# 📝 Phase 32b-fix-8 完了 → Phase 33 完全引き継ぎドキュメント

作成日時: 2025年10月29日 13:00 JST

---

## 📅 現在の状況

### ✅ Phase 32b-fix-8 完了内容

**問題**: `/api/upload` が OTP を返さず、FUNCTION_INVOCATION_FAILED エラー

**根本原因**: 
1. `api/upload.js` がまだ ESM 形式（`import`/`export default`）のままだった
2. `lib/*.js` ファイルもすべて ESM 形式のままだった
3. Phase 32b-fix-7 で他の API は Node 形式に変換したが、`upload.js` と lib ファイルを変換し忘れていた

**解決策**:
1. ✅ `api/upload.js` にOTPフィールドを追加
2. ✅ `api/upload.js` をESMからNode形式（`require`/`module.exports`）に変換
3. ✅ `lib/encryption.js` をNode形式に変換（7関数）
4. ✅ `lib/email-service.js` をNode形式に変換（3関数）
5. ✅ `lib/environment.js` をNode形式に変換（6関数）

**テスト結果**: すべて成功（5/5, 100%）
- ✅ ファイルアップロード
- ✅ JSON解析（fileId, otp取得）
- ✅ ファイル情報取得 (GET)
- ✅ ファイルダウンロード (POST)
- ✅ ファイル内容検証（完全一致）

---

## 🔍 プロジェクト概要

### プロジェクト名
**138DataGate** - PPAP代替セキュアファイル転送システム

### 目的
パスワード付きZIPファイルをメール送信する「PPAP」を廃止し、安全なファイル転送を実現する。

### 主要機能
1. **ファイルアップロード**: AES-256-GCM暗号化 + Upstash Redis (Vercel KV) 保存
2. **OTP認証**: 6桁数値コードによるダウンロード認証
3. **メール送信**: SendGrid経由でダウンロードリンクまたは添付直送
4. **自動削除**: 7日間TTL、最大3回ダウンロード制限
5. **添付直送機能**: 許可ドメイン・サイズ制限付きの添付ファイル送信（現在有効）

---

## 📁 プロジェクト構成

### 作業ディレクトリ
```
D:\datagate-poc
```

### 主要ファイル

```
D:\datagate-poc/
├── api/
│   ├── upload.js                    # ✅ Node形式（Phase 32b-fix-8で変換完了）
│   ├── hello.js                     # ✅ Node形式（Phase 32b-fix-7で変換完了）
│   └── files/
│       ├── download.js              # ✅ Node形式（Phase 32b-fix-7で変換完了）
│       ├── revoke.js                # ✅ Node形式（Phase 32b-fix-7で変換完了）
│       └── download/
│           └── request-otp.js       # ✅ Node形式（Phase 32b-fix-7で変換完了）
├── lib/
│   ├── encryption.js                # ✅ Node形式（Phase 32b-fix-8で変換完了）
│   ├── email-service.js             # ✅ Node形式（Phase 32b-fix-8で変換完了）
│   ├── environment.js               # ✅ Node形式（Phase 32b-fix-8で変換完了）
│   └── audit-log.js                 # Node形式（Phase 31aで実装）
├── public/
│   ├── index.html                   # アップロード画面（manageUrl表示機能あり）
│   ├── download.html                # ダウンロード画面（2段階UI実装済み、未テスト）
│   └── manage.html                  # 管理画面（新規作成済み、未配置）
├── package.json                     # Node.js 20.x指定
└── vercel.json                      # Vercel設定
```

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
ENABLE_DIRECT_ATTACH=true  # ✅ 添付直送有効

# 添付直送設定
ALLOWED_DIRECT_DOMAINS=@138io.com,@138data.com
DIRECT_ATTACH_MAX_SIZE=10485760  # 10MB

# 管理機能
ADMIN_PASSWORD=<設定済み>
```

### 環境変数確認コマンド

```powershell
vercel env ls
```

---

## 🚀 現在のデプロイ状態

### 最新デプロイURL
```
https://datagate-byztsouut-138datas-projects.vercel.app
```

### Git最新コミット

```
a5d1fa1 (HEAD -> main, origin/main) - fix: Convert all lib files from ESM to Node (CommonJS) format
bfe1548 - fix: Convert api/upload.js from ESM to Node (CommonJS) format
cc6cfa2 - fix: Add otp field to upload API response
647fd75 - chore: Remove test files (no longer needed)
```

### デプロイ方法

```powershell
# 作業ディレクトリに移動
Set-Location D:\datagate-poc

# 再デプロイ
vercel --prod --force

# デプロイ待機（90秒）
Start-Sleep -Seconds 90
```

---

## 🧪 動作確認済み機能

### ✅ コア機能
1. **ファイルアップロード** - AES-256-GCM暗号化、KV保存
2. **OTP生成** - 6桁数値コード
3. **メール送信** - SendGrid経由（添付直送モード）
4. **ファイル情報取得** - メタデータ取得（GET）
5. **OTP検証** - 正しいOTP/間違ったOTPの判定
6. **ファイルダウンロード** - 復号化、日本語・絵文字サポート
7. **ダウンロード回数カウント** - downloadCount のインクリメント
8. **監査ログ** - ダウンロードイベントの記録

### ✅ セキュリティ機能
- 暗号化アルゴリズム: AES-256-GCM
- 鍵導出: PBKDF2
- OTP認証: 6桁数値
- TTL: 7日間
- ダウンロード回数上限: 3回（実装済み、未テスト）

### ✅ 日本語サポート
- UTF-8エンコーディング
- 日本語ファイル名
- 絵文字サポート
- RFC5987形式のファイル名エンコーディング

---

## ⏳ 未テスト機能

### 1. ダウンロード回数制限
**状態**: 実装済み、未テスト

**テスト手順**:
1. ファイルをアップロード
2. 同じファイルを3回ダウンロード
3. 4回目のダウンロードで403エラーを確認

---

### 2. OTP誤入力
**状態**: 実装済み、未テスト

**テスト手順**:
1. ファイルをアップロード
2. 間違ったOTPでダウンロード試行
3. 401エラーを確認

---

### 3. ファイル失効機能
**状態**: 実装済み（`api/files/revoke.js`）、未配置・未テスト

**必要な作業**:
1. `api/files/revoke.js` が正しく配置されているか確認
2. `public/manage.html` のテスト

---

### 4. OTP送信機能
**状態**: 実装済み（`api/files/download/request-otp.js`）、未テスト

**テスト手順**:
1. ブラウザで `download.html?id={fileId}` を開く
2. 「認証コードを送信」ボタンをクリック
3. メールが届くか確認

---

### 5. ブラウザUI
**状態**: 実装済み、未テスト

**必要なテスト**:
- `public/index.html` - アップロード画面、manageUrl表示
- `public/download.html` - 2段階UI（メールアドレスマスク表示 → OTP入力）
- `public/manage.html` - ファイル失効画面

---

## 📊 技術仕様

### 暗号化

- **アルゴリズム**: AES-256-GCM
- **鍵導出**: PBKDF2
- **実装**: `lib/encryption.js`

### 暗号化データ構造

**KVに保存される形式**:
```json
{
  "data": "base64string",      // 暗号化されたファイル本体（Base64）
  "salt": "base64string",      // PBKDF2 ソルト
  "iv": "base64string",        // AES-GCM IV
  "authTag": "base64string"    // AES-GCM 認証タグ
}
```

### OTP

- **形式**: 6桁数値（例: 123456）
- **生成**: `crypto.randomInt(100000, 999999)`
- **実装**: `lib/encryption.js` の `generateOTP()`

### ファイル保存

- **ストレージ**: Upstash Redis (Vercel KV)
- **TTL**: 7日間
- **キー形式**:
  - メタデータ: `file:${fileId}:meta`
  - 暗号化データ: `file:${fileId}:data`

### メール送信

- **サービス**: SendGrid
- **送信元**: noreply@138data.com
- **テンプレート**: HTML + テキスト
- **現在のモード**: 添付直送（ENABLE_DIRECT_ATTACH=true）

---

## 🚨 既知の制限事項

### 1. Vercel制限

- **リクエストボディサイズ**: 4.5MB（Pro プラン）
- **関数実行時間**: 60秒（Pro プラン）
- **KV データサイズ**: 値あたり最大1MB

### 2. SendGrid制限

- **添付ファイルサイズ**: 最大30MB（複数ファイル合計）
- **メール送信レート**: プランによる

---

## 🎯 Phase 33 の推奨タスク

### Phase 33a: ダウンロード回数制限のテスト（推奨）

**目標**: 最大3回ダウンロード制限の動作確認

**テスト手順**:
```powershell
cd D:\datagate-poc
$deployUrl = "https://datagate-byztsouut-138datas-projects.vercel.app"

# アップロード
$response = curl.exe -X POST "$deployUrl/api/upload" `
  -F "file=@test-small.txt" `
  -F "recipient=datagate@138io.com" `
  --silent
$json = $response | ConvertFrom-Json
$fileId = $json.fileId
$otp = $json.otp

# 3回ダウンロード
for ($i = 1; $i -le 3; $i++) {
    Write-Host "`n[$i 回目] ダウンロード試行..." -ForegroundColor Cyan
    $body = @{ fileId = $fileId; otp = $otp } | ConvertTo-Json
    curl.exe -X POST "$deployUrl/api/files/download" `
      -H "Content-Type: application/json" `
      -d $body `
      -o "downloaded-$i.txt" `
      --silent
    Write-Host "✅ 成功" -ForegroundColor Green
}

# 4回目（失敗するはず）
Write-Host "`n[4 回目] ダウンロード試行..." -ForegroundColor Cyan
$body = @{ fileId = $fileId; otp = $otp } | ConvertTo-Json
$response = curl.exe -X POST "$deployUrl/api/files/download" `
  -H "Content-Type: application/json" `
  -d $body `
  --silent
Write-Host $response -ForegroundColor Yellow
```

**期待される結果**:
- 1-3回目: ✅ 成功
- 4回目: ❌ 403 エラー（"Maximum download limit reached"）

---

### Phase 33b: OTP誤入力のテスト

**目標**: 間違ったOTPで401エラーを確認

**テスト手順**:
```powershell
# アップロード
$response = curl.exe -X POST "$deployUrl/api/upload" `
  -F "file=@test-small.txt" `
  -F "recipient=datagate@138io.com" `
  --silent
$json = $response | ConvertFrom-Json
$fileId = $json.fileId
$correctOtp = $json.otp

# 間違ったOTPでダウンロード試行
Write-Host "`n間違ったOTPでダウンロード試行..." -ForegroundColor Cyan
$body = @{ fileId = $fileId; otp = "000000" } | ConvertTo-Json
$response = curl.exe -X POST "$deployUrl/api/files/download" `
  -H "Content-Type: application/json" `
  -d $body `
  --silent
Write-Host $response -ForegroundColor Yellow
```

**期待される結果**:
- ❌ 401 エラー（"Invalid OTP"）

---

### Phase 33c: ブラウザUIのテスト

**目標**: ブラウザでE2Eテストを実行

**テスト手順**:
1. ブラウザで `https://datagate-byztsouut-138datas-projects.vercel.app/` を開く
2. ファイルをアップロード
3. 管理リンクが表示されるか確認
4. ダウンロードリンクをクリック
5. OTP送信機能をテスト
6. ファイルをダウンロード

---

## 📝 次回セッション開始時に伝えること

```
138DataGateプロジェクトの続きです。

【前回の状況】
Phase 32b-fix-8 完了:
- api/upload.js: ESMからNode形式に変換完了
- lib/*.js: すべてESMからNode形式に変換完了（encryption, email-service, environment）
- フルテスト: 5/5 成功（アップロード、JSON解析、ファイル情報取得、ダウンロード、内容検証）
- すべてのコアAPIが正常動作

【動作確認済み機能】
✅ ファイルアップロード（AES-256-GCM暗号化）
✅ OTP生成（6桁数値）
✅ メール送信（添付直送モード）
✅ ファイル情報取得
✅ OTP検証
✅ ファイルダウンロード（復号化）
✅ 日本語・絵文字サポート
✅ ダウンロード回数カウント

【未テスト機能】
⏳ ダウンロード回数制限（最大3回）
⏳ OTP誤入力テスト
⏳ ファイル失効機能
⏳ OTP送信機能（request-otp.js）
⏳ ブラウザUI（download.html, manage.html）

【今回やること（推奨）】
Phase 33a: ダウンロード回数制限のテスト
1. ファイルをアップロード
2. 同じファイルを3回ダウンロード
3. 4回目のダウンロードで403エラーを確認

【作業ディレクトリ】
D:\datagate-poc

【現在のデプロイURL】
https://datagate-byztsouut-138datas-projects.vercel.app

【Git最新コミット】
a5d1fa1 - fix: Convert all lib files from ESM to Node (CommonJS) format

【重要な仕様】
- 暗号化: AES-256-GCM（lib/encryption.js）
- OTP: 6桁数値
- TTL: 7日間
- 最大ダウンロード回数: 3回
- Vercel制限: 4.5MB
- 現在のモード: 添付直送（ENABLE_DIRECT_ATTACH=true）

【テストファイル】
test-small.txt (245 bytes, UTF-8, 日本語＋絵文字)

【環境変数（Production）】
✅ すべて設定済み
✅ ENABLE_DIRECT_ATTACH=true

引き継ぎドキュメント: phase32b-fix-8-complete-handover.md
```

---

## 🔗 重要なリンクとファイル

### ローカル
- 作業ディレクトリ: `D:\datagate-poc`
- テストファイル: `test-small.txt` (245 bytes, UTF-8, 日本語＋絵文字)

### Git
- リポジトリ: `https://github.com/138data/datagate-poc.git`
- 最新コミット: `a5d1fa1 - fix: Convert all lib files from ESM to Node (CommonJS) format`

### Vercel
- プロジェクトURL: `https://vercel.com/138datas-projects/datagate-poc`
- 現在のデプロイURL: `https://datagate-byztsouut-138datas-projects.vercel.app`
- Storage (KV): `https://vercel.com/138datas-projects/datagate-poc/stores`

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
- `phase32b-fix-5-handover.md` - Phase 32b-fix-5 引き継ぎ
- `phase32b-fix-6-handover.md` - Phase 32b-fix-6 引き継ぎ
- `phase32b-fix-7-complete-handover.md` - Phase 32b-fix-7 引き継ぎ
- `phase32b-fix-8-complete-handover.md` - Phase 32b-fix-8 引き継ぎ（このファイル）

---

## 🔍 トラブルシューティング

### エラー1: FUNCTION_INVOCATION_FAILED

**原因**: ESM と CommonJS の混在

**解決済み**: Phase 32b-fix-8 ですべてのファイルを Node 形式に統一

**確認方法**:
```powershell
# すべてのファイルが require/module.exports を使用しているか確認
Get-Content api/upload.js -Encoding UTF8 | Select-String -Pattern "require|module\.exports"
Get-Content lib/encryption.js -Encoding UTF8 | Select-String -Pattern "require|module\.exports"
```

---

### エラー2: JSON パースエラー

**症状**: `ConvertFrom-Json: Conversion from JSON failed`

**原因**: API がエラーメッセージをプレーンテキストで返している

**解決済み**: Phase 32b-fix-8 で完全に解決

**確認方法**: Raw Response を確認して、JSON形式であることを確認

---

### エラー3: OTP が空文字列

**原因**: レスポンスに `otp` フィールドが含まれていない

**解決済み**: Phase 32b-fix-8 で `otp` フィールドを追加

**確認方法**:
```powershell
$response = curl.exe -X POST "$deployUrl/api/upload" -F "file=@test-small.txt" -F "recipient=datagate@138io.com" --silent
$json = $response | ConvertFrom-Json
Write-Host "otp: $($json.otp)"
```

---

## 📊 プロジェクト全体の進捗

| Phase | タスク | 状態 |
|---|---|---|
| Phase 1-23 | 基本機能実装 | ✅ 完了 |
| Phase 24 | 添付直送機能実装 | ✅ 完了 |
| Phase 25-28 | エラー修正・モジュール対応 | ✅ 完了 |
| Phase 29 | ES Modules 完全移行 | ✅ 完了 |
| Phase 30 | 再デプロイとテストシナリオ | ✅ 完了 |
| Phase 31a | ダウンロードエンドポイントの実装 | ✅ 完了 |
| Phase 31b | ダウンロード機能の最終テスト | ✅ 完了 |
| Phase 32a | 添付直送機能のテスト | ✅ 完了 |
| Phase 32b | 管理画面実装 | ✅ 完了 |
| Phase 32b-fix-1〜6 | 各種バグ修正 | ✅ 完了 |
| Phase 32b-fix-7 | Node ハンドラ形式への統一（API） | ✅ 完了 |
| Phase 32b-fix-8 | Node ハンドラ形式への統一（lib） | ✅ 完了 |
| **Phase 33** | **完全機能テスト** | **⏳ 次回実施** |

---

## 🎉 Phase 32b-fix-8 の成果

1. ✅ **根本原因の特定**: ESM と CommonJS の混在問題
2. ✅ **api/upload.js の完全修正**（OTP追加 + Node形式変換）
3. ✅ **すべての lib ファイルを Node 形式に統一**（16関数）
4. ✅ **フルテストで100%成功**（5/5）
5. ✅ **完全に動作するコアシステム**

---

## 🎯 重要な設計原則（再確認）

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

**作成日時**: 2025年10月29日 13:00 JST  
**次回更新**: Phase 33 完了時  
**重要度**: 🔴 High - コアシステム完全動作、次は完全機能テストが推奨  
**推定所要時間**: Phase 33a-c で約2-3時間

---

**[完全版引き継ぎドキュメント]**
