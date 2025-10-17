const { decryptFile, decryptString } = require('../../lib/encryption');
const { decompress } = require('../../lib/compression');
const fetch = require('node-fetch');

// KVクライアント（REST API方式）
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
    }
};

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    const { fileId } = req.query;

    if (!fileId) {
        return res.status(400).json({
            success: false,
            error: 'ファイルIDが指定されていません'
        });
    }

    try {
        // メタデータの取得
        const metadataJson = await kvClient.get(`file:${fileId}`);

        if (!metadataJson) {
            return res.status(404).json({
                success: false,
                error: 'ファイルが見つかりません',
                details: '指定されたファイルIDは存在しないか、期限切れです'
            });
        }

        const metadata = JSON.parse(metadataJson);

        // 有効期限チェック
        if (new Date(metadata.expiresAt) < new Date()) {
            return res.status(410).json({
                success: false,
                error: 'ファイルの有効期限が切れています'
            });
        }

        // 暗号化ファイルデータの取得（KVから）
        const encryptedFileBase64 = await kvClient.get(`file:data:${fileId}`);
        
        if (!encryptedFileBase64) {
            return res.status(404).json({
                success: false,
                error: 'ファイルデータが見つかりません'
            });
        }

        const encryptedFileBuffer = Buffer.from(encryptedFileBase64, 'base64');

        // ファイルの復号
        const decryptedBuffer = decryptFile(encryptedFileBuffer);

        // 圧縮されている場合は解凍
        let finalBuffer = decryptedBuffer;
        if (metadata.compressed) {
            finalBuffer = await decompress(decryptedBuffer);
        }

        // ファイル名の復号
        const fileName = decryptString({
            encryptedData: metadata.fileName,
            salt: metadata.fileNameSalt,
            iv: metadata.fileNameIv,
            authTag: metadata.fileNameAuthTag
        });

        // ファイルのダウンロード
        res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader('Content-Length', finalBuffer.length);

        return res.status(200).send(finalBuffer);

    } catch (error) {
        console.error('Download error:', error);
        return res.status(500).json({
            success: false,
            error: 'ファイルのダウンロードに失敗しました',
            details: error.message
        });
    }
};
