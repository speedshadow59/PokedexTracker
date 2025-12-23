// Storage keys
const STORAGE_KEY = 'pokedexTracker';
const USER_ID_KEY = 'pokedexUserId';

// State
let currentRegion = null;
let currentPokemonList = [];
let selectedPokemon = null;

// Initialize user ID if not exists
function getUserId() {
    let userId = localStorage.getItem(USER_ID_KEY);
    if (!userId) {
        userId = 'user_' + Date.now();
        localStorage.setItem(USER_ID_KEY, userId);
    }
    return userId;
}

// Get caught Pokemon data from storage
function getCaughtData() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
}

// Save caught Pokemon data to storage
function saveCaughtData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Load user's caught Pokemon data from backend
async function loadUserCaughtData() {
    try {
        const userId = getUserId();
        const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/userdex?userId=${userId}`);
        
        if (response.ok) {
            const data = await response.json();
            // Merge backend data with local storage
            const localData = getCaughtData();
            const mergedData = { ...localData };
            
            // Backend data takes precedence
            if (data.pokemon && Array.isArray(data.pokemon)) {
                data.pokemon.forEach(entry => {
                    mergedData[entry.pokemonId] = {
                        caught: entry.caught,
                        shiny: entry.shiny || false,
                        notes: entry.notes || '',
                        screenshot: entry.screenshot || null,
                        timestamp: entry.updatedAt ? new Date(entry.updatedAt).getTime() : Date.now()
                    };
                });
            }
            
            saveCaughtData(mergedData);
        }
    } catch (error) {
        console.log('Could not load user data from backend, using local storage:', error);
        // If backend is not available, continue with local storage
    }
}


// Initialize the app
document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    updateProgress();
    loadFromURL();
});

// Load region from URL if present
function loadFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const region = urlParams.get('region');
    
    if (region) {
        const regionBtn = document.querySelector(`[data-region="${region}"]`);
        if (regionBtn) {
            regionBtn.click();
        }
    }
}

// Handle browser back/forward buttons
window.addEventListener('popstate', (event) => {
    const urlParams = new URLSearchParams(window.location.search);
    const region = urlParams.get('region');
    
    if (region) {
        const regionBtn = document.querySelector(`[data-region="${region}"]`);
        if (regionBtn) {
            const offset = parseInt(regionBtn.dataset.offset);
            const limit = parseInt(regionBtn.dataset.limit);
            
            currentRegion = region;
            document.querySelector('.region-selector').style.display = 'none';
            document.getElementById('pokedexSection').style.display = 'block';
            document.getElementById('regionTitle').textContent = regionBtn.textContent + ' Pokédex';
            document.getElementById('loadingSpinner').style.display = 'block';
            document.getElementById('pokemonGrid').innerHTML = '';
            
            fetchPokemonByRegion(offset, limit);
        }
    } else {
        // No region in URL, show region selector
        document.getElementById('pokedexSection').style.display = 'none';
        document.querySelector('.region-selector').style.display = 'block';
        currentRegion = null;
        currentPokemonList = [];
    }
});

function setupEventListeners() {
    // Region buttons
    document.querySelectorAll('.region-btn').forEach(btn => {
        btn.addEventListener('click', handleRegionClick);
    });
    
    // Back button
    document.getElementById('backBtn').addEventListener('click', () => {
        // Remove region from URL
        const url = new URL(window.location);
        url.searchParams.delete('region');
        window.history.pushState({}, '', url);
        
        document.getElementById('pokedexSection').style.display = 'none';
        document.querySelector('.region-selector').style.display = 'block';
        currentRegion = null;
        currentPokemonList = [];
    });
    
    // Modal close
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('pokemonModal').addEventListener('click', (e) => {
        if (e.target.id === 'pokemonModal') {
            closeModal();
        }
    });
    
    // Modal buttons
    document.getElementById('saveBtn').addEventListener('click', savePokemonData);
    document.getElementById('uncatchBtn').addEventListener('click', uncatchPokemon);
    
    // Screenshot upload preview
    document.getElementById('screenshotUpload').addEventListener('change', handleScreenshotUpload);
}

async function handleRegionClick(e) {
    const btn = e.target;
    const region = btn.dataset.region;
    const offset = parseInt(btn.dataset.offset);
    const limit = parseInt(btn.dataset.limit);
    
    currentRegion = region;
    
    // Update URL with selected region
    const url = new URL(window.location);
    url.searchParams.set('region', region);
    window.history.pushState({ region, offset, limit }, '', url);
    
    // Update UI
    document.querySelector('.region-selector').style.display = 'none';
    document.getElementById('pokedexSection').style.display = 'block';
    document.getElementById('regionTitle').textContent = btn.textContent + ' Pokédex';
    
    // Show loading spinner
    document.getElementById('loadingSpinner').style.display = 'block';
    document.getElementById('pokemonGrid').innerHTML = '';
    
    // Fetch Pokemon from PokeAPI
    await fetchPokemonByRegion(offset, limit);
}

async function fetchPokemonByRegion(offset, limit) {
    try {
        currentPokemonList = [];

        const batchSize = 20;
        const spinnerTextEl = document.getElementById('loadingSpinner').querySelector('p');

        for (let start = 1; start <= limit; start += batchSize) {
            const end = Math.min(limit, start + batchSize - 1);
            const batchPromises = [];

            for (let i = start; i <= end; i++) {
                const dexNumber = offset + i;
                batchPromises.push(fetchPokemonDetails(dexNumber));
            }

            const batchResults = await Promise.all(batchPromises);

            batchResults.forEach(pokemon => {
                if (pokemon) {
                    currentPokemonList.push(pokemon);
                }
            });

            if (spinnerTextEl) {
                spinnerTextEl.textContent = 'Loading Pokémon... ' + currentPokemonList.length + '/' + limit;
            }

            renderPokemonGrid();
            updateProgress();
        }

        document.getElementById('loadingSpinner').style.display = 'none';

    } catch (error) {
        console.error('Error fetching Pokemon:', error);
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('pokemonGrid').innerHTML = '<p style="text-align: center; color: #666;">Error loading Pokémon. Please try again.</p>';
    }
}

async function fetchPokemonDetails(dexNumber) {
    try {
        // Try to fetch from PokeAPI first
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${dexNumber}`);
        if (response.ok) {
            const data = await response.json();
            return {
                id: data.id,
                name: data.name,
                sprite: data.sprites.front_default,
                spriteShiny: data.sprites.front_shiny,
                types: data.types.map(t => t.type.name)
            };
        }
    } catch (error) {
        // API call failed, use fallback data
    }
    
    // Fallback: generate Pokemon data using sprite URLs that work without CORS
    const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dexNumber}.png`;
    const spriteShinyUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${dexNumber}.png`;
    
    return {
        id: dexNumber,
        name: getPokemonName(dexNumber),
        sprite: spriteUrl,
        spriteShiny: spriteShinyUrl,
        types: getPokemonTypes(dexNumber)
    };
}

// Helper function to get Pokemon names (first 151 for Kanto)
function getPokemonName(id) {
    const names = {
        1: 'bulbasaur', 2: 'ivysaur', 3: 'venusaur', 4: 'charmander', 5: 'charmeleon',
        6: 'charizard', 7: 'squirtle', 8: 'wartortle', 9: 'blastoise', 10: 'caterpie',
        11: 'metapod', 12: 'butterfree', 13: 'weedle', 14: 'kakuna', 15: 'beedrill',
        16: 'pidgey', 17: 'pidgeotto', 18: 'pidgeot', 19: 'rattata', 20: 'raticate',
        21: 'spearow', 22: 'fearow', 23: 'ekans', 24: 'arbok', 25: 'pikachu',
        26: 'raichu', 27: 'sandshrew', 28: 'sandslash', 29: 'nidoran-f', 30: 'nidorina',
        31: 'nidoqueen', 32: 'nidoran-m', 33: 'nidorino', 34: 'nidoking', 35: 'clefairy',
        36: 'clefable', 37: 'vulpix', 38: 'ninetales', 39: 'jigglypuff', 40: 'wigglytuff',
        41: 'zubat', 42: 'golbat', 43: 'oddish', 44: 'gloom', 45: 'vileplume',
        46: 'paras', 47: 'parasect', 48: 'venonat', 49: 'venomoth', 50: 'diglett',
        51: 'dugtrio', 52: 'meowth', 53: 'persian', 54: 'psyduck', 55: 'golduck',
        56: 'mankey', 57: 'primeape', 58: 'growlithe', 59: 'arcanine', 60: 'poliwag',
        61: 'poliwhirl', 62: 'poliwrath', 63: 'abra', 64: 'kadabra', 65: 'alakazam',
        66: 'machop', 67: 'machoke', 68: 'machamp', 69: 'bellsprout', 70: 'weepinbell',
        71: 'victreebel', 72: 'tentacool', 73: 'tentacruel', 74: 'geodude', 75: 'graveler',
        76: 'golem', 77: 'ponyta', 78: 'rapidash', 79: 'slowpoke', 80: 'slowbro',
        81: 'magnemite', 82: 'magneton', 83: 'farfetchd', 84: 'doduo', 85: 'dodrio',
        86: 'seel', 87: 'dewgong', 88: 'grimer', 89: 'muk', 90: 'shellder',
        91: 'cloyster', 92: 'gastly', 93: 'haunter', 94: 'gengar', 95: 'onix',
        96: 'drowzee', 97: 'hypno', 98: 'krabby', 99: 'kingler', 100: 'voltorb',
        101: 'electrode', 102: 'exeggcute', 103: 'exeggutor', 104: 'cubone', 105: 'marowak',
        106: 'hitmonlee', 107: 'hitmonchan', 108: 'lickitung', 109: 'koffing', 110: 'weezing',
        111: 'rhyhorn', 112: 'rhydon', 113: 'chansey', 114: 'tangela', 115: 'kangaskhan',
        116: 'horsea', 117: 'seadra', 118: 'goldeen', 119: 'seaking', 120: 'staryu',
        121: 'starmie', 122: 'mr-mime', 123: 'scyther', 124: 'jynx', 125: 'electabuzz',
        126: 'magmar', 127: 'pinsir', 128: 'tauros', 129: 'magikarp', 130: 'gyarados',
        131: 'lapras', 132: 'ditto', 133: 'eevee', 134: 'vaporeon', 135: 'jolteon',
        136: 'flareon', 137: 'porygon', 138: 'omanyte', 139: 'omastar', 140: 'kabuto',
        141: 'kabutops', 142: 'aerodactyl', 143: 'snorlax', 144: 'articuno', 145: 'zapdos',
        146: 'moltres', 147: 'dratini', 148: 'dragonair', 149: 'dragonite', 150: 'mewtwo',
        151: 'mew'
    };
    return names[id] || `pokemon-${id}`;
}

// Helper function to get Pokemon types (simplified)
function getPokemonTypes(id) {
    const typeMap = {
        1: ['grass', 'poison'], 2: ['grass', 'poison'], 3: ['grass', 'poison'],
        4: ['fire'], 5: ['fire'], 6: ['fire', 'flying'],
        7: ['water'], 8: ['water'], 9: ['water'],
        10: ['bug'], 11: ['bug'], 12: ['bug', 'flying'],
        13: ['bug', 'poison'], 14: ['bug', 'poison'], 15: ['bug', 'poison'],
        16: ['normal', 'flying'], 17: ['normal', 'flying'], 18: ['normal', 'flying'],
        19: ['normal'], 20: ['normal'],
        21: ['normal', 'flying'], 22: ['normal', 'flying'],
        23: ['poison'], 24: ['poison'],
        25: ['electric'], 26: ['electric'],
        27: ['ground'], 28: ['ground'],
        29: ['poison'], 30: ['poison'], 31: ['poison', 'ground'],
        32: ['poison'], 33: ['poison'], 34: ['poison', 'ground'],
        35: ['fairy'], 36: ['fairy'],
        37: ['fire'], 38: ['fire'],
        39: ['normal', 'fairy'], 40: ['normal', 'fairy'],
        41: ['poison', 'flying'], 42: ['poison', 'flying'],
        43: ['grass', 'poison'], 44: ['grass', 'poison'], 45: ['grass', 'poison'],
        46: ['bug', 'grass'], 47: ['bug', 'grass'],
        48: ['bug', 'poison'], 49: ['bug', 'poison'],
        50: ['ground'], 51: ['ground'],
        52: ['normal'], 53: ['normal'],
        54: ['water'], 55: ['water'],
        56: ['fighting'], 57: ['fighting'],
        58: ['fire'], 59: ['fire'],
        60: ['water'], 61: ['water'], 62: ['water', 'fighting'],
        63: ['psychic'], 64: ['psychic'], 65: ['psychic'],
        66: ['fighting'], 67: ['fighting'], 68: ['fighting'],
        69: ['grass', 'poison'], 70: ['grass', 'poison'], 71: ['grass', 'poison'],
        72: ['water', 'poison'], 73: ['water', 'poison'],
        74: ['rock', 'ground'], 75: ['rock', 'ground'], 76: ['rock', 'ground'],
        77: ['fire'], 78: ['fire'],
        79: ['water', 'psychic'], 80: ['water', 'psychic'],
        81: ['electric', 'steel'], 82: ['electric', 'steel'],
        83: ['normal', 'flying'],
        84: ['normal', 'flying'], 85: ['normal', 'flying'],
        86: ['water'], 87: ['water', 'ice'],
        88: ['poison'], 89: ['poison'],
        90: ['water'], 91: ['water', 'ice'],
        92: ['ghost', 'poison'], 93: ['ghost', 'poison'], 94: ['ghost', 'poison'],
        95: ['rock', 'ground'],
        96: ['psychic'], 97: ['psychic'],
        98: ['water'], 99: ['water'],
        100: ['electric'], 101: ['electric'],
        102: ['grass', 'psychic'], 103: ['grass', 'psychic'],
        104: ['ground'], 105: ['ground'],
        106: ['fighting'], 107: ['fighting'],
        108: ['normal'],
        109: ['poison'], 110: ['poison'],
        111: ['ground', 'rock'], 112: ['ground', 'rock'],
        113: ['normal'],
        114: ['grass'],
        115: ['normal'],
        116: ['water'], 117: ['water'],
        118: ['water'], 119: ['water'],
        120: ['water'], 121: ['water', 'psychic'],
        122: ['psychic', 'fairy'],
        123: ['bug', 'flying'],
        124: ['ice', 'psychic'],
        125: ['electric'],
        126: ['fire'],
        127: ['bug'],
        128: ['normal'],
        129: ['water'], 130: ['water', 'flying'],
        131: ['water', 'ice'],
        132: ['normal'],
        133: ['normal'], 134: ['water'], 135: ['electric'], 136: ['fire'],
        137: ['normal'],
        138: ['rock', 'water'], 139: ['rock', 'water'],
        140: ['rock', 'water'], 141: ['rock', 'water'],
        142: ['rock', 'flying'],
        143: ['normal'],
        144: ['ice', 'flying'], 145: ['electric', 'flying'], 146: ['fire', 'flying'],
        147: ['dragon'], 148: ['dragon'], 149: ['dragon', 'flying'],
        150: ['psychic'],
        151: ['psychic']
    };
    return typeMap[id] || ['normal'];
}

function renderPokemonGrid() {
    const grid = document.getElementById('pokemonGrid');
    const caughtData = getCaughtData();
    
    grid.innerHTML = '';
    
    currentPokemonList.forEach(pokemon => {
        const card = createPokemonCard(pokemon, caughtData[pokemon.id]);
        grid.appendChild(card);
    });
}

function createPokemonCard(pokemon, caughtInfo) {
    const card = document.createElement('div');
    card.className = 'pokemon-card';
    
    if (caughtInfo) {
        card.classList.add('caught');
        if (caughtInfo.shiny) {
            card.classList.add('shiny');
        }
    }
    
    card.dataset.pokemonId = pokemon.id;
    
    const paddedId = String(pokemon.id).padStart(3, '0');
    
    const sprite = caughtInfo && caughtInfo.shiny ? pokemon.spriteShiny : pokemon.sprite;
    
    card.innerHTML = `
        <div class="pokemon-number">#${paddedId}</div>
        <img src="${sprite}" alt="${pokemon.name}" class="pokemon-sprite" loading="lazy">
        <h4 class="pokemon-name">${pokemon.name}</h4>
        <div class="pokemon-types">
            ${pokemon.types.map(type => `<span class="pokemon-type type-${type}">${type}</span>`).join('')}
        </div>
    `;
    
    card.addEventListener('click', () => openPokemonModal(pokemon));
    
    return card;
}

function openPokemonModal(pokemon) {
    selectedPokemon = pokemon;
    const caughtData = getCaughtData();
    const caughtInfo = caughtData[pokemon.id] || {};
    
    // Update modal content
    const modal = document.getElementById('pokemonModal');
    const sprite = caughtInfo.shiny ? pokemon.spriteShiny : pokemon.sprite;
    
    document.getElementById('modalSprite').src = sprite;
    document.getElementById('modalName').textContent = pokemon.name;
    document.getElementById('modalNumber').textContent = `#${String(pokemon.id).padStart(3, '0')}`;
    
    const typesHtml = pokemon.types.map(type => 
        `<span class="pokemon-type type-${type}">${type}</span>`
    ).join('');
    document.getElementById('modalTypes').innerHTML = typesHtml;
    
    // Set form values
    document.getElementById('shinyToggle').checked = caughtInfo.shiny || false;
    document.getElementById('catchNotes').value = caughtInfo.notes || '';
    
    // Handle screenshot preview
    const previewDiv = document.getElementById('screenshotPreview');
    if (caughtInfo.screenshot) {
        previewDiv.innerHTML = `<img src="${caughtInfo.screenshot}" alt="Screenshot">`;
    } else {
        previewDiv.innerHTML = '';
    }
    
    // Clear file input
    document.getElementById('screenshotUpload').value = '';
    
    // Show/hide uncatch button
    const uncatchBtn = document.getElementById('uncatchBtn');
    uncatchBtn.style.display = caughtData[pokemon.id] ? 'block' : 'none';
    
    modal.classList.add('show');
}

function closeModal() {
    document.getElementById('pokemonModal').classList.remove('show');
    selectedPokemon = null;
}

function handleScreenshotUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        const previewDiv = document.getElementById('screenshotPreview');
        previewDiv.innerHTML = `<img src="${event.target.result}" alt="Screenshot preview">`;
    };
    reader.readAsDataURL(file);
}

async function savePokemonData() {
    if (!selectedPokemon) return;
    
    const shiny = document.getElementById('shinyToggle').checked;
    const notes = document.getElementById('catchNotes').value.trim();
    const screenshotFile = document.getElementById('screenshotUpload').files[0];
    
    // Get current data
    const caughtData = getCaughtData();
    
    // Prepare Pokemon data
    const pokemonData = {
        caught: true,
        shiny: shiny,
        notes: notes,
        timestamp: Date.now()
    };
    
    // Handle screenshot
    if (screenshotFile) {
        const reader = new FileReader();
        reader.onload = function(e) {
            pokemonData.screenshot = e.target.result;
            finalizeSave(pokemonData);
        };
        reader.readAsDataURL(screenshotFile);
    } else {
        // Keep existing screenshot if any
        if (caughtData[selectedPokemon.id] && caughtData[selectedPokemon.id].screenshot) {
            pokemonData.screenshot = caughtData[selectedPokemon.id].screenshot;
        }
        finalizeSave(pokemonData);
    }
}

function finalizeSave(pokemonData) {
    const caughtData = getCaughtData();
    caughtData[selectedPokemon.id] = pokemonData;
    saveCaughtData(caughtData);
    
    // Call backend API to sync data
    syncPokemonToBackend(selectedPokemon.id, pokemonData);
    
    // Update UI
    renderPokemonGrid();
    updateProgress();
    closeModal();
}

// Sync Pokemon data to backend
async function syncPokemonToBackend(pokemonId, pokemonData) {
    try {
        const userId = getUserId();
        
        // Prepare request body
        const requestBody = {
            userId: userId,
            pokemonId: pokemonId,
            caught: pokemonData.caught,
            shiny: pokemonData.shiny,
            notes: pokemonData.notes
        };
        
        // Upload screenshot first if it's a new base64 image
        if (pokemonData.screenshot && pokemonData.screenshot.startsWith('data:')) {
            const screenshotUrl = await uploadScreenshotToBackend(pokemonId, pokemonData.screenshot);
            if (screenshotUrl) {
                requestBody.screenshot = screenshotUrl;
            }
        } else if (pokemonData.screenshot) {
            // Existing screenshot URL
            requestBody.screenshot = pokemonData.screenshot;
        }
        
        // Call backend API to save Pokemon data
        const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/userdex`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            console.error('Failed to sync to backend:', await response.text());
        } else {
            console.log('Successfully synced to backend');
        }
    } catch (error) {
        console.error('Error syncing to backend:', error);
        // Continue anyway - local storage will preserve the data
    }
}

// Upload screenshot to backend
async function uploadScreenshotToBackend(pokemonId, base64Data) {
    try {
        const userId = getUserId();
        
        // Extract content type from base64 string
        const matches = base64Data.match(/^data:(image\/\w+);base64,/);
        const contentType = matches ? matches[1] : 'image/png';
        
        const requestBody = {
            userId: userId,
            pokemonId: pokemonId,
            file: base64Data,
            fileName: `pokemon_${pokemonId}_screenshot.png`,
            contentType: contentType
        };
        
        const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.url;
        } else {
            console.error('Failed to upload screenshot:', await response.text());
            return null;
        }
    } catch (error) {
        console.error('Error uploading screenshot:', error);
        return null;
    }
}


function uncatchPokemon() {
    if (!selectedPokemon) return;
    
    if (!confirm('Are you sure you want to mark this Pokémon as uncaught?')) {
        return;
    }
    
    const caughtData = getCaughtData();
    delete caughtData[selectedPokemon.id];
    saveCaughtData(caughtData);
    
    // Call backend API to remove caught status
    uncatchPokemonOnBackend(selectedPokemon.id);
    
    // Update UI
    renderPokemonGrid();
    updateProgress();
    closeModal();
}

// Remove caught Pokemon from backend
async function uncatchPokemonOnBackend(pokemonId) {
    try {
        const userId = getUserId();
        
        const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/userdex`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                pokemonId: pokemonId,
                caught: false
            })
        });
        
        if (!response.ok) {
            console.error('Failed to uncatch on backend:', await response.text());
        } else {
            console.log('Successfully uncaught on backend');
        }
    } catch (error) {
        console.error('Error uncatching on backend:', error);
    }
}


function updateProgress() {
    const caughtData = getCaughtData();
    const total = currentPokemonList.length;
    const caught = currentPokemonList.filter(p => caughtData[p.id]).length;
    
    document.getElementById('progressCount').textContent = `${caught}/${total}`;
    
    const percentage = total > 0 ? (caught / total) * 100 : 0;
    document.getElementById('progressFill').style.width = `${percentage}%`;
}
