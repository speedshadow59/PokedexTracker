// upload-pokedex-to-mongodb.js
// Uploads Pokédex data to MongoDB (using environment variables for secrets)
import { MongoClient } from "mongodb";
import fs from "fs";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DATABASE || "pokeapi";
const collectionName = process.env.MONGODB_COLLECTION || "pokedex";

const data = JSON.parse(fs.readFileSync("pokedex-azure.json", "utf8")).value;

async function uploadData() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const result = await collection.insertMany(data);
    console.log(`Inserted ${result.insertedCount} documents.`);
  } catch (err) {
    console.error("Error uploading data:", err.message);
  } finally {
    await client.close();
  }
}

uploadData();
