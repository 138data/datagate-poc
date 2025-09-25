const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send(`
        <h1>DataGate Emergency Mode</h1>
        <p>System is running on port ${PORT}</p>
        <p>Time: ${new Date().toISOString()}</p>
    `);
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', port: PORT });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});