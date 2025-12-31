const { MongoClient } = require('mongodb');

const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
const databaseName = process.env.COSMOS_DB_DATABASE_NAME || 'pokedextracker';
const collectionName = process.env.COSMOS_DB_COLLECTION_NAME || 'userdex';

if (!connectionString) {
  console.error('COSMOS_DB_CONNECTION_STRING is not set.');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(connectionString);
  await client.connect();

  const collection = client.db(databaseName).collection(collectionName);

  try {
    // Pipeline update to set deterministic string id `${userId}-${pokemonId}`
    const result = await collection.updateMany(
      {},
      [
        {
          $set: {
            id: {
              $concat: [
                { $ifNull: ['$userId', ''] },
                '-',
                { $toString: '$pokemonId' }
              ]
            }
          }
        }
      ]
    );

    console.log(`Updated documents: ${result.modifiedCount}`);
  } catch (err) {
    console.error('Update failed (pipeline updates may not be supported on this account):', err.message);
    console.error('If this fails, run a manual script to read each doc and set `id = `${userId}-${pokemonId}`.`');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
