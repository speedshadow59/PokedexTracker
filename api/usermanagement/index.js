// Usermanagement endpoint is obsolete. Use /api/checkadmin instead.
module.exports = async function (context, req) {
    context.res = {
        status: 410,
        body: { error: 'This endpoint is obsolete. Use /api/checkadmin instead.' }
    };
}
