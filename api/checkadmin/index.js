// Minimal test version without dependencies to debug routing
const { getClientPrincipal, getUserAppRoles } = require('../shared/utils');

module.exports = async function (context, req) {
  try {

    const principal = getClientPrincipal(req);
    // Debug: log incoming principal
    context.log('DEBUG: principal', principal);
    if (!principal || !principal.userId) {
      context.res = {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          isAdmin: false, 
          error: 'Not authenticated',
          debug: { principal }
        })
      };
      return;
    }

    let userId = null;
    let roles = [];
    let lookedUp = false;
    let upn = null;
    let usersDebug = null;
    let appRoleAssignmentsDebug = null;
    // Always use UPN for Graph lookup
    if (principal && principal.userDetails) {
      // If userDetails looks like an email, convert to B2B UPN if needed
      if (principal.userDetails.includes('@')) {
        // For B2B/guest users, Azure AD UPN is usually <email>_domain.com#EXT#@tenant.onmicrosoft.com
        // Example: laurispielikys@gmail.com -> laurispielikys_gmail.com#EXT#@lpielikysgmail.onmicrosoft.com
        const email = principal.userDetails;
        const match = email.match(/^([^@]+)@([^@]+)$/);
        if (match) {
          const local = match[1];
          const domain = match[2].replace(/\./g, '_');
          upn = `${local}_${domain}#EXT#@lpielikysgmail.onmicrosoft.com`;
        } else {
          upn = email;
        }
      } else {
        upn = principal.userDetails;
      }
      const { getGraphToken } = require('../shared/utils');
      const graphToken = await getGraphToken();
      const encode = encodeURIComponent;
      let url = `https://graph.microsoft.com/v1.0/users?$filter=userPrincipalName eq '${encode(upn)}'&$select=id,userPrincipalName`;
      let res = await fetch(url, {
        headers: { Authorization: `Bearer ${graphToken}` }
      });
      let data = res.ok ? await res.json() : null;
      usersDebug = data;
      context.log('DEBUG: Graph lookup by UPN', { upn, url, usersDebug: data });
      if (data && Array.isArray(data.value) && data.value.length) {
        userId = data.value[0].id;
        lookedUp = true;
        // Get appRoleAssignments debug
        let appRoleUrl = `https://graph.microsoft.com/v1.0/users/${encode(userId)}/appRoleAssignments`;
        let appRoleRes = await fetch(appRoleUrl, { headers: { Authorization: `Bearer ${graphToken}` } });
        appRoleAssignmentsDebug = appRoleRes.ok ? await appRoleRes.json() : null;
        context.log('DEBUG: appRoleAssignments', { userId, appRoleAssignmentsDebug });
        roles = await getUserAppRoles(userId);
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
        userDetails: principal.userDetails || null,
        debug: {
          principal,
          usersDebug,
          appRoleAssignmentsDebug
        }
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
