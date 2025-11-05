// api/admin/login.js
// POST /api/admin/login
// Body: { username: string, password: string }
// Response: { success: true, token: string } | { error: string }

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  // キャッシュ無効化（Phase 40方針）
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // OPTIONS対応
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // POSTのみ許可
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // 環境変数取得
  const ADMIN_USER = process.env.ADMIN_USER || 'admin';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; // bcryptハッシュ
  const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
  
  // 設定確認
  if (!ADMIN_PASSWORD || !JWT_SECRET) {
    console.error('Admin credentials not configured');
    return res.status(500).json({ error: 'Server not configured' });
  }
  
  try {
    // リクエストボディ取得
    const body = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
    
    const { username, password } = JSON.parse(body || '{}');
    
    // 入力検証
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    // ユーザー名確認
    const usernameMatch = username === ADMIN_USER;
    
    // パスワード検証（bcrypt）
    const passwordMatch = await bcrypt.compare(password, ADMIN_PASSWORD);
    
    // 認証失敗
    if (!usernameMatch || !passwordMatch) {
      console.log('Login failed:', { username, usernameMatch, passwordMatch });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // JWT生成
    const token = jwt.sign(
      { 
        sub: ADMIN_USER, 
        role: 'admin',
        iat: Math.floor(Date.now() / 1000)
      }, 
      JWT_SECRET, 
      {
        algorithm: 'HS256',
        expiresIn: '24h',
        issuer: '138datagate',
        audience: 'admin-dashboard'
      }
    );
    
    console.log('Login successful:', { username, tokenLength: token.length });
    
    return res.status(200).json({ 
      success: true, 
      token,
      expiresIn: '24h'
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return res.status(400).json({ error: 'Bad request' });
  }
};