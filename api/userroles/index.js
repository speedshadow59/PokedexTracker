const { getClientPrincipal } = require('../shared/utils');

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
