const { getBlobServiceClient, emitEvent, getClientPrincipal, getGraphToken, findUserByIdentifier, connectToDatabase } = require('../shared/utils');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/media
 * Accepts an uploaded file and stores it in Azure Blob Storage
 * 
 * Request Body (multipart/form-data or JSON with base64):
 * {
 *   "userId": "user_123",
 *   "pokemonId": 25,
 *   "file": "base64_encoded_file_data",
 *   "fileName": "pikachu_screenshot.png",
 *   "contentType": "image/png"
 * }
 */
module.exports = async function (context, req) {
  context.log('HTTP trigger function processed a POST request for media upload.');

  const principal = getClientPrincipal(req);
  if (!principal || !principal.userId) {
    context.res = {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Unauthorized' }
    };
    return;
  }

  // Resolve userId to Graph API id for consistent storage
  let userId = principal.userId;
  if (principal.userDetails) {
    try {
      const graphUser = await findUserByIdentifier(principal.userDetails);
      if (graphUser) {
        userId = graphUser.id;
        context.log('media: resolved principal userId', principal.userId, 'to Graph id', userId);
      }
    } catch (err) {
      context.log('media: error resolving userId', err.message);
    }
  }
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
    const blobServiceClient = getBlobServiceClient();
    const containerName = process.env.BLOB_STORAGE_CONTAINER_NAME || 'pokemon-media';
    
    // Get container client (create container if it doesn't exist)
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    try {
      await containerClient.createIfNotExists({
        access: 'blob' // Public read access for blobs
      });
    } catch (error) {
      context.log('Container may already exist or error creating:', error.message);
    }
    
    // Ensure container has public blob access
    try {
      await containerClient.setAccessPolicy('blob');
    } catch (error) {
      context.log('Error setting container access policy:', error.message);
    }

    // Generate unique blob name
    const fileExtension = fileName ? fileName.split('.').pop() : 'png';
    const blobName = `${userId}/${pokemonId}/${uuidv4()}.${fileExtension}`;
    
    // Get blob client
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Convert base64 to buffer if needed
    let buffer;
    if (typeof file === 'string') {
      // Remove data URL prefix if present (e.g., "data:image/png;base64,")
      const base64Data = file.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } else if (Buffer.isBuffer(file)) {
      buffer = file;
    } else {
      throw new Error('Invalid file format. Expected base64 string or Buffer');
    }

    // Upload to blob storage
    const uploadOptions = {
      blobHTTPHeaders: {
        blobContentType: contentType || 'image/png'
      }
    };

    await blockBlobClient.upload(buffer, buffer.length, uploadOptions);

    // Get the URL of the uploaded blob
    const blobUrl = blockBlobClient.url;

    // Check if the Pokemon is caught by the user
    const db = await connectToDatabase();
    const userdexCollection = db.collection('userdex');
    const existingEntry = await userdexCollection.findOne({ userId: userId, pokemonId: parseInt(pokemonId), caught: true });
    if (!existingEntry) {
      // Delete the uploaded blob since Pokemon is not caught
      await blockBlobClient.deleteIfExists();
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Cannot upload media for uncaught Pokemon' }
      };
      return;
    }

    // Save metadata to Cosmos DB
    const mediaCollection = db.collection('media');
    const metadata = {
      id: blobName,
      userId: userId,
      pokemonId: parseInt(pokemonId),
      blobName: blobName,
      blobUrl: blobUrl,
      fileSize: buffer.length,
      contentType: contentType || 'image/png',
      timestamp: new Date()
    };
    await mediaCollection.insertOne(metadata);

    // Emit Event Grid event
    await emitEvent(
      'PokedexTracker.Media.Uploaded',
      `media/${userId}/${pokemonId}`,
      {
        userId: userId,
        pokemonId: parseInt(pokemonId),
        blobName: blobName,
        blobUrl: blobUrl,
        fileSize: buffer.length,
        contentType: contentType || 'image/png',
        timestamp: new Date()
      }
    );

    context.res = {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: true,
        message: 'File uploaded successfully',
        url: blobUrl,
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
};
