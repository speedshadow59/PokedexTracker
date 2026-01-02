const { connectToDatabase, emitEvent, getClientPrincipal, getBlobServiceClient, generateBlobSasUrl } = require('../shared/utils');

/**
 * GET /api/userdex - Retrieve all caught Pokémon for authenticated user
 * PUT /api/userdex - Create or update a caught Pokémon entry
 * DELETE /api/userdex - Delete a caught Pokémon entry (hard delete)
 * 
 * PUT Request Body:
 * {
 *   "pokemonId": 25,
 *   "caught": true,
 *   "shiny": false,
 *   "notes": "Caught in Victory Road",
 *   "screenshot": "base64_or_url"
 * }
 * 
 * DELETE Request Body:
 * {
 *   "pokemonId": 25
 * }
 */

const { v4: uuidv4 } = require('uuid');

module.exports = async function (context, req) {
  // Share endpoint: POST /api/userdex/share
  if (req.method === 'POST' && req.url && req.url.endsWith('/share')) {
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
    try {
      const db = await connectToDatabase();
      const collection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');
      // Check if user already has a shareId
      const existingEntry = await collection.findOne({ userId: userId, shareId: { $exists: true, $ne: null } });
      let shareId = existingEntry && existingEntry.shareId ? existingEntry.shareId : uuidv4();
      // Store shareId on all userdex entries for this user
      await collection.updateMany(
        { userId: userId },
        { $set: { shareId } }
      );
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { shareId }
      };
    } catch (error) {
      context.res = {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Internal server error', message: error.message }
      };
    }
    return;
  }

  // Shared view endpoint: GET /api/userdex/shared/:shareId
  if (req.method === 'GET' && req.url && req.url.includes('/shared/')) {
    // Extract shareId from URL
    const parts = req.url.split('/shared/');
    const shareId = parts[1] ? parts[1].split('?')[0] : null;
    if (!shareId) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Missing shareId' }
      };
      return;
    }
    try {
      const db = await connectToDatabase();
      const collection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');
      const items = await collection.find({ shareId }).toArray();
      if (!items.length) {
        context.res = {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
          body: { error: 'Not found' }
        };
        return;
      }
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          shareId,
          count: items.length,
          pokemon: items.map(i => ({
            pokemonId: i.pokemonId,
            caught: i.caught,
            shiny: i.shiny || false,
            notes: i.notes || '',
            sprite: i.sprite || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${i.pokemonId}.png`,
            spriteShiny: i.spriteShiny || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${i.pokemonId}.png`,
            // Include screenshots with SAS tokens for secure access
            screenshot: i.screenshot ? generateBlobSasUrl(i.screenshot, 90) : null,
            screenshotShiny: i.screenshotShiny ? generateBlobSasUrl(i.screenshotShiny, 90) : null,
            updatedAt: i.updatedAt || i.createdAt || null
          }))
        }
      };
    } catch (error) {
      context.res = {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Internal server error', message: error.message }
      };
    }
    return;
  }

  // Default: require authentication for other endpoints
  const principal = getClientPrincipal(req);
  if (!principal || !principal.userId) {
    context.res = {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Unauthorized' }
    };
    return;
  }
  const authenticatedUserId = principal.userId;

  if (req.method === 'GET') {
    context.log('HTTP trigger function processed a GET request for userdex.');
    const userId = authenticatedUserId;

    try {
      const db = await connectToDatabase();
      const collection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');
      const cursor = collection.find({ userId: userId });
      const items = await cursor.toArray();

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          userId: userId,
          count: items.length,
          pokemon: items.map(i => ({
            pokemonId: i.pokemonId,
            caught: i.caught,
            shiny: i.shiny || false,
            notes: i.notes || '',
            screenshot: i.screenshot || null,
            updatedAt: i.updatedAt || i.createdAt || null
          }))
        }
      };
      return;
    } catch (error) {
      context.log.error('Error fetching userdex:', error);
      context.res = {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Internal server error', message: error.message }
      };
      return;
    }
  }

  if (req.method === 'DELETE') {
    context.log('HTTP trigger function processed a DELETE request for userdex.');
    const { pokemonId } = req.body || {};
    const userId = authenticatedUserId;

    context.log(`DELETE: userId=${userId}, pokemonId=${pokemonId}`);

    // Validate required parameters
    if (!pokemonId) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: 'Missing required parameter: pokemonId'
        }
      };
      return;
    }

    try {
      // Connect to Cosmos DB
      const db = await connectToDatabase();
      const collection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');

      // First, fetch the document to get the screenshot URL
      const existingDoc = await collection.findOne({
        userId: userId,
        pokemonId: parseInt(pokemonId)
      });

      // Delete the blob if it exists
      if (existingDoc && existingDoc.screenshot) {
        try {
          const blobServiceClient = getBlobServiceClient();
          const containerName = process.env.BLOB_CONTAINER_NAME || 'pokemon-media';
          const containerClient = blobServiceClient.getContainerClient(containerName);
          
          // Extract blob name from URL (format: https://<account>.blob.core.windows.net/<container>/<blobName>)
          const blobUrl = existingDoc.screenshot;
          // Extract everything after the container name (includes userId/pokemonId/filename.png)
          const urlParts = blobUrl.split(`/${containerName}/`);
          const blobName = urlParts.length > 1 ? urlParts[1] : blobUrl.split('/').pop();
          
          const blockBlobClient = containerClient.getBlockBlobClient(blobName);
          await blockBlobClient.deleteIfExists();
          context.log(`Deleted blob: ${blobName}`);
        } catch (blobError) {
          context.log.warn('Error deleting blob (continuing with document delete):', blobError.message);
          // Continue with document deletion even if blob deletion fails
        }
      }

      // Delete the shiny screenshot blob if it exists
      if (existingDoc && existingDoc.screenshotShiny) {
        try {
          const blobServiceClient = getBlobServiceClient();
          const containerName = process.env.BLOB_CONTAINER_NAME || 'pokemon-media';
          const containerClient = blobServiceClient.getContainerClient(containerName);
          
          const blobUrl = existingDoc.screenshotShiny;
          const urlParts = blobUrl.split(`/${containerName}/`);
          const blobName = urlParts.length > 1 ? urlParts[1] : blobUrl.split('/').pop();
          
          const blockBlobClient = containerClient.getBlockBlobClient(blobName);
          await blockBlobClient.deleteIfExists();
          context.log(`Deleted shiny blob: ${blobName}`);
        } catch (blobError) {
          context.log.warn('Error deleting shiny blob (continuing with document delete):', blobError.message);
        }
      }

      // Delete entry
      const result = await collection.deleteOne({
        userId: userId,
        pokemonId: parseInt(pokemonId)
      });

      context.log(`DELETE result: deletedCount=${result.deletedCount}`);

      if (result.deletedCount === 0) {
        // Return 200 anyway (idempotent) - entry doesn't exist or already deleted
        context.res = {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            success: true,
            message: 'Pokémon deleted or not found (idempotent)',
            pokemonId: parseInt(pokemonId)
          }
        };
        return;
      }

      // Emit Event Grid event
      await emitEvent(
        'PokedexTracker.UserDex.Deleted',
        `userdex/${userId}/${pokemonId}`,
        {
          userId: userId,
          pokemonId: parseInt(pokemonId),
          action: 'deleted',
          timestamp: new Date()
        }
      );

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: true,
          message: 'Pokémon deleted successfully',
          pokemonId: parseInt(pokemonId)
        }
      };

    } catch (error) {
      context.log.error('Error deleting userdex entry:', error);
      
      context.res = {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: 'Internal server error',
          message: error.message
        }
      };
    }
    return;
  }

  context.log('HTTP trigger function processed a PUT request for userdex.');

  const { pokemonId, caught, shiny, notes, screenshot } = req.body || {};
  const userId = authenticatedUserId;

  // Validate required parameters
  if (!pokemonId) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: 'Missing required parameter: pokemonId'
      }
    };
    return;
  }

  try {
    // Connect to Cosmos DB
    const db = await connectToDatabase();
    const collection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');

    // Check if entry exists
    const existingEntry = await collection.findOne({
      userId: userId,
      pokemonId: parseInt(pokemonId)
    });

    let result;
    let action;

    if (existingEntry) {
      // Toggle: If exists and caught is true, update. If caught is false/undefined, remove
      if (caught === false) {
        // Remove entry (mark as uncaught)
        result = await collection.deleteOne({
          userId: userId,
          pokemonId: parseInt(pokemonId)
        });
        action = 'uncaught';
      } else {
        // Update entry
        result = await collection.updateOne(
          { userId: userId, pokemonId: parseInt(pokemonId) },
          {
            $set: {
              id: `${userId}-${parseInt(pokemonId)}`,
              caught: true,
              shiny: shiny || false,
              notes: notes || '',
              screenshot: screenshot || null,
              updatedAt: new Date()
            }
          }
        );
        action = 'updated';
      }
    } else {
      // Create new entry (mark as caught)
      if (caught !== false) {
        result = await collection.insertOne({
          id: `${userId}-${parseInt(pokemonId)}`,
          userId: userId,
          pokemonId: parseInt(pokemonId),
          caught: true,
          shiny: shiny || false,
          notes: notes || '',
          screenshot: screenshot || null,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        action = 'caught';
      } else {
        // Nothing to do - trying to uncatch something that doesn't exist
        context.res = {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            success: true,
            message: 'No action needed',
            action: 'none'
          }
        };
        return;
      }
    }

    // Emit Event Grid event
    await emitEvent(
      'PokedexTracker.UserDex.Updated',
      `userdex/${userId}/${pokemonId}`,
      {
        userId: userId,
        pokemonId: parseInt(pokemonId),
        action: action,
        caught: caught !== false,
        timestamp: new Date()
      }
    );

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: true,
        message: `Pokémon ${action} successfully`,
        action: action,
        pokemonId: parseInt(pokemonId)
      }
    };

  } catch (error) {
    context.log.error('Error updating userdex:', error);
    
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
