// Storage keys
const STORAGE_KEY = 'pokedexTracker';
const USER_ID_KEY = 'pokedexUserId';

// State
let currentRegion = null;
let currentPokemonList = [];
let selectedPokemon = null;
let currentUserPrincipal = null;
let aiSearchEnabled = false;
let currentSearchResults = null;

function isAuthenticated() {
    return !!(currentUserPrincipal && currentUserPrincipal.userId);
}

// Initialize user ID if not exists
function getUserId() {
    if (currentUserPrincipal && currentUserPrincipal.userId) {
        localStorage.setItem(USER_ID_KEY, currentUserPrincipal.userId);
        return currentUserPrincipal.userId;
    }
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
            // Re-render grid if not in search mode
            if (!currentSearchResults) {
                renderPokemonGrid();
                updateProgress();
            }
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
    checkBackendStatus();
    // Refresh status periodically
    setInterval(checkBackendStatus, 60000);
    fetchAndApplyCurrentUser();
    checkAdminAndShowDashboard();
    // Sync user data periodically
    setInterval(() => {
        if (isAuthenticated()) {
            loadUserCaughtData();
        }
    }, 30000); // Sync every 30 seconds
    // Sync when page becomes visible
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isAuthenticated()) {
            loadUserCaughtData();
        }
    });
    // Admin Dashboard button click handler
    const adminBtn = document.getElementById('adminDashboardBtn');
    if (adminBtn) {
        adminBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const adminSection = document.getElementById('adminDashboard');
            if (adminSection) {
                adminSection.style.display = adminSection.style.display === 'none' ? '' : 'none';
            }
        });
    }
});

async function checkAdminAndShowDashboard() {
    try {
        const res = await fetch('/api/checkadmin', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const adminDashboard = document.getElementById('adminDashboard');
        const adminBtn = document.getElementById('adminDashboardBtn');
        if (data.isAdmin) {
            if (adminDashboard) adminDashboard.style.display = 'none'; // Hide on load
            if (adminBtn) adminBtn.style.display = '';
            setupAdminDashboardTabs();
        } else {
            if (adminDashboard) adminDashboard.style.display = 'none';
            if (adminBtn) adminBtn.style.display = 'none';
        }
    } catch (e) {
        const adminDashboard = document.getElementById('adminDashboard');
        const adminBtn = document.getElementById('adminDashboardBtn');
        if (adminDashboard) adminDashboard.style.display = 'none';
        if (adminBtn) adminBtn.style.display = 'none';
    }
}

function setupAdminDashboardTabs() {
    const tabUsers = document.getElementById('adminTabUsers');
    const tabMedia = document.getElementById('adminTabMedia');
    const tabAudit = document.getElementById('adminTabAudit');
    const panelUsers = document.getElementById('adminPanelUsers');
    const panelMedia = document.getElementById('adminPanelMedia');
    const panelAudit = document.getElementById('adminPanelAudit');
    if (!tabUsers || !tabMedia || !tabAudit) return;
    tabUsers.onclick = () => {
        tabUsers.classList.add('active');
        tabMedia.classList.remove('active');
        tabAudit.classList.remove('active');
        panelUsers.style.display = '';
        panelMedia.style.display = 'none';
        panelAudit.style.display = 'none';
        loadAdminUsers();
    };
    // --- Admin Dashboard Functionality ---
    async function loadAdminUsers() {
        const panel = document.getElementById('adminPanelUsers');
        panel.innerHTML = '<div>Loading users...</div>';
        try {
            const res = await fetch('/api/checkadmin?action=listUsers', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            renderAdminUsers(panel, data.users || []);
        } catch (err) {
            panel.innerHTML = '<div class="empty-state">Failed to load users.</div>';
        }
    }

    function renderAdminUsers(panel, users) {
        if (!users.length) {
            panel.innerHTML = '<div class="empty-state">No users found.</div>';
            return;
        }
        let html = `<table class="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>`;
        for (const user of users) {
            html += `<tr>
                <td>${user.name || ''}</td>
                <td>${user.email || ''}</td>
                <td>${user.isAdmin ? '<span class="admin-role">Admin</span>' : 'User'}</td>
                <td>${user.blocked ? '<span class="blocked">Blocked</span>' : 'Active'}</td>
                <td>
                    ${user.isAdmin
                        ? `<button class="admin-action-btn demote-btn" data-id="${user.id}">Demote</button>`
                        : `<button class="admin-action-btn promote-btn" data-id="${user.id}">Promote</button>`}
                    ${user.blocked
                        ? `<button class="admin-action-btn unblock-btn" data-id="${user.id}">Unblock</button>`
                        : `<button class="admin-action-btn block-btn" data-id="${user.id}">Block</button>`}
                </td>
            </tr>`;
        }
        html += '</tbody></table>';
        panel.innerHTML = html;
        // Wire up action buttons
        panel.querySelectorAll('.promote-btn').forEach(btn => {
            btn.onclick = () => adminUserAction(btn.dataset.id, 'promote');
        });
        panel.querySelectorAll('.demote-btn').forEach(btn => {
            btn.onclick = () => adminUserAction(btn.dataset.id, 'demote');
        });
        panel.querySelectorAll('.block-btn').forEach(btn => {
            btn.onclick = () => adminUserAction(btn.dataset.id, 'block');
        });
        panel.querySelectorAll('.unblock-btn').forEach(btn => {
            btn.onclick = () => adminUserAction(btn.dataset.id, 'unblock');
        });
    }

    async function adminUserAction(userId, action) {
        const panel = document.getElementById('adminPanelUsers');
        panel.innerHTML = '<div>Updating...</div>';
        try {
            let mappedAction = action;
            if (action === 'promote') mappedAction = 'promoteAdmin';
            if (action === 'demote') mappedAction = 'demoteAdmin';
            if (action === 'block') mappedAction = 'blockUser';
            if (action === 'unblock') mappedAction = 'unblockUser';
            const res = await fetch(`/api/checkadmin?action=${mappedAction}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId, action: mappedAction })
            });
            if (!res.ok) throw new Error('Failed to update user');

            // Wait 10 seconds for the change to propagate, then refresh the list
            await new Promise(resolve => setTimeout(resolve, 10000));
            await loadAdminUsers();
        } catch (err) {
            panel.innerHTML = '<div class="empty-state">Failed to update user.</div>';
        }
    }

    async function loadAdminMedia() {
        const panel = document.getElementById('adminPanelMedia');
        panel.innerHTML = '<div>Loading media...</div>';
        try {
            const res = await fetch('/api/useradmin?action=listMedia', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch media');
            const data = await res.json();
            renderAdminMedia(panel, data.media || []);
        } catch (err) {
            panel.innerHTML = '<div class="empty-state">Failed to load media.</div>';
        }
    }

    function renderAdminMedia(panel, media) {
        if (!media.length) {
            panel.innerHTML = '<div class="empty-state">No media found.</div>';
            return;
        }
        
        let html = `<div class="media-grid">`;
        for (const item of media) {
            const pokemonName = getPokemonName(item.pokemonId) || `Pokemon ${item.pokemonId}`;
            const shinyText = item.shiny ? ' (Shiny)' : '';
            html += `
                <div class="media-item">
                    <div class="media-info">
                        <strong>${pokemonName}${shinyText}</strong><br>
                        <small>User: ${item.userId}</small><br>
                        <small>Pokemon ID: ${item.pokemonId}</small>
                    </div>
                    <div class="media-preview">
                        <img src="${item.url}" alt="Screenshot" style="max-width: 200px; max-height: 200px; border-radius: 6px; border: 1px solid #d1d5db;">
                    </div>
                    <div class="media-actions">
                        <button class="admin-action-btn delete-btn" data-userid="${item.userId}" data-pokemonid="${item.pokemonId}" data-shiny="${item.shiny}">Delete</button>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        panel.innerHTML = html;
        
        // Wire up delete buttons
        panel.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = () => adminDeleteScreenshot(btn.dataset.userid, btn.dataset.pokemonid, btn.dataset.shiny === 'true');
        });
    }

    async function adminDeleteScreenshot(userId, pokemonId, shiny) {
        if (!confirm('Are you sure you want to delete this screenshot? This action cannot be undone.')) {
            return;
        }
        
        const panel = document.getElementById('adminPanelMedia');
        panel.innerHTML = '<div>Deleting screenshot...</div>';
        
        try {
            const res = await fetch('/api/useradmin?action=deleteScreenshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId, pokemonId: parseInt(pokemonId), shiny })
            });
            
            if (!res.ok) throw new Error('Failed to delete screenshot');
            
            // Reload the media list
            await loadAdminMedia();
            showToast('Screenshot deleted successfully.', 'success');
        } catch (err) {
            panel.innerHTML = '<div class="empty-state">Failed to delete screenshot.</div>';
            showToast('Failed to delete screenshot.', 'error');
        }
    }

    tabMedia.onclick = () => {
        tabUsers.classList.remove('active');
        tabMedia.classList.add('active');
        tabAudit.classList.remove('active');
        panelUsers.style.display = 'none';
        panelMedia.style.display = '';
        panelAudit.style.display = 'none';
        loadAdminMedia();
    };
    tabAudit.onclick = () => {
        tabUsers.classList.remove('active');
        tabMedia.classList.remove('active');
        tabAudit.classList.add('active');
        panelUsers.style.display = 'none';
        panelMedia.style.display = 'none';
        panelAudit.style.display = '';
    };
}

// Load region from URL if present
function loadFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    if (shareId) {
        // Shared Pokedex view
        showSharedPokedex(shareId);
        return;
    }
    const region = urlParams.get('region');
    if (region) {
        const regionBtn = document.querySelector(`[data-region="${region}"]`);
        if (regionBtn) {
            regionBtn.click();
        }
    }
// Show shared Pokedex in read-only mode
async function showSharedPokedex(shareId) {
    document.querySelector('.region-selector').style.display = 'none';
    document.getElementById('pokedexSection').style.display = 'block';
    document.getElementById('loadingSpinner').style.display = 'block';
    document.getElementById('pokemonGrid').innerHTML = '';
    // Hide share button
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) shareBtn.style.display = 'none';
    // Hide AI search and search input
    const aiToggle = document.getElementById('aiSearchToggle');
    if (aiToggle) aiToggle.style.display = 'none';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.style.display = 'none';
    // Hide back button
    const backBtn = document.getElementById('backBtn');
    if (backBtn) backBtn.style.display = 'none';

    try {
        const res = await fetch(`${window.APP_CONFIG.API_BASE_URL}/userdex/shared/${shareId}`);
        if (!res.ok) {
            document.getElementById('regionTitle').textContent = 'Shared Pokédex Not Found';
            document.getElementById('loadingSpinner').style.display = 'none';
            document.getElementById('pokemonGrid').innerHTML = '<div class="empty-state"><p>Shared Pokédex not found or has been removed.</p></div>';
            return;
        }
        const data = await res.json();
        // Set title
        document.getElementById('regionTitle').textContent = 'Shared Pokédex';
        // Render grid (read-only)
        renderSharedPokemonGrid(data.pokemon || []);
        document.getElementById('loadingSpinner').style.display = 'none';
    } catch (err) {
        document.getElementById('regionTitle').textContent = 'Error Loading Shared Pokédex';
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('pokemonGrid').innerHTML = '<div class="empty-state"><p>Error loading shared Pokédex.</p></div>';
    }
}

// Render shared Pokedex grid (read-only)
function renderSharedPokemonGrid(pokemonList) {
    const grid = document.getElementById('pokemonGrid');
    grid.innerHTML = '';
    if (!pokemonList.length) {
        grid.innerHTML = '<div class="empty-state"><p>No Pokémon found in this Pokédex.</p></div>';
        return;
    }
    pokemonList.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'pokemon-card caught';
        if (entry.shiny) card.classList.add('shiny');
        const spriteUrl = entry.shiny && entry.spriteShiny ? entry.spriteShiny : (entry.sprite || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${entry.pokemonId}.png`);
        const pokemonName = getPokemonName(entry.pokemonId) || `Pokemon #${entry.pokemonId}`;
        const types = getPokemonTypes(entry.pokemonId);
        const typeBadges = types.map(type => `<span class="pokemon-type type-${type.toLowerCase()}">${type}</span>`).join('');
        card.innerHTML = `
            <div class="pokemon-number">#${entry.pokemonId}</div>
            <div class="pokemon-sprite"><img src="${spriteUrl}" alt="${pokemonName}" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${entry.pokemonId}.png'" /></div>
            <div class="pokemon-name">${pokemonName}</div>
            <div class="pokemon-types">${typeBadges}</div>
        `;
        card.addEventListener('click', () => openSharedPokemonModal(entry));
        grid.appendChild(card);
    });
}

// Show read-only modal for shared pokedex
function openSharedPokemonModal(entry) {
    const modal = document.getElementById('pokemonModal');
    if (!modal) return;
    const spriteUrl = entry.shiny && entry.spriteShiny ? entry.spriteShiny : (entry.sprite || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${entry.pokemonId}.png`);
    const pokemonName = getPokemonName(entry.pokemonId) || `Pokemon #${entry.pokemonId}`;
    document.getElementById('modalSprite').src = spriteUrl;
    document.getElementById('modalSprite').onerror = function() {
        this.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${entry.pokemonId}.png`;
    };
    document.getElementById('modalName').textContent = pokemonName;
    document.getElementById('modalNumber').textContent = `#${entry.pokemonId}`;
    document.getElementById('modalTypes').innerHTML = getPokemonTypes(entry.pokemonId).map(type => `<span class="pokemon-type type-${type.toLowerCase()}">${type}</span>`).join('');
    document.getElementById('shinyToggle').checked = !!entry.shiny;
    document.getElementById('shinyToggle').disabled = true;
    document.getElementById('catchNotes').value = entry.notes || '';
    document.getElementById('catchNotes').disabled = true;
    
    // Show screenshots if available (now with SAS tokens for secure access)
    const screenshotPreview = document.getElementById('screenshotPreview');
    const screenshotUrl = entry.shiny && entry.screenshotShiny ? entry.screenshotShiny : entry.screenshot;
    
    if (screenshotUrl) {
        screenshotPreview.innerHTML = `<img src="${screenshotUrl}" alt="Screenshot" style="max-width: 100%; border-radius: 6px; border: 1px solid #d1d5db;">`;
        screenshotPreview.style.display = 'block';
    } else {
        screenshotPreview.style.display = 'none';
        screenshotPreview.innerHTML = '';
    }
    
    // Hide upload controls for shared view
    document.getElementById('screenshotUpload').style.display = 'none';
    const screenshotLabel = document.querySelector('label[for="screenshotUpload"]');
    if (screenshotLabel) screenshotLabel.style.display = 'none';
    
    document.getElementById('saveBtn').style.display = 'none';
    document.getElementById('uncatchBtn').style.display = 'none';
    document.getElementById('modalAuthNotice').style.display = 'block';
    document.getElementById('modalAuthNotice').textContent = 'This is a shared Pokédex (read-only)';
    modal.classList.add('show');
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

// Backend connectivity indicator
async function checkBackendStatus() {
    try {
        const el = document.getElementById('backendStatus');
        if (!el) return;

        if (!isAuthenticated()) {
            el.textContent = 'Cloud Sync: Sign in required';
            el.style.background = '#fef3c7';
            el.style.color = '#92400e';
            el.style.border = '1px solid #fcd34d';
            return;
        }

        const userId = getUserId();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(`${window.APP_CONFIG.API_BASE_URL}/userdex?userId=${userId}`, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
            el.textContent = 'Cloud Sync: Online';
            el.style.background = '#e7f7ed';
            el.style.color = '#1e7e34';
            el.style.border = '1px solid #c6eed4';
        } else {
            el.textContent = 'Cloud Sync: Offline';
            el.style.background = '#f5f5f5';
            el.style.color = '#555';
            el.style.border = '1px solid #e0e0e0';
        }
    } catch (err) {
        const el = document.getElementById('backendStatus');
        if (!el) return;
        el.textContent = 'Cloud Sync: Offline';
        el.style.background = '#f5f5f5';
        el.style.color = '#555';
        el.style.border = '1px solid #e0e0e0';
    }
}

async function fetchAndApplyCurrentUser() {
    try {
        const res = await fetch('/.auth/me', { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            const principal = data && data.clientPrincipal ? data.clientPrincipal : null;
            const prevUserId = currentUserPrincipal && currentUserPrincipal.userId;
            currentUserPrincipal = principal;
            const userInfoEl = document.getElementById('userInfo');
            const userNameLabel = document.getElementById('userNameLabel');
            const loginLink = document.getElementById('loginLink');
            const logoutLink = document.getElementById('logoutLink');
            const authPanel = document.getElementById('authPanel');
            // Always clear caught data on login/user change
            saveCaughtData({});
            if (principal) {
                if (userInfoEl) userInfoEl.style.display = 'inline-flex';
                if (userNameLabel) userNameLabel.textContent = principal.userDetails || principal.userId;
                if (loginLink) loginLink.style.display = 'none';
                if (logoutLink) logoutLink.style.display = 'inline-block';
                if (authPanel) authPanel.style.display = 'none';
                // Load caught Pokémon from backend for this user
                await loadUserCaughtData();
            } else {
                if (userInfoEl) userInfoEl.style.display = 'none';
                if (userNameLabel) userNameLabel.textContent = '';
                if (loginLink) loginLink.style.display = 'inline-block';
                if (logoutLink) logoutLink.style.display = 'none';
                if (authPanel) authPanel.style.display = 'flex';
            }
        }
    } catch (_) {
        // ignore
    }
}

function setupEventListeners() {
    // Region buttons
    document.querySelectorAll('.region-btn').forEach(btn => {
        btn.addEventListener('click', handleRegionClick);
    });
    
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                filterPokemonBySearch(e);
            }
        });
    }

    const aiToggle = document.getElementById('aiSearchToggle');
    if (aiToggle) {
        aiToggle.addEventListener('click', toggleAISearch);
    }
    
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
        currentSearchResults = null;
        aiSearchEnabled = false;
        const aiToggleBtn = document.getElementById('aiSearchToggle');
        if (aiToggleBtn) aiToggleBtn.textContent = 'AI Search: Off';
        updateAISearchStatus('Local filter');
        
        // Clear search
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
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

    // Export/Import local data
    const exportBtn = document.getElementById('exportBtn');
    const importFile = document.getElementById('importFile');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportLocalData);
    }
    if (importFile) {
        importFile.addEventListener('change', importLocalDataFromFile);
    }

    // Share button
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            if (!isAuthenticated()) {
                showToast('Sign in to share your Pokédex.', 'warning');
                return;
            }
            shareBtn.disabled = true;
            shareBtn.textContent = 'Generating...';
            try {
                const res = await fetch(`${window.APP_CONFIG.API_BASE_URL}/userdex/share`, {
                    method: 'POST',
                    credentials: 'include'
                });
                if (res.ok) {
                    const data = await res.json();
                    const shareId = data.shareId;
                    const shareUrl = `${window.location.origin}${window.location.pathname}?share=${shareId}`;
                    document.getElementById('shareLinkInput').value = shareUrl;
                    document.getElementById('shareModal').classList.add('show');
                } else {
                    showToast('Failed to generate share link.', 'error');
                }
            } catch (err) {
                showToast('Error generating share link.', 'error');
            } finally {
                shareBtn.disabled = false;
                shareBtn.textContent = 'Share Pokédex';
            }
        });
    }

    // Share modal close
    const shareModal = document.getElementById('shareModal');
    const closeShareModal = document.getElementById('closeShareModal');
    if (closeShareModal) {
        closeShareModal.addEventListener('click', () => {
            shareModal.classList.remove('show');
        });
    }
    // Close modal when clicking outside
    if (shareModal) {
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) {
                shareModal.classList.remove('show');
            }
        });
    }

    // Copy share link with modern clipboard API
    const copyShareLinkBtn = document.getElementById('copyShareLinkBtn');
    if (copyShareLinkBtn) {
        copyShareLinkBtn.addEventListener('click', async () => {
            const input = document.getElementById('shareLinkInput');
            try {
                await navigator.clipboard.writeText(input.value);
                showToast('Link copied to clipboard!', 'success');
            } catch (err) {
                // Fallback for older browsers
                input.select();
                document.execCommand('copy');
                showToast('Link copied!', 'success');
            }
        });
    }

    // Unshare / make private
    const unshareBtn = document.getElementById('unshareBtn');
    if (unshareBtn) {
        unshareBtn.addEventListener('click', async () => {
            if (!isAuthenticated()) {
                showToast('Sign in to manage sharing.', 'warning');
                return;
            }
            unshareBtn.disabled = true;
            const originalText = unshareBtn.textContent;
            unshareBtn.textContent = 'Making private...';
            try {
                const res = await fetch(`${window.APP_CONFIG.API_BASE_URL}/userdex/unshare`, {
                    method: 'POST',
                    credentials: 'include'
                });
                if (res.ok) {
                    const shareInput = document.getElementById('shareLinkInput');
                    if (shareInput) shareInput.value = '';
                    const shareModal = document.getElementById('shareModal');
                    if (shareModal) shareModal.classList.remove('show');
                    showToast('Sharing disabled. Link revoked.', 'success');
                } else {
                    showToast('Failed to disable sharing.', 'error');
                }
            } catch (err) {
                showToast('Error disabling sharing.', 'error');
            } finally {
                unshareBtn.disabled = false;
                unshareBtn.textContent = originalText;
            }
        });
    }
}

// Filter Pokemon by search
function filterPokemonBySearch(e) {
    const rawSearch = e.target.value;
    const searchTerm = rawSearch.trim();

    if (!searchTerm) {
        // Clear search results to show all Pokemon
        currentSearchResults = null;
        renderPokemonGrid();
        updateProgress();
        const emptyMsg = document.getElementById('searchEmpty');
        if (emptyMsg) emptyMsg.style.display = 'none';
        return;
    }

    if (aiSearchEnabled) {
        runAISearch(searchTerm);
    } else {
        // Local search
        const caughtCheckbox = document.getElementById('caughtFilter');
        const caughtFilter = caughtCheckbox ? caughtCheckbox.checked : undefined;

        let url = `${window.APP_CONFIG.API_BASE_URL}/search?q=${encodeURIComponent(searchTerm)}`;
        if (caughtFilter !== undefined) url += `&caught=${caughtFilter}`;
        url += `&topK=30`;

        fetch(url, { method: 'GET', credentials: 'include' })
            .then(response => response.json())
            .then(data => {
                const results = Array.isArray(data.results) ? data.results : [];
                currentSearchResults = results.map(r => ({
                    id: r.pokemonId,
                    name: r.name || `pokemon-${r.pokemonId}`,
                    sprite: r.sprite,
                    spriteShiny: r.spriteShiny || r.sprite,
                    types: Array.isArray(r.types) && r.types.length ? r.types : ['unknown'],
                    region: r.region || null,
                    caught: !!r.caught,
                    shiny: !!r.shiny,
                    notes: r.notes || ''
                }));
                renderPokemonGrid();
                updateProgress(currentSearchResults);
                if (!currentSearchResults.length) {
                    let emptyMsg = document.getElementById('searchEmpty');
                    if (!emptyMsg) {
                        emptyMsg = document.createElement('div');
                        emptyMsg.id = 'searchEmpty';
                        emptyMsg.className = 'empty-state';
                        emptyMsg.innerHTML = '<p>No Pokémon found matching your search.</p>';
                        document.getElementById('pokemonGrid').after(emptyMsg);
                    }
                    emptyMsg.style.display = 'block';
                } else {
                    const emptyMsg = document.getElementById('searchEmpty');
                    if (emptyMsg) emptyMsg.style.display = 'none';
                }
            })
            .catch(err => {
                console.error('Search failed', err);
                showToast('Search unavailable.', 'warning');
                currentSearchResults = null;
                renderPokemonGrid();
                updateProgress();
            });
    }
}

function updateAISearchStatus(text) {
    const statusEl = document.getElementById('aiSearchStatus');
    if (statusEl && text) {
        statusEl.textContent = text;
    }
}

function toggleAISearch() {
    aiSearchEnabled = !aiSearchEnabled;
    const toggleBtn = document.getElementById('aiSearchToggle');
    if (toggleBtn) {
        toggleBtn.textContent = aiSearchEnabled ? 'AI Search: On' : 'AI Search: Off';
    }
    updateAISearchStatus(aiSearchEnabled ? 'AI search ready' : 'Local filter');

    const searchInput = document.getElementById('searchInput');
    if (!aiSearchEnabled) {
        currentSearchResults = null;
        if (searchInput && searchInput.value) {
            filterPokemonBySearch({ target: searchInput });
        } else {
            renderPokemonGrid();
            updateProgress();
        }
        return;
    }

    if (searchInput && searchInput.value.trim()) {
        runAISearch(searchInput.value);
    }
}

async function runAISearch(searchTerm) {
    const query = (searchTerm || '').trim();

    if (!query) {
        currentSearchResults = null;
        updateAISearchStatus('AI search idle');
        renderPokemonGrid();
        updateProgress();
        return;
    }

    // No authentication required for AI search

    updateAISearchStatus('Searching...');

    try {
        const url = `${window.APP_CONFIG.API_BASE_URL}/search?q=${encodeURIComponent(query)}&ai=true&topK=30`;
        const response = await fetch(url, { method: 'GET', credentials: 'include' });

        if (response.status === 401) {
            showToast('Sign in to use AI search.', 'warning');
            updateAISearchStatus('Login required for AI search');
            currentSearchResults = null;
            renderPokemonGrid();
            updateProgress();
            return;
        }

        const data = await response.json();
        const results = Array.isArray(data.results) ? data.results : [];

        currentSearchResults = results.map(r => ({
            id: r.pokemonId,
            name: r.name || `pokemon-${r.pokemonId}`,
            sprite: r.sprite,
            spriteShiny: r.spriteShiny || r.sprite,
            types: Array.isArray(r.types) && r.types.length ? r.types : ['unknown'],
            region: r.region || null,
            caught: !!r.caught,
            shiny: !!r.shiny,
            notes: r.notes || ''
        }));

        renderPokemonGrid();
        updateProgress(currentSearchResults);
        updateAISearchStatus(data.usedAI ? 'AI search (embeddings)' : 'AI search (keywords)');

        if (!currentSearchResults.length) {
            showToast('No matching results. Try another query.', 'info');
        }
    } catch (err) {
        console.error('AI search failed', err);
        showToast('AI search unavailable. Using local filter instead.', 'warning');
        currentSearchResults = null;
        updateAISearchStatus('Local filter');
        renderPokemonGrid();
        updateProgress();
    }
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
        currentSearchResults = null;
        const spinnerTextEl = document.getElementById('loadingSpinner').querySelector('p');

        // Use PokeAPI batch endpoint
        const apiUrl = `https://pokeapi.co/api/v2/pokemon?limit=${limit}&offset=${offset}`;
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error('Failed to fetch Pokémon batch');
        const data = await response.json();
        const results = data.results || [];

        // Fetch details for all Pokémon in parallel, but only one network roundtrip for the list
        const detailPromises = results.map((item, idx) => fetchPokemonDetails(offset + idx + 1));
        const batchResults = await Promise.all(detailPromises);
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
        document.getElementById('loadingSpinner').style.display = 'none';
    } catch (error) {
        console.error('Error fetching Pokemon:', error);
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('pokemonGrid').innerHTML = '<p style="text-align: center; color: #666;">Error loading Pokémon. Please try again.</p>';
    }
}

// Export local storage data to a JSON file
function exportLocalData() {
    const data = {
        userId: getUserId(),
        caught: getCaughtData()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pokedex-tracker-backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Import local storage data from a JSON file
function importLocalDataFromFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const json = JSON.parse(reader.result);
            if (json && json.caught && typeof json.caught === 'object') {
                saveCaughtData(json.caught);
            }
            if (json && json.userId) {
                localStorage.setItem(USER_ID_KEY, json.userId);
            }
            updateProgress();
            if (currentRegion) {
                renderPokemonGrid();
            }
        } catch (err) {
            console.error('Failed to import data:', err);
        }
    };
    reader.readAsText(file);
    // reset input so same file can be chosen again
    event.target.value = '';
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

    const list = currentSearchResults && currentSearchResults.length > 0
        ? currentSearchResults
        : currentPokemonList;

    list.forEach(pokemon => {
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

async function openPokemonModal(pokemon) {
    selectedPokemon = pokemon;
    let caughtInfo = getCaughtData()[pokemon.id] || {};
    
    // If authenticated, fetch latest data for this Pokemon from backend
    if (isAuthenticated()) {
        try {
            const userId = getUserId();
            const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/userdex?userId=${userId}&pokemonId=${pokemon.id}`);
            console.log('Modal fetch response:', response.status, response.ok);
            if (response.ok) {
                const data = await response.json();
                console.log('Modal fetch data:', data);
                if (data.pokemon && data.pokemon.length > 0) {
                    const backendData = data.pokemon[0];
                    caughtInfo = {
                        caught: backendData.caught,
                        shiny: backendData.shiny || false,
                        notes: backendData.notes || '',
                        screenshot: backendData.screenshot || null,
                        timestamp: backendData.updatedAt ? new Date(backendData.updatedAt).getTime() : Date.now()
                    };
                    // Update local storage with fresh data
                    const allData = getCaughtData();
                    allData[pokemon.id] = caughtInfo;
                    saveCaughtData(allData);
                    // Re-render grid if not in search mode
                    if (!currentSearchResults) {
                        renderPokemonGrid();
                        updateProgress();
                    }
                }
            }
        } catch (error) {
            console.log('Could not fetch latest Pokemon data, using local data:', error);
        }
    }
    
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
        previewDiv.innerHTML = `
            <div style="position: relative; display: inline-block;">
                <img src="${caughtInfo.screenshot}" alt="Screenshot" style="max-width: 100%; border-radius: 6px; border: 1px solid #d1d5db;">
                <button id="deleteScreenshotBtn" style="position: absolute; top: 5px; right: 5px; background: red; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px; line-height: 1;">×</button>
            </div>
        `;
        // Add event listener for delete button
        setTimeout(() => {
            const deleteBtn = document.getElementById('deleteScreenshotBtn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', deleteScreenshot);
            }
        }, 0);
    } else {
        previewDiv.innerHTML = '';
    }
    
    // Clear file input
    document.getElementById('screenshotUpload').value = '';
    
    // Show/hide uncatch button
    const uncatchBtn = document.getElementById('uncatchBtn');
    uncatchBtn.style.display = caughtInfo.caught ? 'block' : 'none';

    applyModalAuthState();
    
    modal.classList.add('show');
}

function closeModal() {
    document.getElementById('pokemonModal').classList.remove('show');
    selectedPokemon = null;
}

function handleScreenshotUpload(e) {
    if (!isAuthenticated()) {
        e.target.value = '';
        alert('Sign in to upload screenshots.');
        return;
    }
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
    if (!isAuthenticated()) {
        alert('Sign in to mark as caught or save changes.');
        closeModal();
        return;
    }
    
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
    
    // Show success toast
    showToast(`${selectedPokemon.name} caught! ✓`, 'success');
    
    // Call backend API to sync data only if authenticated
    if (isAuthenticated()) {
        syncPokemonToBackend(selectedPokemon.id, pokemonData);
    } else {
        showToast('Saved locally. Sign in to sync to cloud.', 'info');
    }
    
    // Update UI
    renderPokemonGrid();
    updateProgress();
    closeModal();
}

// Sync Pokemon data to backend
async function syncPokemonToBackend(pokemonId, pokemonData) {
    if (!isAuthenticated()) {
        return;
    }
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
            showToast('Failed to sync to cloud. Check your connection.', 'error');
        } else {
            showToast('Synced to cloud!', 'success');
        }
    } catch (error) {
        showToast('Network error—data saved locally.', 'warning');
        // Continue anyway - local storage will preserve the data
    }
}

// Upload screenshot to backend
async function uploadScreenshotToBackend(pokemonId, base64Data) {
    if (!isAuthenticated()) {
        return null;
    }
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
            showToast('Screenshot uploaded! 📷', 'success');
            return data.url;
        } else {
            showToast('Failed to upload screenshot.', 'error');
            return null;
        }
    } catch (error) {
        showToast('Upload error—saved locally.', 'error');
        return null;
    }
}

async function deleteScreenshot() {
    if (!selectedPokemon) return;
    if (!isAuthenticated()) {
        showToast('Sign in to delete screenshots.', 'warning');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this screenshot?')) {
        return;
    }
    
    try {
        const caughtData = getCaughtData();
        const caughtInfo = caughtData[selectedPokemon.id] || {};
        const isShiny = document.getElementById('shinyToggle').checked;
        
        // Determine which screenshot to delete
        const updateData = { pokemonId: selectedPokemon.id };
        if (isShiny && caughtInfo.screenshotShiny) {
            updateData.screenshotShiny = null;
        } else if (!isShiny && caughtInfo.screenshot) {
            updateData.screenshot = null;
        } else {
            // Fallback: delete whichever exists
            if (caughtInfo.screenshot) updateData.screenshot = null;
            if (caughtInfo.screenshotShiny) updateData.screenshotShiny = null;
        }
        
        // Call backend API to delete screenshot
        const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/userdex`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            // Update local data
            if (caughtData[selectedPokemon.id]) {
                if (updateData.screenshot !== undefined) caughtData[selectedPokemon.id].screenshot = null;
                if (updateData.screenshotShiny !== undefined) caughtData[selectedPokemon.id].screenshotShiny = null;
                saveCaughtData(caughtData);
            }
            
            // Update UI
            document.getElementById('screenshotPreview').innerHTML = '';
            showToast('Screenshot deleted.', 'success');
        } else {
            showToast('Failed to delete screenshot.', 'error');
        }
    } catch (error) {
        showToast('Network error—could not delete screenshot.', 'error');
    }
}

function uncatchPokemon() {
    if (!selectedPokemon) return;
    if (!isAuthenticated()) {
        showToast('Sign in to change caught status.', 'warning');
        return;
    }
    
    if (!confirm('Are you sure you want to mark this Pokémon as uncaught?')) {
        return;
    }
    
    const caughtData = getCaughtData();
    delete caughtData[selectedPokemon.id];
    saveCaughtData(caughtData);
    
    showToast(`${selectedPokemon.name} marked as uncaught.`, 'info');
    
    // Call backend API to remove caught status
    uncatchPokemonOnBackend(selectedPokemon.id);
    
    // Update UI
    renderPokemonGrid();
    updateProgress();
    closeModal();
}

// Remove caught Pokemon from backend
async function uncatchPokemonOnBackend(pokemonId) {
    if (!isAuthenticated()) {
        return;
    }
    try {
        const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/userdex`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pokemonId: pokemonId
            })
        });
        
        if (!response.ok) {
            showToast('Failed to sync uncatch to cloud.', 'error');
        } else {
            console.log('Successfully uncaught on backend');
        }
    } catch (error) {
        console.error('Error uncatching on backend:', error);
    }
}

function applyModalAuthState() {
    const requireAuth = !isAuthenticated();
    const authNotice = document.getElementById('modalAuthNotice');
    const shinyToggle = document.getElementById('shinyToggle');
    const catchNotes = document.getElementById('catchNotes');
    const screenshotUpload = document.getElementById('screenshotUpload');
    const saveBtn = document.getElementById('saveBtn');
    const uncatchBtn = document.getElementById('uncatchBtn');

    if (authNotice) authNotice.style.display = requireAuth ? 'block' : 'none';
    if (shinyToggle) shinyToggle.disabled = requireAuth;
    if (catchNotes) catchNotes.disabled = requireAuth;
    if (screenshotUpload) screenshotUpload.disabled = requireAuth;
    if (saveBtn) saveBtn.disabled = requireAuth;
    if (uncatchBtn) uncatchBtn.disabled = requireAuth;
}


function updateProgress(listOverride) {
    const caughtData = getCaughtData();
    const list = listOverride || (currentSearchResults && currentSearchResults.length ? currentSearchResults : currentPokemonList);
    const total = list.length;
    const caught = list.filter(p => caughtData[p.id]).length;

    document.getElementById('progressCount').textContent = `${caught}/${total}`;

    const percentage = total > 0 ? (caught / total) * 100 : 0;
    document.getElementById('progressFill').style.width = `${percentage}%`;
}
