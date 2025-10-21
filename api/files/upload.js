// api/files/upload.js
// ファイルアップロードAPI（CommonJS形式）

// Vercel Body Parser を無効化
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

const formidable = require('formidable').formidable;
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

    async set(key, value, options = {}) {
        const url = `${(process.env.KV_REST_API_URL || '').trim()}/set/${key}`;
        const token = (process.env.KV_REST_API_TOKEN || '').trim();
        
        const body = {
            value: value
        };
        
        if (options.ex) {
            body.ex = options.ex;
        }
        
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
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            error: 'Method not allowed' 
        });
    }

    try {
        console.log('📤 Upload API called');

        // Formidable設定
        const form = formidable({
            maxFileSize: 100 * 1024 * 1024, // 100MB
            keepExtensions: true,
        });

        console.log('📋 Parsing form data...');

        // フォームデータをパース
        const [fields, files] = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) {
                    console.error('❌ Form parse error:', err);
                    reject(err);
                } else {
                    console.log('✅ Form parsed successfully');
                    resolve([fields, files]);
                }
            });
        });

        // ファイルの取得
        const file = files.file;
        if (!file) {
            console.error('❌ No file uploaded');
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        // ファイル情報を取得
        const uploadedFile = Array.isArray(file) ? file[0] : file;
        console.log('📁 File info:', {
            originalFilename: uploadedFile.originalFilename,
            mimetype: uploadedFile.mimetype,
            size: uploadedFile.size
        });

        // ファイルIDを生成
        const fileId = uuidv4();
        console.log('🔑 Generated file ID:', fileId);

        // ファイルを読み込み
        console.log('📖 Reading file...');
        let fileBuffer = await fs.readFile(uploadedFile.filepath);
        console.log('✅ File read successfully, size:', fileBuffer.length);

        // 圧縮判定
        const enableCompression = process.env.ENABLE_COMPRESSION === 'true';
        let compressed = false;
        let originalSize = fileBuffer.length;
        let compressedSize = originalSize;
        let compressionRatio = 0;

        if (enableCompression && isCompressible(fileBuffer, uploadedFile.mimetype)) {
            console.log('🗜️ Compressing file...');
            const compressionResult = await compress(fileBuffer);
            fileBuffer = compressionResult.compressed;
            compressed = true;
            compressedSize = compressionResult.compressedSize;
            compressionRatio = parseFloat(compressionResult.compressionRatio);
            console.log(`✅ Compressed: ${originalSize} → ${compressedSize} bytes (${compressionRatio}% reduction)`);
        }

        // ファイルを暗号化
        console.log('🔐 Encrypting file...');
        const encryptedFileData = await encryptFile(fileBuffer);
        console.log('✅ File encrypted');

        // ファイル名を暗号化
        console.log('🔐 Encrypting filename...');
        const encryptedFileName = await encryptString(uploadedFile.originalFilename);
        console.log('✅ Filename encrypted');

        // メタデータを作成
        const metadata = {
            id: fileId,
            fileName: encryptedFileName.encrypted,
            fileNameSalt: encryptedFileName.salt,
            fileNameIv: encryptedFileName.iv,
            fileNameAuthTag: encryptedFileName.authTag,
            mimeType: uploadedFile.mimetype,
            size: originalSize,
            compressed: compressed,
            compressedSize: compressedSize,
            compressionRatio: compressionRatio,
            encryptedSize: encryptedFileData.encrypted.length,
            uploadedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };

        console.log('💾 Saving to KV...');

        // 暗号化ファイルをKVに保存
        await kvClient.set(`file:${fileId}:data`, encryptedFileData.encrypted.toString('base64'), {
            ex: 7 * 24 * 60 * 60 // 7日間
        });

        // メタデータをKVに保存
        await kvClient.set(`file:${fileId}:meta`, metadata, {
            ex: 7 * 24 * 60 * 60 // 7日間
        });

        console.log('✅ Saved to KV');

        // 一時ファイルを削除
        try {
            await fs.unlink(uploadedFile.filepath);
            console.log('🗑️ Temporary file deleted');
        } catch (unlinkError) {
            console.error('⚠️ Failed to delete temporary file:', unlinkError);
        }

        // 成功レスポンス
        console.log('🎉 Upload completed successfully');
        return res.status(200).json({
            success: true,
            message: 'File uploaded successfully',
            file: {
                id: fileId,
                fileName: uploadedFile.originalFilename,
                size: originalSize,
                compressed: compressed,
                compressionRatio: compressed ? compressionRatio : 0,
                uploadedAt: metadata.uploadedAt,
                expiresAt: metadata.expiresAt
            }
        });

    } catch (error) {
        console.error('❌ Upload error:', error);
        console.error('Error stack:', error.stack);
        
        return res.status(500).json({
            success: false,
            error: 'File upload failed',
            details: error.message
        });
    }
};
