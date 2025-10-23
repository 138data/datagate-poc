import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { withGuard } from '../../lib/guard.js';
import fs from 'fs';
import path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// 環境変数から管理者の認証情報を取得
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function loginHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    // 環境変数ベースの認証（優先）
    if (username === ADMIN_USERNAME && ADMIN_PASSWORD) {
      // 環境変数のパスワードを bcrypt でハッシュ化して比較
      // 注意: ADMIN_PASSWORD は平文で保存されているため、直接比較
      if (password === ADMIN_PASSWORD) {
        const token = jwt.sign(
          { 
            id: '1', 
            username: ADMIN_USERNAME, 
            email: 'admin@138data.com', 
            role: 'admin' 
          },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        console.log('Login success (env):', username);
        
        return res.status(200).json({
          success: true,
          token,
          user: { 
            id: '1', 
            username: ADMIN_USERNAME, 
            email: 'admin@138data.com', 
            role: 'admin' 
          }
        });
      }
    }

    // フォールバック: data/users.json から認証（従来の方式）
    const usersPath = path.join(process.cwd(), 'data', 'users.json');
    
    // ファイルが存在するか確認
    if (!fs.existsSync(usersPath)) {
      console.log('users.json not found, using env-only authentication');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const usersData = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
    const user = usersData.find(u => u.username === username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('Login success (file):', username);

    res.status(200).json({
      success: true,
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
}

export default withGuard(loginHandler, {
  route: '/api/auth/login',
  requireAuth: false,
  checkIP: false,
  rateLimit: true,
  cap: 5,
  ttl: 900,
  logAccess: true
});