// Useradmin endpoints: user management (list, promote/demote, block)
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
        // List users from Microsoft Graph (Entra ID)
        try {
            const graphToken = await getGraphToken();
            const url = 'https://graph.microsoft.com/v1.0/users?$top=100&$select=id,displayName,mail,userPrincipalName,accountEnabled';
            const res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
            if (!res.ok) {
                const text = await res.text();
                context.res = { status: 500, body: { error: 'Failed to fetch users from Graph', details: text, status: res.status, statusText: res.statusText } };
                return;
            }
            const data = await res.json();
            // Map to expected frontend format
            const users = (data.value || []).map(u => ({
                id: u.id,
                name: u.displayName || u.userPrincipalName || u.mail,
                email: u.mail || u.userPrincipalName,
                isAdmin: false, // Optionally, fetch roles per user if needed
                blocked: u.accountEnabled === false
            }));
            context.res = { status: 200, body: { users } };
            return;
        } catch (err) {
            context.res = { status: 500, body: { error: 'Exception in listUsers', details: err && err.message, stack: err && err.stack } };
            return;
        }
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
