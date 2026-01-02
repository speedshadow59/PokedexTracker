const { getClientPrincipal } = require('../shared/utils');

/**
 * GET /api/roles
 * Returns the authenticated user's Entra app roles (or built-ins when using Simple auth)
 * Called by SWA to populate user roles for route enforcement
 */
module.exports = async function (context, req) {
  const principal = getClientPrincipal(req);
  let roles = ['authenticated'];

  if (principal && principal.userRoles && Array.isArray(principal.userRoles) && principal.userRoles.length > 0) {
    roles = principal.userRoles;
  }

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(roles)
  };
};
