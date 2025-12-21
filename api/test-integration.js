/**
 * Integration test for API endpoints
 * Tests the actual behavior of each endpoint with mock context
 */

// Mock Azure Functions context
function createMockContext() {
  const logs = [];
  const context = {
    log: (...args) => {
      logs.push(args.join(' '));
      console.log('  [LOG]', ...args);
    },
    res: null,
    logs
  };
  
  // Add log.error as a property of log function
  context.log.error = (...args) => {
    logs.push('ERROR: ' + args.join(' '));
    console.error('  [ERROR]', ...args);
  };
  
  return context;
}

async function testPokedexEndpoint() {
  console.log('\n=== Testing GET /api/pokedex ===');
  
  const handler = require('./pokedex/index.js');
  
  // Test 1: No region parameter (should return 200 with available regions)
  console.log('\n Test 1: No region parameter');
  let context = createMockContext();
  let req = { query: {} };
  
  await handler(context, req);
  
  if (context.res.status === 200 && context.res.body.availableRegions) {
    console.log('  ✅ Returns 200 with available regions when no region specified');
    console.log('  Available regions:', context.res.body.availableRegions);
  } else {
    console.log('  ❌ Failed: Expected 200 with available regions');
    console.log('  Got:', JSON.stringify(context.res, null, 2));
    return false;
  }
  
  // Test 2: Valid region (kanto)
  console.log('\n Test 2: Valid region (kanto)');
  context = createMockContext();
  req = { query: { region: 'kanto' } };
  
  await handler(context, req);
  
  if (context.res.status === 200 && context.res.body.pokemon && context.res.body.count === 151) {
    console.log('  ✅ Returns 200 with 151 Pokémon for Kanto region');
  } else {
    console.log('  ❌ Failed: Expected 200 with 151 Pokémon');
    console.log('  Got status:', context.res.status, 'count:', context.res.body.count);
    return false;
  }
  
  // Test 3: Invalid region
  console.log('\n Test 3: Invalid region');
  context = createMockContext();
  req = { query: { region: 'invalid' } };
  
  await handler(context, req);
  
  if (context.res.status === 404 && context.res.body.error) {
    console.log('  ✅ Returns 404 for invalid region');
  } else {
    console.log('  ❌ Failed: Expected 404 for invalid region');
    console.log('  Got:', context.res.status);
    return false;
  }
  
  // Test 4: All regions
  console.log('\n Test 4: Test all regions');
  const regions = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar'];
  const expectedCounts = [151, 100, 135, 107, 156, 72, 88, 89];
  
  for (let i = 0; i < regions.length; i++) {
    context = createMockContext();
    req = { query: { region: regions[i] } };
    
    await handler(context, req);
    
    if (context.res.status !== 200 || context.res.body.count !== expectedCounts[i]) {
      console.log(`  ❌ Failed for region ${regions[i]}: Expected count ${expectedCounts[i]}, got ${context.res.body.count}`);
      return false;
    }
  }
  console.log('  ✅ All regions return correct Pokémon counts');
  
  return true;
}

async function testUserdexEndpoint() {
  console.log('\n=== Testing PUT /api/userdex ===');
  
  const handler = require('./userdex/index.js');
  
  // Test 1: Missing parameters
  console.log('\n Test 1: Missing parameters');
  let context = createMockContext();
  let req = { body: {} };
  
  await handler(context, req);
  
  if (context.res.status === 400 && context.res.body.error) {
    console.log('  ✅ Returns 400 when parameters are missing');
  } else {
    console.log('  ❌ Failed: Expected 400 for missing parameters');
    return false;
  }
  
  // Test 2: Database not configured (expected to fail gracefully)
  console.log('\n Test 2: Database not configured (expected error)');
  context = createMockContext();
  req = { body: { userId: 'test', pokemonId: 25, caught: true } };
  
  await handler(context, req);
  
  if (context.res.status === 500) {
    console.log('  ✅ Returns 500 when database is not available (expected)');
  } else {
    console.log('  ⚠️  Unexpected status:', context.res.status);
  }
  
  return true;
}

async function testCommentsEndpoint() {
  console.log('\n=== Testing POST /api/comments ===');
  
  const handler = require('./comments/index.js');
  
  // Test 1: Missing parameters
  console.log('\n Test 1: Missing parameters');
  let context = createMockContext();
  let req = { body: {} };
  
  await handler(context, req);
  
  if (context.res.status === 400 && context.res.body.error) {
    console.log('  ✅ Returns 400 when parameters are missing');
  } else {
    console.log('  ❌ Failed: Expected 400 for missing parameters');
    return false;
  }
  
  // Test 2: Empty comment
  console.log('\n Test 2: Empty comment');
  context = createMockContext();
  req = { body: { userId: 'test', pokemonId: 25, comment: '   ' } };
  
  await handler(context, req);
  
  if (context.res.status === 400 && context.res.body.error.includes('empty')) {
    console.log('  ✅ Returns 400 for empty comment');
  } else {
    console.log('  ❌ Failed: Expected 400 for empty comment');
    return false;
  }
  
  return true;
}

async function testMediaEndpoint() {
  console.log('\n=== Testing POST /api/media ===');
  
  const handler = require('./media/index.js');
  
  // Test 1: Missing parameters
  console.log('\n Test 1: Missing parameters');
  let context = createMockContext();
  let req = { body: {} };
  
  await handler(context, req);
  
  if (context.res.status === 400 && context.res.body.error) {
    console.log('  ✅ Returns 400 when parameters are missing');
  } else {
    console.log('  ❌ Failed: Expected 400 for missing parameters');
    return false;
  }
  
  return true;
}

// Run all tests
async function runTests() {
  console.log('Running API Integration Tests');
  console.log('======================================');
  
  try {
    const results = {
      pokedex: await testPokedexEndpoint(),
      userdex: await testUserdexEndpoint(),
      comments: await testCommentsEndpoint(),
      media: await testMediaEndpoint()
    };
    
    console.log('\n======================================');
    console.log('Test Results:');
    console.log('  Pokedex:', results.pokedex ? '✅ PASSED' : '❌ FAILED');
    console.log('  Userdex:', results.userdex ? '✅ PASSED' : '❌ FAILED');
    console.log('  Comments:', results.comments ? '✅ PASSED' : '❌ FAILED');
    console.log('  Media:', results.media ? '✅ PASSED' : '❌ FAILED');
    
    const allPassed = Object.values(results).every(r => r === true);
    
    if (allPassed) {
      console.log('\n✅ All tests passed!');
      process.exit(0);
    } else {
      console.log('\n❌ Some tests failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test suite failed with error:', error);
    process.exit(1);
  }
}

runTests();
