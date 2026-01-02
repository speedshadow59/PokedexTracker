// Minimal test version without dependencies to debug routing
const { getClientPrincipal, getUserAppRoles } = require('../shared/utils');

module.exports = async function (context, req) {
  try {
    const principal = getClientPrincipal(req);
    
    if (!principal || !principal.userId) {
      context.res = {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          isAdmin: false, 
          error: 'Not authenticated' 
        })
      };
      return;
    }

    let userId = principal.userId;
    let roles = [];
    let lookedUp = false;

    // Try to get roles with userId
    try {
      roles = await getUserAppRoles(userId);
    } catch (err) {
      // If 404, look up by email
      if (err.message && err.message.includes('Resource') && principal.userDetails) {
        // Look up user by email
        const { getGraphToken } = require('../shared/utils');
        const graphToken = await getGraphToken();
        const email = principal.userDetails;
        const url = `https://graph.microsoft.com/v1.0/users?$filter=userPrincipalName eq '${email}'&$select=id`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${graphToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.value) && data.value.length) {
            userId = data.value[0].id;
            lookedUp = true;
            roles = await getUserAppRoles(userId);
          }
        }
      }
    }
    const isAdmin = roles.includes('Admin');
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        isAdmin, 
        roles,
        userId,
        lookedUpByEmail: lookedUp
      })
    };
  } catch (error) {
    context.log.error('Error checking admin role:', error);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        isAdmin: false, 
        error: error.message 
      })
    };
  }
};
