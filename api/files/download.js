const { kv } = require('@vercel/kv');
const { put } = require('@vercel/blob');
const crypto = require('crypto');

/**
 * ファイルダウンロード API（Phase 35a-v2 方式）
 * 
 * GET /api/files/download?fileId=xxx&token=xxx
 *   - ファイル情報取得（トークン検証）
 * 
 * POST /api/files/download
 *   - OTP検証 → 復号化 → 短寿命Blob作成 → JSON で downloadUrl 返却
 *   - 関数は常に JSON を返す（バイナリ返送なし）
 */
module.exports = async function handler(req, res) {
    try {
        // CORS設定
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        // GET: ファイル情報取得
        if (req.method === 'GET') {
            return await handleGetFileInfo(req, res);
        }

        // POST: OTP検証 + 短寿命URL発行
        if (req.method === 'POST') {
            return await handleIssueDownloadUrl(req, res);
        }

        // その他のメソッドは405
        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('[download.js] Unexpected error:', error);
        return res.status(500).json({ 
            error: 'サーバーエラーが発生しました。しばらくしてから再度お試しください。' 
        });
    }
};

/**
 * GET: ファイル情報取得
 */
async function handleGetFileInfo(req, res) {
    const { fileId, token } = req.query;

    console.log('[download.js GET] Request:', { fileId, token: token ? '***' : null });

    // パラメータ検証
    if (!fileId || !token) {
        console.log('[download.js GET] Missing parameters');
        return res.status(400).json({ 
            error: 'ファイルIDまたはトークンが指定されていません。' 
        });
    }

    try {
        // メタデータ取得
        const metaKey = `file:${fileId}:meta`;
        const meta = await kv.get(metaKey);

        console.log('[download.js GET] Meta retrieved:', { 
            found: !!meta,
            fileId,
            metaKey 
        });

        // ファイルが存在しない
        if (!meta) {
            console.log('[download.js GET] File not found');
            return res.status(404).json({ 
                error: 'ファイルが見つかりません。リンクが無効か、既に削除されている可能性があります。' 
            });
        }

        // トークン検証
        if (meta.token !== token) {
            console.log('[download.js GET] Invalid token');
            return res.status(404).json({ 
                error: 'ファイルが見つかりません。リンクが無効です。' 
            });
        }

        // 有効期限確認
        const now = Date.now();
        if (now > meta.expiresAt) {
            console.log('[download.js GET] File expired:', { 
                now, 
                expiresAt: meta.expiresAt 
            });
            return res.status(410).json({ 
                error: 'ファイルの有効期限が切れています。送信者に再送を依頼してください。' 
            });
        }

        // ダウンロード回数確認
        const downloadCount = meta.downloadCount || 0;
        const maxDownloads = 3;
        const remainingDownloads = Math.max(0, maxDownloads - downloadCount);

        // ファイル情報を返す
        const fileInfo = {
            filename: meta.originalFilename || '不明',
            size: meta.size || 0,
            sender: meta.senderEmail || '不明',
            expiresAt: meta.expiresAt,
            uploadedAt: meta.uploadedAt,
            remainingDownloads,
            maxDownloads
        };

        console.log('[download.js GET] Success:', fileInfo);

        return res.status(200).json(fileInfo);

    } catch (error) {
        console.error('[download.js GET] Error:', error);
        return res.status(500).json({ 
            error: 'ファイル情報の取得中にエラーが発生しました。' 
        });
    }
}

/**
 * POST: OTP検証 + 短寿命URL発行
 */
async function handleIssueDownloadUrl(req, res) {
    const { fileId, token, otp } = req.body;

    console.log('[download.js POST] Request:', { 
        fileId, 
        token: token ? '***' : null,
        otp: otp ? '***' : null
    });

    // パラメータ検証
    if (!fileId || !token || !otp) {
        console.log('[download.js POST] Missing parameters');
        return res.status(400).json({ 
            error: 'ファイルID、トークン、または認証コードが指定されていません。' 
        });
    }

    // OTP形式検証（6桁の数字）
    if (!/^\d{6}$/.test(otp)) {
        console.log('[download.js POST] Invalid OTP format');
        return res.status(400).json({ 
            error: '認証コードは6桁の数字で入力してください。' 
        });
    }

    try {
        // メタデータ取得
        const metaKey = `file:${fileId}:meta`;
        const meta = await kv.get(metaKey);

        console.log('[download.js POST] Meta retrieved:', { 
            found: !!meta,
            fileId,
            metaKey 
        });

        // ファイルが存在しない
        if (!meta) {
            console.log('[download.js POST] File not found');
            return res.status(404).json({ 
                error: 'ファイルが見つかりません。' 
            });
        }

        // トークン検証
        if (meta.token !== token) {
            console.log('[download.js POST] Invalid token');
            return res.status(404).json({ 
                error: 'ファイルが見つかりません。' 
            });
        }

        // 有効期限確認
        const now = Date.now();
        if (now > meta.expiresAt) {
            console.log('[download.js POST] File expired');
            return res.status(410).json({ 
                error: 'ファイルの有効期限が切れています。' 
            });
        }

        // OTP試行回数制限チェック（IP単位）
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                        req.headers['x-real-ip'] || 
                        'unknown';
        const otpAttemptsKey = `otp:attempts:${fileId}:${clientIp}`;
        const attempts = await kv.get(otpAttemptsKey) || 0;

        console.log('[download.js POST] OTP attempts:', { attempts, clientIp });

        if (attempts >= 5) {
            console.log('[download.js POST] Too many attempts');
            return res.status(429).json({ 
                error: '試行回数の上限に達しました。15分後に再度お試しください。' 
            });
        }

        // OTP検証
        if (meta.otp !== otp) {
            console.log('[download.js POST] Invalid OTP');

            // 試行回数を増やす（15分間有効）
            const newAttempts = attempts + 1;
            await kv.set(otpAttemptsKey, newAttempts, { ex: 900 }); // 900秒 = 15分

            console.log('[download.js POST] Attempts updated:', newAttempts);

            const remainingAttempts = 5 - newAttempts;
            return res.status(401).json({ 
                error: `認証コードが正しくありません。あと${remainingAttempts}回試行できます。` 
            });
        }

        console.log('[download.js POST] OTP verified successfully');

        // ダウンロード回数制限チェック
        const downloadCount = meta.downloadCount || 0;
        if (downloadCount >= 3) {
            console.log('[download.js POST] Download limit reached');
            return res.status(403).json({ 
                error: 'ダウンロード回数の上限に達しました。' 
            });
        }

        // blobKey 確認（Phase 34 方式）
        const blobKey = meta.blobKey;
        if (!blobKey) {
            console.error('[download.js POST] blobKey not found in meta');
            return res.status(500).json({ 
                error: 'ファイルデータの取得に失敗しました。' 
            });
        }

        console.log('[download.js POST] blobKey found:', blobKey);

        // Blob から暗号化ファイル取得
        const blobUrl = `https://${process.env.BLOB_READ_WRITE_TOKEN?.split('_')[2] || 'blob'}.public.blob.vercel-storage.com/${blobKey}`;
        console.log('[download.js POST] Fetching from Blob:', blobUrl);

        const blobResponse = await fetch(blobUrl, {
            headers: {
                'Authorization': `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`
            }
        });

        if (!blobResponse.ok) {
            console.error('[download.js POST] Failed to fetch from Blob:', blobResponse.status);
            return res.status(500).json({ 
                error: 'ファイルデータの取得に失敗しました。' 
            });
        }

        const encryptedBuffer = Buffer.from(await blobResponse.arrayBuffer());
        console.log('[download.js POST] Blob fetched, size:', encryptedBuffer.length);

        // ファイル復号化
        const key = Buffer.from(meta.encryptionKey, 'hex');
        const iv = Buffer.from(meta.encryptionIv, 'hex');
        const authTag = Buffer.from(meta.authTag, 'hex');

        console.log('[download.js POST] Decrypting file...');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(encryptedBuffer),
            decipher.final()
        ]);

        console.log('[download.js POST] Decryption successful, size:', decrypted.length);

        // 短寿命Blobに一時アップロード（60秒有効）
        const tempBlobKey = `temp/${fileId}/${Date.now()}-${meta.originalFilename}`;
        console.log('[download.js POST] Creating temporary Blob:', tempBlobKey);

        const { url: downloadUrl } = await put(tempBlobKey, decrypted, {
            access: 'public',
            addRandomSuffix: true,
            cacheControlMaxAge: 60 // 60秒キャッシュ
        });

        console.log('[download.js POST] Temporary Blob created:', downloadUrl);

        // ダウンロード回数を増やす
        const newDownloadCount = downloadCount + 1;
        await kv.set(metaKey, { ...meta, downloadCount: newDownloadCount });

        // OTP試行回数をリセット
        await kv.del(otpAttemptsKey);

        console.log('[download.js POST] Download count updated:', newDownloadCount);

        // 監査ログ記録
        const auditLogKey = `audit:download:${fileId}:${Date.now()}`;
        await kv.set(auditLogKey, {
            event: 'download_url_issued',
            fileId,
            filename: meta.originalFilename,
            downloadedAt: Date.now(),
            ipAddress: clientIp,
            downloadCount: newDownloadCount
        }, { ex: 1209600 }); // 14日間保持

        console.log('[download.js POST] Audit log created:', auditLogKey);

        // JSON で短寿命URL返却
        const response = {
            downloadUrl,
            fileName: meta.originalFilename,
            expiresInSec: 60,
            remainingDownloads: Math.max(0, 3 - newDownloadCount),
            message: 'ダウンロードリンクを発行しました。60秒以内にダウンロードしてください。'
        };

        console.log('[download.js POST] Success, returning JSON:', response);

        return res.status(200).json(response);

    } catch (error) {
        console.error('[download.js POST] Error:', error);
        
        // 復号化エラーの場合
        if (error.message && error.message.includes('Unsupported state or unable to authenticate data')) {
            return res.status(500).json({ 
                error: 'ファイルの復号化に失敗しました。ファイルが破損している可能性があります。' 
            });
        }

        return res.status(500).json({ 
            error: 'ダウンロード処理中にエラーが発生しました。' 
        });
    }
}
