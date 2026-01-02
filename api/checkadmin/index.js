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
      // Always look up Entra objectId by email, then fallback to external UPN
      const { getGraphToken } = require('../shared/utils');
      const graphToken = await getGraphToken();
      let url = `https://graph.microsoft.com/v1.0/users?$filter=userPrincipalName eq '${email}'&$select=id,userPrincipalName`;
      let res = await fetch(url, {
        headers: { Authorization: `Bearer ${graphToken}` }
      });
      let data = res.ok ? await res.json() : null;
      if (data && Array.isArray(data.value) && data.value.length) {
        userId = data.value[0].id;
        lookedUp = true;
        roles = await getUserAppRoles(userId);
      } else {
        // Try external UPN fallback
        const extUpn = email.replace(/[@.]/g, match => match === '@' ? '_' : '_') + '#EXT#@lpielikysgmail.onmicrosoft.com';
        url = `https://graph.microsoft.com/v1.0/users?$filter=userPrincipalName eq '${extUpn}'&$select=id,userPrincipalName`;
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${graphToken}` }
        });
        data = res.ok ? await res.json() : null;
        if (data && Array.isArray(data.value) && data.value.length) {
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
