// api/download.js
// ファイルダウンロードAPI - 2段階認証付き

import fs from 'fs';
import path from 'path';

const STORAGE_DIR = path.join(process.cwd(), 'storage');

// ダウンロードページのHTML
function getDownloadPageHTML(fileId) {
    return `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ファイルダウンロード - 138DataGate</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
            max-width: 500px;
            width: 100%;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 30px;
            text-align: center;
            color: white;
        }
        
        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
        }
        
        .header p {
            opacity: 0.9;
            font-size: 14px;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .form-group {
            margin-bottom: 25px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 500;
            font-size: 14px;
        }
        
        .input-wrapper {
            position: relative;
        }
        
        .icon {
            position: absolute;
            left: 15px;
            top: 50%;
            transform: translateY(-50%);
            color: #999;
            font-size: 20px;
        }
        
        input {
            width: 100%;
            padding: 15px 15px 15px 45px;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            font-size: 16px;
            transition: all 0.3s;
        }
        
        input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        .security-code-input {
            text-align: center;
            font-size: 24px;
            letter-spacing: 10px;
            padding-left: 15px;
            font-weight: bold;
        }
        
        .button {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
            margin-top: 20px;
        }
        
        .button:hover {
            transform: translateY(-2px);
        }
        
        .button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
        
        .error-message {
            background: #fee;
            color: #c33;
            padding: 12px;
            border-radius: 8px;
            margin-top: 20px;
            display: none;
            font-size: 14px;
        }
        
        .success-message {
            background: #efe;
            color: #3a3;
            padding: 12px;
            border-radius: 8px;
            margin-top: 20px;
            display: none;
            font-size: 14px;
        }
        
        .info-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin-bottom: 25px;
            border-radius: 5px;
        }
        
        .info-box p {
            color: #666;
            font-size: 14px;
            line-height: 1.6;
        }
        
        .loading {
            display: none;
            text-align: center;
            color: #667eea;
            margin-top: 20px;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .spinner {
            display: inline-block;
            width: 30px;
            height: 30px;
            border: 3px solid #e0e0e0;
            border-top-color: #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 セキュリティコード入力</h1>
            <p>ファイルをダウンロードするには認証が必要です</p>
        </div>
        
        <div class="content">
            <div class="info-box">
                <p>📧 メールで送信された6桁のセキュリティコードを入力してください。</p>
                <p>セキュリティコードは別メールで送信されています。</p>
            </div>
            
            <form id="downloadForm">
                <input type="hidden" id="fileId" value="${fileId}">
                
                <div class="form-group">
                    <label for="securityCode">セキュリティコード（6桁）</label>
                    <div class="input-wrapper">
                        <span class="icon">🔑</span>
                        <input 
                            type="text" 
                            id="securityCode" 
                            maxlength="6" 
                            pattern="[0-9]{6}" 
                            class="security-code-input"
                            placeholder="000000"
                            required
                            autocomplete="off"
                        >
                    </div>
                </div>
                
                <button type="submit" class="button">
                    ダウンロード
                </button>
            </form>
            
            <div id="errorMessage" class="error-message"></div>
            <div id="successMessage" class="success-message"></div>
            <div id="loading" class="loading">
                <div class="spinner"></div>
                <p>処理中...</p>
            </div>
        </div>
    </div>
    
    <script>
        document.getElementById('downloadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fileId = document.getElementById('fileId').value;
            const securityCode = document.getElementById('securityCode').value;
            
            if (securityCode.length !== 6 || !/^\\d{6}$/.test(securityCode)) {
                showError('6桁の数字を入力してください');
                return;
            }
            
            const button = e.target.querySelector('button');
            const loading = document.getElementById('loading');
            
            button.disabled = true;
            loading.style.display = 'block';
            hideMessages();
            
            try {
                const response = await fetch('/api/download', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        fileId: fileId,
                        securityCode: securityCode
                    })
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    const contentDisposition = response.headers.get('Content-Disposition');
                    let fileName = 'download';
                    
                    if (contentDisposition) {
                        const match = contentDisposition.match(/filename="(.+)"/);
                        if (match) fileName = match[1];
                    }
                    
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    
                    showSuccess('ダウンロードを開始しました');
                } else {
                    const error = await response.json();
                    showError(error.error || 'ダウンロードに失敗しました');
                }
            } catch (error) {
                showError('ネットワークエラーが発生しました');
                console.error(error);
            } finally {
                button.disabled = false;
                loading.style.display = 'none';
            }
        });
        
        function showError(message) {
            const errorDiv = document.getElementById('errorMessage');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
        
        function showSuccess(message) {
            const successDiv = document.getElementById('successMessage');
            successDiv.textContent = message;
            successDiv.style.display = 'block';
        }
        
        function hideMessages() {
            document.getElementById('errorMessage').style.display = 'none';
            document.getElementById('successMessage').style.display = 'none';
        }
        
        // セキュリティコード入力欄の自動フォーカス
        document.getElementById('securityCode').focus();
        
        // 数字のみ入力可能にする
        document.getElementById('securityCode').addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
    </script>
</body>
</html>
    `;
}

export default async function handler(req, res) {
    console.log('=== Download Request ===');
    console.log('Method:', req.method);
    console.log('Query:', req.query);
    console.log('Body:', req.body);

    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GETリクエスト: ダウンロードページを表示
    if (req.method === 'GET') {
        const { id } = req.query;
        
        if (!id) {
            return res.status(400).send('ファイルIDが指定されていません');
        }

        // ダウンロードページのHTMLを返す
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(getDownloadPageHTML(id));
    }

    // POSTリクエスト: ファイルダウンロード処理
    if (req.method === 'POST') {
        try {
            const { fileId, securityCode } = req.body;

            if (!fileId || !securityCode) {
                return res.status(400).json({ 
                    error: 'ファイルIDとセキュリティコードが必要です' 
                });
            }

            // メタデータファイルのパスを構築
            const metadataPath = path.join(STORAGE_DIR, `${fileId}.meta.json`);
            const metadataPath2 = path.join(STORAGE_DIR, `${fileId}.json`);

            // メタデータを読み込む
            let metadata;
            if (fs.existsSync(metadataPath)) {
                metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            } else if (fs.existsSync(metadataPath2)) {
                metadata = JSON.parse(fs.readFileSync(metadataPath2, 'utf8'));
            } else {
                console.log('メタデータファイルが見つかりません:', fileId);
                return res.status(404).json({ 
                    error: 'ファイルが見つかりません' 
                });
            }

            // セキュリティコードの検証
            if (metadata.securityCode !== securityCode) {
                console.log('セキュリティコード不一致:', {
                    expected: metadata.securityCode,
                    received: securityCode
                });
                return res.status(401).json({ 
                    error: 'セキュリティコードが正しくありません' 
                });
            }

            // ダウンロード回数のチェック
            const maxDownloads = metadata.maxDownloads || 5;
            if (metadata.downloadCount >= maxDownloads) {
                return res.status(403).json({ 
                    error: `ダウンロード回数の上限（${maxDownloads}回）に達しました` 
                });
            }

            // ファイルの存在確認
            const filePath = path.join(STORAGE_DIR, metadata.fileName);
            if (!fs.existsSync(filePath)) {
                console.log('ファイルが見つかりません:', filePath);
                return res.status(404).json({ 
                    error: 'ファイルが見つかりません' 
                });
            }

            // ダウンロード回数を増やす
            metadata.downloadCount = (metadata.downloadCount || 0) + 1;
            metadata.lastDownloadedAt = new Date().toISOString();
            
            // メタデータを更新
            if (fs.existsSync(metadataPath)) {
                fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            } else {
                fs.writeFileSync(metadataPath2, JSON.stringify(metadata, null, 2));
            }

            console.log(`ダウンロード成功: ${metadata.originalName} (${metadata.downloadCount}/${maxDownloads})`);

            // ファイルを送信
            const fileContent = fs.readFileSync(filePath);
            res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName}"`);
            res.setHeader('Content-Length', fileContent.length);
            
            return res.status(200).send(fileContent);

        } catch (error) {
            console.error('ダウンロードエラー:', error);
            return res.status(500).json({ 
                error: 'サーバーエラーが発生しました' 
            });
        }
    }

    // その他のメソッドは許可しない
    return res.status(405).json({ 
        error: 'Method not allowed' 
    });
}
