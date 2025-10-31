// api/files/info.js
// ファイル情報取得API（OTP認証なし）

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // CORSヘッダー設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: 'Method Not Allowed'
        });
    }

    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'ファイルIDが指定されていません'
            });
        }

        console.log('[INFO] ファイル情報取得開始:', id);

        // Vercel KVからファイルメタデータを取得
        const fileData = await kv.get(`file:${id}`);

        if (!fileData) {
            console.log('[ERROR] ファイルが見つかりません:', id);
            return res.status(404).json({
                success: false,
                error: 'ファイルが見つかりません'
            });
        }

        // 有効期限チェック
        const now = new Date();
        const expiresAt = new Date(fileData.expiresAt);

        if (now > expiresAt) {
            console.log('[ERROR] ファイルの有効期限切れ:', id);
            return res.status(410).json({
                success: false,
                error: 'ファイルの有効期限が切れています'
            });
        }

        console.log('[INFO] ファイル情報取得成功:', {
            id,
            fileName: fileData.fileName,
            fileSize: fileData.fileSize
        });

        // ファイル情報を返却（OTP以外）
        return res.status(200).json({
            success: true,
            fileName: fileData.fileName,
            fileSize: fileData.fileSize,
            uploadedAt: fileData.uploadedAt,
            expiresAt: fileData.expiresAt
        });

    } catch (error) {
        console.error('[ERROR] ファイル情報取得エラー:', error);
        return res.status(500).json({
            success: false,
            error: 'サーバーエラーが発生しました',
            details: error.message
        });
    }
}
