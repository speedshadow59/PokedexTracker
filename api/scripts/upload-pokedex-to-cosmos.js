// upload-pokedex-to-cosmos.js
// Uploads Pokédex data to Azure Cosmos DB (using environment variables for secrets)
import { CosmosClient } from "@azure/cosmos";
import fs from "fs";

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE || "pokeapi";
const containerId = process.env.COSMOS_CONTAINER || "pokedex";

const data = JSON.parse(fs.readFileSync("pokedex-azure.json", "utf8")).value;
const client = new CosmosClient({ endpoint, key });

async function uploadData() {
  const container = client.database(databaseId).container(containerId);
  for (const item of data) {
    try {
      await container.items.create(item);
      console.log(`Uploaded: ${item.name}`);
    } catch (err) {
      console.error(`Error uploading ${item.name}:`, err.message);
    }
  }
  console.log("Upload complete!");
}

uploadData();
