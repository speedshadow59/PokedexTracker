const { getClientPrincipal } = require('../shared/utils');

/**
 * GET /api/roles
 * Returns the authenticated user's Entra app roles (or built-ins when using Simple auth)
 * Called by SWA to populate user roles for route enforcement
 */
module.exports = async function (context, req) {
  try {
    context.log('roles function alive');
    const principal = getClientPrincipal(req);
    
    if (!principal) {
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: []
      };
      return;
    }

    // Extract roles from userRoles array (Entra app roles)
    const roles = principal.userRoles || [];

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: roles
    };

  } catch (error) {
    context.log.error('Error fetching user roles:', error);
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: []
    };
  }
};
