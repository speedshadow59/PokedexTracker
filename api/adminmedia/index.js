// Admin endpoints: content moderation (list media, remove/restore)
const { connectToDatabase } = require('../shared/utils');
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
        const media = await db.collection('media').find({}).toArray();
        context.res = { status: 200, body: { media } };
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
