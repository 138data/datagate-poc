export const config = {
  api: {
    bodyParser: false,
  },
};
const { formidable } = require('formidable');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { encryptFile, encryptString } = require('../../lib/encryption');
const { compress, isCompressible } = require('../../lib/compression');
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
    }
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    const form = formidable({
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800,
        keepExtensions: true,
        multiples: false
    });

    try {
        const [fields, files] = await form.parse(req);

        // デバッグ用ログ
        console.log('Parsed fields:', fields);
        console.log('Parsed files:', files);

        const file = files.file?.[0];
        if (!file) {
            return res.status(400).json({
                success: false,
                error: 'ファイルがアップロードされていません'
            });
        }

        // フィールド取得方法を修正（配列とオブジェクトの両方に対応）
        let sender, recipient;
        
        if (Array.isArray(fields.sender)) {
            sender = fields.sender[0];
        } else if (typeof fields.sender === 'string') {
            sender = fields.sender;
        } else {
            sender = null;
        }
        
        if (Array.isArray(fields.recipient)) {
            recipient = fields.recipient[0];
        } else if (typeof fields.recipient === 'string') {
            recipient = fields.recipient;
        } else {
            recipient = null;
        }

        console.log('Extracted sender:', sender);
        console.log('Extracted recipient:', recipient);

        if (!sender || !recipient) {
            return res.status(400).json({
                success: false,
                error: '送信者または受信者が指定されていません',
                debug: {
                    sender: sender,
                    recipient: recipient,
                    fieldsKeys: Object.keys(fields)
                }
            });
        }

        // ファイルIDの生成
        const fileId = uuidv4();

        // ファイルを読み込み
        const fileBuffer = await fs.readFile(file.filepath);
        let processedBuffer = fileBuffer;
        let compressed = false;
        let compressionRatio = 0;
        const originalSize = fileBuffer.length;

        // 圧縮処理
        const enableCompression = process.env.ENABLE_COMPRESSION === 'true';
        if (enableCompression && isCompressible(fileBuffer, file.mimetype)) {
            const compressionResult = await compress(fileBuffer);
            processedBuffer = compressionResult.compressed;
            compressed = true;
            compressionRatio = parseFloat(compressionResult.compressionRatio);
        }

        // ファイルの暗号化
        const encryptedFileData = encryptFile(processedBuffer);

        // 暗号化ファイルをKVに保存（Base64エンコード）
        const encryptedFileBase64 = encryptedFileData.encryptedData.toString('base64');
        await kvClient.set(`file:data:${fileId}`, encryptedFileBase64, { ex: 604800 });

        // メタデータの暗号化
        const encryptedFileName = encryptString(file.originalFilename || 'untitled');
        const encryptedSender = encryptString(sender);
        const encryptedRecipient = encryptString(recipient);

        // 有効期限の設定（7日後）
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        // メタデータをKVに保存
        const metadata = {
            id: fileId,
            fileName: encryptedFileName.encryptedData,
            fileNameSalt: encryptedFileName.salt,
            fileNameIv: encryptedFileName.iv,
            fileNameAuthTag: encryptedFileName.authTag,
            sender: encryptedSender.encryptedData,
            senderSalt: encryptedSender.salt,
            senderIv: encryptedSender.iv,
            senderAuthTag: encryptedSender.authTag,
            recipient: encryptedRecipient.encryptedData,
            recipientSalt: encryptedRecipient.salt,
            recipientIv: encryptedRecipient.iv,
            recipientAuthTag: encryptedRecipient.authTag,
            size: originalSize,
            compressed,
            originalSize: compressed ? originalSize : undefined,
            compressedSize: compressed ? processedBuffer.length : undefined,
            compressionRatio: compressed ? compressionRatio : undefined,
            mimeType: file.mimetype,
            uploadedAt: new Date().toISOString(),
            expiresAt
        };

        await kvClient.set(`file:${fileId}`, JSON.stringify(metadata), { ex: 604800 });

        // 一時ファイルの削除
        await fs.unlink(file.filepath);

        return res.status(200).json({
            success: true,
            message: 'ファイルが正常にアップロードされました',
            file: {
                id: fileId,
                encryptedFileName: encryptedFileName.encryptedData,
                size: originalSize,
                compressed,
                compressionRatio: compressed ? compressionRatio : undefined,
                uploadedAt: metadata.uploadedAt,
                expiresAt
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({
            success: false,
            error: 'ファイルのアップロードに失敗しました',
            details: error.message
        });
    }
};

