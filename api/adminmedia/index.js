// Admin endpoints: basic media management (list all user media, delete any media)
const { getBlobServiceClient, generateBlobSasUrl } = require('../shared/utils');
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
        const blobServiceClient = getBlobServiceClient();
        const containerName = process.env.BLOB_STORAGE_CONTAINER_NAME || 'pokemon-media';
        const containerClient = blobServiceClient.getContainerClient(containerName);

        // List all media (blobs) in the container
        if (action === 'listMedia') {
            const blobs = [];
            for await (const blob of containerClient.listBlobsFlat()) {
                // Parse blob name to extract userId, pokemonId, filename
                const parts = blob.name.split('/');
                if (parts.length >= 3) {
                    const userId = parts[0];
                    const pokemonId = parseInt(parts[1]);
                    const filename = parts.slice(2).join('/');

                    // Generate SAS URL for viewing
                    const blobClient = containerClient.getBlockBlobClient(blob.name);
                    const sasUrl = generateBlobSasUrl(blobClient.url);

                    blobs.push({
                        blobName: blob.name,
                        userId: userId,
                        pokemonId: pokemonId,
                        filename: filename,
                        url: sasUrl,
                        size: blob.properties.contentLength,
                        lastModified: blob.properties.lastModified,
                        contentType: blob.properties.contentType
                    });
                }
            }

            context.res = {
                status: 200,
                body: {
                    success: true,
                    media: blobs,
                    count: blobs.length
                }
            };
            return;
        }

        // Delete specific media by blob name
        if (action === 'deleteMedia' && req.body && req.body.blobName) {
            const blobName = req.body.blobName;
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);

            const deleteResponse = await blockBlobClient.deleteIfExists();

            if (deleteResponse.succeeded) {
                // Extract pokemonId from blob name for database cleanup
                const parts = blobName.split('/');
                const userId = parts[0];
                const pokemonId = parts.length >= 2 ? parseInt(parts[1]) : null;

                // Update userdex to remove screenshot reference if pokemonId is available
                if (pokemonId) {
                    const { connectToDatabase } = require('../shared/utils');
                    const db = await connectToDatabase();
                    const collection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');

                    await collection.updateOne(
                        { userId: userId, pokemonId: pokemonId },
                        { $unset: { screenshot: "" } }
                    );
                }

                context.res = {
                    status: 200,
                    body: {
                        success: true,
                        message: 'Media deleted successfully',
                        blobName: blobName
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
