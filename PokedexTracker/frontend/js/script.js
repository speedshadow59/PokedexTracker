// Store Pokémon data in localStorage
const STORAGE_KEY = 'pokedexTracker';
let isEditMode = false;
let editingPokemonId = null;

// Utility function to escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
    loadPokemon();

    document.getElementById("pokemonForm").addEventListener("submit", handleFormSubmit);
});

function handleFormSubmit(e) {
    e.preventDefault();
    if (isEditMode && editingPokemonId) {
        updatePokemon(editingPokemonId);
    } else {
        createPokemon();
    }
}

function loadPokemon() {
    console.log("Loading Pokémon...");
    const pokemonData = getPokemonFromStorage();
    renderPokemon(pokemonData);
}

function getPokemonFromStorage() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

function savePokemonToStorage(pokemonData) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pokemonData));
}

function renderPokemon(pokemonData) {
    const grid = document.getElementById("pokemonGrid");
    
    if (pokemonData.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No Pokémon yet. Add your first one above!</p>';
        return;
    }
    
    // Clear grid first
    grid.innerHTML = '';
    
    // Create cards using DOM methods to prevent XSS
    pokemonData.forEach(pokemon => {
        const card = document.createElement('div');
        card.className = 'pokemon-card';
        card.dataset.id = pokemon.id;
        
        const img = document.createElement('img');
        img.src = pokemon.image;
        img.alt = escapeHtml(pokemon.name);
        
        const nameHeading = document.createElement('h3');
        nameHeading.textContent = pokemon.name;
        
        const typeSpan = document.createElement('span');
        typeSpan.className = 'type';
        typeSpan.textContent = pokemon.type;
        
        const descPara = document.createElement('p');
        descPara.className = 'description';
        descPara.textContent = pokemon.description || '';
        
        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'card-buttons';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = 'Edit';
        editBtn.onclick = () => editPokemon(pokemon.id);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => deletePokemon(pokemon.id);
        
        buttonDiv.appendChild(editBtn);
        buttonDiv.appendChild(deleteBtn);
        
        card.appendChild(img);
        card.appendChild(nameHeading);
        card.appendChild(typeSpan);
        card.appendChild(descPara);
        card.appendChild(buttonDiv);
        
        grid.appendChild(card);
    });
}

function createPokemon() {
    console.log("Creating Pokémon...");
    
    const name = document.getElementById("name").value.trim();
    const type = document.getElementById("type").value.trim();
    const description = document.getElementById("description").value.trim();
    const imageFile = document.getElementById("image").files[0];
    
    if (!name || !type || !imageFile) {
        alert("Please fill in all required fields");
        return;
    }
    
    // Read the image file and convert to base64
    const reader = new FileReader();
    reader.onload = function(e) {
        const pokemonData = getPokemonFromStorage();
        
        const newPokemon = {
            id: Date.now().toString(),
            name: name,
            type: type,
            description: description,
            image: e.target.result
        };
        
        pokemonData.push(newPokemon);
        savePokemonToStorage(pokemonData);
        
        // Clear form
        document.getElementById("pokemonForm").reset();
        
        // Reload display
        loadPokemon();
        
        console.log("Pokémon created:", newPokemon.name);
    };
    
    reader.readAsDataURL(imageFile);
}

function editPokemon(id) {
    console.log("Editing Pokémon:", id);
    
    const pokemonData = getPokemonFromStorage();
    const pokemon = pokemonData.find(p => p.id === id);
    
    if (!pokemon) {
        alert("Pokémon not found");
        return;
    }
    
    // Set edit mode
    isEditMode = true;
    editingPokemonId = id;
    
    // Populate form with existing data
    document.getElementById("name").value = pokemon.name;
    document.getElementById("type").value = pokemon.type;
    document.getElementById("description").value = pokemon.description || '';
    
    // Remove required from image since we're editing
    const imageInput = document.getElementById("image");
    imageInput.removeAttribute('required');
    
    // Change form submit button text
    const submitBtn = document.querySelector('#pokemonForm button[type="submit"]');
    submitBtn.textContent = "Update Pokémon";
    
    // Scroll to form
    document.getElementById("pokemonForm").scrollIntoView({ behavior: 'smooth' });
}

function updatePokemon(id) {
    console.log("Updating Pokémon:", id);
    
    const name = document.getElementById("name").value.trim();
    const type = document.getElementById("type").value.trim();
    const description = document.getElementById("description").value.trim();
    const imageFile = document.getElementById("image").files[0];
    
    if (!name || !type) {
        alert("Name and type are required");
        return;
    }
    
    const pokemonData = getPokemonFromStorage();
    const index = pokemonData.findIndex(p => p.id === id);
    
    if (index === -1) {
        alert("Pokémon not found");
        return;
    }
    
    // If new image is provided, read it
    if (imageFile) {
        const reader = new FileReader();
        reader.onload = function(e) {
            pokemonData[index] = {
                ...pokemonData[index],
                name: name,
                type: type,
                description: description,
                image: e.target.result
            };
            
            savePokemonToStorage(pokemonData);
            resetForm();
            loadPokemon();
        };
        reader.readAsDataURL(imageFile);
    } else {
        // Keep existing image
        pokemonData[index] = {
            ...pokemonData[index],
            name: name,
            type: type,
            description: description
        };
        
        savePokemonToStorage(pokemonData);
        resetForm();
        loadPokemon();
    }
}

function deletePokemon(id) {
    console.log("Deleting Pokémon:", id);
    
    if (!confirm("Are you sure you want to delete this Pokémon?")) {
        return;
    }
    
    const pokemonData = getPokemonFromStorage();
    const filteredData = pokemonData.filter(p => p.id !== id);
    
    savePokemonToStorage(filteredData);
    loadPokemon();
    
    console.log("Pokémon deleted");
}

function resetForm() {
    const form = document.getElementById("pokemonForm");
    form.reset();
    
    // Reset edit mode
    isEditMode = false;
    editingPokemonId = null;
    
    // Restore required attribute on image
    const imageInput = document.getElementById("image");
    imageInput.setAttribute('required', 'required');
    
    // Restore submit button text
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.textContent = "Add Pokémon";
}
