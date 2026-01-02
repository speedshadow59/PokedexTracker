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

    const roles = await getUserAppRoles(principal.userId);
    const isAdmin = roles.includes('Admin');

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        isAdmin, 
        roles,
        userId: principal.userId 
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
