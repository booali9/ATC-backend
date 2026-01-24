// Script to test deployed backend health and debug info
const https = require('https');

const endpoints = [
  { path: '/health', name: 'Health Check' },
];

function testEndpoint(endpoint) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'backend-liard-alpha-33.vercel.app',
      port: 443,
      path: endpoint.path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    console.log(`\n🔄 Testing ${endpoint.name}: https://backend-liard-alpha-33.vercel.app${endpoint.path}`);

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        console.log(`   Status: ${res.statusCode}`);
        try {
          const data = JSON.parse(body);
          console.log(`   Response:`, JSON.stringify(data, null, 2).substring(0, 500));
        } catch (e) {
          console.log(`   Response: ${body.substring(0, 200)}`);
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      console.log(`   Error: ${e.message}`);
      resolve();
    });

    req.end();
  });
}

async function main() {
  console.log('🚀 Testing Vercel Backend Deployment\n');
  
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
  }
  
  console.log('\n✅ Done!');
}

main();
