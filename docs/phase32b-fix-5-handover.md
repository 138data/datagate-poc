# 📝 Phase 32b-fix-5 完全引き継ぎドキュメント

作成日時: 2025年10月28日 20:10 JST

---

## 📅 現在の状況

### ✅ Phase 32b-fix-4 で完了した作業

1. ✅ `api/files/download.js` - デバッグログ追加（GET ハンドラ）
2. ✅ `lib/encryption.js` - **verifyOTP 関数を追加**
3. ✅ Git コミット・プッシュ完了

**Git 最新コミット**: 
- `25d590c - fix: Add verifyOTP function to encryption.js`
- `c73ea74 - debug: Add extensive logging to GET handler`

---

## 🐛 Phase 32b-fix-5 で対応中の問題

**問題**: GET `/api/files/download?id={fileId}` が `FUNCTION_INVOCATION_FAILED` エラー

**原因（Phase 32b-fix-4 で判明）**:
```
SyntaxError: The requested module '../../lib/encryption.js' does not provide an export named 'verifyOTP'
```

**対応済み**:
- ✅ `lib/encryption.js` に `verifyOTP` 関数を追加
- ✅ Git コミット・プッシュ完了
- ✅ 再デプロイ完了

**次回実行予定のコマンド**:
```powershell
# 最新のデプロイURLでテスト
$deployUrl = "https://datagate-f7fua0hjx-138datas-projects.vercel.app"

# アップロード
$response = curl.exe -X POST "$deployUrl/api/upload" `
  -F "file=@test-small.txt" `
  -F "recipient=datagate@138io.com" `
  --silent

$json = $response | ConvertFrom-Json
$fileId = $json.fileId

# GET テスト
curl.exe -X GET "$deployUrl/api/files/download?id=$fileId" --silent
```

---

## 🔍 プロジェクト概要

### プロジェクト名
**138DataGate** - PPAP代替セキュアファイル転送システム

### 作業ディレクトリ
```
D:\datagate-poc
```

### 現在のデプロイURL
```
https://datagate-f7fua0hjx-138datas-projects.vercel.app
```

### テストファイル
```
test-small.txt (245 bytes, UTF-8, 日本語＋絵文字)
```

---

## 📁 重要なファイルの現在の状態

### 1. api/files/download.js

**状態**: デバッグログ追加済み

**機能**:
- GET: ファイル情報取得（maskedEmail を含む）
- POST: OTP検証 + ファイルダウンロード

**デバッグログ**:
- `[DEBUG]` で始まる詳細なログを出力
- エラー発生時は `error.message` と `error.stack` を出力

---

### 2. lib/encryption.js

**状態**: verifyOTP 関数追加済み

**エクスポートされている関数**:
- `encryptFile(fileBuffer)` - ファイル暗号化
- `decryptFile(encryptedData, salt, iv, authTag)` - ファイル復号化
- `encryptString(text)` - 文字列暗号化
- `decryptString(encrypted, salt, iv, authTag)` - 文字列復号化
- `generateEncryptionKey()` - 暗号化キー生成
- `generateOTP()` - 6桁OTP生成
- **`verifyOTP(inputOTP, storedOTP)` - OTP検証（新規追加）**

---

### 3. api/upload.js

**状態**: manageUrl 追加済み

**機能**:
- ファイルアップロード
- AES-256-GCM 暗号化
- メタデータ保存（recipient, manageToken, revokedAt など）
- メール送信（リンク送付 or 添付直送）
- レスポンスに `manageUrl` を含む

---

### 4. public/download.html

**状態**: 2段階UI実装済み（未テスト）

**機能**:
- Step 1: 宛先マスク表示 + 「認証コードを送信」ボタン
- Step 2: OTP入力 + ダウンロード

**注**: まだテストしていない（GET エンドポイントが動作してから）

---

### 5. public/index.html

**状態**: manageUrl 表示機能追加済み（未テスト）

**機能**:
- ファイルアップロード
- アップロード成功時に管理リンクを表示

---

### 6. public/manage.html

**状態**: 新規作成済み（未テスト）

**機能**:
- ファイル情報表示
- 失効ボタン
- トークン検証

---

### 7. api/files/revoke.js

**状態**: 新規作成済み（未テスト）

**機能**:
- PUT リクエスト
- トークン検証
- `metadata.revokedAt` を設定

---

### 8. api/files/download/request-otp.js

**状態**: 新規作成済み（未配置）

**機能**:
- POST リクエスト
- `fileId` のみで OTP 送信
- マスク済みメールアドレスを返す

**配置場所**: `D:\datagate-poc\api\files\download\request-otp.js`

---

## 🚀 Git の状態

### 最新コミット

```
25d590c (HEAD -> main, origin/main) - fix: Add verifyOTP function to encryption.js
c73ea74 - debug: Add extensive logging to GET handler
9921755 - fix: Replace backticks with parentheses in kv.get calls
66b8d63 - feat: Add OTP request flow + sender management features
```

### 未コミットのファイル

**ローカルに存在するが Git 未追跡**:
- `public/manage.html`
- `api/files/revoke.js`
- `api/files/download/request-otp.js`

これらは GET エンドポイントが動作確認できてからコミット予定

---

## 🔐 環境変数（Production）

### 必須環境変数（すべて設定済み）

```bash
# SendGrid
SENDGRID_API_KEY=<設定済み>
SENDGRID_FROM_EMAIL=<設定済み>
SENDGRID_FROM_NAME=138DataGate

# Vercel KV (Upstash Redis)
KV_REST_API_URL=<設定済み>
KV_REST_API_TOKEN=<設定済み>

# 暗号化
FILE_ENCRYPT_KEY=<設定済み>

# JWT認証
JWT_SECRET=<設定済み>

# 機能フラグ
ENABLE_EMAIL_SENDING=true
ENABLE_DIRECT_ATTACH=true  # 添付直送有効

# 添付直送設定
ALLOWED_DIRECT_DOMAINS=@138io.com,@138data.com
DIRECT_ATTACH_MAX_SIZE=10485760  # 10MB

# 管理機能
ADMIN_PASSWORD=<設定済み>
```

---

## 🧪 次回セッションの開始手順

### Step 1: 現在の状況確認

次回セッション開始時に以下を伝えてください：

```
138DataGateプロジェクトの続きです。

【前回の状況】
Phase 32b-fix-4 完了:
- api/files/download.js: デバッグログ追加完了
- lib/encryption.js: verifyOTP 関数追加完了
- Git コミット・プッシュ完了
- 再デプロイ完了（https://datagate-f7fua0hjx-138datas-projects.vercel.app）

【問題】
GET /api/files/download?id={fileId} が FUNCTION_INVOCATION_FAILED エラー
→ verifyOTP 関数が存在しないことが原因
→ 対応完了（verifyOTP 関数を追加）

【今回最初にやること】
最新のデプロイURLでテストを実行して、結果を報告します。

【作業ディレクトリ】
D:\datagate-poc

【現在のデプロイURL】
https://datagate-f7fua0hjx-138datas-projects.vercel.app

【Git最新コミット】
25d590c - fix: Add verifyOTP function to encryption.js

引き継ぎドキュメント: phase32b-fix-5-handover.md
```

---

### Step 2: 最新URLでテスト実行

```powershell
cd D:\datagate-poc

# 最新のデプロイURL
$deployUrl = "https://datagate-f7fua0hjx-138datas-projects.vercel.app"

Write-Host "=== アップロードテスト ===" -ForegroundColor Green
$response = curl.exe -X POST "$deployUrl/api/upload" `
  -F "file=@test-small.txt" `
  -F "recipient=datagate@138io.com" `
  --silent

$json = $response | ConvertFrom-Json
$fileId = $json.fileId

Write-Host "fileId: $fileId" -ForegroundColor Cyan

# GET テスト
Write-Host "`n=== GET テスト ===" -ForegroundColor Green
$response = curl.exe -X GET "$deployUrl/api/files/download?id=$fileId" --silent

Write-Host "Raw Response:" -ForegroundColor Yellow
Write-Host $response -ForegroundColor Cyan

# JSON解析
Write-Host "`n=== JSON解析 ===" -ForegroundColor Green
try {
    $json = $response | ConvertFrom-Json
    Write-Host "✅ 成功！" -ForegroundColor Green
    Write-Host "maskedEmail: $($json.maskedEmail)" -ForegroundColor Cyan
    Write-Host "fileName: $($json.fileName)" -ForegroundColor Cyan
    Write-Host "downloadCount: $($json.downloadCount)" -ForegroundColor Cyan
    Write-Host "maxDownloads: $($json.maxDownloads)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ 失敗" -ForegroundColor Red
    Write-Host "エラー: $_" -ForegroundColor Red
}
```

**このコマンドの実行結果を報告してください。**

---

### Step 3a: テストが成功した場合

```powershell
Write-Host "`n🎉 GET エンドポイント成功！" -ForegroundColor Green
Write-Host "次は POST エンドポイントのテスト（OTP検証 + ダウンロード）を実行します。" -ForegroundColor Yellow
```

次に進むテスト：
1. POST `/api/files/download` - OTP検証 + ダウンロード
2. ダウンロード回数制限のテスト（最大3回）
3. OTP誤入力のテスト
4. ブラウザでの E2E テスト（download.html）

---

### Step 3b: テストが失敗した場合

```powershell
# Vercel ログを確認
Write-Host "`n🔍 ログ確認:" -ForegroundColor Yellow
vercel logs https://datagate-f7fua0hjx-138datas-projects.vercel.app
```

ログ内容を確認して、エラーの原因を特定します。

---

## 📊 プロジェクト全体の進捗

| Phase | タスク | 状態 |
|---|---|---|
| Phase 1-31b | 基本機能実装 | ✅ 完了 |
| Phase 32a | 添付直送機能テスト | ✅ 完了 |
| Phase 32b | 管理画面実装 | ✅ 完了 |
| Phase 32b-fix-1 | OTP送信フロー修正 | ✅ 完了 |
| Phase 32b-fix-2 | 設計仕様準拠への修正 | ✅ 完了 |
| Phase 32b-fix-3 | download.js のバグ修正 | ✅ 完了 |
| Phase 32b-fix-4 | verifyOTP 関数追加 | ✅ 完了 |
| **Phase 32b-fix-5** | **GET エンドポイント動作確認** | **🔄 次回実施** |

---

## 🔗 重要なリンクとファイル

### ローカル
- 作業ディレクトリ: `D:\datagate-poc`
- テストファイル: `test-small.txt` (245 bytes, UTF-8, 日本語＋絵文字)

### Git
- リポジトリ: `https://github.com/138data/datagate-poc.git`
- 最新コミット: `25d590c - fix: Add verifyOTP function to encryption.js`

### Vercel
- 現在のデプロイURL: `https://datagate-f7fua0hjx-138datas-projects.vercel.app`
- プロジェクト: `https://vercel.com/138datas-projects/datagate-poc`

---

## 🎯 Phase 32b-fix-5 の成功基準

以下がすべて動作すれば Phase 32b-fix-5 完了：

1. ✅ GET `/api/files/download?id={fileId}` が成功
2. ✅ レスポンスに `maskedEmail` が含まれる
3. ✅ `fileName`, `fileSize`, `downloadCount`, `maxDownloads` が正しく表示される
4. ✅ エラーが発生しない

---

## 🔍 トラブルシューティング

### エラー1: FUNCTION_INVOCATION_FAILED

**原因**: モジュールのインポートエラー、構文エラー、実行時エラー

**対処法**:
```powershell
# Vercel ログを確認
vercel logs <デプロイURL>

# エラーメッセージから原因を特定
# - SyntaxError → 構文エラー
# - ModuleError → インポートエラー
# - ReferenceError → 未定義の変数・関数
```

---

### エラー2: verifyOTP is not defined

**原因**: `lib/encryption.js` に `verifyOTP` 関数がエクスポートされていない

**対処法**: **Phase 32b-fix-4 で対応済み**

確認コマンド:
```powershell
Get-Content "D:\datagate-poc\lib\encryption.js" -Encoding UTF8 | Select-String "verifyOTP"
```

期待される結果:
```javascript
export function verifyOTP(inputOTP, storedOTP) {
```

---

### エラー3: JSON 解析失敗

**症状**: `Conversion from JSON failed`

**原因**: API がエラーメッセージをプレーンテキストで返している

**対処法**: Vercel ログでエラー内容を確認

---

## 📝 重要な設計原則（再確認）

### 1. メールアドレス入力は不要

- 受信者は `metadata.recipient` としてサーバー側に保存済み
- ダウンロードページではマスク表示のみ（例: `d***@138io.com`）
- GET `/api/files/download?id={fileId}` で `maskedEmail` を返す

### 2. 送信者専用管理リンク

- `manageUrl` で送信者のみがファイルを失効可能
- `metadata.manageToken` でトークン検証
- `metadata.revokedAt` 設定で即座に失効

### 3. OTP送信フロー

- POST `/api/files/download/request-otp` に `email` パラメータ不要
- `fileId` のみで `metadata.recipient` 宛てに送信
- レスポンスにマスク済みメールアドレスを返す

### 4. 失効チェック

- すべてのダウンロードエンドポイントで `metadata.revokedAt` をチェック
- 失効済みの場合は 403 エラー

---

## 🚨 既知の問題

### 1. vercel.json が存在しない

**影響**: デフォルトの Vercel 設定が使用される

**対処**: 必要に応じて `vercel.json` を作成

### 2. SENDGRID_API_KEY が露出

**影響**: セキュリティリスク

**対処**: 後で再生成が必要

### 3. 一部ファイルが未配置

**影響**: 機能が不完全

**未配置ファイル**:
- `api/files/download/request-otp.js`
- `public/manage.html`
- `api/files/revoke.js`

**対処**: GET エンドポイントが動作確認できてから配置

---

## 📚 関連ドキュメント

### プロジェクト文書（最新）

- `/mnt/project/slo-kpi.md` - SLO/KPI定義
- `/mnt/project/docsthreat-model.md` - 脅威モデルと対策
- `/mnt/project/docsretention-audit.md` - データ保持と監査
- `/mnt/project/env-matrix.md` - 環境マトリクス
- `/mnt/project/incident-response.md` - インシデント対応
- `/mnt/project/jp-encoding-playbook.md` - 日本語エンコーディング

### Phase 完了レポート

- `phase30-completion-report.md` - Phase 30 完了レポート
- `phase30-to-phase31-handover.md` - Phase 30→31 引き継ぎ
- `phase31b-to-phase32-handover.md` - Phase 31b→32 引き継ぎ
- `phase32b-fix-2-handover.md` - Phase 32b-fix-2 引き継ぎ
- `phase32b-fix-4-handover.md` - Phase 32b-fix-4 引き継ぎ

---

## 🎉 Phase 32b-fix-4 の成果

1. ✅ **verifyOTP 関数の追加完了**（lib/encryption.js）
2. ✅ **デバッグログの追加完了**（api/files/download.js）
3. ✅ **Git コミット・プッシュ完了**
4. ✅ **再デプロイ完了**

---

**作成日時**: 2025年10月28日 20:10 JST  
**次回更新**: Phase 32b-fix-5 完了時  
**重要度**: 🔴 High - GET エンドポイントの動作確認が最優先  
**推定所要時間**: テスト + デバッグ約30-60分

---

**[完全版引き継ぎドキュメント]**
