// Sample Pokémon data for demonstration
const samplePokemon = [
    { id: 1, name: 'Bulbasaur', types: ['grass', 'poison'], caught: true },
    { id: 2, name: 'Ivysaur', types: ['grass', 'poison'], caught: false },
    { id: 3, name: 'Venusaur', types: ['grass', 'poison'], caught: true },
    { id: 4, name: 'Charmander', types: ['fire'], caught: false },
    { id: 5, name: 'Charmeleon', types: ['fire'], caught: false },
    { id: 6, name: 'Charizard', types: ['fire', 'flying'], caught: true },
    { id: 7, name: 'Squirtle', types: ['water'], caught: false },
    { id: 8, name: 'Wartortle', types: ['water'], caught: false },
    { id: 9, name: 'Blastoise', types: ['water'], caught: true },
    { id: 10, name: 'Caterpie', types: ['bug'], caught: false },
    { id: 11, name: 'Metapod', types: ['bug'], caught: false },
    { id: 12, name: 'Butterfree', types: ['bug', 'flying'], caught: false },
    { id: 25, name: 'Pikachu', types: ['electric'], caught: true },
    { id: 26, name: 'Raichu', types: ['electric'], caught: false },
    { id: 39, name: 'Jigglypuff', types: ['normal', 'fairy'], caught: false },
    { id: 94, name: 'Gengar', types: ['ghost', 'poison'], caught: true },
    { id: 131, name: 'Lapras', types: ['water', 'ice'], caught: false },
    { id: 150, name: 'Mewtwo', types: ['psychic'], caught: false },
];

// Initialize the app
function initApp() {
    // Update the app message
    document.getElementById('app').innerHTML = '';
    
    // Render Pokémon grid
    renderPokemonGrid(samplePokemon);
    
    // Update progress
    updateProgress(samplePokemon);
}

// Render Pokémon grid
function renderPokemonGrid(pokemonList) {
    const grid = document.getElementById('pokemon-grid');
    
    if (!pokemonList || pokemonList.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <h3>No Pokémon Yet</h3>
                <p>Start tracking your collection!</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = pokemonList.map(pokemon => createPokemonCard(pokemon)).join('');
    
    // Use event delegation for better performance
    grid.addEventListener('click', handleCardClick);
}

// Handle card click using event delegation
function handleCardClick(event) {
    const card = event.target.closest('.pokemon-card');
    if (!card) return;
    
    const pokemonId = parseInt(card.dataset.pokemonId);
    const index = samplePokemon.findIndex(p => p.id === pokemonId);
    
    if (index !== -1) {
        toggleCaught(index, card);
    }
}

// Create individual Pokémon card HTML
function createPokemonCard(pokemon) {
    const paddedId = String(pokemon.id).padStart(3, '0');
    const caughtClass = pokemon.caught ? 'caught' : '';
    const typesHtml = pokemon.types.map(type => 
        `<span class="pokemon-type type-${type}">${type}</span>`
    ).join('');
    
    // Use PokeAPI sprite URL
    const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`;
    
    return `
        <div class="pokemon-card ${caughtClass}" data-pokemon-id="${pokemon.id}">
            <div class="pokemon-number">#${paddedId}</div>
            <img src="${spriteUrl}" alt="${pokemon.name}" class="pokemon-sprite" loading="lazy">
            <h4 class="pokemon-name">${pokemon.name}</h4>
            <div class="pokemon-types">${typesHtml}</div>
        </div>
    `;
}

// Toggle caught status
function toggleCaught(index, card) {
    samplePokemon[index].caught = !samplePokemon[index].caught;
    
    // Update only the specific card instead of re-rendering everything
    if (samplePokemon[index].caught) {
        card.classList.add('caught');
    } else {
        card.classList.remove('caught');
    }
    
    updateProgress(samplePokemon);
}

// Update progress indicator
function updateProgress(pokemonList) {
    const total = pokemonList.length;
    const caught = pokemonList.filter(p => p.caught).length;
    const percentage = Math.round((caught / total) * 100);
    
    const progressText = document.querySelector('.progress-text strong');
    const progressFill = document.querySelector('.progress-fill');
    
    if (progressText) {
        progressText.textContent = `${caught}/${total}`;
    }
    
    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}