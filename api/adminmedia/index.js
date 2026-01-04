// Admin endpoints: content moderation (list media, remove/restore)
// const { connectToDatabase, getBlobServiceClient } = require('../shared/utils');
// const checkAdmin = require('../checkadmin');

module.exports = async function (context, req) {
    // IMMEDIATE TEST RESPONSE
    context.res = { 
        status: 200, 
        headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: { 
            test: 'Function is working',
            action: req.query?.action || req.body?.action,
            timestamp: new Date().toISOString()
        } 
    };
    return;

        const action = req.query.action || (req.body && req.body.action);
        if (!action) {
            context.res = { 
                status: 400, 
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                },
                body: { error: 'Missing action' } 
            };
            return;
        }

        console.log('Connecting to database...');
        context.log('Connecting to database...');
        const db = await connectToDatabase();
        console.log('Database connected successfully');
        context.log('Database connected successfully');

        // Test database connection
        const collections = await db.collections();
        console.log('Available collections:', collections.map(c => c.collectionName));
        context.log('Available collections:', collections.map(c => c.collectionName));

        // Content moderation actions
        if (action === 'listMedia') {
            console.log('=== PROCESSING LISTMEDIA ACTION ===');
            context.log('Processing listMedia action');
            // Get all user screenshots from userdex collection
            const userdexCollection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');
            console.log('Querying userdex collection for screenshots...');
            const screenshots = await userdexCollection.find({
                $or: [
                    { screenshot: { $exists: true, $ne: null } },
                    { screenshotShiny: { $exists: true, $ne: null } }
                ]
            }).toArray();

            console.log(`Found ${screenshots.length} screenshot documents`);
            context.log(`Found ${screenshots.length} screenshot documents`);

            // Transform to media items
            const media = [];
            for (const doc of screenshots) {
                if (doc.screenshot) {
                    media.push({
                        id: `${doc.userId}-${doc.pokemonId}-regular`,
                        userId: doc.userId,
                        pokemonId: doc.pokemonId,
                        type: 'screenshot',
                        url: doc.screenshot,
                        shiny: false,
                        removed: false // User screenshots are not "removed" in the same way
                    });
                }
                if (doc.screenshotShiny) {
                    media.push({
                        id: `${doc.userId}-${doc.pokemonId}-shiny`,
                        userId: doc.userId,
                        pokemonId: doc.pokemonId,
                        type: 'screenshot',
                        url: doc.screenshotShiny,
                        shiny: true,
                        removed: false
                    });
                }
            }

            context.log(`Returning ${media.length} media items`);
            context.res = { 
                status: 200, 
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                },
                body: { media } 
            };
            return;
        }
                    type: 'screenshot',
                    url: doc.screenshotShiny,
                    shiny: true,
                    removed: false
                });
            }
        }
        
        context.res = { status: 200, body: { media } };
        return;
    }
        if (action === 'deleteScreenshot' && req.body && req.body.userId && req.body.pokemonId && req.body.shiny !== undefined) {
            context.log('Processing deleteScreenshot action for user:', req.body.userId, 'pokemon:', req.body.pokemonId, 'shiny:', req.body.shiny);
            const userdexCollection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');

            // Find the document
            const doc = await userdexCollection.findOne({
                userId: req.body.userId,
                pokemonId: parseInt(req.body.pokemonId)
            });

            if (!doc) {
                context.log('User Pokemon entry not found');
                context.res = { status: 404, body: { error: 'User Pokemon entry not found' } };
                return;
            }

            const field = req.body.shiny ? 'screenshotShiny' : 'screenshot';
            const screenshotUrl = doc[field];

            if (!screenshotUrl) {
                context.log('Screenshot not found in document');
                context.res = { status: 404, body: { error: 'Screenshot not found' } };
                return;
            }

            // Delete from blob storage
            try {
                context.log('Attempting to delete blob for URL:', screenshotUrl);
                const blobServiceClient = getBlobServiceClient();
                const containerName = process.env.BLOB_STORAGE_CONNECTION_STRING ? 'pokemon-media' : 'pokemon-media';
                const containerClient = blobServiceClient.getContainerClient(containerName);

                const url = new URL(screenshotUrl);
                const blobName = url.pathname.split(`/${containerName}/`)[1].split('?')[0];

                const blockBlobClient = containerClient.getBlockBlobClient(blobName);
                await blockBlobClient.deleteIfExists();
                context.log(`Admin deleted screenshot blob: ${blobName}`);
            } catch (blobError) {
                context.log.warn('Error deleting screenshot blob:', blobError.message);
            }

            // Update database to remove the screenshot reference
            const updateData = { [field]: null };
            const result = await userdexCollection.updateOne(
                { userId: req.body.userId, pokemonId: parseInt(req.body.pokemonId) },
                { $set: updateData }
            );

            context.log('Screenshot deleted successfully');
            context.res = { 
                status: 200, 
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                },
                body: { result, message: 'Screenshot deleted' } 
            };
            return;
        }
    if (action === 'removeMedia' && req.body && req.body.mediaId) {
        const result = await db.collection('media').updateOne(
            { _id: req.body.mediaId },
            { $set: { removed: true } }
        );
        context.res = { 
            status: 200, 
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: { result } 
        };
        return;
    }
    if (action === 'restoreMedia' && req.body && req.body.mediaId) {
        const result = await db.collection('media').updateOne(
            { _id: req.body.mediaId },
            { $set: { removed: false } }
        );
        context.res = { 
            status: 200, 
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: { result } 
        };
        return;
    }

    } catch (error) {
        context.log.error('Error in content moderation function:', error);
        context.res = {
            status: 500,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: {
                error: 'Internal server error',
                message: error.message,
                stack: error.stack,
                details: {
                    action: req.query?.action || req.body?.action,
                    hasBody: !!req.body,
                    bodyKeys: req.body ? Object.keys(req.body) : null,
                    timestamp: new Date().toISOString()
                }
            }
        };
    }
};
