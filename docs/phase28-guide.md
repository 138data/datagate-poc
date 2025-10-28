# Phase 28: 実装ガイド

## 📋 概要

**目的:** `lib/encryption.js` に `generateOTP()` を追加し、`api/upload.js` を完全版に置き換える

**変更内容:**
1. `lib/encryption.js`: `generateOTP()` 関数を追加
2. `api/upload.js`: 暗号化関数のシグネチャを修正

---

## 🚀 実装手順

### 前提条件

- 作業ディレクトリ: `D:\datagate-poc`
- Git コミット最新: `9dde083`
- デプロイURL: `https://datagate-llf1m9q6a-138datas-projects.vercel.app`

### Step 1: ファイルのダウンロード

Claude から以下のファイルをダウンロード:

1. **encryption.js** (完全版)
2. **upload.js** (完全版)

### Step 2: ファイルの配置

```powershell
# 作業ディレクトリに移動
Set-Location D:\datagate-poc

# バックアップを作成
Copy-Item lib\encryption.js lib\encryption.js.backup-phase28
Copy-Item api\upload.js api\upload.js.backup-phase28

# ダウンロードしたファイルを配置
# 1. encryption.js を D:\datagate-poc\lib\encryption.js に上書き
# 2. upload.js を D:\datagate-poc\api\upload.js に上書き
```

### Step 3: 変更内容の確認

```powershell
# generateOTP 関数の存在確認
Get-Content lib\encryption.js -Encoding UTF8 | Select-String "generateOTP" -Context 0,5

# 期待される出力:
# export function generateOTP() {
#   const num = Math.floor(100000 + Math.random() * 900000);
#   return num.toString();
# }
```

### Step 4: Git コミット・プッシュ

```powershell
# ステージング
git add lib/encryption.js api/upload.js

# ステータス確認
git status

# コミット
git commit -m "fix: Add generateOTP and correct encryption function usage"

# プッシュ
git push origin main
```

### Step 5: デプロイ待機

```powershell
# 90秒待機
Start-Sleep -Seconds 90
```

### Step 6: アップロードテスト

```powershell
# テスト実行
curl.exe -X POST "https://datagate-llf1m9q6a-138datas-projects.vercel.app/api/upload" `
  -F "file=@test-small.txt" `
  -F "recipient=datagate@138io.com"

# 期待される結果:
# {
#   "success": true,
#   "fileId": "...",
#   "fileName": "test-small.txt",
#   "fileSize": 245,
#   "expiresAt": "...",
#   "downloadUrl": "...",
#   "otp": "123456",  # 6桁の数値
#   "email": {
#     "sent": true,
#     "success": true,
#     "mode": "link",
#     "reason": "feature_disabled",
#     "messageId": "...",
#     "statusCode": 202
#   }
# }
```

---

## 🔍 変更点の詳細

### lib/encryption.js の変更

**追加された関数:**

```javascript
/**
 * 6桁数値OTPを生成
 * @returns {string} 6桁の数値文字列
 */
export function generateOTP() {
  const num = Math.floor(100000 + Math.random() * 900000);
  return num.toString();
}
```

- 100000 ～ 999999 の範囲で生成
- 必ず6桁の数値文字列
- モバイル端末の数値キーパッドで入力しやすい

### api/upload.js の変更

**1. インポートパスの修正:**

```javascript
// 旧
import { encryptFile, generateOTP } from '../lib/crypto.js';

// 新
import { encryptFile, generateOTP } from '../lib/encryption.js';
```

**2. encryptFile() 呼び出しの修正:**

```javascript
// 旧（Phase 26 以前）
const encryptedData = encryptFile(file.fileContent, fileId, otp);
await kv.set(`file:${fileId}:data`, encryptedData.encryptedContent, ...);

// 新（Phase 28）
const encryptedData = encryptFile(file.fileContent);
await kv.set(`file:${fileId}:data`, encryptedData.encryptedData, ...);
```

**3. メタデータへの暗号化パラメータ追加:**

```javascript
const metadata = {
  fileName: file.fileName,
  fileSize: file.fileSize,
  mimeType: file.mimeType,
  uploadedAt: new Date().toISOString(),
  expiresAt: expiresAt,
  downloadCount: 0,
  maxDownloads: 3,
  otp: otp,
  salt: encryptedData.salt,      // 追加
  iv: encryptedData.iv,          // 追加
  authTag: encryptedData.authTag // 追加
};
```

---

## ✅ 検証項目

### 1. アップロード成功

- ✅ `success: true`
- ✅ `fileId` が生成される（32桁の16進数）
- ✅ `otp` が生成される（6桁の数値）

### 2. メール送信成功

- ✅ `email.sent: true`
- ✅ `email.success: true`
- ✅ `email.mode: "link"`（既定設定）
- ✅ `email.reason: "feature_disabled"`
- ✅ `email.statusCode: 202`

### 3. ファイル暗号化

- ✅ KVに `file:{fileId}:data` として保存
- ✅ KVに `file:{fileId}:meta` として保存
- ✅ メタデータに `salt`, `iv`, `authTag` が含まれる

### 4. ダウンロード成功

```powershell
# ダウンロードテスト
curl.exe -X POST "https://datagate-llf1m9q6a-138datas-projects.vercel.app/api/files/download" `
  -H "Content-Type: application/json" `
  -d "{`"fileId`":`"<fileId>`",`"otp`":`"<otp>`"}" `
  --output downloaded-test.txt

# ファイル内容比較
$original = Get-Content test-small.txt -Raw -Encoding UTF8
$downloaded = Get-Content downloaded-test.txt -Raw -Encoding UTF8
$original -eq $downloaded  # True であれば成功
```

---

## 🧪 Phase 24 テストシナリオ

Phase 28 完了後、以下の4つのテストを実行:

### テスト1: リンク送付モード（既定動作）

**条件:**
- `ENABLE_DIRECT_ATTACH=false`（現在の設定）

**期待結果:**
- ダウンロードリンク + OTP送信
- `mode: 'link'`, `reason: 'feature_disabled'`

**コマンド:**
```powershell
curl.exe -X POST "$baseUrl/api/upload" `
  -F "file=@test-small.txt" `
  -F "recipient=datagate@138io.com"
```

### テスト2: 許可ドメイン外（フォールバック）

**条件:**
- 許可外ドメイン（例: `test@example.com`）

**期待結果:**
- リンク送付にフォールバック
- `mode: 'link'`, `reason: 'domain_not_allowed'`

**コマンド:**
```powershell
curl.exe -X POST "$baseUrl/api/upload" `
  -F "file=@test-small.txt" `
  -F "recipient=test@example.com"
```

### テスト3: サイズ超過（フォールバック）

**条件:**
- 10MB超過ファイル

**期待結果:**
- リンク送付にフォールバック
- `mode: 'link'`, `reason: 'size_exceeded'`

**準備:**
```powershell
# 11MB のテストファイルを作成
fsutil file createnew test-large.txt 11534336
```

**コマンド:**
```powershell
curl.exe -X POST "$baseUrl/api/upload" `
  -F "file=@test-large.txt" `
  -F "recipient=datagate@138io.com"
```

### テスト4: 添付直送モード（要環境変数変更）

**条件:**
- `ENABLE_DIRECT_ATTACH=true` + 許可ドメイン + 10MB以下

**期待結果:**
- ファイルを添付して送信
- `mode: 'attach'`, `reason: null`

**準備:**
1. Vercel ダッシュボードで `ENABLE_DIRECT_ATTACH=true` に設定
2. 再デプロイ（環境変数変更後は自動デプロイ）
3. デプロイ完了を待機（90秒）

**コマンド:**
```powershell
curl.exe -X POST "$baseUrl/api/upload" `
  -F "file=@test-small.txt" `
  -F "recipient=datagate@138io.com"
```

---

## 🐛 トラブルシューティング

### 問題1: `generateOTP is not a function`

**原因:** `lib/encryption.js` に関数が追加されていない

**対処法:**
```powershell
# 関数の存在確認
Get-Content lib\encryption.js -Encoding UTF8 | Select-String "generateOTP"

# 存在しない場合は、encryption.js を再度ダウンロード・配置
```

### 問題2: `Cannot find module '../lib/crypto.js'`

**原因:** `api/upload.js` のインポートパスが旧版

**対処法:**
```powershell
# インポート文の確認
Get-Content api\upload.js -Encoding UTF8 | Select-String "import.*encryption"

# 正しいパス: '../lib/encryption.js'
```

### 問題3: `encryptedData.encryptedContent is undefined`

**原因:** `encryptFile()` の戻り値構造が変更されている

**対処法:**
- `api/upload.js` を完全版に置き換え
- `encryptedData.encryptedData` を使用（プロパティ名の変更）

### 問題4: デプロイ後もエラーが続く

**原因:** ブラウザキャッシュまたはVercelキャッシュ

**対処法:**
```powershell
# Vercel CLI でキャッシュクリア（オプション）
vercel --prod

# または、ブラウザで強制リロード（Ctrl+Shift+R）
```

---

## 📊 期待される Vercel ログ

デプロイ後、Vercel のログで以下を確認:

```
[Upload] Environment: production
[Upload] Email enabled: true
[Upload] Direct attach enabled: false
[Upload] File received: { fileName: 'test-small.txt', fileSize: 245, mimeType: 'text/plain', recipient: 'datagate@138io.com' }
[Upload] Encrypting file...
[Upload] Saving to KV...
[Upload] File saved successfully: <fileId>
[Upload] Processing email send...
[Upload] Direct attach check: { allowed: false, reason: 'feature_disabled' }
[Upload] Sending download link (reason: feature_disabled)
[Upload] Email processing complete: { sent: true, success: true, mode: 'link', reason: 'feature_disabled', ... }
```

---

## 🔄 ロールバック手順

問題が発生した場合:

```powershell
# バックアップから復元
Copy-Item lib\encryption.js.backup-phase28 lib\encryption.js
Copy-Item api\upload.js.backup-phase28 api\upload.js

# Git リバート
git add lib/encryption.js api/upload.js
git commit -m "revert: Rollback Phase 28 changes"
git push origin main

# デプロイ待機
Start-Sleep -Seconds 90
```

---

**作成日時:** 2025年10月28日  
**Phase:** 28  
**重要度:** 🔴 High  
**推定所要時間:** 20分
