# Pokédex Tracker API

Azure Functions backend for the Pokédex Tracker application.

## Architecture

- **Azure Functions**: Serverless compute for API endpoints
- **Cosmos DB (MongoDB API)**: NoSQL database for user data and comments
- **Azure Blob Storage**: File storage for uploaded media (screenshots)
- **Event Grid**: Event-driven architecture for emitting events

## Prerequisites

- Node.js 18.x or higher
- Azure Functions Core Tools (`npm install -g azure-functions-core-tools@4`)
- Azure account with:
  - Azure Static Web App
  - Cosmos DB account (MongoDB API)
  - Azure Blob Storage account
  - Event Grid Topic (optional)

## Local Development

### 1. Install Dependencies

```bash
cd api
npm install
```

**Note:** Dependencies are managed within the `/api` folder, where `package.json` is located.

### 2. Configure Local Settings

Create a `local.settings.json` file from the template in the repository root:

```bash
cp ../local.settings.json.template ../local.settings.json
```

Then update `../local.settings.json` with your connection strings:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "COSMOS_DB_CONNECTION_STRING": "mongodb://localhost:27017",
    "COSMOS_DB_DATABASE_NAME": "pokedextracker",
    "COSMOS_DB_COLLECTION_NAME": "userdex",
    "BLOB_STORAGE_CONNECTION_STRING": "DefaultEndpointsProtocol=https;AccountName=...",
    "BLOB_STORAGE_CONTAINER_NAME": "pokemon-media",
    "EVENT_GRID_TOPIC_ENDPOINT": "https://your-topic.region.eventgrid.azure.net/api/events",
    "EVENT_GRID_TOPIC_KEY": "your-event-grid-key"
  }
}
```

**Note:** The `local.settings.json` file is excluded from version control to protect sensitive connection strings.

### 3. Run Locally

```bash
cd api
func start
```

**Note:** Run this command from the `/api` directory. Azure Functions Core Tools will read the `host.json` and `function.json` files from this location.

The API will be available at `http://localhost:7071/api`

## API Endpoints

### 1. GET /api/pokedex

Returns all Pokémon for a selected region, sorted by Pokédex number.

**Query Parameters:**
- `region` (required): Region name (`kanto`, `johto`, `hoenn`, `sinnoh`, `unova`, `kalos`, `alola`, `galar`)

**Example Request:**
```bash
GET /api/pokedex?region=kanto
```

**Example Response:**
```json
{
  "region": "kanto",
  "count": 151,
  "pokemon": [
    {
      "id": 1,
      "name": "pokemon-1",
      "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png",
      "spriteShiny": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/1.png",
      "region": "kanto"
    }
  ]
}
```

### 2. PUT /api/userdex

Toggles the caught status for a Pokémon for the current user.

**Request Body:**
```json
{
  "userId": "user_123",
  "pokemonId": 25,
  "caught": true,
  "shiny": false,
  "notes": "Caught in Victory Road",
  "screenshot": "base64_encoded_or_url"
}
```

**Parameters:**
- `userId` (required): Unique user identifier
- `pokemonId` (required): Pokémon Dex number
- `caught` (optional): `true` to mark as caught, `false` to uncatch. Defaults to `true`
- `shiny` (optional): Whether the Pokémon is shiny
- `notes` (optional): User notes about the catch
- `screenshot` (optional): Base64 encoded image or URL

**Example Response:**
```json
{
  "success": true,
  "message": "Pokémon caught successfully",
  "action": "caught",
  "pokemonId": 25
}
```

**Event Emitted:**
- Event Type: `PokedexTracker.UserDex.Updated`
- Subject: `userdex/{userId}/{pokemonId}`

### 3. POST /api/comments

Saves a comment for a Pokémon entry.

**Request Body:**
```json
{
  "userId": "user_123",
  "pokemonId": 25,
  "comment": "This Pikachu is my favorite!"
}
```

**Parameters:**
- `userId` (required): Unique user identifier
- `pokemonId` (required): Pokémon Dex number
- `comment` (required): Comment text

**Example Response:**
```json
{
  "success": true,
  "message": "Comment saved successfully",
  "commentId": "507f1f77bcf86cd799439011",
  "pokemonId": 25
}
```

**Event Emitted:**
- Event Type: `PokedexTracker.Comment.Created`
- Subject: `comments/{userId}/{pokemonId}`

### 4. POST /api/media

Accepts an uploaded file and stores it in Azure Blob Storage.

**Request Body:**
```json
{
  "userId": "user_123",
  "pokemonId": 25,
  "file": "base64_encoded_file_data",
  "fileName": "pikachu_screenshot.png",
  "contentType": "image/png"
}
```

**Parameters:**
- `userId` (required): Unique user identifier
- `pokemonId` (required): Pokémon Dex number
- `file` (required): Base64 encoded file data
- `fileName` (optional): Original file name (used for extension)
- `contentType` (optional): MIME type (defaults to `image/png`)

**Example Response:**
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "url": "https://yourstorage.blob.core.windows.net/pokemon-media/user_123/25/uuid.png",
  "blobName": "user_123/25/uuid.png",
  "pokemonId": 25
}
```

**Event Emitted:**
- Event Type: `PokedexTracker.Media.Uploaded`
- Subject: `media/{userId}/{pokemonId}`

## Database Schema

### Cosmos DB Collections

#### userdex Collection
```json
{
  "_id": "ObjectId",
  "userId": "user_123",
  "pokemonId": 25,
  "caught": true,
  "shiny": false,
  "notes": "Caught in Victory Road",
  "screenshot": "base64_or_url",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### comments Collection
```json
{
  "_id": "ObjectId",
  "userId": "user_123",
  "pokemonId": 25,
  "comment": "This Pikachu is my favorite!",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

## Event Grid Events

All events follow this structure:

```json
{
  "eventType": "PokedexTracker.{Resource}.{Action}",
  "subject": "{resource}/{userId}/{pokemonId}",
  "dataVersion": "1.0",
  "data": {
    "userId": "user_123",
    "pokemonId": 25,
    "timestamp": "2024-01-01T00:00:00.000Z"
  },
  "eventTime": "2024-01-01T00:00:00.000Z"
}
```

### Event Types

1. **PokedexTracker.UserDex.Updated**
   - Emitted when a Pokémon is caught or uncaught
   - Includes `action` field: `caught`, `uncaught`, or `updated`

2. **PokedexTracker.Comment.Created**
   - Emitted when a comment is created
   - Includes `commentId`

3. **PokedexTracker.Media.Uploaded**
   - Emitted when media is uploaded
   - Includes `blobName`, `blobUrl`, `fileSize`, and `contentType`

## Deployment

### Azure Static Web Apps

The API functions are automatically deployed as part of the Azure Static Web App deployment.

**Repository Structure:**
- Frontend: `PokedexTracker/frontend`
- API Functions: `api/` (at repository root)
- Configuration files: `host.json`, `package.json` are located **inside the `api/` directory**
- Local settings template: `local.settings.json.template` (at repository root)

**Important:** The `host.json` and `package.json` files **must** be in the `api/` directory for Azure Static Web Apps to properly detect and deploy the Functions.

**Setup Steps:**

1. Ensure the GitHub Actions workflow has `api_location: "api"` configured
2. Ensure `host.json` and `package.json` are in the `api/` directory
3. Configure environment variables in Azure Portal (Configuration → Application settings):
   - `COSMOS_DB_CONNECTION_STRING`
   - `COSMOS_DB_DATABASE_NAME`
   - `COSMOS_DB_COLLECTION_NAME`
   - `BLOB_STORAGE_CONNECTION_STRING`
   - `BLOB_STORAGE_CONTAINER_NAME`
   - `EVENT_GRID_TOPIC_ENDPOINT`
   - `EVENT_GRID_TOPIC_KEY`

4. The Azure Static Web Apps deployment action will automatically:
   - Deploy the frontend from `PokedexTracker/frontend`
   - Deploy the API functions from `api/`
   - Install dependencies from `api/package.json`

## Testing

### Using cURL

```bash
# Get Pokémon for Kanto region
curl "http://localhost:7071/api/pokedex?region=kanto"

# Mark a Pokémon as caught
curl -X PUT "http://localhost:7071/api/userdex" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_123","pokemonId":25,"caught":true}'

# Add a comment
curl -X POST "http://localhost:7071/api/comments" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_123","pokemonId":25,"comment":"Great catch!"}'

# Upload media
curl -X POST "http://localhost:7071/api/media" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_123","pokemonId":25,"file":"base64data","fileName":"screenshot.png"}'
```

## Troubleshooting

### Connection Issues

If you encounter connection issues:

1. Verify connection strings in `local.settings.json`
2. Ensure Cosmos DB firewall allows your IP
3. Check if Blob Storage account is accessible

### CORS Issues

CORS is configured in `local.settings.json` for local development. For production, configure CORS in Azure Portal under your Static Web App settings.

## License

MIT
