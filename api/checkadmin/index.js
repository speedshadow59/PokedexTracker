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
    let usersDebug = null;
    let appRoleAssignmentsDebug = null;
    if (email) {
      // Always look up Entra objectId by email, then fallback to external UPN, then try startswith
      const { getGraphToken } = require('../shared/utils');
      const graphToken = await getGraphToken();
      const encode = encodeURIComponent;
      let url = `https://graph.microsoft.com/v1.0/users?$filter=userPrincipalName eq '${encode(email)}'&$select=id,userPrincipalName`;
      let res = await fetch(url, {
        headers: { Authorization: `Bearer ${graphToken}` }
      });
      let data = res.ok ? await res.json() : null;
      usersDebug = data;
      if (data && Array.isArray(data.value) && data.value.length) {
        userId = data.value[0].id;
        lookedUp = true;
        // Get appRoleAssignments debug
        let appRoleUrl = `https://graph.microsoft.com/v1.0/users/${encode(userId)}/appRoleAssignments`;
        let appRoleRes = await fetch(appRoleUrl, { headers: { Authorization: `Bearer ${graphToken}` } });
        appRoleAssignmentsDebug = appRoleRes.ok ? await appRoleRes.json() : null;
        roles = await getUserAppRoles(userId);
      } else {
        // Try exact external UPN fallback for this tenant
        const extUpn = 'l.pielikys_gmail.com#EXT#@lpielikysgmail.onmicrosoft.com';
        url = `https://graph.microsoft.com/v1.0/users?$filter=userPrincipalName eq '${encode(extUpn)}'&$select=id,userPrincipalName`;
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${graphToken}` }
        });
        data = res.ok ? await res.json() : null;
        usersDebug = data;
        if (data && Array.isArray(data.value) && data.value.length) {
          userId = data.value[0].id;
          lookedUp = true;
          // Get appRoleAssignments debug
          let appRoleUrl = `https://graph.microsoft.com/v1.0/users/${encode(userId)}/appRoleAssignments`;
          let appRoleRes = await fetch(appRoleUrl, { headers: { Authorization: `Bearer ${graphToken}` } });
          appRoleAssignmentsDebug = appRoleRes.ok ? await appRoleRes.json() : null;
          roles = await getUserAppRoles(userId);
        } else {
          // Try startswith fallback for debugging
          url = `https://graph.microsoft.com/v1.0/users?$filter=startswith(userPrincipalName,'l.pielikys')&$select=id,userPrincipalName`;
          res = await fetch(url, {
            headers: { Authorization: `Bearer ${graphToken}` }
          });
          data = res.ok ? await res.json() : null;
          usersDebug = data;
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
        userDetails: email || null,
        usersDebug,
        appRoleAssignmentsDebug
      }, null, 2)
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
