const { getClientPrincipal } = require('../shared/utils');

// Minimal handler to verify function is loaded and reachable. Once confirmed,
// we can re-enable the Graph role lookup.
module.exports = async function (context, req) {
  const principal = getClientPrincipal(req);
  const summary = principal ? {
    identityProvider: principal.identityProvider,
    userId: principal.userId,
    userDetails: principal.userDetails,
    userRoles: principal.userRoles
  } : null;

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, principal: summary })
  };
};
