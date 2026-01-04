// Admin endpoints: basic media management (list all user media, delete any media)
const { connectToDatabase } = require('../shared/utils');
const checkAdmin = require('../checkadmin');

module.exports = async function (context, req) {
    // Check admin status
    const adminCheck = await checkAdmin(context, req);
    if (!adminCheck.isAdmin) {
        context.res = { status: 403, body: { error: 'Admin access required' } };
        return;
    }

    const action = req.params.action || req.query.action || (req.body && req.body.action);
    if (!action) {
        context.res = { status: 400, body: { error: 'Missing action' } };
        return;
    }

    try {
        const db = await connectToDatabase();
        const collection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');

        // List all media (screenshots) from database
        if (action === 'listMedia') {
            const media = [];
            const cursor = collection.find({ screenshot: { $exists: true, $ne: null } }, {
                projection: { userId: 1, pokemonId: 1, screenshot: 1, updatedAt: 1 }
            });
            const items = await cursor.toArray();

            for (const item of items) {
                media.push({
                    userId: item.userId,
                    pokemonId: item.pokemonId,
                    url: item.screenshot,
                    lastModified: item.updatedAt,
                    contentType: 'image' // Assuming all are images
                });
            }

            context.res = {
                status: 200,
                body: {
                    success: true,
                    media: media,
                    count: media.length
                }
            };
            return;
        }

        // Delete specific media by userId and pokemonId
        if (action === 'deleteMedia' && req.body && req.body.userId && req.body.pokemonId) {
            const { userId, pokemonId } = req.body;

            const result = await collection.updateOne(
                { userId: userId, pokemonId: parseInt(pokemonId) },
                { $unset: { screenshot: "" } }
            );

            if (result.modifiedCount > 0) {
                context.res = {
                    status: 200,
                    body: {
                        success: true,
                        message: 'Media deleted successfully',
                        userId: userId,
                        pokemonId: pokemonId
                    }
                };
            } else {
                context.res = {
                    status: 404,
                    body: {
                        error: 'Media not found'
                    }
                };
            }
            return;
        }

        context.res = {
            status: 400,
            body: {
                error: 'Invalid action or missing parameters'
            }
        };

    } catch (error) {
        context.log.error('Admin media error:', error);
        context.res = {
            status: 500,
            body: {
                error: 'Internal server error',
                message: error.message
            }
        };
    }
};
