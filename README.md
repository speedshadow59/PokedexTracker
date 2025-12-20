# Pokédex Tracker - Azure Static Web App

This project has been migrated from an ASP.NET Core MVC App Service to an Azure Static Web App.

## Project Structure

```
PokedexTracker/
└── frontend/          # Static web app files
    ├── index.html     # Main HTML file
    ├── css/           # Stylesheets
    ├── js/            # JavaScript files
    ├── lib/           # Third-party libraries (Bootstrap, jQuery, etc.)
    └── favicon.ico    # Site icon
```

## Deployment

The project is configured to deploy to Azure Static Web Apps using Azure Pipelines.

### Azure Pipeline Configuration

The main pipeline configuration is in `azure-pipelines.yml` at the root level.

**Key Configuration:**
- **App Location:** `PokedexTracker/frontend`
- **Output Location:** (empty - no build step required for basic static content)

### Deployment Steps

1. Ensure you have an Azure Static Web App resource created in Azure Portal
2. Get the deployment token from your Static Web App in Azure Portal
3. Add the token as a pipeline variable named `AZURE_STATIC_WEB_APPS_API_TOKEN`
4. Push changes to the `main` branch to trigger automatic deployment

### Legacy Files

The following files are deprecated and kept for reference only:
- `azure-pipelines-1.yml` - Old ASP.NET Core build configuration
- `azure-pipelines-2.yml` - Old ASP.NET Core deployment configuration  
- `azure-pipelines-3.yml` - Old multi-job ASP.NET Core pipeline

These files reference the old MVC project structure and should not be used for the current static web app deployment.

## Local Development

To run locally, simply open `PokedexTracker/frontend/index.html` in a web browser or serve the `frontend` directory using any static web server:

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

## Features

- Track your Pokémon collection
- Living Dex progress tracking
- Clean, simple interface

## Technologies

- HTML5
- CSS3
- JavaScript
- Bootstrap 5
- jQuery
