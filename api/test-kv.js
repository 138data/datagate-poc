// KVクライアント（REST API方式）
const fetch = require('node-fetch');

const kvClient = {
    async get(key) {
        const url = `${(process.env.KV_REST_API_URL || '').trim()}/get/${key}`;
        const token = (process.env.KV_REST_API_TOKEN || '').trim();

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`KV GET failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.result;
    },

    async set(key, value, opts = {}) {
        const url = `${(process.env.KV_REST_API_URL || '').trim()}/set/${key}`;
        const token = (process.env.KV_REST_API_TOKEN || '').trim();

        const body = { value };
        if (opts.ex) body.ex = opts.ex;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`KV SET failed: ${response.statusText}`);
        }

        return await response.json();
    },

    async keys(pattern) {
        const url = `${(process.env.KV_REST_API_URL || '').trim()}/keys/${pattern}`;
        const token = (process.env.KV_REST_API_TOKEN || '').trim();

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 404) return [];
            throw new Error(`KV KEYS failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.result || [];
    },

    async del(key) {
        const url = `${(process.env.KV_REST_API_URL || '').trim()}/del/${key}`;
        const token = (process.env.KV_REST_API_TOKEN || '').trim();

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`KV DEL failed: ${response.statusText}`);
        }

        return await response.json();
    }
};

// api/test-kvClient.js
// KVクライアントの動作確認用テストAPI

let kvClient = null;
try {
  ({ kv: kvClient } = require('@vercel/kv'));
  console.log('[TEST-KV] KV client loaded successfully');
} catch (e) {
  console.error('[TEST-KV] KV load error:', e.message);
}

module.exports = async (req, res) => {
  try {
    console.log('[TEST-KV] Starting KV test...');
    console.log('[TEST-KV] KV client exists:', !!kvClient);
    console.log('[TEST-KV] Environment variables:');
    console.log('[TEST-KV]   KV_URL:', process.env.KV_URL ? 'SET' : 'NOT SET');
    console.log('[TEST-KV]   KV_REST_API_URL:', process.env.KV_REST_API_URL ? 'SET' : 'NOT SET');
    console.log('[TEST-KV]   KV_REST_API_TOKEN:', process.env.KV_REST_API_TOKEN ? 'SET' : 'NOT SET');
    
    if (!kvClient) {
      return res.status(500).json({ 
        success: false, 
        error: 'KV client not initialized',
        envVars: {
          KV_URL: !!process.env.KV_URL,
          KV_REST_API_URL: !!process.env.KV_REST_API_URL,
          KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN
        }
      });
    }
    
    // 簡単な書き込みテスト
    const testKey = `test:${Date.now()}`;
    const testData = { hello: 'world', timestamp: new Date().toISOString() };
    
    console.log('[TEST-KV] Writing test data...');
    await kvClient.set(testKey, testData, { ex: 60 }); // 60秒で期限切れ
    
    console.log('[TEST-KV] Reading test data...');
    const result = await kvClient.get(testKey);
    
    console.log('[TEST-KV] Test successful!');
    
    return res.status(200).json({ 
      success: true, 
      message: 'KV test successful',
      testKey,
      written: testData,
      read: result,
      match: JSON.stringify(testData) === JSON.stringify(result)
    });
    
  } catch (error) {
    console.error('[TEST-KV] Error:', error.message);
    console.error('[TEST-KV] Stack:', error.stack);
    
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack,
      envVars: {
        KV_URL: !!process.env.KV_URL,
        KV_REST_API_URL: !!process.env.KV_REST_API_URL,
        KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN
      }
    });
  }
};

