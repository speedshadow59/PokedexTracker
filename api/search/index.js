const { connectToDatabase, getClientPrincipal } = require('../shared/utils');
const { REGIONS } = require('../shared/pokemonData');

const MAX_ITEMS = 300;
const DEFAULT_TOP_K = 20;
const POKE_API_BASE = 'https://pokeapi.co/api/v2/pokemon/';

const pokemonCache = new Map();

function getSearchConfig() {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT || process.env.AZURE_AI_SEARCH_ENDPOINT;
  const apiKey = process.env.AZURE_SEARCH_KEY || process.env.AZURE_SEARCH_ADMIN_KEY;
  const indexName = process.env.AZURE_SEARCH_INDEX || process.env.AZURE_AI_SEARCH_INDEX || 'pokeapi';
  if (!endpoint || !apiKey) return null;
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
  for (const region of Object.keys(REGIONS)) {
    const { offset, limit } = REGIONS[region];
    if (idNum >= offset && idNum < offset + limit) return region;
  }
  return null;
}

async function getPokemonMeta(pokemonId) {
  if (pokemonCache.has(pokemonId)) return pokemonCache.get(pokemonId);
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
  } catch (_) {}
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

module.exports = async function (context, req) {
  try {
    const principal = getClientPrincipal(req);
    const searchConfig = getSearchConfig();
    const query = (req.query.q || req.query.query || (req.body && req.body.query) || '').trim();
    const regionFilter = (req.query.region || (req.body && req.body.region) || '').toLowerCase();
    const caughtFilter = parseBoolean(req.query.caught ?? req.body?.caught);
    const shinyFilter = parseBoolean(req.query.shiny ?? req.body?.shiny);
    const screenshotFilter = req.query.screenshot === 'true' || req.body?.screenshot === true;
    const topKInput = parseInt(req.query.topK || req.query.k || (req.body && req.body.topK), 10);
    const topK = Number.isFinite(topKInput) ? Math.max(1, Math.min(topKInput, MAX_ITEMS)) : DEFAULT_TOP_K;
    const aiSearchEnabled = searchConfig && (req.query.ai === 'true' || req.body?.ai === true);

    // --- AI Search Path ---
    if (aiSearchEnabled) {
      try {
        // First, get AI search results from the index
        const url = `${searchConfig.endpoint}/indexes/${searchConfig.indexName}/docs/search?api-version=2023-11-01`;
        let searchQuery = query || '*';
        let queryType = 'simple';
        const body = {
          search: searchQuery,
          top: topK,
          queryType,
          searchMode: 'all',
          select: 'id,pokemonId,name,types,region,sprite,spriteShiny'
        };
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': searchConfig.apiKey
          },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Azure AI Search query failed: ${res.status} ${res.statusText} - ${text}`);
        }
        const data = await res.json();
        let aiResults = Array.isArray(data.value)
          ? data.value.map(doc => ({
              pokemonId: doc.pokemonId,
              name: doc.name || `pokemon-${doc.pokemonId}`,
              sprite: doc.sprite,
              spriteShiny: doc.spriteShiny || doc.sprite,
              types: Array.isArray(doc.types) ? doc.types : [],
              region: doc.region || inferRegionFromDex(doc.pokemonId),
              similarity: doc['@search.score'] !== undefined ? Number(doc['@search.score'].toFixed(4)) : undefined
            }))
          : [];

        // Now query user data from Cosmos DB to merge with AI results
        const db = await connectToDatabase();
        const userdexCol = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');
        const userdexDocs = await userdexCol.find({ userId: principal.userId }).toArray();
        const userdexMap = {};
        for (const doc of userdexDocs) {
          userdexMap[doc.pokemonId] = doc;
        }

        // Merge AI results with user data
        let results = aiResults.map(aiResult => {
          const userData = userdexMap[aiResult.pokemonId] || {};
          return {
            pokemonId: aiResult.pokemonId,
            name: aiResult.name,
            sprite: aiResult.sprite,
            spriteShiny: aiResult.spriteShiny,
            types: aiResult.types,
            region: aiResult.region,
            caught: !!userData.caught,
            shiny: !!userData.shiny,
            notes: userData.notes || '',
            screenshot: userData.screenshot || null,
            similarity: aiResult.similarity
          };
        });

        // Apply all filters (now that we have user data)
        results = results.filter(item => {
          const passesRegion = !regionFilter || item.region?.toLowerCase() === regionFilter;
          const passesCaught = caughtFilter === undefined || Boolean(item.caught) === Boolean(caughtFilter);
          const passesShiny = shinyFilter === undefined || Boolean(item.shiny) === Boolean(shinyFilter);
          const passesScreenshot = !screenshotFilter || item.screenshot;
          return passesRegion && passesCaught && passesShiny && passesScreenshot;
        });

        context.res = {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            query,
            count: results.length,
            usedAI: true,
            results
          }
        };
      } catch (err) {
        context.res = {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          body: { error: 'Azure AI Search failed', details: err && err.stack, debug: { query, regionFilter, caughtFilter, shinyFilter, screenshotFilter, topK, aiSearchEnabled } }
        };
      }
      return;
    }

    // --- Local Search Path ---
    let db;
    try {
      db = await connectToDatabase();
    } catch (err) {
      context.res = { status: 500, headers: { 'Content-Type': 'application/json' }, body: { error: 'Database connection failed', details: err && err.stack } };
      return;
    }
    const userdexCol = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');
    const pokedexCol = db.collection('pokedex');
    let pokedexDocs = [];
    try {
      pokedexDocs = await pokedexCol.find({}).limit(MAX_ITEMS).toArray();
    } catch (err) {
      context.res = { status: 500, headers: { 'Content-Type': 'application/json' }, body: { error: 'Failed to query pokedex', details: err && err.stack } };
      return;
    }
    let userdexDocs = [];
    try {
      userdexDocs = await userdexCol.find({ userId: principal.userId }).limit(MAX_ITEMS).toArray();
    } catch (err) {
      context.res = { status: 500, headers: { 'Content-Type': 'application/json' }, body: { error: 'Failed to query user data', details: err && err.stack } };
      return;
    }
    const userdexMap = {};
    for (const doc of userdexDocs) {
      userdexMap[doc.pokemonId] = doc;
    }
    let items = [];
    for (const base of pokedexDocs) {
      const doc = userdexMap[base.pokemonId] || {};
      const meta = await getPokemonMeta(base.pokemonId);
      if (regionFilter && meta.region && meta.region.toLowerCase() !== regionFilter) continue;
      if (caughtFilter !== undefined && Boolean(doc.caught) !== Boolean(caughtFilter)) continue;
      if (shinyFilter !== undefined && Boolean(doc.shiny) !== Boolean(shinyFilter)) continue;
      if (screenshotFilter && !doc.screenshot) continue;
      const textParts = [
        `Name: ${meta.name}`,
        meta.types && meta.types.length ? `Types: ${meta.types.join(', ')}` : null,
        doc.notes ? `Notes: ${doc.notes}` : null,
        doc.caught ? 'caught' : '',
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
    const scored = items.map(item => ({ item, score: keywordScore(item.embeddingText, query) }));
    scored.sort((a, b) => b.score - a.score);
    // Only return items with a score > 0 (relevant matches)
    const relevantResults = scored.filter(entry => entry.score > 0);
    const results = relevantResults.slice(0, topK).map(entry => ({
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
      body: { query, count: results.length, total: relevantResults.length, usedAI: false, results }
    };
    return;
  } catch (err) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Unhandled error in search handler', details: err && err.stack }
    };
  }
}
