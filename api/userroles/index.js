const { getClientPrincipal } = require('../shared/utils');

module.exports = async function (context, req) {
  try {
    context.log('GET /api/userroles invoked', {method: req.method});
    const principal = getClientPrincipal(req);

    if (!principal) {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: []
      };
    }

    // Fall back to built-in authenticated if no app roles are assigned
    const roles = (principal.userRoles && principal.userRoles.length)
      ? principal.userRoles
      : ['authenticated'];

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: roles
    };
  } catch (error) {
    context.log.error('Error fetching user roles:', error);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: []
    };
  }
};
