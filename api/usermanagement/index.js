// Usermanagement endpoints: user management (list, promote/demote, block)
// Protect all actions with admin check
const { getGraphToken, getUserById, getAllUsers, setUserRole, blockUser } = require('../shared/utils');
const checkAdmin = require('../checkadmin');

module.exports = async function (context, req) {
    context.log('usermanagement: function start');
    try {
        // Check admin status
        const adminCheck = await checkAdmin(context, req);
        context.log('usermanagement: adminCheck', adminCheck);
        if (!adminCheck || typeof adminCheck.isAdmin === 'undefined') {
            context.res = { status: 401, body: { error: 'Admin check failed', adminCheck } };
            context.log('usermanagement: adminCheck failed', adminCheck);
            return;
        }
        if (!adminCheck.isAdmin) {
            context.res = { status: 403, body: { error: 'Admin access required' } };
            context.log('usermanagement: not admin');
            return;
        }

        const action = req.query.action || (req.body && req.body.action);
        if (!action) {
            context.res = { status: 400, body: { error: 'Missing action' } };
            context.log('usermanagement: missing action');
            return;
        }

        context.log('usermanagement: action', action);
        // User management actions
        if (action === 'listUsers') {
            context.log('usermanagement: listUsers start');
            try {
                const graphToken = await getGraphToken();
                context.log('usermanagement: got graph token');
                const url = 'https://graph.microsoft.com/v1.0/users?$top=100&$count=true';
                context.log('usermanagement: fetch', url);
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${graphToken}`,
                        'ConsistencyLevel': 'eventual'
                    }
                });
                context.log('usermanagement: fetch done', res.status, res.statusText);
                const text = await res.text();
                let data = {};
                try { data = JSON.parse(text); } catch (e) { data = { parseError: e.message, raw: text }; }
                if (!res.ok) {
                    context.log('usermanagement: graph error', text);
                    context.res = { status: 500, body: { error: 'Failed to fetch users from Graph', details: text, status: res.status, statusText: res.statusText, raw: data, requestUrl: url, requestHeaders: { Authorization: 'Bearer ...', ConsistencyLevel: 'eventual' } } };
                    return;
                }
                // Map to expected frontend format
                const users = (data.value || []).map(u => ({
                    id: u.id,
                    name: u.displayName || u.userPrincipalName || u.mail,
                    email: u.mail || u.userPrincipalName,
                    isAdmin: false, // Optionally, fetch roles per user if needed
                    blocked: u.accountEnabled === false
                }));
                context.log('usermanagement: users found', users.length);
                context.res = { status: 200, body: { users, rawGraph: data, requestUrl: url, requestHeaders: { Authorization: 'Bearer ...', ConsistencyLevel: 'eventual' } } };
                return;
            } catch (err) {
                context.log('usermanagement: exception', err && err.message, err && err.stack);
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
    } catch (fatal) {
        context.log('usermanagement: fatal error', fatal && fatal.message, fatal && fatal.stack);
        context.res = { status: 500, body: { error: 'Fatal error in usermanagement', details: fatal && fatal.message, stack: fatal && fatal.stack } };
    }
};
