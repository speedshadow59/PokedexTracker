const { connectToDatabase, emitEvent, getClientPrincipal } = require('../shared/utils');

/**
 * PUT /api/userdex
 * Toggles caught status for a Pokémon for the current user
 * 
 * Request Body:
 * {
 *   "userId": "user_123",
 *   "pokemonId": 25,
 *   "caught": true,
 *   "shiny": false,
 *   "notes": "Caught in Victory Road",
 *   "screenshot": "base64_or_url"
 * }
 */
module.exports = async function (context, req) {
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
