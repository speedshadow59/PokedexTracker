# Frontend-Backend Integration Guide

## Overview
The Pokédex Tracker now properly connects the frontend to the backend API, following the requirement:
- **Use PokeAPI for GET operations** (fetching Pokemon data)
- **Use backend endpoints for everything else** (saving, updating, deleting caught Pokemon)

## Architecture

### Data Flow

1. **Fetching Pokemon Data (GET)**
   - Frontend calls **PokeAPI** directly (`https://pokeapi.co/api/v2/pokemon/{id}`)
   - Retrieves Pokemon details including sprites, types, and names
   - This data is displayed in the UI

2. **Saving Caught Pokemon (PUT)**
   - User marks a Pokemon as caught
   - Frontend calls **backend API**: `PUT /api/userdex`
   - Backend saves to Cosmos DB
   - Local storage is updated as a cache

3. **Uploading Screenshots (POST)**
   - User uploads a screenshot
   - Frontend calls **backend API**: `POST /api/media`
   - Backend uploads to Azure Blob Storage
   - Returns a URL that is saved with the Pokemon data

4. **Uncatching Pokemon (PUT)**
   - User marks a Pokemon as uncaught
   - Frontend calls **backend API**: `PUT /api/userdex` with `caught: false`
   - Backend removes from Cosmos DB
   - Local storage is updated

## API Configuration

The frontend uses `js/config.js` to determine the API base URL:

- **Local Development**: `http://localhost:7071/api`
- **Production (Azure Static Web Apps)**: `/api`

## Files Modified

1. **PokedexTracker/frontend/js/config.js** (NEW)
   - Configures API base URL based on environment

2. **PokedexTracker/frontend/js/script.js** (MODIFIED)
   - Added `syncPokemonToBackend()` - syncs caught Pokemon to backend
   - Added `uploadScreenshotToBackend()` - uploads screenshots to blob storage
   - Added `uncatchPokemonOnBackend()` - removes caught status from backend
   - Removed TODO comments, replaced with actual API calls

3. **PokedexTracker/frontend/index.html** (MODIFIED)
   - Added `<script src="js/config.js"></script>` before script.js

## Backend Endpoints Used

### 1. PUT /api/userdex
**Purpose**: Save or update caught Pokemon data

**Request Body**:
```json
{
  "userId": "user_123",
  "pokemonId": 25,
  "caught": true,
  "shiny": false,
  "notes": "Caught in Victory Road",
  "screenshot": "https://blob-url/screenshot.png"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Pokémon caught successfully",
  "action": "caught",
  "pokemonId": 25
}
```

### 2. POST /api/media
**Purpose**: Upload screenshot to Azure Blob Storage

**Request Body**:
```json
{
  "userId": "user_123",
  "pokemonId": 25,
  "file": "data:image/png;base64,...",
  "fileName": "pokemon_25_screenshot.png",
  "contentType": "image/png"
}
```

**Response**:
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "url": "https://storage.azure.com/blob-url/screenshot.png",
  "blobName": "user_123/25/uuid.png",
  "pokemonId": 25
}
```

## Testing

### Local Development

1. **Start Backend API**:
   ```bash
   cd api
   npm install
   func start
   ```
   Backend will run at `http://localhost:7071`

2. **Start Frontend**:
   ```bash
   cd PokedexTracker/frontend
   python -m http.server 8000
   ```
   Frontend will run at `http://localhost:8000`

3. **Test Flow**:
   - Open `http://localhost:8000` in browser
   - Select a region (e.g., Kanto)
   - Pokemon list loads from PokeAPI ✓
   - Click a Pokemon to open modal
   - Toggle shiny, add notes, upload screenshot
   - Click Save
   - Check browser console for "Successfully synced to backend" ✓

### Production

In Azure Static Web Apps:
- Frontend is served from `/PokedexTracker/frontend`
- Backend API is automatically available at `/api`
- Configuration in `staticwebapp.config.json` or GitHub workflow

## Error Handling

The integration is designed to be resilient:

- **Backend unavailable**: Data is saved to local storage, syncing will fail gracefully
- **Screenshot upload fails**: Pokemon is still marked as caught, screenshot is optional
- **Network errors**: Logged to console, user can retry

## Environment Variables (Backend)

Required for backend to work:
- `COSMOS_DB_CONNECTION_STRING`
- `COSMOS_DB_DATABASE_NAME`
- `COSMOS_DB_COLLECTION_NAME`
- `BLOB_STORAGE_CONNECTION_STRING`
- `BLOB_STORAGE_CONTAINER_NAME`

## Summary

✅ **PokeAPI used for GET**: Fetching Pokemon details  
✅ **Backend API used for POST/PUT**: Saving, updating, deleting caught Pokemon  
✅ **Screenshot uploads**: Via backend media endpoint to blob storage  
✅ **Graceful fallback**: Local storage used when backend unavailable  
✅ **Production ready**: Configured for Azure Static Web Apps
