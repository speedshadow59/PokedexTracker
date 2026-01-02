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
    let email = principal.userDetails;
    let usersDebug = {};
    let appRoleAssignmentsDebug = null;
    if (email) {
      const { getGraphToken } = require('../shared/utils');
      const graphToken = await getGraphToken();
      const encode = encodeURIComponent;
      // 1. Try userPrincipalName eq email
      let url = `https://graph.microsoft.com/v1.0/users?$filter=userPrincipalName eq '${encode(email)}'&$select=id,userPrincipalName`;
      let res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
      let data = res.ok ? await res.json() : null;
      usersDebug.byEmail = data;
      context.log('DEBUG: Graph lookup by email', { email, url, usersDebug: data });
      if (!(data && Array.isArray(data.value) && data.value.length)) {
        // 2. Try external UPN (B2B guest)
        let extUpn = email;
        if (email.includes('@')) {
          const match = email.match(/^([^@]+)@([^@]+)$/);
          if (match) {
            const local = match[1].replace(/\./g, '_');
            const domain = match[2].replace(/\./g, '_');
            extUpn = `${local}_${domain}#EXT#@lpielikysgmail.onmicrosoft.com`;
          }
        }
        url = `https://graph.microsoft.com/v1.0/users?$filter=userPrincipalName eq '${encode(extUpn)}'&$select=id,userPrincipalName`;
        res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
        data = res.ok ? await res.json() : null;
        usersDebug.byExtUpn = data;
        context.log('DEBUG: Graph lookup by extUpn', { extUpn, url, usersDebug: data });
      }
      if (!(data && Array.isArray(data.value) && data.value.length)) {
        // 3. Try mail eq email
        url = `https://graph.microsoft.com/v1.0/users?$filter=mail eq '${encode(email)}'&$select=id,userPrincipalName`;
        res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
        data = res.ok ? await res.json() : null;
        usersDebug.byMail = data;
        context.log('DEBUG: Graph lookup by mail', { email, url, usersDebug: data });
      }
      if (!(data && Array.isArray(data.value) && data.value.length)) {
        // 4. Try otherMails/any(x:x eq email)
        url = `https://graph.microsoft.com/v1.0/users?$filter=otherMails/any(x:x eq '${encode(email)}')&$select=id,userPrincipalName`;
        res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
        data = res.ok ? await res.json() : null;
        usersDebug.byOtherMails = data;
        context.log('DEBUG: Graph lookup by otherMails', { email, url, usersDebug: data });
      }
      if (!(data && Array.isArray(data.value) && data.value.length)) {
        // 5. Try startswith(userPrincipalName, local part)
        const local = email.split('@')[0];
        url = `https://graph.microsoft.com/v1.0/users?$filter=startswith(userPrincipalName,'${encode(local)}')&$select=id,userPrincipalName`;
        res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
        data = res.ok ? await res.json() : null;
        usersDebug.byStartsWith = data;
        context.log('DEBUG: Graph lookup by startswith', { local, url, usersDebug: data });
      }
      // Use first match found
      let found = null;
      for (const key of ['byEmail','byExtUpn','byMail','byOtherMails','byStartsWith']) {
        if (usersDebug[key] && Array.isArray(usersDebug[key].value) && usersDebug[key].value.length) {
          found = usersDebug[key].value[0];
          break;
        }
      }
      if (found) {
        userId = found.id;
        lookedUp = true;
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
