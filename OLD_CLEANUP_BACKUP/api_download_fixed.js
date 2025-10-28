// DataGate Download API - Phase 3 完全版（Redis統合）
const Redis = require('@upstash/redis').Redis;

// Redis初期化
let redis;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log('[Redis] 接続設定完了');
}

module.exports = async (req, res) => {
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // URLからファイルID取得
    const { id } = req.query;
    
    if (!id) {
        return res.status(400).json({
            success: false,
            error: 'ファイルIDが必要です'
        });
    }
    
    // テストファイルの特別処理
    if (id === 'test123') {
        const testFile = {
            fileName: 'test-file.txt',
            fileData: Buffer.from('This is a test file content').toString('base64'),
            fileSize: 27,
            mimeType: 'text/plain',
            otp: '123456',
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 100
        };
        
        if (req.method === 'GET') {
            return res.status(200).json({
                success: true,
                exists: true,
                fileName: testFile.fileName,
                fileSize: testFile.fileSize,
                uploadTime: testFile.uploadTime,
                remainingDownloads: testFile.maxDownloads - testFile.downloadCount,
                requiresOTP: true,
                isTestFile: true
            });
        }
        
        if (req.method === 'POST') {
            let body = '';
            await new Promise((resolve) => {
                req.on('data', chunk => { body += chunk.toString(); });
                req.on('end', resolve);
            });
            
            const data = JSON.parse(body);
            if (data.otp !== testFile.otp) {
                return res.status(401).json({
                    success: false,
                    error: 'OTPが正しくありません',
                    hint: 'テストファイルのOTPは123456です'
                });
            }
            
            res.setHeader('Content-Type', testFile.mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${testFile.fileName}"`);
            return res.status(200).send(Buffer.from(testFile.fileData, 'base64'));
        }
    }
    
    // Redisからファイル情報取得
    let fileInfo = null;
    
    if (redis) {
        try {
            const data = await redis.get(`file:${id}`);
            if (data) {
                fileInfo = typeof data === 'string' ? JSON.parse(data) : data;
                console.log(`[Redis] ファイル取得成功: ${id}`);
            }
        } catch (error) {
            console.error('[Redis] 取得エラー:', error);
        }
    }
    
    if (!fileInfo) {
        return res.status(404).json({
            success: false,
            error: 'ファイルが見つかりません',
            hint: 'ファイルが削除されたか、有効期限が切れています',
            availableTest: 'テスト用にID "test123" とOTP "123456" を使用できます'
        });
    }
    
    // GETリクエスト：ファイル情報確認
    if (req.method === 'GET') {
        // 有効期限チェック
        if (fileInfo.expiryTime && new Date() > new Date(fileInfo.expiryTime)) {
            // 期限切れファイルをRedisから削除
            if (redis) {
                try {
                    await redis.del(`file:${id}`);
                    console.log(`[Redis] 期限切れファイル削除: ${id}`);
                } catch (error) {
                    console.error('[Redis] 削除エラー:', error);
                }
            }
            
            return res.status(410).json({
                success: false,
                error: 'ファイルの有効期限が切れています'
            });
        }
        
        return res.status(200).json({
            success: true,
            exists: true,
            fileName: fileInfo.fileName,
            fileSize: fileInfo.fileSize,
            uploadTime: fileInfo.uploadTime,
            remainingDownloads: fileInfo.maxDownloads - fileInfo.downloadCount,
            requiresOTP: true
        });
    }
    
    // POSTリクエスト：OTP認証とダウンロード
    if (req.method === 'POST') {
        // リクエストボディ取得
        let body = '';
        await new Promise((resolve) => {
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', resolve);
        });
        
        let otp;
        try {
            const data = JSON.parse(body);
            otp = data.otp;
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: '無効なリクエストです'
            });
        }
        
        // OTP検証
        if (!otp) {
            return res.status(400).json({
                success: false,
                error: 'OTPが入力されていません'
            });
        }
        
        if (otp !== fileInfo.otp) {
            console.log(`[Download] OTP不一致: 入力=${otp}, 正解=${fileInfo.otp}`);
            return res.status(401).json({
                success: false,
                error: 'OTPが正しくありません'
            });
        }
        
        // ダウンロード回数チェック
        if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
            return res.status(403).json({
                success: false,
                error: `ダウンロード制限を超えました（最大${fileInfo.maxDownloads}回）`
            });
        }
        
        // ダウンロード回数を増加
        fileInfo.downloadCount++;
        console.log(`[Download] ファイル ${id} ダウンロード ${fileInfo.downloadCount}/${fileInfo.maxDownloads} 回`);
        
        // Redisを更新
        if (redis) {
            try {
                if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
                    // 制限に達したら削除
                    await redis.del(`file:${id}`);
                    console.log(`[Redis] ダウンロード制限到達、ファイル削除: ${id}`);
                } else {
                    // カウントを更新
                    const ttl = await redis.ttl(`file:${id}`);
                    await redis.set(`file:${id}`, JSON.stringify(fileInfo), {
                        ex: ttl > 0 ? ttl : 7 * 24 * 60 * 60
                    });
                    console.log(`[Redis] ダウンロードカウント更新: ${id}`);
                }
            } catch (error) {
                console.error('[Redis] 更新エラー:', error);
            }
        }
        
        // ファイルレスポンス
        res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"`);
        res.setHeader('Content-Length', fileInfo.fileSize);
        
        // Base64デコードして送信
        const fileBuffer = Buffer.from(fileInfo.fileData, 'base64');
        return res.status(200).send(fileBuffer);
    }
    
    // その他のメソッド
    return res.status(405).json({
        success: false,
        error: '許可されていないメソッドです'
    });
};
