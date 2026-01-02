const { getClientPrincipal, getUserAppRoles } = require('../shared/utils');

module.exports = async function (context, req) {
  const principal = getClientPrincipal(req);
  if (!principal || !principal.userId) {
    return {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  try {
    const roles = await getUserAppRoles(principal.userId);
    const isAdmin = Array.isArray(roles) && roles.includes('Admins');

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAdmin, roles })
    };
  } catch (error) {
    context.log.error('Admin check failed:', error);
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to check admin role' })
    };
  }
};
