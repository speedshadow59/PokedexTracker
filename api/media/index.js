const { getBlobServiceClient, emitEvent, getClientPrincipal, generateBlobSasUrl } = require('../shared/utils');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/media - Upload a screenshot
 * DELETE /api/media - Delete a user's own screenshot
 * 
 * POST Request Body:
 * {
 *   "pokemonId": 25,
 *   "file": "base64_encoded_file_data",
 *   "fileName": "pikachu_screenshot.png",
 *   "contentType": "image/png"
 * }
 * 
 * DELETE Request: DELETE /api/media?blobName=userId/pokemonId/uuid.png
 */
module.exports = async function (context, req) {
  context.log(`HTTP trigger function processed a ${req.method} request for media.`);

  const principal = getClientPrincipal(req);
  if (!principal || !principal.userId) {
    context.res = {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Unauthorized' }
    };
    return;
  }

  const userId = principal.userId;

  if (req.method === 'POST') {
    // Handle file upload
    const { pokemonId, file, fileName, contentType } = req.body || {};

    // Validate required parameters
    if (!pokemonId || !file) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: 'Missing required parameters: pokemonId and file'
        }
      };
      return;
    }

    try {
      // Get Blob Service Client
      context.log('Getting blob service client...');
      const blobServiceClient = getBlobServiceClient();
      const containerName = process.env.BLOB_STORAGE_CONTAINER_NAME || 'pokemon-media';
      context.log(`Container name: ${containerName}`);
      
      // Get container client (create container if it doesn't exist)
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      context.log('Creating container if not exists...');
      try {
        await containerClient.createIfNotExists();
        context.log('Container created or already exists');
      } catch (error) {
        context.log('Container may already exist or error creating:', error.message);
      }

      // Generate unique blob name
      const fileExtension = fileName ? fileName.split('.').pop() : 'png';
      const blobName = `${userId}/${pokemonId}/${uuidv4()}.${fileExtension}`;
      context.log(`Generated blob name: ${blobName}`);
      
      // Get blob client
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // Convert base64 to buffer if needed
      context.log('Converting file to buffer...');
      let buffer;
      if (typeof file === 'string') {
        // Remove data URL prefix if present (e.g., "data:image/png;base64,")
        const base64Data = file.replace(/^data:image\/\w+;base64,/, '');
        buffer = Buffer.from(base64Data, 'base64');
        context.log(`Buffer created from base64 string, length: ${buffer.length}`);
      } else if (Buffer.isBuffer(file)) {
        buffer = file;
        context.log(`Using provided buffer, length: ${buffer.length}`);
      } else {
        throw new Error('Invalid file format. Expected base64 string or Buffer');
      }

      // Upload to blob storage
      context.log('Uploading to blob storage...');
      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: contentType || 'image/png'
        }
      };

      await blockBlobClient.upload(buffer, buffer.length, uploadOptions);
      context.log('Upload successful');

      // Get the URL of the uploaded blob with SAS token for private access
      const blobUrl = blockBlobClient.url;
      context.log(`Blob URL: ${blobUrl}`);
      const sasUrl = generateBlobSasUrl(blobUrl);
      context.log(`SAS URL generated: ${!!sasUrl}`);

      // Emit Event Grid event
      context.log('Emitting event...');
      await emitEvent(
        'PokedexTracker.Media.Uploaded',
        `media/${userId}/${pokemonId}`,
        {
          userId: userId,
          pokemonId: parseInt(pokemonId),
          blobName: blobName,
          blobUrl: sasUrl || blobUrl, // Use SAS URL for accessible URL
          fileSize: buffer.length,
          contentType: contentType || 'image/png',
          timestamp: new Date()
        }
      );
      context.log('Event emitted');

      context.res = {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: true,
          message: 'File uploaded successfully',
          url: sasUrl || blobUrl, // Use SAS URL if available, fallback to direct URL
          blobName: blobName,
          pokemonId: parseInt(pokemonId)
        }
      };

    } catch (error) {
      context.log.error('Error uploading file:', error);
      
      context.res = {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: 'Internal server error',
          message: error.message
        }
      };
    }
  } else if (req.method === 'DELETE') {
    // Handle screenshot deletion
    const blobName = req.query.blobName || req.body?.blobName;

    if (!blobName) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: 'Missing required parameter: blobName'
        }
      };
      return;
    }

    // Security check: ensure the blob belongs to the authenticated user
    if (!blobName.startsWith(`${userId}/`)) {
      context.res = {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: 'Forbidden: You can only delete your own screenshots'
        }
      };
      return;
    }

    try {
      // Get Blob Service Client
      const blobServiceClient = getBlobServiceClient();
      const containerName = process.env.BLOB_STORAGE_CONTAINER_NAME || 'pokemon-media';
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // Delete the blob
      const deleteResponse = await blockBlobClient.deleteIfExists();
      
      if (!deleteResponse.succeeded) {
        context.res = {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
          body: {
            error: 'Screenshot not found'
          }
        };
        return;
      }

      // Extract pokemonId from blob name (format: userId/pokemonId/uuid.ext)
      const parts = blobName.split('/');
      const pokemonId = parts.length >= 2 ? parseInt(parts[1]) : null;

      // Update userdex to remove screenshot reference if pokemonId is available
      if (pokemonId) {
        const { connectToDatabase } = require('../shared/utils');
        const db = await connectToDatabase();
        const collection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');
        
        // Remove screenshot reference from the pokemon entry
        await collection.updateOne(
          { userId: userId, pokemonId: pokemonId },
          { $unset: { screenshot: "" } }
        );
      }

      // Emit Event Grid event
      await emitEvent(
        'PokedexTracker.Media.Deleted',
        `media/${userId}`,
        {
          userId: userId,
          pokemonId: pokemonId,
          blobName: blobName,
          timestamp: new Date()
        }
      );

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: true,
          message: 'Screenshot deleted successfully',
          blobName: blobName,
          pokemonId: pokemonId
        }
      };

    } catch (error) {
      context.log.error('Error deleting screenshot:', error);
      
      context.res = {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: 'Internal server error',
          message: error.message
        }
      };
    }
  } else {
    context.res = {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: 'Method not allowed'
      }
    };
  }
};
