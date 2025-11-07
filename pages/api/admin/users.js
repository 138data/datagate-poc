// pages/api/admin/users.js
import { kv } from '@vercel/kv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || '8hKHwgR0W1fdaO9btu26TlIF5JSe4iymAVv3LzsoQUq7cXjkpnMrDPECxNBYGZ';
const USERS_KEY = 'admin:users';

/**
 * JWT検証ミドルウェア
 */
function verifyToken(req) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) {
    throw new Error('認証トークンがありません');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    throw new Error('トークンが無効です');
  }
}

/**
 * 管理者権限チェック
 */
function requireAdmin(decoded) {
  if (decoded.role !== 'admin') {
    throw new Error('管理者権限が必要です');
  }
}

/**
 * ユーザー一覧取得
 */
async function getUsers() {
  const users = await kv.get(USERS_KEY) || {};
  
  // パスワードを除外して返す
  const sanitizedUsers = Object.values(users).map(user => ({
    username: user.username,
    role: user.role,
    createdAt: user.createdAt
  }));

  return sanitizedUsers;
}

/**
 * ユーザー追加
 */
async function createUser(username, password, role) {
  const users = await kv.get(USERS_KEY) || {};

  // 重複チェック
  if (users[username]) {
    throw new Error('このユーザー名は既に使用されています');
  }

  // バリデーション
  if (!username || username.length < 3) {
    throw new Error('ユーザー名は3文字以上必要です');
  }
  if (!password || password.length < 8) {
    throw new Error('パスワードは8文字以上必要です');
  }
  if (!['admin', 'viewer'].includes(role)) {
    throw new Error('ロールはadminまたはviewerを指定してください');
  }

  // パスワードハッシュ化
  const hashedPassword = await bcrypt.hash(password, 10);

  // ユーザー作成
  users[username] = {
    username,
    password: hashedPassword,
    role,
    createdAt: new Date().toISOString()
  };

  await kv.set(USERS_KEY, users);

  return {
    username,
    role,
    createdAt: users[username].createdAt
  };
}

/**
 * ユーザー更新
 */
async function updateUser(username, updates) {
  const users = await kv.get(USERS_KEY) || {};

  // 存在チェック
  if (!users[username]) {
    throw new Error('ユーザーが見つかりません');
  }

  // パスワード更新の場合はハッシュ化
  if (updates.password) {
    if (updates.password.length < 8) {
      throw new Error('パスワードは8文字以上必要です');
    }
    updates.password = await bcrypt.hash(updates.password, 10);
  }

  // ロール更新の場合はバリデーション
  if (updates.role && !['admin', 'viewer'].includes(updates.role)) {
    throw new Error('ロールはadminまたはviewerを指定してください');
  }

  // 更新
  users[username] = {
    ...users[username],
    ...updates
  };

  await kv.set(USERS_KEY, users);

  return {
    username: users[username].username,
    role: users[username].role,
    createdAt: users[username].createdAt
  };
}

/**
 * ユーザー削除
 */
async function deleteUser(username) {
  const users = await kv.get(USERS_KEY) || {};

  // 存在チェック
  if (!users[username]) {
    throw new Error('ユーザーが見つかりません');
  }

  // 最後の管理者削除を防止
  const adminCount = Object.values(users).filter(u => u.role === 'admin').length;
  if (users[username].role === 'admin' && adminCount <= 1) {
    throw new Error('最後の管理者アカウントは削除できません');
  }

  delete users[username];
  await kv.set(USERS_KEY, users);

  return { success: true };
}

/**
 * メインハンドラー
 */
export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // JWT検証
    const decoded = verifyToken(req);

    // GET: ユーザー一覧取得
    if (req.method === 'GET') {
      // 管理者のみ
      requireAdmin(decoded);
      
      const users = await getUsers();
      return res.status(200).json({ users });
    }

    // POST: ユーザー追加
    if (req.method === 'POST') {
      // 管理者のみ
      requireAdmin(decoded);

      const { username, password, role } = req.body;
      const user = await createUser(username, password, role);
      return res.status(201).json({ user, message: 'ユーザーを作成しました' });
    }

    // PUT: ユーザー更新
    if (req.method === 'PUT') {
      // 管理者のみ
      requireAdmin(decoded);

      const { username, password, role } = req.body;
      
      if (!username) {
        return res.status(400).json({ error: 'ユーザー名が必要です' });
      }

      const updates = {};
      if (password) updates.password = password;
      if (role) updates.role = role;

      const user = await updateUser(username, updates);
      return res.status(200).json({ user, message: 'ユーザーを更新しました' });
    }

    // DELETE: ユーザー削除
    if (req.method === 'DELETE') {
      // 管理者のみ
      requireAdmin(decoded);

      const { username } = req.body;
      
      if (!username) {
        return res.status(400).json({ error: 'ユーザー名が必要です' });
      }

      // 自分自身の削除を防止
      if (username === decoded.username) {
        return res.status(400).json({ error: '自分自身を削除することはできません' });
      }

      await deleteUser(username);
      return res.status(200).json({ message: 'ユーザーを削除しました' });
    }

    return res.status(405).json({ error: 'メソッドが許可されていません' });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(error.message.includes('認証') || error.message.includes('トークン') ? 401 : 
                      error.message.includes('権限') ? 403 : 400)
      .json({ error: error.message });
  }
}