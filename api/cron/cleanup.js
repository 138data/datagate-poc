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

/**
 * 期限切れファイル自動削除
 * Vercel Cron Jobsで毎日実行
 */

import { kv } from '@vercel/kv';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  // Vercel Cron認証
  const authHeader = req.headers.authorization;
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  
  // 開発環境では管理者トークンも許可
  const isDev = process.env.NODE_ENV !== 'production';
  const isValidCron = authHeader === expectedAuth;
  
  // 本番環境ではCRON_SECRETのみ、開発環境では管理者トークンも許可
  if (!isValidCron && !isDev) {
    console.error('❌ Unauthorized: Invalid CRON_SECRET');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('🧹 自動削除ジョブ開始:', new Date().toISOString());

  try {
    let deletedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const deletedFiles = [];

    // KVから全ファイルキーを取得
    const keys = await kvClient.keys('file:*');
    console.log(`📊 検索対象: ${keys.length}件のファイル`);

    for (const key of keys) {
      try {
        const metadataRaw = await kvClient.get(key);
        
        if (!metadataRaw) {
          console.log(`⚠️  メタデータが見つかりません: ${key}`);
          skippedCount++;
          continue;
        }

        const metadata = typeof metadataRaw === 'string' 
          ? JSON.parse(metadataRaw) 
          : metadataRaw;
        
        // 期限チェック（7日以上経過、または expiresAt を過ぎている）
        const uploadedAt = new Date(metadata.uploadedAt);
        const now = new Date();
        const daysPassed = (now - uploadedAt) / (1000 * 60 * 60 * 24);
        
        // expiresAt がある場合はそれもチェック
        const isExpired = metadata.expiresAt 
          ? new Date(metadata.expiresAt) < now 
          : daysPassed >= 7;
        
        if (isExpired) {
          const fileId = key.replace('file:', '');
          
          // 物理ファイル削除
          if (metadata.encryptedPath && fs.existsSync(metadata.encryptedPath)) {
            fs.unlinkSync(metadata.encryptedPath);
            console.log(`🗑️  物理ファイル削除: ${metadata.encryptedPath}`);
          }
          
          // KVからメタデータ削除
          await kvClient.del(key);
          
          deletedCount++;
          deletedFiles.push({
            fileId,
            uploadedAt: metadata.uploadedAt,
            expiresAt: metadata.expiresAt,
            daysPassed: Math.floor(daysPassed)
          });
          
          console.log(`✅ 削除完了: ${key} (${Math.floor(daysPassed)}日経過)`);
        } else {
          skippedCount++;
          console.log(`⏭️  スキップ: ${key} (${Math.floor(daysPassed)}日経過 - まだ期限内)`);
        }
      } catch (error) {
        console.error(`❌ 削除エラー: ${key}`, error);
        errorCount++;
      }
    }

    const result = {
      success: true,
      summary: {
        total: keys.length,
        deleted: deletedCount,
        skipped: skippedCount,
        errors: errorCount
      },
      deletedFiles,
      timestamp: new Date().toISOString()
    };

    console.log('✅ 自動削除ジョブ完了:', result.summary);

    res.status(200).json(result);

  } catch (error) {
    console.error('❌ 自動削除ジョブエラー:', error);
    res.status(500).json({ 
      success: false,
      error: '自動削除ジョブに失敗しました',
      details: error.message 
    });
  }
}

