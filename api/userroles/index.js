const { getClientPrincipal } = require('../shared/utils');

module.exports = async function (context, req) {
  try {
    const principal = getClientPrincipal(req);
    let roles = [];

    if (principal && principal.userRoles && principal.userRoles.length > 0) {
      roles = principal.userRoles;
    } else if (principal) {
      roles = ['authenticated'];
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: roles
    };
  } catch (error) {
    context.log.error('Error in userroles:', error.message);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: ['authenticated']
    };
  }
};
