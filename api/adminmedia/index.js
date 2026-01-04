// Admin endpoints: content moderation (list media, remove/restore)
// This function is deprecated - content moderation is now handled by useradmin
// Keeping for backward compatibility

module.exports = async function (context, req) {
    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: {
            message: 'This endpoint is deprecated. Use /api/useradmin for content moderation.',
            action: req.query?.action || req.body?.action,
            timestamp: new Date().toISOString()
        }
    };
}
