/**
 * Test production API endpoints on Azure Static Web Apps
 */

const https = require('https');

const BASE_URL = 'jolly-sand-089c0af03.3.azurestaticapps.net';

function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonBody = JSON.parse(body);
          resolve({ status: res.statusCode, body: jsonBody });
        } catch (e) {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function testPokedexAPI() {
  console.log('\n🔍 Testing GET /api/pokedex');
  console.log('==========================================');
  
  try {
    const result = await makeRequest('/api/pokedex');
    console.log(`Status: ${result.status}`);
    console.log(`Response:`, JSON.stringify(result.body, null, 2));
    
    if (result.status === 200 && result.body.availableRegions) {
      console.log('✅ Pokedex API is working!');
      return true;
    } else {
      console.log('❌ Unexpected response');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testPokedexKanto() {
  console.log('\n🔍 Testing GET /api/pokedex?region=kanto');
  console.log('==========================================');
  
  try {
    const result = await makeRequest('/api/pokedex?region=kanto');
    console.log(`Status: ${result.status}`);
    
    if (result.status === 200) {
      console.log(`✅ Retrieved ${result.body.count} Pokémon from Kanto`);
      console.log(`First Pokémon: ${result.body.pokemon[0].name} (#${result.body.pokemon[0].id})`);
      return true;
    } else {
      console.log('❌ Failed to get Kanto Pokémon');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testUserdexGET() {
  console.log('\n🔍 Testing GET /api/userdex');
  console.log('==========================================');
  
  try {
    const userId = 'test_user_production';
    const result = await makeRequest(`/api/userdex?userId=${userId}`);
    console.log(`Status: ${result.status}`);
    console.log(`Response:`, JSON.stringify(result.body, null, 2));
    
    if (result.status === 200) {
      console.log('✅ Userdex GET endpoint is working!');
      return true;
    } else {
      console.log('⚠️  Status:', result.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testUserdexPUT() {
  console.log('\n🔍 Testing PUT /api/userdex');
  console.log('==========================================');
  
  try {
    const userId = 'test_user_production_' + Date.now();
    const data = {
      userId: userId,
      pokemonId: 25,
      caught: true,
      shiny: false,
      notes: 'Tested from production API test script'
    };
    
    const options = {
      hostname: BASE_URL,
      path: '/api/userdex',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(data))
      }
    };

    const result = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, body: body });
          }
        });
      });
      req.on('error', reject);
      req.write(JSON.stringify(data));
      req.end();
    });

    console.log(`Status: ${result.status}`);
    console.log(`Response:`, JSON.stringify(result.body, null, 2));
    
    if (result.status === 200 || result.status === 201) {
      console.log('✅ Userdex PUT endpoint is working!');
      return true;
    } else {
      console.log('⚠️  Status:', result.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   Testing Production API Endpoints               ║');
  console.log('║   https://jolly-sand-089c0af03.3.azurestaticapps.net   ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  
  const results = {
    pokedex: await testPokedexAPI(),
    pokedexKanto: await testPokedexKanto(),
    userdexGET: await testUserdexGET(),
    userdexPUT: await testUserdexPUT()
  };
  
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   TEST RESULTS                                    ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log(`  Pokedex (list regions): ${results.pokedex ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Pokedex (Kanto region): ${results.pokedexKanto ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Userdex GET:            ${results.userdexGET ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Userdex PUT:            ${results.userdexPUT ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  
  const allPassed = Object.values(results).every(r => r === true);
  if (allPassed) {
    console.log('🎉 All production API endpoints are working!');
  } else {
    console.log('⚠️  Some endpoints may not be fully configured');
  }
}

runTests();
