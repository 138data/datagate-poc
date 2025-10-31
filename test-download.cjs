const axios = require('axios');

const fileId = '767d210f3e8d617111a610262306d3ec';
const otp = '0f9473';

console.log('🧪 Testing download API\n');

axios.get(`https://datagate-poc.vercel.app/api/download?id=${fileId}&otp=${otp}`)
.then(response => {
  console.log('✅ SUCCESS!');
  console.log('Status:', response.status);
  console.log('Content-Type:', response.headers['content-type']);
  console.log('Content-Length:', response.headers['content-length']);
  console.log('Data:', response.data);
})
.catch(error => {
  console.error('❌ ERROR!');
  console.error('Status:', error.response?.status);
  console.error('Data:', error.response?.data);
});
