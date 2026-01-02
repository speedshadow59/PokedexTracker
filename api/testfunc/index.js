// Minimal test version without dependencies to debug routing
module.exports = async function (context, req) {
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, message: 'admincheck loaded' })
  };
};
