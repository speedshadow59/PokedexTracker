const { getClientPrincipal } = require('../shared/utils');

module.exports = async function (context, req) {
  const principal = getClientPrincipal(req);
  let roles = ['authenticated'];

  if (principal && principal.userRoles && Array.isArray(principal.userRoles)) {
    // Filter to only authenticated role for signed-in users (exclude anonymous)
    roles = principal.userRoles.filter(r => r !== 'anonymous');
    if (roles.length === 0) {
      roles = ['authenticated'];
    }
  }

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(roles)
  };
};
