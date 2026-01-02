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

    let userId = null;
    let roles = [];
    let lookedUp = false;
    let email = principal.userDetails;
    if (email) {
      // Always look up Entra objectId by email
      const { getGraphToken } = require('../shared/utils');
      const graphToken = await getGraphToken();
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
    const isAdmin = roles.includes('Admin');
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        isAdmin, 
        roles,
        userId,
        lookedUpByEmail: lookedUp,
        userDetails: email || null
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
