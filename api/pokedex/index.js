const { getPokemonByRegion, isValidRegion, getAllRegions } = require('../shared/pokemonData');

/**
 * GET /api/pokedex?region=X
 * Returns all Pokémon for the selected region sorted by Dex number
 */
module.exports = async function (context, req) {
  context.log('HTTP trigger function processed a GET request for pokedex.');

  const region = req.query.region;

  // Validate region parameter
  if (!region) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: 'Missing required parameter: region',
        availableRegions: getAllRegions()
      }
    };
    return;
  }

  if (!isValidRegion(region)) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: `Invalid region: ${region}`,
        availableRegions: getAllRegions()
      }
    };
    return;
  }

  try {
    // Get Pokemon data for the region
    const pokemonList = getPokemonByRegion(region);

    // Sort by Dex number (already sorted by default, but explicit here)
    pokemonList.sort((a, b) => a.id - b.id);

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        region: region,
        count: pokemonList.length,
        pokemon: pokemonList
      }
    };
  } catch (error) {
    context.log.error('Error fetching Pokemon:', error);
    
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: 'Internal server error',
        message: error.message
      }
    };
  }
};
