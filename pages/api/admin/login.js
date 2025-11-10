// pages/api/admin/login.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS ヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください' });
    }

    // 環境変数から管理者情報を取得
    const adminUser = process.env.ADMIN_USER;
    const adminPasswordHash = process.env.ADMIN_PASSWORD;
    const jwtSecret = process.env.ADMIN_JWT_SECRET;

    if (!adminUser || !adminPasswordHash || !jwtSecret) {
      console.error('環境変数が設定されていません');
      return res.status(500).json({ error: 'サーバー設定エラー' });
    }

    let userRole = null;
    let passwordHash = null;

    // まず環境変数の管理者アカウントをチェック
    if (username === adminUser) {
      userRole = 'admin';
      passwordHash = adminPasswordHash;
    } else {
      // Upstash から追加ユーザーを取得
      try {
        const userData = await kv.get(`admin:user:${username}`);
        if (userData && userData.passwordHash) {
          userRole = userData.role || 'viewer';
          passwordHash = userData.passwordHash;
        }
      } catch (error) {
        console.error('Upstash エラー:', error);
      }
    }

    // ユーザーが見つからない
    if (!userRole || !passwordHash) {
      return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません' });
    }

    // パスワードチェック
    const isPasswordValid = await bcrypt.compare(password, passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません' });
    }

    // JWT トークン生成
    const token = jwt.sign(
      {
        username: username,
        role: userRole
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    // トークンの有効期限
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    return res.status(200).json({
      token,
      expires: expiresAt,
      user: {
        username: username,
        role: userRole
      }
    });
  } catch (error) {
    console.error('ログインエラー:', error);
    return res.status(500).json({ error: 'ログイン処理中にエラーが発生しました' });
  }
}