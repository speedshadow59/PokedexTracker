const { connectToDatabase, getClientPrincipal } = require('../shared/utils');
const { REGIONS } = require('../shared/pokemonData');
const { OpenAIClient, AzureKeyCredential } = require('@azure/openai');

const MAX_ITEMS = 300;
const DEFAULT_TOP_K = 20;
const POKE_API_BASE = 'https://pokeapi.co/api/v2/pokemon/';

const pokemonCache = new Map();

function buildOpenAIClient(context) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const key = process.env.AZURE_OPENAI_KEY;
  if (!endpoint || !key) return null;
  try {
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-01-preview';
    return new OpenAIClient(endpoint, new AzureKeyCredential(key), { apiVersion });
  } catch (err) {
    context.log.warn('Failed to init OpenAI client', err.message);
    return null;
  }
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
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

async function embedTexts(client, deploymentName, inputs) {
  if (!client) return null;
  const result = await client.getEmbeddings(deploymentName, inputs);
  return result.data.map(item => item.embedding);
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
  let scored = [];
  const openAIClient = buildOpenAIClient(context);
  const embeddingDeployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || process.env.AZURE_OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large';

  if (openAIClient) {
    try {
      const inputs = [query, ...items.map(i => i.embeddingText)];
      const embeddings = await embedTexts(openAIClient, embeddingDeployment, inputs);
      if (embeddings && embeddings.length === inputs.length) {
        usedAI = true;
        const queryVector = embeddings[0];
        const docVectors = embeddings.slice(1);
        scored = docVectors.map((vector, idx) => ({ item: items[idx], score: cosineSimilarity(queryVector, vector) }));
      }
    } catch (err) {
      context.log.warn('Embedding search failed, falling back to keyword search', err.message);
    }
  }

  if (!scored.length) {
    scored = items.map(item => ({ item, score: keywordScore(item.embeddingText, query) }));
  }

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
      usedAI,
      results
    }
  };
};
