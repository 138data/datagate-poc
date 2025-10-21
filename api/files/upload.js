// api/files/upload.js
// ファイルアップロードAPI（ESM形式）

export const config = {
  api: {
    bodyParser: false,
  },
};

import { formidable } from 'formidable';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { encryptFile, encryptString } from '../../lib/encryption.js';
import { compress, isCompressible } from '../../lib/compression.js';
import fetch from 'node-fetch';

const kvClient = {
    async get(key) {
        const url = `${(process.env.KV_REST_API_URL || '').trim()}/get/${key}`;
        const token = (process.env.KV_REST_API_TOKEN || '').trim();
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
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
        const body = { value };
        if (options.ex) body.ex = options.ex;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`KV SET failed: ${response.statusText}`);
        return await response.json();
    }
};

export default async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        console.log('📤 Upload API called');
        const form = formidable({ maxFileSize: 100 * 1024 * 1024, keepExtensions: true });

        const [fields, files] = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                err ? reject(err) : resolve([fields, files]);
            });
        });

        const file = files.file;
        if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        const uploadedFile = Array.isArray(file) ? file[0] : file;
        const fileId = uuidv4();
        let fileBuffer = await fs.readFile(uploadedFile.filepath);

        const enableCompression = process.env.ENABLE_COMPRESSION === 'true';
        let compressed = false, originalSize = fileBuffer.length;
        let compressedSize = originalSize, compressionRatio = 0;

        if (enableCompression && isCompressible(fileBuffer, uploadedFile.mimetype)) {
            const result = await compress(fileBuffer);
            fileBuffer = result.compressed;
            compressed = true;
            compressedSize = result.compressedSize;
            compressionRatio = parseFloat(result.compressionRatio);
        }

        const encryptedFileData = await encryptFile(fileBuffer);
        const encryptedFileName = await encryptString(uploadedFile.originalFilename);

        const metadata = {
            id: fileId,
            fileName: encryptedFileName.encrypted,
            fileNameSalt: encryptedFileName.salt,
            fileNameIv: encryptedFileName.iv,
            fileNameAuthTag: encryptedFileName.authTag,
            mimeType: uploadedFile.mimetype,
            size: originalSize,
            compressed, compressedSize, compressionRatio,
            encryptedSize: encryptedFileData.encrypted.length,
            uploadedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };

        await kvClient.set(`file:${fileId}:data`, encryptedFileData.encrypted.toString('base64'), { ex: 7 * 24 * 60 * 60 });
        await kvClient.set(`file:${fileId}:meta`, metadata, { ex: 7 * 24 * 60 * 60 });

        try { await fs.unlink(uploadedFile.filepath); } catch {}

        return res.status(200).json({
            success: true,
            message: 'File uploaded successfully',
            file: {
                id: fileId,
                fileName: uploadedFile.originalFilename,
                size: originalSize,
                compressed,
                compressionRatio: compressed ? compressionRatio : 0,
                uploadedAt: metadata.uploadedAt,
                expiresAt: metadata.expiresAt
            }
        });

    } catch (error) {
        console.error('❌ Upload error:', error);
        return res.status(500).json({
            success: false,
            error: 'File upload failed',
            details: error.message
        });
    }
};
