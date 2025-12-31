const { connectToDatabase, getClientPrincipal } = require('../shared/utils');
const { REGIONS } = require('../shared/pokemonData');

const MAX_ITEMS = 300;
const DEFAULT_TOP_K = 20;
const POKE_API_BASE = 'https://pokeapi.co/api/v2/pokemon/';

const pokemonCache = new Map();

function getSearchConfig() {
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
  const filter = buildSearchFilter(options.userId, options.regionFilter, options.caughtFilter, options.shinyFilter);

  const url = `${endpoint}/indexes/${indexName}/docs/search?api-version=2023-11-01`; // stable API version

  const body = {
    search: query || '*',
    filter: filter || undefined,
    top: options.topK,
    queryType: 'simple',
    searchMode: 'all',
    select: [
      'pokemonId',
      'name',
      'types',
      'region',
      'caught',
      'shiny',
      'notes',
      'screenshot',
      'sprite',
      'spriteShiny',
      'userId'
    ]
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
  const principal = getClientPrincipal(req);
  if (!principal || !principal.userId) {
    context.res = { status: 401, headers: { 'Content-Type': 'application/json' }, body: { error: 'Unauthorized' } };
    return;
  }

  const query = (req.query.q || req.query.query || (req.body && req.body.query) || '').trim();
  if (!query) {
    context.res = { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: 'Missing query parameter: q' } };
    return;
  }

  const regionFilter = (req.query.region || (req.body && req.body.region) || '').toLowerCase();
  const caughtFilter = parseBoolean(req.query.caught ?? req.body?.caught);
  const shinyFilter = parseBoolean(req.query.shiny ?? req.body?.shiny);
  const topKInput = parseInt(req.query.topK || req.query.k || (req.body && req.body.topK), 10);
  const topK = Number.isFinite(topKInput) ? Math.max(1, Math.min(topKInput, MAX_ITEMS)) : DEFAULT_TOP_K;

  const searchConfig = getSearchConfig();

  let collection;
  try {
    const db = await connectToDatabase();
    collection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');
  } catch (err) {
    context.log.error('DB connection failed', err);
    context.res = { status: 500, headers: { 'Content-Type': 'application/json' }, body: { error: 'Database connection failed' } };
    return;
  }

  const filter = { userId: principal.userId };
  if (caughtFilter !== undefined) filter.caught = caughtFilter;
  if (shinyFilter !== undefined) filter.shiny = shinyFilter;

  let documents = [];
  try {
    documents = await collection.find(filter).limit(MAX_ITEMS).toArray();
  } catch (err) {
    context.log.error('Failed to query userdex', err);
    context.res = { status: 500, headers: { 'Content-Type': 'application/json' }, body: { error: 'Failed to query user data' } };
    return;
  }

  if (!documents.length) {
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { query, count: 0, usedAI: false, results: [], message: 'No entries found for this user.' }
    };
    return;
  }

  const items = [];
  for (const doc of documents) {
    const meta = await getPokemonMeta(doc.pokemonId);
    if (regionFilter && meta.region && meta.region.toLowerCase() !== regionFilter) {
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
      body: { query, count: 0, usedAI: false, results: [], message: 'No items matched the provided filters.' }
    };
    return;
  }

  let usedAI = false;
  let results = [];

  if (searchConfig) {
    try {
      const searchResults = await runAzureSearch(searchConfig, query, {
        userId: principal.userId,
        regionFilter,
        caughtFilter,
        shinyFilter,
        topK
      }, context);
      if (searchResults && searchResults.length) {
        usedAI = true; // using Azure AI Search service
        results = searchResults.slice(0, topK);
      }
    } catch (err) {
      context.log.warn('Azure AI Search failed, falling back to keyword search', err.message);
    }
  }

  if (!results.length) {
    const scored = items.map(item => ({ item, score: keywordScore(item.embeddingText, query) }));
    scored.sort((a, b) => b.score - a.score);
    results = scored.slice(0, topK).map(entry => ({
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
};
