// Script to test login endpoint
const https = require('https');

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

console.log('🔄 Testing login...');
console.log(`📧 Email: rminhal783@gmail.com`);
console.log(`🔑 Password: 123456789`);
console.log(`🌐 URL: https://backend-liard-alpha-33.vercel.app/api/auth/login\n`);

const req = https.request(options, (res) => {
  console.log(`📊 Status Code: ${res.statusCode}`);
  
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(body);
      console.log('\n📦 Response:');
      console.log(JSON.stringify(response, null, 2));
      
      if (res.statusCode === 200) {
        console.log('\n✅ Login successful!');
      } else {
        console.log('\n❌ Login failed:', response.error || 'Unknown error');
      }
    } catch (e) {
      console.log('\n📦 Raw Response:', body);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request error:', e.message);
});

req.write(data);
req.end();
