// pages/api/admin/users.js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS ヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 認証チェック
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    
    // 権限チェック（GET 以外は管理者のみ）
    if (req.method !== 'GET' && decoded.role !== 'admin') {
      return res.status(403).json({ error: '権限がありません。この操作は管理者のみ実行できます。' });
    }

    // GET: ユーザー一覧取得（閲覧者も可能）
    if (req.method === 'GET') {
      try {
        const users = await kv.keys('admin:user:*');
        const userList = await Promise.all(
          users.map(async (key) => {
            const userData = await kv.get(key);
            return {
              username: userData.username,
              role: userData.role,
              createdAt: userData.createdAt
            };
          })
        );
        
        return res.status(200).json({ users: userList });
      } catch (error) {
        console.error('ユーザー一覧取得エラー:', error);
        return res.status(500).json({ error: 'ユーザー一覧の取得に失敗しました' });
      }
    }

    // POST: ユーザー追加（管理者のみ）
    if (req.method === 'POST') {
      const { username, password, role } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'ユーザー名とパスワードは必須です' });
      }

      // ロールのバリデーション
      if (role && role !== 'admin' && role !== 'viewer') {
        return res.status(400).json({ error: 'ロールは admin または viewer のみ指定できます' });
      }

      // ユーザーが既に存在するかチェック
      const existingUser = await kv.get(`admin:user:${username}`);
      if (existingUser) {
        return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
      }

      // パスワードをハッシュ化
      const passwordHash = await bcrypt.hash(password, 10);

      // ユーザー情報を保存
      const userData = {
        username,
        passwordHash,
        role: role || 'viewer', // デフォルトは閲覧者
        createdAt: new Date().toISOString()
      };

      await kv.set(`admin:user:${username}`, userData);

      return res.status(201).json({
        message: 'ユーザーを作成しました',
        user: {
          username: userData.username,
          role: userData.role,
          createdAt: userData.createdAt
        }
      });
    }

    // DELETE: ユーザー削除（管理者のみ）
    if (req.method === 'DELETE') {
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({ error: 'ユーザー名は必須です' });
      }

      // 自分自身の削除を防止
      if (username === decoded.username) {
        return res.status(400).json({ error: '自分自身は削除できません' });
      }

      // ユーザーを削除
      await kv.del(`admin:user:${username}`);

      return res.status(200).json({ message: 'ユーザーを削除しました' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('API エラー:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: '無効なトークンです' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'トークンの有効期限が切れています' });
    }
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
}