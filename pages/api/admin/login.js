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

    if (!adminUser || !adminPasswordHash) {
      console.error('ADMIN_USER または ADMIN_PASSWORD が設定されていません');
      return res.status(500).json({ error: 'サーバー設定エラー' });
    }

    // ユーザー名チェック
    if (username !== adminUser) {
      return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません' });
    }

    // パスワードチェック
    const isPasswordValid = await bcrypt.compare(password, adminPasswordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません' });
    }

    // Upstash から追加ユーザー情報を取得（将来の拡張用）
    let userRole = 'admin'; // デフォルトは admin
    try {
      const userData = await kv.get(`admin:user:${username}`);
      if (userData && userData.role) {
        userRole = userData.role;
      }
    } catch (error) {
      console.log('Upstash からユーザー情報を取得できませんでした（デフォルト値を使用）:', error.message);
      // エラーでもログインは継続（デフォルト値で）
    }

    // JWT トークン生成（ロール情報を含む）
    const token = jwt.sign(
      { 
        username: username,
        role: userRole  // ロール情報を追加
      },
      process.env.ADMIN_JWT_SECRET,
      { expiresIn: '24h' }
    );

    // トークンの有効期限（24時間後）
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    return res.status(200).json({
      token,
      expires: expiresAt,
      user: {
        username: username,
        role: userRole  // クライアントにもロール情報を返す
      }
    });
  } catch (error) {
    console.error('ログインエラー:', error);
    return res.status(500).json({ error: 'ログイン処理中にエラーが発生しました' });
  }
}