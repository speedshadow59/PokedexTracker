// Minimal test version without dependencies to debug routing
const { getClientPrincipal, getUserAppRoles } = require('../shared/utils');

module.exports = async function (context, req) {
  const { getGraphToken, setUserRole, blockUser } = require('../shared/utils');
  try {
    const principal = getClientPrincipal(req);
    context.log('DEBUG: principal', principal);
    if (!principal || !principal.userId) {
      context.res = {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAdmin: false, error: 'Not authenticated', debug: { principal } })
      };
      return;
    }

    // User management actions (admin dashboard)
    const action = req.query.action || (req.body && req.body.action);
    if (action === 'listUsers') {
      try {
        const graphToken = await getGraphToken();
        const url = 'https://graph.microsoft.com/v1.0/users?$top=100&$count=true';
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${graphToken}`,
            'ConsistencyLevel': 'eventual'
          }
        });
        const text = await res.text();
        let data = {};
        try { data = JSON.parse(text); } catch (e) { data = { parseError: e.message, raw: text }; }
        if (!res.ok) {
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
        context.res = { status: 200, body: { users, rawGraph: data, requestUrl: url, requestHeaders: { Authorization: 'Bearer ...', ConsistencyLevel: 'eventual' } } };
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

    // Default: original checkadmin logic
    // ...existing code for admin check...
};
