const { getClientPrincipal } = require('../shared/utils');

module.exports = async function (context, req) {
  try {
    context.log('userroles function alive');
    const principal = getClientPrincipal(req);

    if (!principal) {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: []
      };
    }

    const roles = principal.userRoles || [];

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
