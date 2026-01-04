const { connectToDatabase, getBlobServiceClient } = require('../shared/utils');

module.exports = async function (context, req) {
  const startedAt = new Date();
  const result = {
    startedAt,
    message: 'Content moderation test function',
    action: req.query?.action || req.body?.action,
    test: 'Function is working'
  };

  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: result
  };
};
