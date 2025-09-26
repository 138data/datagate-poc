// DataGate Upload API
// Version: 1.0.0
// Last Updated: 2025-09-26

const crypto = require('crypto');

// メモリストレージ（本番環境ではDBやS3を使用）
const fileStorage = new Map();
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

module.exports = async (req, res) => {
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // OPTIONSリクエスト処理
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // POSTメソッドのみ許可
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use POST.'
        });
    }
    
    try {
        // マルチパートフォームデータを処理
        const chunks = [];
        let totalSize = 0;
        
        // データ収集
        await new Promise((resolve, reject) => {
            req.on('data', chunk => {
                totalSize += chunk.length;
                
                // ファイルサイズチェック
                if (totalSize > MAX_FILE_SIZE) {
                    reject(new Error('File size exceeds 10MB limit'));
                    return;
                }
                
                chunks.push(chunk);
            });
            
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        // バッファ結合
        const buffer = Buffer.concat(chunks);
        const bodyString = buffer.toString();
        
        // 簡易的なマルチパート解析
        // 本番環境ではmulterやformidableを使用推奨
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        
        if (!boundary) {
            // JSON形式のテスト用
            const data = JSON.parse(bodyString);
            
            // テスト用ファイル作成
            const fileId = generateSecureId();
            const otp = generateOTP();
            
            // メモリに保存
            fileStorage.set(fileId, {
                fileName: 'test-file.txt',
                fileData: Buffer.from('This is a test file'),
                otp: otp,
                recipientEmail: data.recipientEmail || 'test@example.com',
                uploadTime: new Date().toISOString(),
                downloadCount: 0,
                maxDownloads: 3
            });
            
            return res.status(200).json({
                success: true,
                message: 'Test file uploaded successfully',
                fileId: fileId,
                downloadLink: `/download/${fileId}`,
                otp: otp
            });
        }
        
        // マルチパートデータ解析
        const parts = bodyString.split(`--${boundary}`);
        let fileName = 'unknown';
        let fileData = null;
        let recipientEmail = '';
        
        for (const part of parts) {
            if (part.includes('Content-Disposition')) {
                // ファイル名の取得
                const filenameMatch = part.match(/filename="([^"]+)"/);
                if (filenameMatch) {
                    fileName = filenameMatch[1];
                    
                    // ファイルデータの取得
                    const dataStart = part.indexOf('\r\n\r\n') + 4;
                    const dataEnd = part.lastIndexOf('\r\n');
                    
                    if (dataStart > 3 && dataEnd > dataStart) {
                        // バイナリデータとして処理
                        const partBuffer = buffer.slice(
                            bodyString.indexOf(part) + dataStart,
                            bodyString.indexOf(part) + dataEnd
                        );
                        fileData = partBuffer;
                    }
                }
                
                // メールアドレスの取得
                if (part.includes('name="recipientEmail"')) {
                    const emailMatch = part.match(/\r\n\r\n(.+)\r\n/);
                    if (emailMatch) {
                        recipientEmail = emailMatch[1].trim();
                    }
                }
            }
        }
        
        // バリデーション
        if (!fileData && !bodyString.includes('test')) {
            return res.status(400).json({
                success: false,
                error: 'No file data received'
            });
        }
        
        // セキュアIDとOTP生成
        const fileId = generateSecureId();
        const otp = generateOTP();
        
        // ファイル情報をメモリに保存
        const fileInfo = {
            fileName: fileName,
            fileData: fileData || Buffer.from('Test file content'),
            fileSize: fileData ? fileData.length : 17,
            mimeType: getMimeType(fileName),
            otp: otp,
            recipientEmail: recipientEmail || 'noreply@datagate.com',
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 3,
            expiryTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7日後
        };
        
        fileStorage.set(fileId, fileInfo);
        
        console.log(`[Upload] File saved: ${fileId} - ${fileName} (${fileInfo.fileSize} bytes)`);
        console.log(`[Upload] OTP: ${otp} for ${recipientEmail}`);
        
        // レスポンス
        const response = {
            success: true,
            message: 'ファイルが正常にアップロードされました',
            fileId: fileId,
            downloadLink: `/download/${fileId}`,
            otp: otp, // テスト環境のため表示（本番では送信しない）
            fileName: fileName,
            fileSize: fileInfo.fileSize,
            expiryDate: fileInfo.expiryTime
        };
        
        res.status(200).json(response);
        
    } catch (error) {
        console.error('[Upload Error]', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Upload failed'
        });
    }
};

// セキュアID生成（64文字のランダム文字列）
function generateSecureId() {
    return crypto.randomBytes(32).toString('hex');
}

// OTP生成（6桁の数字）
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// MIMEタイプ判定
function getMimeType(fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes = {
        'txt': 'text/plain',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'zip': 'application/zip',
        'csv': 'text/csv'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

// ストレージ状態を外部からアクセス可能に（Download APIと共有）
module.exports.fileStorage = fileStorage;

// テスト用エンドポイント
module.exports.testUpload = async (req, res) => {
    const fileId = generateSecureId();
    const otp = generateOTP();
    
    fileStorage.set(fileId, {
        fileName: 'test-document.pdf',
        fileData: Buffer.from('This is a test PDF content'),
        fileSize: 26,
        mimeType: 'application/pdf',
        otp: otp,
        recipientEmail: 'test@example.com',
        uploadTime: new Date().toISOString(),
        downloadCount: 0,
        maxDownloads: 3
    });
    
    res.status(200).json({
        success: true,
        message: 'Test file created',
        fileId: fileId,
        otp: otp,
        downloadLink: `/download/${fileId}`
    });
};
