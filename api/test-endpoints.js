/**
 * Simple test script to validate API endpoints are correctly configured
 * This tests the function modules can be loaded and have the correct structure
 */

const path = require('path');

// Test function structure
function testEndpoint(name, modulePath) {
  console.log(`\n=== Testing ${name} ===`);
  
  try {
    const handler = require(modulePath);
    
    if (typeof handler !== 'function') {
      console.error(`❌ ${name}: Handler is not a function`);
      return false;
    }
    
    console.log(`✅ ${name}: Handler loaded successfully`);
    return true;
  } catch (error) {
    console.error(`❌ ${name}: Failed to load - ${error.message}`);
    return false;
  }
}

// Test all endpoints
console.log('Testing API Endpoints Configuration\n');
console.log('=====================================');

const endpoints = [
  { name: 'pokedex', path: './pokedex/index.js' },
  { name: 'userdex', path: './userdex/index.js' },
  { name: 'comments', path: './comments/index.js' },
  { name: 'media', path: './media/index.js' },
  { name: 'search', path: './search/index.js' }
];

let allPassed = true;

for (const endpoint of endpoints) {
  const passed = testEndpoint(endpoint.name, endpoint.path);
  allPassed = allPassed && passed;
}

console.log('\n=====================================');

if (allPassed) {
  console.log('✅ All endpoints configured correctly!');
  process.exit(0);
} else {
  console.log('❌ Some endpoints have issues');
  process.exit(1);
}
