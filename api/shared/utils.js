const { MongoClient } = require('mongodb');
const { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } = require('@azure/storage-blob');
const { EventGridPublisherClient, AzureKeyCredential } = require('@azure/eventgrid');
const { Buffer } = require('buffer');

// Cosmos DB (MongoDB API) Connection
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }

  const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
  const databaseName = process.env.COSMOS_DB_DATABASE_NAME || 'pokedextracker';

  if (!connectionString) {
    throw new Error('COSMOS_DB_CONNECTION_STRING is not set');
  }

  const client = new MongoClient(connectionString);

  await client.connect();
  cachedDb = client.db(databaseName);

  return cachedDb;
}

// Blob Storage Connection
function getBlobServiceClient() {
  const connectionString = process.env.BLOB_STORAGE_CONNECTION_STRING;
  
  if (!connectionString) {
    throw new Error('BLOB_STORAGE_CONNECTION_STRING is not set');
  }

  return BlobServiceClient.fromConnectionString(connectionString);
}

// Event Grid Connection
function getEventGridClient() {
  const endpoint = process.env.EVENT_GRID_TOPIC_ENDPOINT;
  const key = process.env.EVENT_GRID_TOPIC_KEY;

  if (!endpoint || !key) {
    throw new Error('EVENT_GRID_TOPIC_ENDPOINT or EVENT_GRID_TOPIC_KEY is not set');
  }

  return new EventGridPublisherClient(endpoint, "EventGrid", new AzureKeyCredential(key));
}

// Generate SAS URL for blob with read-only permissions
function generateBlobSasUrl(blobUrl, expiryDays = 90) {
  try {
    // Parse connection string to get account name and key
    const connectionString = process.env.BLOB_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('BLOB_STORAGE_CONNECTION_STRING is not set');
    }

    const parts = connectionString.split(';');
    const accountName = parts.find(p => p.startsWith('AccountName='))?.split('=')[1];
    const accountKey = parts.find(p => p.startsWith('AccountKey='))?.split('=')[1];

    if (!accountName || !accountKey) {
      throw new Error('Could not parse account name or key from connection string');
    }

    // Parse blob URL to get container and blob name
    const url = new URL(blobUrl);
    const pathParts = url.pathname.split('/').filter(p => p);
    if (pathParts.length < 2) {
      throw new Error('Invalid blob URL format');
    }

    const containerName = pathParts[0];
    const blobName = pathParts.slice(1).join('/');

    // Create SAS token
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    const sasOptions = {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'), // read-only
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + expiryDays * 24 * 60 * 60 * 1000)
    };

    const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();
    return `${blobUrl}?${sasToken}`;
  } catch (error) {
    console.error('Error generating SAS URL:', error.message);
    return null;
  }
}

// Event Grid: Emit Event
async function emitEvent(eventType, subject, data) {
  try {
    const client = getEventGridClient();
    const events = [
      {
        eventType: eventType,
        subject: subject,
        dataVersion: '1.0',
        data: data,
        eventTime: new Date()
      }
    ];

    await client.send(events);
    console.log(`Event emitted: ${eventType}`);
  } catch (error) {
    console.error('Error emitting event:', error.message);
    // Don't throw - event emission failure shouldn't break the main flow
  }
}

function getClientPrincipal(req) {
  try {
    const header = req.headers['x-ms-client-principal'];
    if (!header) return null;
    const decoded = Buffer.from(header, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (e) {
    console.error('Failed to parse client principal:', e.message);
    return null;
  }
}

module.exports = {
  connectToDatabase,
  getBlobServiceClient,
  getEventGridClient,
  emitEvent,
  getClientPrincipal,
  generateBlobSasUrl
};
