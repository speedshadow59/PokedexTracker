const { connectToDatabase, emitEvent } = require('../shared/utils');

/**
 * POST /api/comments
 * Saves a comment for a Pokémon entry
 * 
 * Request Body:
 * {
 *   "userId": "user_123",
 *   "pokemonId": 25,
 *   "comment": "This Pikachu is my favorite!"
 * }
 */
module.exports = async function (context, req) {
  context.log('HTTP trigger function processed a POST request for comments.');

  const { userId, pokemonId, comment } = req.body || {};

  // Validate required parameters
  if (!userId || !pokemonId || !comment) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: 'Missing required parameters: userId, pokemonId, and comment'
      }
    };
    return;
  }

  // Validate comment is not empty
  if (typeof comment !== 'string' || comment.trim().length === 0) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: 'Comment cannot be empty'
      }
    };
    return;
  }

  try {
    // Connect to Cosmos DB
    const db = await connectToDatabase();
    const collection = db.collection('comments');

    // Create comment document
    const commentDocument = {
      userId: userId,
      pokemonId: parseInt(pokemonId),
      comment: comment.trim(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Insert comment
    const result = await collection.insertOne(commentDocument);

    // Emit Event Grid event
    await emitEvent(
      'PokedexTracker.Comment.Created',
      `comments/${userId}/${pokemonId}`,
      {
        userId: userId,
        pokemonId: parseInt(pokemonId),
        commentId: result.insertedId.toString(),
        timestamp: new Date()
      }
    );

    context.res = {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: true,
        message: 'Comment saved successfully',
        commentId: result.insertedId.toString(),
        pokemonId: parseInt(pokemonId)
      }
    };

  } catch (error) {
    context.log.error('Error saving comment:', error);
    
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
