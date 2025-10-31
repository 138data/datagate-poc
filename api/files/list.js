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

import { kv } from '@vercel/kv';
import jwt from 'jsonwebtoken';
import { decryptString } from '../../lib/encryption.js';

// JWT検証関数
function verifyToken(token) {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }
    return jwt.verify(token, secret);
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // JWT認証
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '認証が必要です' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ error: '無効なトークンです' });
    }

    console.log('✅ 認証成功:', decoded.username);

    // KVから全ファイルのキーを取得
    console.log('📂 ファイル一覧取得開始...');
    const keys = await kvClient.keys('file:*');
    console.log('🔑 取得したキー数:', keys ? keys.length : 0);
    
    if (!keys || keys.length === 0) {
      console.log('📭 ファイルが見つかりません');
      return res.status(200).json({ 
        files: [],
        total: 0
      });
    }

    // 各ファイルのメタデータを取得
    const filePromises = keys.map(async (key) => {
      try {
        console.log('📄 処理中:', key);
        const metadataRaw = await kvClient.get(key);
        
        if (!metadataRaw) {
          console.log('⚠️ データなし:', key);
          return null;
        }

        // データ型を確認
        let fileData;
        if (typeof metadataRaw === 'string') {
          // 文字列の場合はJSON.parse
          try {
            fileData = JSON.parse(metadataRaw);
            console.log('✅ JSON文字列をパース成功');
          } catch (e) {
            console.error('❌ JSONパースエラー:', e.message);
            return null;
          }
        } else if (typeof metadataRaw === 'object' && metadataRaw !== null) {
          // 既にオブジェクトの場合はそのまま使用
          fileData = metadataRaw;
          console.log('✅ 既にオブジェクト形式');
        } else {
          console.error('❌ 不明なデータ型:', typeof metadataRaw);
          return null;
        }

        console.log('📦 メタデータ取得成功:', fileData.fileId);
        
        // ファイル名を復号
        let fileName = 'unknown';
        try {
          fileName = decryptString(
            fileData.fileName,
            fileData.fileNameSalt,
            fileData.fileNameIv,
            fileData.fileNameAuthTag
          );
          console.log('✅ ファイル名復号成功:', fileName);
        } catch (e) {
          console.error('❌ ファイル名復号失敗:', e.message);
          fileName = `encrypted_${fileData.fileId.substring(0, 8)}`;
        }

        // 送信者を復号
        let sender = 'unknown';
        try {
          sender = decryptString(
            fileData.sender,
            fileData.senderSalt,
            fileData.senderIv,
            fileData.senderAuthTag
          );
        } catch (e) {
          console.error('❌ 送信者復号失敗:', e.message);
        }

        // 受信者を復号
        let recipient = 'unknown';
        try {
          recipient = decryptString(
            fileData.recipient,
            fileData.recipientSalt,
            fileData.recipientIv,
            fileData.recipientAuthTag
          );
        } catch (e) {
          console.error('❌ 受信者復号失敗:', e.message);
        }

        return {
          id: fileData.fileId,
          fileName: fileName,
          originalName: fileName,
          mimeType: 'application/octet-stream',
          size: fileData.originalSize || fileData.fileSize || 0,
          sender: sender,
          recipient: recipient,
          uploadDate: fileData.uploadedAt,
          expiresAt: fileData.expiresAt,
          uploadedBy: 'admin'
        };
      } catch (error) {
        console.error('❌ ファイルメタデータ取得エラー:', key, error.message);
        return null;
      }
    });

    const filesData = await Promise.all(filePromises);
    
    // nullを除外
    const files = filesData.filter(f => f !== null);
    console.log('📊 有効なファイル数:', files.length);

    // 日付でソート（新しい順）
    files.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

    console.log('✅ ファイル一覧取得完了:', files.length, '件');

    return res.status(200).json({
      files: files,
      total: files.length
    });

  } catch (error) {
    console.error('❌ ファイル一覧取得エラー:', error);
    return res.status(500).json({ 
      error: 'ファイル一覧の取得に失敗しました',
      details: error.message 
    });
  }
}

