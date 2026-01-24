// Script to directly query a user via the API (if there's such an endpoint)
const https = require('https');

// Test login with more detailed logging
const data = JSON.stringify({
  email: 'rminhal783@gmail.com',
  password: '123456789'
});

const options = {
  hostname: 'backend-liard-alpha-33.vercel.app',
  port: 443,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('🔄 Making login request...');
console.log('📦 Request body:', data);

const req = https.request(options, (res) => {
  console.log(`\n📊 Response Status: ${res.statusCode}`);
  console.log('📋 Response Headers:', JSON.stringify(res.headers, null, 2));
  
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    console.log('\n📦 Response Body:');
    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      console.log(body);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request error:', e.message);
});

req.write(data);
req.end();
