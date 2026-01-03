// Admin endpoint: audit log (record and retrieve admin actions)
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

    if (action === 'getLogs') {
        const logs = await db.collection('auditlog').find({}).sort({ timestamp: -1 }).limit(100).toArray();
        context.res = { status: 200, body: { logs } };
        return;
    }
    if (action === 'addLog' && req.body && req.body.log) {
        const log = req.body.log;
        log.timestamp = new Date();
        await db.collection('auditlog').insertOne(log);
        context.res = { status: 200, body: { success: true } };
        return;
    }

    context.res = { status: 400, body: { error: 'Invalid action or missing parameters' } };
};
