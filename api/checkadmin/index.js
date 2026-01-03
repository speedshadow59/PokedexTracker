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
        // For each user, fetch their app roles and set isAdmin accordingly
        const users = await Promise.all((data.value || []).map(async u => {
          let roles = [];
          try {
            roles = await getUserAppRoles(u.id);
          } catch (e) {
            // If role lookup fails, treat as non-admin
            roles = [];
          }
          return {
            id: u.id,
            name: u.displayName || u.userPrincipalName || u.mail,
            email: u.mail || u.userPrincipalName,
            isAdmin: roles.includes('Admin'),
            blocked: u.accountEnabled === false
          };
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

    // Default: original checkadmin logic
    let userId = null;
    let roles = [];
    let lookedUp = false;
    let email = principal.userDetails;
    let usersDebug = {};
    let appRoleAssignmentsDebug = null;
    if (email) {
      const graphToken = await getGraphToken();
      const encode = encodeURIComponent;
      // 1. Try userPrincipalName eq email
      let url = `https://graph.microsoft.com/v1.0/users?$filter=userPrincipalName eq '${encode(email)}'&$select=id,userPrincipalName`;
      let res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
      let data = res.ok ? await res.json() : null;
      usersDebug.byEmail = data;
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
      }
      if (!(data && Array.isArray(data.value) && data.value.length)) {
        // 3. Try mail eq email
        url = `https://graph.microsoft.com/v1.0/users?$filter=mail eq '${encode(email)}'&$select=id,userPrincipalName`;
        res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
        data = res.ok ? await res.json() : null;
        usersDebug.byMail = data;
      }
      if (!(data && Array.isArray(data.value) && data.value.length)) {
        // 4. Try otherMails/any(x:x eq email)
        url = `https://graph.microsoft.com/v1.0/users?$filter=otherMails/any(x:x eq '${encode(email)}')&$select=id,userPrincipalName`;
        res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
        data = res.ok ? await res.json() : null;
        usersDebug.byOtherMails = data;
      }
      if (!(data && Array.isArray(data.value) && data.value.length)) {
        // 5. Try startswith(userPrincipalName, local part)
        const local = email.split('@')[0];
        url = `https://graph.microsoft.com/v1.0/users?$filter=startswith(userPrincipalName,'${encode(local)}')&$select=id,userPrincipalName`;
        res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
        data = res.ok ? await res.json() : null;
        usersDebug.byStartsWith = data;
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
}
