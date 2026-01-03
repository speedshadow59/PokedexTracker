// Admin endpoints: user management (list, promote/demote, block)
// Protect all actions with admin check
const { getGraphToken, getUserById, getAllUsers, setUserRole, blockUser } = require('../shared/utils');
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

    // User management actions
    if (action === 'listUsers') {
        const users = await getAllUsers();
        context.res = { status: 200, body: { users } };
        return;
    }
    if (action === 'promoteAdmin' && req.body && req.body.userId) {
        const result = await setUserRole(req.body.userId, 'admin');
        context.res = { status: 200, body: { result } };
        return;
    }
    if (action === 'demoteAdmin' && req.body && req.body.userId) {
        const result = await setUserRole(req.body.userId, 'user');
        context.res = { status: 200, body: { result } };
        return;
    }
    if (action === 'blockUser' && req.body && req.body.userId) {
        const result = await blockUser(req.body.userId);
        context.res = { status: 200, body: { result } };
        return;
    }

    context.res = { status: 400, body: { error: 'Invalid action or missing parameters' } };
};
