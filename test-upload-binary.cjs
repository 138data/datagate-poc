// test-upload-binary.cjs
const axios = require('axios');
const fs = require('fs');

console.log('🧪 Testing binary upload to /api/upload\n');

// テストファイル作成
const testData = Buffer.from('Test file content - ' + new Date().toISOString());
fs.writeFileSync('test-binary.bin', testData);

axios.post('https://datagate-poc.vercel.app/api/upload', testData, {
  headers: {
    'Content-Type': 'application/octet-stream'
  },
  maxBodyLength: Infinity,
  timeout: 30000
})
.then(response => {
  console.log('✅ SUCCESS!');
  console.log('Status:', response.status);
  console.log('Response:', JSON.stringify(response.data, null, 2));
})
.catch(error => {
  console.error('❌ ERROR!');
  console.error('Status:', error.response?.status);
  console.error('Data:', error.response?.data);
  console.error('Message:', error.message);
});
