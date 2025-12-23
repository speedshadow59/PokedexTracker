const { connectToDatabase, getBlobServiceClient } = require('../shared/utils');

module.exports = async function (context, req) {
  const startedAt = new Date();
  const result = {
    startedAt,
    env: {
      COSMOS_DB_CONNECTION_STRING: !!process.env.COSMOS_DB_CONNECTION_STRING,
      COSMOS_DB_DATABASE_NAME: !!process.env.COSMOS_DB_DATABASE_NAME,
      COSMOS_DB_COLLECTION_NAME: !!process.env.COSMOS_DB_COLLECTION_NAME,
      BLOB_STORAGE_CONNECTION_STRING: !!process.env.BLOB_STORAGE_CONNECTION_STRING,
      BLOB_STORAGE_CONTAINER_NAME: !!process.env.BLOB_STORAGE_CONTAINER_NAME
    },
    checks: {
      cosmos: { ok: false, message: null },
      blob: { ok: false, message: null }
    }
  };

  // Cosmos DB check
  try {
    const db = await connectToDatabase();
    const collections = await db.listCollections().toArray();
    result.checks.cosmos.ok = true;
    result.checks.cosmos.message = `Connected. Collections: ${collections.map(c => c.name).join(', ')}`;
  } catch (err) {
    result.checks.cosmos.ok = false;
    result.checks.cosmos.message = err && err.message ? err.message : String(err);
  }

  // Blob Storage check
  try {
    const client = getBlobServiceClient();
    const containerName = process.env.BLOB_STORAGE_CONTAINER_NAME || 'pokemon-media';
    const containerClient = client.getContainerClient(containerName);
    const exists = await containerClient.exists();
    if (!exists) {
      await containerClient.create({ access: 'blob' });
    }
    const props = await containerClient.getProperties();
    result.checks.blob.ok = true;
    result.checks.blob.message = `Container '${containerName}' is ready.`;
  } catch (err) {
    result.checks.blob.ok = false;
    result.checks.blob.message = err && err.message ? err.message : String(err);
  }

  context.res = {
    status: (result.checks.cosmos.ok && result.checks.blob.ok) ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
    body: result
  };
};
