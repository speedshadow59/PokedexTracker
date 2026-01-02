const { getClientPrincipal } = require('../shared/utils');

/**
 * GET /api/roles
 * Returns the authenticated user's Entra app roles (or built-ins when using Simple auth)
 * Called by SWA to populate user roles for route enforcement
 */
module.exports = async function (context, req) {
  try {
    context.log('GET /api/roles invoked', {method: req.method});
    const principal = getClientPrincipal(req);

    if (!principal) {
      context.log('No principal found');
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: []
      };
      return;
    }

    context.log('Principal:', JSON.stringify(principal));
    context.log('userRoles:', principal.userRoles);

    // Fall back to built-in authenticated if no app roles are assigned
    const roles = (principal.userRoles && principal.userRoles.length)
      ? principal.userRoles
      : ['authenticated'];
    
    context.log('Returning roles:', roles);

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
