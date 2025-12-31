# Pokédex Tracker - Azure Static Web App

This project has been migrated from an ASP.NET Core MVC App Service to an Azure Static Web App.

## Project Structure

```
PokedexTracker/
├── .github/
│   └── workflows/      # GitHub Actions for deployment
├── PokedexTracker/
│   └── frontend/       # Static web app files
│       ├── index.html  # Main HTML file
│       ├── css/        # Stylesheets
│       ├── js/         # JavaScript files
│       ├── lib/        # Third-party libraries (Bootstrap, jQuery, etc.)
│       └── favicon.ico # Site icon
├── api/                # Azure Functions backend (at root level)
│   ├── pokedex/        # GET endpoint for Pokemon by region
│   ├── userdex/        # PUT endpoint for toggling caught status
│   ├── comments/       # POST endpoint for saving comments
│   ├── media/          # POST endpoint for media uploads
│   ├── shared/         # Shared utilities and helpers
│   ├── host.json       # Azure Functions host configuration (MUST be in api/)
│   └── package.json    # Node.js dependencies (MUST be in api/)
└── local.settings.json.template  # Template for local development settings
```

## Deployment

The project is configured to deploy to Azure Static Web Apps using GitHub Actions.

### GitHub Actions Configuration

The deployment workflow is in `.github/workflows/azure-static-web-apps-jolly-sand-089c0af03.yml`.

**Key Configuration:**
- **App Location:** `PokedexTracker/frontend`
- **API Location:** `api` *(at repository root)*
- **Output Location:** `.` (no build step required for static content)

### Deployment Steps

1. **Create Required Azure Resources:**
   - Azure Static Web App
   - Cosmos DB account (with MongoDB API enabled)
   - Azure Blob Storage account
   - Azure OpenAI resource (for embeddings powering AI search)
   - Event Grid Topic (optional, for event notifications)

2. **Configure Azure Static Web App:**
   - Configure application settings (environment variables) in Azure Portal:
     - `COSMOS_DB_CONNECTION_STRING`
     - `COSMOS_DB_DATABASE_NAME`
     - `COSMOS_DB_COLLECTION_NAME`
     - `BLOB_STORAGE_CONNECTION_STRING`
     - `BLOB_STORAGE_CONTAINER_NAME`
   - `AZURE_OPENAI_ENDPOINT`
   - `AZURE_OPENAI_KEY`
   - `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` (e.g., `text-embedding-3-large`)
   - `AZURE_OPENAI_API_VERSION` (default `2024-10-01-preview`)
     - `EVENT_GRID_TOPIC_ENDPOINT` (optional)
     - `EVENT_GRID_TOPIC_KEY` (optional)

3. **Deploy:**
   - Push changes to the `main` branch to trigger automatic deployment via GitHub Actions
   - The workflow will deploy both frontend and API automatically
   - Azure Static Web Apps will detect the API in the `/api` folder and deploy the Functions
   - **Important:** The `host.json` and `package.json` files must be inside the `api/` directory for the deployment to work correctly

### Legacy Files

The following files are deprecated and kept for reference only:
- `azure-pipelines-1.yml` - Old ASP.NET Core build configuration
- `azure-pipelines-2.yml` - Old ASP.NET Core deployment configuration  
- `azure-pipelines-3.yml` - Old multi-job ASP.NET Core pipeline

These files reference the old MVC project structure and should not be used for the current static web app deployment.

## Local Development

### Frontend

To run the frontend locally, simply open `PokedexTracker/frontend/index.html` in a web browser or serve the `frontend` directory using any static web server:

```bash
# Using Python
cd PokedexTracker/frontend
python -m http.server 8000

# Using Node.js http-server
cd PokedexTracker/frontend
npx http-server

# Using PHP
cd PokedexTracker/frontend
php -S localhost:8000
```

Then navigate to `http://localhost:8000` in your browser.

### Backend API

To run the Azure Functions backend locally:

1. Install Azure Functions Core Tools:
```bash
npm install -g azure-functions-core-tools@4
```

2. Install dependencies from the `api` directory:
```bash
cd api
npm install
```

3. Configure `local.settings.json` with your connection strings (copy from `local.settings.json.template` in the root and update values, then move to root or api directory)

4. Start the Functions runtime from the `api` directory:
```bash
cd api
func start
```

The API will be available at `http://localhost:7071/api`

**Note:** Azure Functions Core Tools reads the `host.json` from the directory where you run `func start`.

See the [API Documentation](api/README.md) for detailed information about endpoints and configuration.

## Features

- Track your Pokémon collection
- Living Dex progress tracking
- Clean, simple interface
- Serverless backend with Azure Functions
- Persistent storage with Cosmos DB
- Media uploads to Azure Blob Storage
- Event-driven architecture with Event Grid
- AI-assisted search using Azure OpenAI embeddings

## API Endpoints

The backend provides the following REST API endpoints:

- **GET /api/pokedex** - Get information about available regions (when no region specified)
- **GET /api/pokedex?region=X** - Get all Pokémon for a specific region
- **PUT /api/userdex** - Toggle caught status for a Pokémon
- **POST /api/comments** - Save a comment for a Pokémon entry
- **POST /api/media** - Upload and store media files
- **GET/POST /api/search** - AI-assisted search across caught Pokémon (embeddings + filters)

For detailed API documentation, see [api/README.md](api/README.md).

## Technologies

### Frontend
- HTML5
- CSS3
- JavaScript
- Bootstrap 5
- jQuery

### Backend
- Azure Functions (Node.js)
- Cosmos DB (MongoDB API)
- Azure Blob Storage
- Azure Event Grid
- Azure Static Web Apps
- Azure OpenAI (embeddings for AI search)
