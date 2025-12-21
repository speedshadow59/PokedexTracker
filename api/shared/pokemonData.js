// Pokemon region definitions
const REGIONS = {
  kanto: { offset: 1, limit: 151, name: 'Kanto' },
  johto: { offset: 152, limit: 100, name: 'Johto' },
  hoenn: { offset: 252, limit: 135, name: 'Hoenn' },
  sinnoh: { offset: 387, limit: 107, name: 'Sinnoh' },
  unova: { offset: 494, limit: 156, name: 'Unova' },
  kalos: { offset: 650, limit: 72, name: 'Kalos' },
  alola: { offset: 722, limit: 88, name: 'Alola' },
  galar: { offset: 810, limit: 89, name: 'Galar' }
};

/**
 * Get Pokemon data for a specific region
 * @param {string} region - The region name (e.g., 'kanto', 'johto')
 * @returns {Array} Array of Pokemon objects with id, name, and sprite URL
 */
function getPokemonByRegion(region) {
  const regionData = REGIONS[region.toLowerCase()];
  
  if (!regionData) {
    throw new Error(`Invalid region: ${region}`);
  }

  const pokemon = [];
  const { offset, limit } = regionData;

  for (let i = 0; i < limit; i++) {
    const dexNumber = offset + i;
    pokemon.push({
      id: dexNumber,
      name: `pokemon-${dexNumber}`,
      sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dexNumber}.png`,
      spriteShiny: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${dexNumber}.png`,
      region: region
    });
  }

  return pokemon;
}

/**
 * Validate if a region name is valid
 * @param {string} region - The region name
 * @returns {boolean} True if valid, false otherwise
 */
function isValidRegion(region) {
  return region && REGIONS.hasOwnProperty(region.toLowerCase());
}

/**
 * Get all available regions
 * @returns {Array} Array of region names
 */
function getAllRegions() {
  return Object.keys(REGIONS);
}

module.exports = {
  REGIONS,
  getPokemonByRegion,
  isValidRegion,
  getAllRegions
};
