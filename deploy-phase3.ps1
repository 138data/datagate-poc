# DataGate Phase 3 デプロイスクリプト (PowerShell版)
# メール送信機能の完全実装
# 実行方法: .\deploy-phase3.ps1

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "   DataGate Phase 3 デプロイスクリプト" -ForegroundColor Cyan
Write-Host "   メール送信機能の実装" -ForegroundColor Cyan  
Write-Host "===============================================" -ForegroundColor Cyan

# プロジェクトディレクトリ
$projectDir = "D:\datagate-poc"

# ディレクトリ確認
if (-not (Test-Path $projectDir)) {
    Write-Host "❌ プロジェクトディレクトリが見つかりません: $projectDir" -ForegroundColor Red
    exit 1
}

Set-Location $projectDir
Write-Host "`n📂 作業ディレクトリ: $projectDir" -ForegroundColor Green

# Step 1: 既存ファイルのバックアップ
Write-Host "`n📦 既存ファイルのバックアップ..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if (Test-Path "api\upload.js") {
    Copy-Item "api\upload.js" "api\upload.js.backup_$timestamp" -Force
    Write-Host "✅ upload.js をバックアップしました" -ForegroundColor Green
}

if (Test-Path "api\download.js") {
    Copy-Item "api\download.js" "api\download.js.backup_$timestamp" -Force
    Write-Host "✅ download.js をバックアップしました" -ForegroundColor Green
}

# Step 2: 修正されたファイルを作成
Write-Host "`n📝 Phase 3のファイルを作成..." -ForegroundColor Yellow

# upload.js の内容
$uploadContent = @'
// DataGate Upload API - Phase 3 完全版（メール送信機能付き）
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');
const Redis = require('@upstash/redis').Redis;

// SendGrid初期化
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('[SendGrid] APIキー設定完了');
} else {
    console.warn('[SendGrid] APIキーが設定されていません');
}

// Redis初期化
let redis;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log('[Redis] 接続設定完了');
}

// メール送信関数
async function sendOTPEmail(recipientEmail, otp, fileName, fileId, downloadLink) {
    if (!process.env.SENDGRID_API_KEY) {
        console.log('[Email] SendGrid未設定のため、メール送信をスキップ');
        return false;
    }

    const msg = {
        to: recipientEmail,
        from: process.env.SENDER_EMAIL || '138data@gmail.com',
        subject: '【DataGate】ファイルダウンロード通知',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0; text-align: center;">🔐 DataGate</h1>
                    <p style="color: white; text-align: center; margin-top: 10px;">セキュアファイル転送サービス</p>
                </div>
                
                <div style="background: #f8f9fa; padding: 30px; border: 1px solid #dee2e6;">
                    <h2 style="color: #333; margin-bottom: 20px;">ファイルが送信されました</h2>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                        <p><strong>ファイル名:</strong> ${fileName}</p>
                        <p><strong>ファイルID:</strong> <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">${fileId.substring(0, 16)}...</code></p>
                    </div>
                    
                    <div style="background: #fff3cd; padding: 20px; border-radius: 8px; border: 2px solid #ffc107; text-align: center; margin-bottom: 20px;">
                        <p style="margin: 0; color: #856404;"><strong>ワンタイムパスワード (OTP)</strong></p>
                        <div style="font-size: 36px; font-weight: bold; color: #dc3545; letter-spacing: 8px; margin: 15px 0;">
                            ${otp}
                        </div>
                        <p style="margin: 0; color: #856404; font-size: 14px;">このコードはダウンロード時に必要です</p>
                    </div>
                    
                    <div style="text-align: center; margin-bottom: 20px;">
                        <a href="${downloadLink}" style="display: inline-block; background: #667eea; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                            📥 ダウンロードページを開く
                        </a>
                    </div>
                    
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px;">
                        <p style="margin: 0; font-size: 14px; color: #666;">
                            <strong>ご注意:</strong><br>
                            • ダウンロードは3回まで可能です<br>
                            • ファイルは7日間保存されます<br>
                            • OTPは他人に教えないでください
                        </p>
                    </div>
                </div>
            </div>
        `
    };

    try {
        await sgMail.send(msg);
        console.log(`[Email] メール送信成功: ${recipientEmail}`);
        return true;
    } catch (error) {
        console.error('[Email] メール送信エラー:', error.response?.body || error.message);
        return false;
    }
}

// ファイルアップロード処理（メイン）
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use POST.'
        });
    }
    
    try {
        const chunks = [];
        let totalSize = 0;
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        
        await new Promise((resolve, reject) => {
            req.on('data', chunk => {
                totalSize += chunk.length;
                if (totalSize > MAX_FILE_SIZE) {
                    reject(new Error('ファイルサイズが10MBを超えています'));
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        const buffer = Buffer.concat(chunks);
        const bodyString = buffer.toString();
        
        // フォームデータの解析
        let fileName = 'uploaded-file';
        let fileData = buffer;
        let recipientEmail = '';
        let mimeType = 'application/octet-stream';
        
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        
        if (boundary) {
            const parts = bodyString.split(`--${boundary}`);
            
            for (const part of parts) {
                if (part.includes('Content-Disposition')) {
                    const filenameMatch = part.match(/filename="([^"]+)"/);
                    if (filenameMatch) {
                        fileName = filenameMatch[1];
                        
                        const mimeMatch = part.match(/Content-Type:\s*([^\r\n]+)/);
                        if (mimeMatch) {
                            mimeType = mimeMatch[1];
                        }
                        
                        const dataStart = part.indexOf('\r\n\r\n') + 4;
                        const dataEnd = part.lastIndexOf('\r\n');
                        
                        if (dataStart > 3 && dataEnd > dataStart) {
                            const startIndex = bodyString.indexOf(part) + dataStart;
                            const endIndex = bodyString.indexOf(part) + dataEnd;
                            fileData = buffer.slice(startIndex, endIndex);
                        }
                    }
                    
                    if (part.includes('name="recipientEmail"')) {
                        const emailMatch = part.match(/\r\n\r\n(.+)\r\n/);
                        if (emailMatch) {
                            recipientEmail = emailMatch[1].trim();
                        }
                    }
                }
            }
        }
        
        const fileId = crypto.randomBytes(32).toString('hex');
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        const fileInfo = {
            fileName: fileName,
            fileData: fileData.toString('base64'),
            fileSize: fileData.length,
            mimeType: mimeType,
            otp: otp,
            recipientEmail: recipientEmail || 'noreply@datagate.com',
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 3,
            expiryTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
        
        // Redisに保存
        if (redis) {
            try {
                await redis.set(`file:${fileId}`, JSON.stringify(fileInfo), {
                    ex: 7 * 24 * 60 * 60
                });
                console.log(`[Redis] ファイル保存成功: ${fileId}`);
            } catch (error) {
                console.error('[Redis] 保存エラー:', error);
            }
        }
        
        const baseUrl = process.env.BASE_URL || 'https://datagate-poc.vercel.app';
        const downloadLink = `${baseUrl}/download.html?id=${fileId}`;
        
        // メール送信
        let emailSent = false;
        if (recipientEmail && recipientEmail.includes('@')) {
            emailSent = await sendOTPEmail(
                recipientEmail,
                otp,
                fileName,
                fileId,
                downloadLink
            );
        }
        
        const response = {
            success: true,
            message: emailSent 
                ? 'ファイルがアップロードされ、メールが送信されました' 
                : 'ファイルがアップロードされました（メール送信はスキップ）',
            fileId: fileId,
            downloadLink: downloadLink,
            fileName: fileName,
            fileSize: fileInfo.fileSize,
            expiryDate: fileInfo.expiryTime,
            emailSent: emailSent
        };
        
        if (!emailSent) {
            response.otp = otp;
            response.testMode = true;
            response.hint = 'メールが送信されなかったため、OTPを画面に表示しています';
        }
        
        console.log(`[Upload] 完了 - ID: ${fileId}, Email: ${emailSent ? '送信済み' : 'スキップ'}`);
        
        return res.status(200).json(response);
        
    } catch (error) {
        console.error('[Upload Error]', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'アップロードに失敗しました'
        });
    }
};
'@

# ファイルを保存
$uploadContent | Out-File -FilePath "api\upload.js" -Encoding UTF8
Write-Host "✅ api/upload.js を更新しました" -ForegroundColor Green

# Step 3: package.json確認
Write-Host "`n📦 依存関係の確認..." -ForegroundColor Yellow

$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json

$needsUpdate = $false

if ($packageJson.dependencies.'@sendgrid/mail' -eq $null) {
    Write-Host "SendGridパッケージを追加..." -ForegroundColor Yellow
    npm install @sendgrid/mail --save
    $needsUpdate = $true
}

if ($packageJson.dependencies.'@upstash/redis' -eq $null) {
    Write-Host "Upstash Redisパッケージを追加..." -ForegroundColor Yellow
    npm install @upstash/redis --save
    $needsUpdate = $true
}

if (-not $needsUpdate) {
    Write-Host "✅ 必要なパッケージは全てインストール済みです" -ForegroundColor Green
}

# Step 4: 環境変数の確認
Write-Host "`n🔐 環境変数の確認..." -ForegroundColor Yellow

Write-Host @"
必要な環境変数:
- SENDGRID_API_KEY
- SENDER_EMAIL (138data@gmail.com)
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN

Vercelダッシュボードで確認:
https://vercel.com/138data/datagate-poc/settings/environment-variables
"@ -ForegroundColor Cyan

# Step 5: Git操作
Write-Host "`n📝 変更をコミット..." -ForegroundColor Yellow
git add -A
git commit -m "Phase 3: メール送信機能の完全実装 - SendGrid統合" 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ コミット成功" -ForegroundColor Green
} else {
    Write-Host "⚠️ 変更がないか、既にコミット済みです" -ForegroundColor Yellow
}

# Step 6: デプロイ
Write-Host "`n🚀 GitHubへプッシュ..." -ForegroundColor Yellow
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ プッシュ成功" -ForegroundColor Green
} else {
    Write-Host "❌ プッシュ失敗" -ForegroundColor Red
}

# Step 7: 動作確認
Write-Host "`n===============================================" -ForegroundColor Green
Write-Host "   ✅ Phase 3 デプロイ完了！" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green

Write-Host @"

📋 次のステップ:

1. Vercelダッシュボードでデプロイ状況を確認
   https://vercel.com/138data/datagate-poc

2. テストを実行:
   - ファイルアップロード: https://datagate-poc.vercel.app
   - メール受信確認
   - ダウンロード動作確認

3. SendGrid Activity Feedで送信状況を確認:
   https://app.sendgrid.com/activity

"@ -ForegroundColor Cyan

# ヘルスチェック
Write-Host "🏥 5秒後にヘルスチェックを実行..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

try {
    $health = Invoke-RestMethod "https://datagate-poc.vercel.app/api/health" -ErrorAction Stop
    Write-Host "✅ API動作確認: Version $($health.version)" -ForegroundColor Green
} catch {
    Write-Host "⚠️ APIがまだ準備中です。数分後に再度確認してください。" -ForegroundColor Yellow
}

Write-Host "`n🎉 Phase 3 メール送信機能の実装が完了しました！" -ForegroundColor Green

# ブラウザで開く
$openBrowser = Read-Host "`nブラウザでアプリを開きますか？ (Y/N)"
if ($openBrowser -eq 'Y' -or $openBrowser -eq 'y') {
    Start-Process "https://datagate-poc.vercel.app"
}
