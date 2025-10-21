// test-upload-direct.js
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function testUpload() {
    try {
        console.log('Vercel API test starting...\n');

        const testFilePath = './test-upload-file.txt';
        fs.writeFileSync(testFilePath, 'This is a test file for 138DataGate upload API test.');
        console.log('Test file created: test-upload-file.txt\n');

        const formData = new FormData();
        formData.append('file', fs.createReadStream(testFilePath));
        formData.append('sender', 'test@example.com');
        formData.append('recipient', 'recipient@example.com');
        formData.append('message', 'Test upload from direct script');

        const apiUrl = 'https://datagate-poc.vercel.app/api/files/upload';
        console.log('Upload destination: ' + apiUrl + '\n');

        const response = await axios.post(apiUrl, formData, {
            headers: {
                ...formData.getHeaders()
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 30000
        });

        console.log('Upload successful!\n');
        console.log('Response:');
        console.log(JSON.stringify(response.data, null, 2));

        fs.unlinkSync(testFilePath);

    } catch (error) {
        console.error('ERROR occurred:\n');
        
        if (error.response) {
            console.error('Status code:', error.response.status);
            console.error('Error data:');
            console.error(JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('No response:', error.message);
        } else {
            console.error('Error:', error.message);
        }

        console.error('\nStack trace:');
        console.error(error.stack);
    }
}

testUpload();