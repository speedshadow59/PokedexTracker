const { getClientPrincipal } = require('../shared/utils');

/**
 * GET /api/roles
 * Returns the authenticated user's Entra app roles (or built-ins when using Simple auth)
 * Called by SWA to populate user roles for route enforcement
 */
module.exports = async function (context, req) {
  try {
    const principal = getClientPrincipal(req);
    let roles = [];

    if (principal && principal.userRoles && principal.userRoles.length > 0) {
      roles = principal.userRoles;
    } else if (principal) {
      roles = ['authenticated'];
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: roles
    };

  } catch (error) {
    context.log.error('Error in roles:', error.message);
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: ['authenticated']
    };
  }
};
