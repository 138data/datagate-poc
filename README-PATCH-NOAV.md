# 📋 ノーコストAV仕込みパッチ - 適用手順書

**作成日**: 2025年10月23日  
**対象**: 138DataGate Phase 22準備  
**目的**: 将来のマルウェアスキャン導入時の工数を最小化

---

## 📌 概要

このパッチは**現状の挙動を一切変更せず**、将来マルウェアスキャン機能を導入する際の工数を最小化するための「仕込み」です。

### 現状維持される機能
- ✅ ファイルサイズ上限: 10MB
- ✅ OTP認証: 6桁英数字
- ✅ ダウンロード回数制限: 最大3回
- ✅ ファイル保持期間: 最大7日（TTL）
- ✅ Vercel KV使用

### 追加される「仕込み」（動作に影響なし）
- ✅ 環境変数フラグ（`AV_ENABLED`, `AV_FAIL_OPEN`）
- ✅ メタデータに `scanStatus` と `sha256` を追加
- ✅ スタブ関数 `scanBuffer()`（常に clean 返却）
- ✅ 許可拡張子チェック（ゼロコストのセキュリティ強化）
- ✅ 将来用のAVゲート（現在は無効）

---

## 🚀 適用手順

### 方法1: ファイル置き換え（推奨）

#### ステップ1: バックアップ
```powershell
cd D:\datagate-poc

# 既存ファイルのバックアップ
Copy-Item api\upload.js api\upload.js.backup
Copy-Item api\download.js api\download.js.backup
```

#### ステップ2: 新しいファイルを配置
```powershell
# ダウンロードしたファイルを配置
Copy-Item api-upload-noav.js api\upload.js
Copy-Item api-download-noav.js api\download.js
```

#### ステップ3: Vercel環境変数の追加
1. Vercel Dashboard を開く: https://vercel.com/dashboard
2. プロジェクトを選択
3. Settings → Environment Variables
4. 以下の2つを追加:

| 変数名 | 値 | 環境 |
|--------|-----|------|
| `AV_ENABLED` | `false` | Production, Preview, Development |
| `AV_FAIL_OPEN` | `false` | Production, Preview, Development |

#### ステップ4: デプロイ
```powershell
# ローカル環境変数にも追加（オプション）
Add-Content .env "`nAV_ENABLED=false`nAV_FAIL_OPEN=false"

# Git commit & push
git add api/upload.js api/download.js .env
git commit -m "chore: add no-cost AV scaffolding (scanStatus, sha256, flags)"
git push origin main

# Vercelデプロイ
vercel --prod
```

---

### 方法2: Git Patch適用（上級者向）

```powershell
cd D:\datagate-poc

# パッチ適用
git apply datagate-noav-setup.patch

# 確認
git diff

# コミット
git add api/upload.js api/download.js
git commit -m "chore: add no-cost AV scaffolding"
git push origin main
```

---

## 🧪 動作確認

### テスト1: アップロード
```powershell
# テストファイル作成
$content = "Test file - $(Get-Date)"
Set-Content test.txt -Value $content

# アップロード
$url = "https://datagate-150t77hod-138datas-projects.vercel.app/api/upload"
$headers = @{
    "Content-Type" = "application/octet-stream"
    "X-File-Name" = "test.txt"
    "X-File-Type" = "text/plain"
}
$body = [System.IO.File]::ReadAllBytes("test.txt")
$response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body

Write-Host "✅ Upload Success!"
Write-Host "File ID: $($response.fileId)"
Write-Host "OTP: $($response.otp)"
Write-Host "Scan Status: $($response.scanStatus)"  # ← 新項目
```

**期待される結果**:
```json
{
  "success": true,
  "fileId": "abc123...",
  "otp": "1a2b3c",
  "fileName": "test.txt",
  "scanStatus": "not_scanned",  // ← 現在はこれ
  "message": "ファイルが正常にアップロードされました"
}
```

---

### テスト2: ファイル情報取得（GET）
```powershell
$fileId = $response.fileId
$infoUrl = "https://datagate-150t77hod-138datas-projects.vercel.app/api/download?id=$fileId"
$info = Invoke-RestMethod -Uri $infoUrl -Method Get

Write-Host "ファイル情報:"
Write-Host "Scan Status: $($info.scanStatus)"  # ← 新項目
Write-Host "Remaining Downloads: $($info.remainingDownloads)"
```

**期待される結果**:
```json
{
  "success": true,
  "exists": true,
  "fileName": "test.txt",
  "scanStatus": "not_scanned",  // ← 新項目
  "remainingDownloads": 3
}
```

---

### テスト3: ダウンロード（POST）
```powershell
$downloadUrl = "https://datagate-150t77hod-138datas-projects.vercel.app/api/download"
$downloadBody = @{
    id = $fileId
    otp = $response.otp
} | ConvertTo-Json

$file = Invoke-RestMethod -Uri $downloadUrl -Method Post -Body $downloadBody -ContentType "application/json" -OutFile "downloaded.txt"

Write-Host "✅ Download Success!"
```

---

### テスト4: 禁止拡張子のテスト
```powershell
# .exe ファイルをアップロード試行
$exeContent = [byte[]](1..100)
$headers = @{
    "Content-Type" = "application/octet-stream"
    "X-File-Name" = "malware.exe"
    "X-File-Type" = "application/x-msdownload"
}

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $exeContent
} catch {
    Write-Host "✅ 期待通り拒否されました: $($_.Exception.Message)"
}
```

**期待される結果**:
```json
{
  "success": false,
  "error": "拡張子 .exe は許可されていません",
  "allowedExtensions": [".pdf", ".docx", ".xlsx", ...]
}
```

---

## 🔮 将来AVを有効化する手順（参考）

### ステップ1: 環境変数を変更
Vercel Dashboard → Settings → Environment Variables

```
AV_ENABLED = true  # ← falseからtrueに変更
```

### ステップ2: scanBuffer()を実装

**api/upload.js の `scanBuffer()` を差し替え**:

#### オプションA: Cloud AV（VirusTotal）
```javascript
async function scanBuffer(buffer, filename) {
  if (!AV_ENABLED) {
    return { clean: true, vendor: 'none' };
  }
  
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  const formData = new FormData();
  formData.append('file', buffer, filename);
  
  const response = await fetch('https://www.virustotal.com/api/v3/files', {
    method: 'POST',
    headers: { 'x-apikey': apiKey },
    body: formData
  });
  
  const result = await response.json();
  const isClean = result.data.attributes.stats.malicious === 0;
  
  return { clean: isClean, vendor: 'virustotal' };
}
```

#### オプションB: 自前ClamAV REST
```javascript
async function scanBuffer(buffer, filename) {
  if (!AV_ENABLED) {
    return { clean: true, vendor: 'none' };
  }
  
  const response = await fetch('http://your-clamav-server:8080/scan', {
    method: 'POST',
    body: buffer
  });
  
  const result = await response.json();
  return { clean: result.status === 'clean', vendor: 'clamav' };
}
```

### ステップ3: 再デプロイ
```powershell
vercel --prod
```

---

## 📊 変更内容の詳細

### api/upload.js
```diff
+ const AV_ENABLED = process.env.AV_ENABLED === 'true';
+ const AV_FAIL_OPEN = process.env.AV_FAIL_OPEN === 'true';
+ const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', ...]);

+ function computeSha256(buffer) { ... }
+ async function scanBuffer(buffer, filename) { ... }

  // ファイル受信後
+ const sha256 = computeSha256(buffer);
+ let scanStatus = AV_ENABLED ? 'pending' : 'not_scanned';
+ const scanResult = await scanBuffer(buffer, originalName);

  const fileInfo = {
    ...
+   scanStatus: scanStatus,
+   sha256: sha256
  };
```

### api/download.js
```diff
+ const AV_ENABLED = process.env.AV_ENABLED === 'true';

  // GET応答
  return res.status(200).json({
    ...
+   scanStatus: fileInfo.scanStatus || 'not_scanned'
  });

  // POST配布前
+ if (AV_ENABLED && fileInfo.scanStatus !== 'clean') {
+   return res.status(403).json({ ... });
+ }
```

---

## 🔧 トラブルシューティング

### 問題1: デプロイ後もscanStatusが表示されない
**原因**: 環境変数が反映されていない

**対処**:
```powershell
# 環境変数確認
vercel env ls

# 再デプロイ
vercel --prod
```

---

### 問題2: 禁止拡張子が拒否されない
**原因**: ヘッダー `X-File-Name` が送信されていない

**対処**:
フロント側（index.html）を確認し、ヘッダーを追加:
```javascript
headers: {
  'Content-Type': 'application/octet-stream',
  'X-File-Name': encodeURIComponent(file.name),
  'X-File-Type': file.type
}
```

---

### 問題3: 既存ファイルがダウンロードできない
**原因**: 新しいコードが古いメタデータを読めない

**対処**: 互換性は維持されています。古いファイルは `scanStatus` が undefined のため、`|| 'not_scanned'` で自動補完されます。

---

## 📝 フロント側の対応（オプション）

現状は FormData を使用していますが、将来の差分を減らすなら生バイト送信に変更することを推奨します。

### index.html の修正（オプション）
```javascript
// 現状（FormData）
const formData = new FormData();
formData.append('file', file);
const response = await fetch('/api/upload', {
  method: 'POST',
  body: formData
});

// 推奨（生バイト + ヘッダー）
const buffer = await file.arrayBuffer();
const response = await fetch('/api/upload', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/octet-stream',
    'X-File-Name': encodeURIComponent(file.name),
    'X-File-Type': file.type || 'application/octet-stream'
  },
  body: buffer
});
```

---

## 🎯 チェックリスト

### 適用前
- [ ] 既存ファイルのバックアップ作成
- [ ] Gitの状態確認（`git status`）
- [ ] ローカルテスト環境の準備

### 適用時
- [ ] api/upload.js を置き換え
- [ ] api/download.js を置き換え
- [ ] Vercel環境変数を追加（2個）
- [ ] .env に環境変数を追加（オプション）
- [ ] Git commit & push
- [ ] Vercelデプロイ

### 適用後
- [ ] アップロードテスト
- [ ] ダウンロードテスト
- [ ] 禁止拡張子テスト
- [ ] scanStatus の表示確認
- [ ] 既存ファイルの動作確認

---

## 📚 参考情報

### 環境変数の説明
| 変数名 | 既定値 | 説明 |
|--------|-------|------|
| `AV_ENABLED` | `false` | マルウェアスキャンの有効/無効 |
| `AV_FAIL_OPEN` | `false` | AV障害時の挙動（false=ブロック、true=許可） |

### scanStatus の値
| 値 | 説明 |
|----|------|
| `not_scanned` | スキャン未実施（AV無効時） |
| `pending` | スキャン中（将来） |
| `clean` | クリーン（安全） |
| `infected` | 感染検出 |
| `scan_error` | スキャンエラー |

---

## 💰 コスト

- **初期費用**: 0円
- **月額費用**: 0円
- **追加リソース**: なし
- **外部API**: 未使用

---

## 📞 サポート

質問や問題がある場合は、以下に連絡してください：
- **メール**: 138data@gmail.com
- **プロジェクト**: 138DataGate

---

**ドキュメント作成日**: 2025年10月23日  
**バージョン**: 1.0  
**Phase**: 22準備

---

*このパッチは現状の挙動を一切変更せず、将来の拡張性を確保するためのものです。*
