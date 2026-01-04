const { connectToDatabase, getClientPrincipal } = require('../shared/utils');
const { REGIONS } = require('../shared/pokemonData');

const MAX_ITEMS = 300;
const DEFAULT_TOP_K = 20;
const POKE_API_BASE = 'https://pokeapi.co/api/v2/pokemon/';

const pokemonCache = new Map();

function getSearchConfig() {
    // DEBUG: Log config for troubleshooting
    if (process.env.NODE_ENV !== 'production') {
      // Avoid leaking secrets in production logs
      console.log('[DEBUG] Azure Search config:', {
        endpoint: process.env.AZURE_SEARCH_ENDPOINT || process.env.AZURE_AI_SEARCH_ENDPOINT,
        apiKey: process.env.AZURE_SEARCH_KEY ? 'set' : (process.env.AZURE_SEARCH_ADMIN_KEY ? 'set' : 'unset'),
        indexName: process.env.AZURE_SEARCH_INDEX || process.env.AZURE_AI_SEARCH_INDEX || 'userdex'
      });
    }
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT || process.env.AZURE_AI_SEARCH_ENDPOINT;
  const apiKey = process.env.AZURE_SEARCH_KEY || process.env.AZURE_SEARCH_ADMIN_KEY;
  const indexName = process.env.AZURE_SEARCH_INDEX || process.env.AZURE_AI_SEARCH_INDEX || 'userdex';
  if (!endpoint || !apiKey) {
    return null;
  }
  return { endpoint: endpoint.replace(/\/?$/, ''), apiKey, indexName };
}

function keywordScore(text, query) {
  if (!text || !query) return 0;
  const haystack = text.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function inferRegionFromDex(pokemonId) {
  const idNum = parseInt(pokemonId, 10);
  const regions = Object.keys(REGIONS);
  for (const region of regions) {
    const { offset, limit } = REGIONS[region];
    if (idNum >= offset && idNum < offset + limit) {
      return region;
    }
  }
  return null;
}

async function getPokemonMeta(pokemonId) {
  if (pokemonCache.has(pokemonId)) {
    return pokemonCache.get(pokemonId);
  }

  let name = `pokemon-${pokemonId}`;
  let types = [];
  let sprite = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonId}.png`;
  let spriteShiny = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${pokemonId}.png`;

  try {
    const res = await fetch(`${POKE_API_BASE}${pokemonId}`);
    if (res.ok) {
      const data = await res.json();
      name = data.name || name;
      types = Array.isArray(data.types) ? data.types.map(t => t.type.name) : types;
      if (data.sprites) {
        sprite = data.sprites.front_default || sprite;
        spriteShiny = data.sprites.front_shiny || spriteShiny;
      }
    }
  } catch (_) {
    // PokeAPI fallback will be used
  }

  const region = inferRegionFromDex(pokemonId);
  const meta = { pokemonId: parseInt(pokemonId, 10), name, types, sprite, spriteShiny, region };
  pokemonCache.set(pokemonId, meta);
  return meta;
}

function parseBoolean(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}

function escapeFilterValue(value) {
  return String(value).replace(/'/g, "''");
}

function buildSearchFilter(userId, regionFilter, caughtFilter, shinyFilter) {
  const clauses = [`userId eq '${escapeFilterValue(userId)}'`];
  if (regionFilter) {
    clauses.push(`region eq '${escapeFilterValue(regionFilter)}'`);
  }
  if (caughtFilter !== undefined) {
    clauses.push(`caught eq ${caughtFilter}`);
  }
  if (shinyFilter !== undefined) {
    clauses.push(`shiny eq ${shinyFilter}`);
  }
  return clauses.join(' and ');
}

async function runAzureSearch(config, query, options, context) {
  const { endpoint, apiKey, indexName } = config;
  // DEBUG: Log Azure Search request
  context.log('[DEBUG] Azure Search request', { endpoint, indexName, query, top: options.topK });
  // Only filter by userId if provided (for user-specific search)
  let filter = undefined;
  if (options.userId) {
    filter = buildSearchFilter(options.userId, options.regionFilter, options.caughtFilter, options.shinyFilter);
  } else if (options.regionFilter || options.caughtFilter !== undefined || options.shinyFilter !== undefined) {
    // Allow region/caught/shiny filters in global mode
    const clauses = [];
    if (options.regionFilter) clauses.push(`region eq '${escapeFilterValue(options.regionFilter)}'`);
    if (options.caughtFilter !== undefined) clauses.push(`caught eq ${options.caughtFilter}`);
    if (options.shinyFilter !== undefined) clauses.push(`shiny eq ${options.shinyFilter}`);
    filter = clauses.length ? clauses.join(' and ') : undefined;
  }

  const url = `${endpoint}/indexes/${indexName}/docs/search?api-version=2023-11-01`; // stable API version

  // Use wildcard for partial name matching only if queryType is 'full'
  let searchQuery = query || '*';
  let queryType = 'simple';
  if (query && query !== '*') {
    // If query is not a filter, use full for wildcards
    searchQuery = `*${query}*`;
    queryType = 'full';
  }
  const body = {
    search: searchQuery,
    filter: filter || undefined,
    top: options.topK,
    queryType,
    searchMode: 'all',
    select: 'id,pokemonId,name,types,region,sprite,spriteShiny'
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure AI Search query failed: ${res.status} ${res.statusText} - ${text}`);
  }

  const data = await res.json();
  const results = Array.isArray(data.value) ? data.value : [];

  return results.map(doc => ({
    pokemonId: doc.pokemonId,
    name: doc.name || `pokemon-${doc.pokemonId}`,
    sprite: doc.sprite,
    spriteShiny: doc.spriteShiny || doc.sprite,
    types: Array.isArray(doc.types) ? doc.types : [],
    region: doc.region || inferRegionFromDex(doc.pokemonId),
    caught: !!doc.caught,
    shiny: !!doc.shiny,
    notes: doc.notes || '',
    screenshot: doc.screenshot || null,
    similarity: doc['@search.score'] !== undefined ? Number(doc['@search.score'].toFixed(4)) : undefined
  }));
}

module.exports = async function (context, req) {
    context.log('[DEBUG] search function invoked');
  try {
    const principal = getClientPrincipal(req);
    const searchConfig = getSearchConfig();
    // --- AI Search Path ---
    if (aiSearchEnabled) {
      let usedAI = false;
      let results = [];
      try {
        // Only pass the query string to Azure AI Search, filters handled separately
        let searchResults = await runAzureSearch(searchConfig, query, {
          userId: undefined,
          regionFilter,
          caughtFilter,
          shinyFilter,
          topK
        }, context);
        // If searching for 'caught' as a keyword, also include caught Pokémon
        if (query && query.toLowerCase() === 'caught') {
          searchResults = searchResults.concat(
            searchResults.filter(r => r.caught)
          );
        }
        usedAI = true;
        results = searchResults.slice(0, topK);
        context.res = {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            query,
            count: results.length,
            usedAI,
            results
          }
        };
      } catch (err) {
        context.log.error('[DEBUG] Azure AI Search error', err);
        context.log.warn('Azure AI Search failed', err.message);
        context.res = {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          body: { error: 'Azure AI Search failed', details: err && err.stack }
        };
      }
      return;
    }

    // --- Local Search Path ---
    let db;
    try {
      db = await connectToDatabase();
    } catch (err) {
      context.log.error('DB connection failed', err);
      context.res = { status: 500, headers: { 'Content-Type': 'application/json' }, body: { error: 'Database connection failed', details: err && err.stack } };
      return;
    }
    const userdexCol = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');
    const pokedexCol = db.collection('pokedex');

    // Get all pokedex entries
    let pokedexDocs = [];
    try {
      pokedexDocs = await pokedexCol.find({}).limit(MAX_ITEMS).toArray();
    } catch (err) {
      context.log.error('Failed to query pokedex', err);
      context.res = { status: 500, headers: { 'Content-Type': 'application/json' }, body: { error: 'Failed to query pokedex', details: err && err.stack } };
      return;
    }

    // Get userdex entries for this user
    let userdexDocs = [];
    try {
      userdexDocs = await userdexCol.find({ userId: principal.userId }).limit(MAX_ITEMS).toArray();
    } catch (err) {
      context.log.error('Failed to query userdex', err);
      context.res = { status: 500, headers: { 'Content-Type': 'application/json' }, body: { error: 'Failed to query user data', details: err && err.stack } };
      return;
    }
    // Map userdex by pokemonId for fast lookup
    const userdexMap = {};
    for (const doc of userdexDocs) {
      userdexMap[doc.pokemonId] = doc;
    }

    const debugFilterInfo = [];
    let items = [];
    for (const base of pokedexDocs) {
      // Overlay userdex data if present
      const doc = userdexMap[base.pokemonId] || {};
      const meta = await getPokemonMeta(base.pokemonId);
      // Region filter
      if (regionFilter && meta.region && meta.region.toLowerCase() !== regionFilter) {
        continue;
      }
      // Caught filter
      let caughtCompare = true;
      if (caughtFilter !== undefined) {
        caughtCompare = Boolean(doc.caught) === Boolean(caughtFilter);
        debugFilterInfo.push({ pokemonId: base.pokemonId, docCaught: doc.caught, caughtFilter, compare: caughtCompare });
        if (!caughtCompare) {
          continue;
        }
      }
      // Shiny filter
      let shinyCompare = true;
      if (shinyFilter !== undefined) {
        shinyCompare = Boolean(doc.shiny) === Boolean(shinyFilter);
        if (!shinyCompare) {
          continue;
        }
      }
      // Screenshot filter
      if (screenshotFilter && !doc.screenshot) {
        continue;
      }
      const textParts = [
        `Name: ${meta.name}`,
        meta.types && meta.types.length ? `Types: ${meta.types.join(', ')}` : null,
        doc.notes ? `Notes: ${doc.notes}` : null,
        doc.caught ? 'Status: caught' : 'Status: not caught',
        doc.shiny ? 'Shiny' : null,
        meta.region ? `Region: ${meta.region}` : null
      ].filter(Boolean);
      items.push({
        pokemonId: meta.pokemonId,
        name: meta.name,
        sprite: meta.sprite,
        spriteShiny: meta.spriteShiny,
        types: meta.types,
        region: meta.region,
        caught: !!doc.caught,
        shiny: !!doc.shiny,
        notes: doc.notes || '',
        screenshot: doc.screenshot || null,
        embeddingText: textParts.join('. ')
      });
    }
    if (!items.length) {
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { query, count: 0, usedAI: false, results: [], message: 'No items matched the provided filters.', debug: debugFilterInfo }
      };
      return;
    }

    // Local keyword search
    const scored = items.map(item => ({ item, score: keywordScore(item.embeddingText, query) }));
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, topK).map(entry => ({
      pokemonId: entry.item.pokemonId,
      name: entry.item.name,
      sprite: entry.item.sprite,
      spriteShiny: entry.item.spriteShiny,
      types: entry.item.types,
      region: entry.item.region,
      caught: entry.item.caught,
      shiny: entry.item.shiny,
      notes: entry.item.notes,
      screenshot: entry.item.screenshot,
      similarity: Number(entry.score.toFixed(4))
    }));

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        query,
        count: results.length,
        total: items.length,
        usedAI: false,
        results
      }
    };
        types: entry.item.types,
        region: entry.item.region,
        caught: entry.item.caught,
        shiny: entry.item.shiny,
        notes: entry.item.notes,
        screenshot: entry.item.screenshot,
        similarity: Number(entry.score.toFixed(4))
      }));
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        query,
        count: results.length,
        total: items.length,
        usedAI,
        results
      }
    };
  } catch (err) {
    // Catch-all error handler for debugging
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Unhandled error in search handler', details: err && err.stack }
    };
  }

// (Removed unreachable duplicate logic)
}
