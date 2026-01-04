// Admin endpoints: content moderation (list media, remove/restore)
const { connectToDatabase, getBlobServiceClient } = require('../shared/utils');
const checkAdmin = require('../checkadmin');

module.exports = async function (context, req) {
    // Check admin status
    const adminCheck = await checkAdmin(context, req);
    if (!adminCheck.isAdmin) {
        context.res = { status: 403, body: { error: 'Admin access required' } };
        return;
    }

    const action = req.query.action || (req.body && req.body.action);
    if (!action) {
        context.res = { status: 400, body: { error: 'Missing action' } };
        return;
    }

    const db = await connectToDatabase();

    // Content moderation actions
    if (action === 'listMedia') {
        // Get all user screenshots from userdex collection
        const userdexCollection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');
        const screenshots = await userdexCollection.find({
            $or: [
                { screenshot: { $exists: true, $ne: null } },
                { screenshotShiny: { $exists: true, $ne: null } }
            ]
        }).toArray();
        
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
        
        context.res = { status: 200, body: { media } };
        return;
    }
    if (action === 'deleteScreenshot' && req.body && req.body.userId && req.body.pokemonId && req.body.shiny !== undefined) {
        const userdexCollection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');
        
        // Find the document
        const doc = await userdexCollection.findOne({
            userId: req.body.userId,
            pokemonId: parseInt(req.body.pokemonId)
        });
        
        if (!doc) {
            context.res = { status: 404, body: { error: 'User Pokemon entry not found' } };
            return;
        }
        
        const field = req.body.shiny ? 'screenshotShiny' : 'screenshot';
        const screenshotUrl = doc[field];
        
        if (!screenshotUrl) {
            context.res = { status: 404, body: { error: 'Screenshot not found' } };
            return;
        }
        
        // Delete from blob storage
        try {
            const blobServiceClient = getBlobServiceClient();
            const containerName = process.env.BLOB_CONTAINER_NAME || 'pokemon-media';
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
        
        context.res = { status: 200, body: { result, message: 'Screenshot deleted' } };
        return;
    }
    if (action === 'removeMedia' && req.body && req.body.mediaId) {
        const result = await db.collection('media').updateOne(
            { _id: req.body.mediaId },
            { $set: { removed: true } }
        );
        context.res = { status: 200, body: { result } };
        return;
    }
    if (action === 'restoreMedia' && req.body && req.body.mediaId) {
        const result = await db.collection('media').updateOne(
            { _id: req.body.mediaId },
            { $set: { removed: false } }
        );
        context.res = { status: 200, body: { result } };
        return;
    }

    context.res = { status: 400, body: { error: 'Invalid action or missing parameters' } };
};
