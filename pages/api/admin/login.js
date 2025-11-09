// api/admin/login.js - Production Version with expires field
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({
      success: false,
      error: 'Method Not Allowed'
    });
    return;
  }
  
  try {
    const { username, password } = req.body || {};
    
    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: 'ユーザー名とパスワードは必須です'
      });
      return;
    }
    
    // 環境変数から認証情報を取得
    const adminUser = process.env.ADMIN_USER;
    const adminPasswordHash = process.env.ADMIN_PASSWORD;
    const jwtSecret = process.env.ADMIN_JWT_SECRET;
    
    // 環境変数の検証
    if (!adminUser || !adminPasswordHash || !jwtSecret) {
      console.error('環境変数が未設定');
      res.status(500).json({
        success: false,
        error: 'サーバー設定エラー'
      });
      return;
    }
    
    // ユーザー名の検証
    if (username !== adminUser) {
      res.status(401).json({
        success: false,
        error: 'ユーザー名またはパスワードが正しくありません'
      });
      return;
    }
    
    // パスワードの検証
    const isPasswordValid = await bcrypt.compare(password, adminPasswordHash);
    
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        error: 'ユーザー名またはパスワードが正しくありません'
      });
      return;
    }
    
    // JWTトークン生成（logs.jsの検証に合わせる）
    const token = jwt.sign(
      {
        username: adminUser,
        role: 'admin',
        iat: Math.floor(Date.now() / 1000)
      },
      jwtSecret,
      {
        expiresIn: '24h',
        audience: 'admin-dashboard',
        issuer: '138datagate'
      }
    );
    
    // 有効期限のタイムスタンプを計算（24時間後）
    const expiresTimestamp = Date.now() + (24 * 60 * 60 * 1000);
    
    console.log('管理者ログイン成功:', username);
    
    res.status(200).json({
      success: true,
      token,
      expires: expiresTimestamp,  // ← 追加: フロントエンドが期待するフィールド
      expiresIn: 86400
    });
  } catch (error) {
    console.error('ログインエラー:', error);
    res.status(500).json({
      success: false,
      error: '認証処理中にエラーが発生しました'
    });
  }
}