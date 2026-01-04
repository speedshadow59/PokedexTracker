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
      // Process the base64 image data
      context.log('Processing image data...');
      let dataUrl;
      if (typeof file === 'string') {
        // Ensure it has the data URL prefix
        if (file.startsWith('data:')) {
          dataUrl = file;
        } else {
          // Assume it's base64 without prefix, add default
          dataUrl = `data:${contentType || 'image/png'};base64,${file}`;
        }
        context.log(`Data URL created, length: ${dataUrl.length}`);
      } else {
        throw new Error('Invalid file format. Expected base64 string');
      }

      // Generate a unique identifier for the image
      const imageId = uuidv4();
      context.log(`Generated image ID: ${imageId}`);

      // Emit Event Grid event
      context.log('Emitting event...');
      await emitEvent(
        'PokedexTracker.Media.Uploaded',
        `media/${userId}/${pokemonId}`,
        {
          userId: userId,
          pokemonId: parseInt(pokemonId),
          imageId: imageId,
          dataUrl: dataUrl,
          fileSize: dataUrl.length,
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
          message: 'Image processed successfully',
          url: dataUrl,
          imageId: imageId,
          pokemonId: parseInt(pokemonId)
        }
      };

    } catch (error) {
      context.log.error('Error processing image:', error);
      
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
      // Since images are stored in the database, deletion is handled by removing the Pokemon entry
      // Extract pokemonId from the request (assuming it's passed as a parameter)
      const pokemonId = req.query.pokemonId ? parseInt(req.query.pokemonId) : null;

      // Emit Event Grid event
      await emitEvent(
        'PokedexTracker.Media.Deleted',
        `media/${userId}`,
        {
          userId: userId,
          pokemonId: pokemonId,
          timestamp: new Date()
        }
      );

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: true,
          message: 'Screenshot deletion processed',
          pokemonId: pokemonId
        }
      };

    } catch (error) {
      context.log.error('Error processing screenshot deletion:', error);
      
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
