# 📝 Phase 33e → Phase 33f 完全引き継ぎドキュメント

作成日時: 2025年10月30日 11:00 JST

---

## 📅 現在の状況

### 🚨 Phase 33e で発見した重大な問題

**問題**: `api/files/download.js` が **一度もCommonJS形式に変換されていない**

**症状**:
- すべてのバージョンで **ESMとCommonJSの混在**（`import` + `module.exports`）
- GET/POST 両方のエンドポイントが **60秒タイムアウト**
- ダウンロード回数が更新されない

**原因**: Phase 32b-fix-7 で他のファイルは変換したが、`api/files/download.js` だけ変換し忘れ

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
https://datagate-2on45zrb8-138datas-projects.vercel.app
```

### テストファイル
```
test-small.txt (245 bytes, UTF-8, 日本語＋絵文字)
```

---

## 📁 重要なファイルの状態

### 1. api/files/download.js（修正が必要）

**現在の状態**: ESM + CommonJS 混在
```javascript
// ❌ 問題のあるコード（すべてのコミットで同じ）
import { kv } from '@vercel/kv';           // ← ESM
import { decryptFile, verifyOTP } from '../../lib/encryption.js';
import { saveAuditLog } from '../../lib/audit-log.js';

module.exports = async (req, res) => {    // ← CommonJS
  // ...
};
```

**必要な修正**: 完全にCommonJS形式に変換
```javascript
// ✅ 修正後
const { kv } = require('@vercel/kv');
const { decryptFile, verifyOTP } = require('../../lib/encryption.js');
const { saveAuditLog } = require('../../lib/audit-log.js');

module.exports = async (req, res) => {
  // ...
};
```

---

### 2. その他のファイル（すべて正常）

- `api/upload.js` - ✅ CommonJS形式（Phase 32b-fix-8で変換済み）
- `lib/encryption.js` - ✅ CommonJS形式（Phase 32b-fix-8で変換済み）
- `lib/email-service.js` - ✅ CommonJS形式（Phase 32b-fix-8で変換済み）
- `lib/environment.js` - ✅ CommonJS形式（Phase 32b-fix-8で変換済み）
- `lib/audit-log.js` - ✅ CommonJS形式（Phase 31aで実装）

---

## 🚀 Git の状態

### 最新コミット（リモート）

```
5131921 (HEAD -> main, origin/main) revert: Restore working Express.js version from commit 842f713
75705eb revert: Rollback to Express.js style handler (Node.js handler causes timeout)
7bdab27 fix: Improve URL parameter extraction in GET handler
03d37d2 fix: Convert download.js to Node.js handler format (complete rewrite)
b36a56d feat: Add manage.html for sender-side file revocation
be752c7 fix: Replace template literal with parentheses in kv.set call (download count update)
```

### Git履歴の調査結果

すべてのコミットで `api/files/download.js` が **ESM混在**:
- `be752c7` - ESM混在（`import` + `module.exports`）
- `b36a56d` - ESM混在
- `bfe1548` - ESM混在
- `a5d1fa1` - この時点で lib ファイルは変換済み、しかし download.js は未変換
- `842f713` 以前 - すべてESM混在

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

## 🔧 Phase 33f の作業内容

### 目標
**`api/files/download.js` を完全にCommonJS形式に変換**

### 作業手順

#### Step 1: 修正版を作成

以下のPowerShellコマンドを実行して、完全CommonJS版を作成：

```powershell
cd D:\datagate-poc

@"
// api/files/download.js - Node (req, res) handler format - FIXED
const { kv } = require('@vercel/kv');
const { decryptFile, verifyOTP } = require('../../lib/encryption.js');
const { saveAuditLog } = require('../../lib/audit-log.js');

const maskEmail = (mail) => {
  if (!mail || !mail.includes('@')) return '';
  const [l, d] = mail.split('@');
  const lm = l.length <= 2 ? l[0] + '*' : l[0] + '***' + l.slice(-1);
  const [d1, ...rest] = d.split('.');
  const dm = (d1.length <= 2 ? d1[0] + '*' : d1[0] + '***') + (rest.length ? '.' + rest.join('.') : '');
  return lm + '@' + dm;
};

const safeParseMeta = (metaVal) => {
  if (!metaVal) return null;
  if (typeof metaVal === 'string') {
    try { return JSON.parse(metaVal); } catch { return null; }
  }
  if (typeof metaVal === 'object') return metaVal;
  return null;
};

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET: ファイル情報取得
    if (req.method === 'GET') {
      const id = req.query.id;

      if (!id) {
        return res.status(400).json({ error: 'Missing file ID' });
      }

      const metadataJson = await kv.get('file:' + id + ':meta');
      const metadata = safeParseMeta(metadataJson);

      if (!metadata) {
        return res.status(404).json({ error: 'File not found' });
      }

      // 失効チェック
      if (metadata.revokedAt) {
        return res.status(403).json({ error: 'File has been revoked' });
      }

      // レスポンス
      return res.status(200).json({
        success: true,
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        uploadedAt: metadata.uploadedAt,
        expiresAt: metadata.expiresAt,
        downloadCount: metadata.downloadCount || 0,
        maxDownloads: metadata.maxDownloads || 3,
        maskedEmail: maskEmail(metadata.recipient)
      });
    }

    // POST: OTP検証 + ダウンロード
    if (req.method === 'POST') {
      let body;
      if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else {
        body = req.body;
      }

      const fileId = body.fileId;
      const otp = body.otp;

      if (!fileId || !otp) {
        return res.status(400).json({ error: 'Missing fileId or otp' });
      }

      const metadataJson = await kv.get('file:' + fileId + ':meta');
      const metadata = safeParseMeta(metadataJson);

      if (!metadata) {
        return res.status(404).json({ error: 'File not found' });
      }

      // 失効チェック
      if (metadata.revokedAt) {
        await saveAuditLog({
          event: 'download_blocked',
          actor: metadata.recipient,
          fileId: fileId,
          fileName: metadata.fileName,
          reason: 'revoked'
        });
        return res.status(403).json({ error: 'File has been revoked' });
      }

      // OTP検証
      if (!verifyOTP(otp, metadata.otp)) {
        await saveAuditLog({
          event: 'download_failed',
          actor: metadata.recipient,
          fileId: fileId,
          fileName: metadata.fileName,
          reason: 'invalid_otp'
        });
        return res.status(401).json({ error: 'Invalid OTP' });
      }

      // ダウンロード回数チェック
      const downloadCount = metadata.downloadCount || 0;
      const maxDownloads = metadata.maxDownloads || 3;

      if (downloadCount >= maxDownloads) {
        await saveAuditLog({
          event: 'download_blocked',
          actor: metadata.recipient,
          fileId: fileId,
          fileName: metadata.fileName,
          reason: 'max_downloads_exceeded'
        });
        return res.status(403).json({ error: 'Maximum download limit reached' });
      }

      // 暗号化データ取得
      const encryptedDataJson = await kv.get('file:' + fileId + ':data');

      if (!encryptedDataJson) {
        return res.status(404).json({ error: 'File data not found' });
      }

      let encryptedDataObj;
      if (typeof encryptedDataJson === 'string') {
        encryptedDataObj = JSON.parse(encryptedDataJson);
      } else {
        encryptedDataObj = encryptedDataJson;
      }

      // 復号化
      const encryptedBuffer = Buffer.from(encryptedDataObj.data, 'base64');
      const decryptedBuffer = decryptFile(
        encryptedBuffer,
        encryptedDataObj.salt,
        encryptedDataObj.iv,
        encryptedDataObj.authTag
      );

      // ダウンロード回数更新
      metadata.downloadCount = downloadCount + 1;
      await kv.set('file:' + fileId + ':meta', JSON.stringify(metadata), {
        ex: 7 * 24 * 60 * 60
      });

      // 監査ログ
      await saveAuditLog({
        event: 'download_success',
        actor: metadata.recipient,
        fileId: fileId,
        fileName: metadata.fileName,
        size: metadata.fileSize,
        downloadCount: metadata.downloadCount
      });

      // ファイル送信
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="' + metadata.fileName + '"; filename*=UTF-8\'\'' + encodeURIComponent(metadata.fileName));
      res.setHeader('Content-Length', decryptedBuffer.length);
      return res.status(200).end(decryptedBuffer);
    }

    // その他のメソッド
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[ERROR]', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};
"@ | Out-File -FilePath "D:\datagate-poc\api\files\download.js" -Encoding UTF8

Write-Host "✅ 完全CommonJS版を作成しました" -ForegroundColor Green
```

---

#### Step 2: ファイル内容を確認

```powershell
# 先頭30行を確認（requireになっているか）
Get-Content "D:\datagate-poc\api\files\download.js" -Encoding UTF8 -TotalCount 30

# importが残っていないか確認
$content = Get-Content "D:\datagate-poc\api\files\download.js" -Encoding UTF8 -Raw
if ($content -match "import ") {
    Write-Host "❌ まだ import が残っています" -ForegroundColor Red
} else {
    Write-Host "✅ import は存在しません" -ForegroundColor Green
}
```

**期待される出力**:
```
const { kv } = require('@vercel/kv');
const { decryptFile, verifyOTP } = require('../../lib/encryption.js');
const { saveAuditLog } = require('../../lib/audit-log.js');
...
✅ import は存在しません
```

---

#### Step 3: Git コミット・プッシュ

```powershell
# Git コミット
git add api/files/download.js
git commit -m "fix: Convert download.js to pure CommonJS (remove ESM imports)

- Replace import with require
- Keep Express.js (req, res) handler format
- Fix download count update bug
- This was the root cause of FUNCTION_INVOCATION_TIMEOUT"

git push origin main

Write-Host "✅ Git プッシュ完了" -ForegroundColor Green
```

---

#### Step 4: Vercel デプロイ

```powershell
# デプロイ
vercel --prod --force

# 待機
Write-Host "`nデプロイ中... 90秒待機します" -ForegroundColor Yellow
Start-Sleep -Seconds 90

# 新しいデプロイURL確認
vercel --prod
```

---

#### Step 5: 動作テスト

```powershell
# 最新のデプロイURL（Step 4で表示される）
$deployUrl = "https://datagate-<新しいID>-138datas-projects.vercel.app"

Write-Host "`n=== 完全テスト開始 ===" -ForegroundColor Green

# アップロード
Write-Host "`n[Step 1] アップロード" -ForegroundColor Yellow
$response = curl.exe -X POST "$deployUrl/api/upload" `
  -F "file=@test-small.txt" `
  -F "recipient=datagate@138io.com" `
  --silent

$json = $response | ConvertFrom-Json
$fileId = $json.fileId
$otp = $json.otp

Write-Host "  fileId: $fileId" -ForegroundColor Cyan
Write-Host "  otp: $otp" -ForegroundColor Cyan

# 初期状態確認
Write-Host "`n[Step 2] 初期状態確認" -ForegroundColor Yellow
$response = curl.exe -X GET "$deployUrl/api/files/download?id=$fileId" --max-time 10 --silent

Write-Host "  Raw Response: $response" -ForegroundColor White

try {
    $fileInfo = $response | ConvertFrom-Json
    Write-Host "  ✅ JSON解析成功" -ForegroundColor Green
    Write-Host "  ダウンロード回数: $($fileInfo.downloadCount) / $($fileInfo.maxDownloads)" -ForegroundColor Cyan
} catch {
    Write-Host "  ❌ JSON解析失敗: $_" -ForegroundColor Red
}

# 1回目ダウンロード
Write-Host "`n[Step 3] 1回目ダウンロード" -ForegroundColor Yellow
$body = @{ fileId = $fileId; otp = $otp } | ConvertTo-Json
curl.exe -X POST "$deployUrl/api/files/download" `
  -H "Content-Type: application/json" `
  -d $body `
  -o "downloaded-fixed.txt" `
  --max-time 10 `
  --silent

if (Test-Path "downloaded-fixed.txt") {
    $fileSize = (Get-Item "downloaded-fixed.txt").Length
    Write-Host "  ファイルサイズ: $fileSize bytes" -ForegroundColor Cyan
    
    $content = Get-Content "downloaded-fixed.txt" -Encoding UTF8 -Raw -ErrorAction SilentlyContinue
    if ($content -and -not $content.StartsWith("An error")) {
        Write-Host "  ✅ ダウンロード成功" -ForegroundColor Green
        
        # 内容検証
        $original = Get-Content "test-small.txt" -Encoding UTF8 -Raw
        if ($original -eq $content) {
            Write-Host "  ✅ ファイル内容一致" -ForegroundColor Green
        } else {
            Write-Host "  ❌ ファイル内容不一致" -ForegroundColor Red
        }
    } else {
        Write-Host "  ❌ エラー: $($content.Substring(0, [Math]::Min(100, $content.Length)))" -ForegroundColor Red
    }
}

# ダウンロード回数確認
Write-Host "`n[Step 4] ダウンロード回数確認" -ForegroundColor Yellow
$response = curl.exe -X GET "$deployUrl/api/files/download?id=$fileId" --max-time 10 --silent

try {
    $fileInfo = $response | ConvertFrom-Json
    Write-Host "  ダウンロード回数: $($fileInfo.downloadCount) / $($fileInfo.maxDownloads)" -ForegroundColor Cyan
    
    if ($fileInfo.downloadCount -eq 1) {
        Write-Host "  ✅ 回数更新成功！" -ForegroundColor Green
    } else {
        Write-Host "  ❌ downloadCount = $($fileInfo.downloadCount) (期待値: 1)" -ForegroundColor Red
    }
} catch {
    Write-Host "  ❌ JSON解析失敗" -ForegroundColor Red
}

Write-Host "`n=== テスト完了 ===" -ForegroundColor Green
```

---

## 🎯 Phase 33f の成功基準

以下がすべて確認できれば Phase 33f 完了:

1. ✅ `api/files/download.js` に `import` が存在しない
2. ✅ `require` のみ使用されている
3. ✅ GET エンドポイントが10秒以内に応答
4. ✅ POST エンドポイントが10秒以内にダウンロード完了
5. ✅ ダウンロード回数が正しく更新される（`0 / 3` → `1 / 3`）
6. ✅ ファイル内容が完全一致

---

## 📊 技術仕様（確認済み）

### 暗号化

- **アルゴリズム**: AES-256-GCM
- **鍵導出**: PBKDF2
- **実装**: `lib/encryption.js`

### OTP

- **形式**: 6桁数値（例: 903016）
- **生成**: `crypto.randomInt(100000, 999999)`
- **実装**: `lib/encryption.js` の `generateOTP()`

### ファイル保存

- **ストレージ**: Upstash Redis (Vercel KV)
- **TTL**: 7日間
- **キー形式**:
  - メタデータ: `file:${fileId}:meta`
  - 暗号化データ: `file:${fileId}:data`

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

## 🔍 Phase 33e で試したこと（失敗）

### 1. Node.js ハンドラ形式への変換（失敗）

**試したこと**: `module.exports = async function handler(request)` 形式に変換

**結果**: すべてのエンドポイントが60秒タイムアウト

**原因**: Vercel環境で `request.url` が相対パスで渡されることへの対応が不完全

---

### 2. Express.js版へのロールバック（失敗）

**試したこと**: Git履歴から Express.js版（`req, res`）を復元

**結果**: すべてのバージョンがESM混在で、同じくタイムアウト

**原因**: `import` + `module.exports` の混在が根本原因

---

### 3. バックアップファイルの復元（失敗）

**試したこと**: `.backup` ファイルから復元

**結果**: バックアップも Node.js ハンドラ形式だった

**原因**: バックアップのタイミングが悪かった

---

## 📋 Phase 33f 完了後の次のステップ

### Phase 33g: ダウンロード回数制限の完全テスト

**目標**: 最大3回ダウンロード、4回目はエラー

**タスク**:
1. 同じファイルを3回ダウンロード
2. 各回でダウンロード回数が増えることを確認（1/3, 2/3, 3/3）
3. 4回目のダウンロードで403エラーを確認

---

### Phase 33h: OTP誤入力テスト

**目標**: 間違ったOTPで401エラー

**タスク**:
1. 正しくないOTPでダウンロード試行
2. 401エラーを確認
3. ダウンロード回数が増えないことを確認

---

### Phase 33i: ブラウザE2Eテスト

**目標**: ブラウザで完全なフローをテスト

**タスク**:
1. `index.html` でアップロード
2. `download.html` でOTP入力・ダウンロード
3. `manage.html` でファイル失効

---

## 🔗 重要なリンクとファイル

### ローカル
- 作業ディレクトリ: `D:\datagate-poc`
- テストファイル: `test-small.txt` (245 bytes, UTF-8, 日本語＋絵文字)

### Git
- リポジトリ: `https://github.com/138data/datagate-poc.git`
- 最新コミット: `5131921 - revert: Restore working Express.js version from commit 842f713`

### Vercel
- プロジェクトURL: `https://vercel.com/138datas-projects/datagate-poc`
- 現在のデプロイURL: `https://datagate-2on45zrb8-138datas-projects.vercel.app`

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
- `phase31b-to-phase32-handover.md` - Phase 31b→32 引き継ぎ
- `phase32b-fix-8-complete-handover.md` - Phase 32b-fix-8 引き継ぎ
- `phase32b-fix-9-complete-handover.md` - Phase 32b-fix-9 引き継ぎ

---

## 📝 次回セッション開始時に伝えること

```
138DataGateプロジェクトの続きです。

【前回の状況】
Phase 33e 途中:
- api/files/download.js が一度もCommonJS形式に変換されていないことが判明
- すべてのバージョンで ESM混在（import + module.exports）
- これが FUNCTION_INVOCATION_TIMEOUT の根本原因
- 修正版（完全CommonJS）を作成する準備完了

【今回やること】
Phase 33f: api/files/download.js を完全CommonJS形式に変換
1. 修正版を作成（import → require）
2. ファイル内容確認（import が残っていないか）
3. Git コミット・プッシュ
4. Vercel デプロイ
5. 動作テスト（GET/POST/ダウンロード回数更新）

【最初に実行するコマンド】
引き継ぎドキュメントの「Step 1: 修正版を作成」のPowerShellコマンド

【作業ディレクトリ】
D:\datagate-poc

【現在のデプロイURL】
https://datagate-2on45zrb8-138datas-projects.vercel.app

【Git最新コミット】
5131921 - revert: Restore working Express.js version from commit 842f713

【重要な仕様】
- 暗号化: AES-256-GCM
- OTP: 6桁数値
- TTL: 7日間
- 最大ダウンロード回数: 3回
- Vercel制限: 4.5MB

【テストファイル】
test-small.txt (245 bytes, UTF-8, 日本語＋絵文字)

引き継ぎドキュメント: phase33e-to-phase33f-handover.md
```

---

## 🎯 重要な技術的教訓

### 1. ESMとCommonJSの混在は絶対に避ける

**問題**:
```javascript
// ❌ 混在（Vercel環境でタイムアウト）
import { kv } from '@vercel/kv';
module.exports = async (req, res) => { ... };
```

**解決策**:
```javascript
// ✅ CommonJS形式に統一
const { kv } = require('@vercel/kv');
module.exports = async (req, res) => { ... };
```

### 2. Git履歴を徹底的に確認する

**教訓**: 
- 「修正した」と思っても、実際には変更されていないことがある
- `git show <commit>:<file>` で各コミットの内容を確認
- `git log --oneline --all -20` で履歴を確認

### 3. バックアップファイルを信用しない

**教訓**:
- バックアップファイルが正しいバージョンとは限らない
- Git履歴から復元する方が確実

### 4. Vercel環境の特性

**教訓**:
- Node.js ハンドラ形式（`async function handler(request)`）は、URLパラメータ取得が複雑
- Express.js形式（`async (req, res)`）の方が安定
- ESM混在は絶対に動かない

---

## 🚨 重要な注意事項

### 1. 必ずCommonJS形式に統一

**確認コマンド**:
```powershell
$content = Get-Content "D:\datagate-poc\api\files\download.js" -Encoding UTF8 -Raw
if ($content -match "import ") {
    Write-Host "❌ まだ import が残っています" -ForegroundColor Red
} else {
    Write-Host "✅ import は存在しません" -ForegroundColor Green
}
```

### 2. デプロイ後は必ずテスト

**テスト項目**:
1. GET エンドポイント（タイムアウトしないか）
2. POST エンドポイント（タイムアウトしないか）
3. ダウンロード回数更新（正しく増えるか）
4. ファイル内容（元のファイルと一致するか）

### 3. エラー時はロールバック

**ロールバックコマンド**:
```powershell
# 前のコミットに戻す
git reset --hard HEAD~1
git push origin main --force

# 再デプロイ
vercel --prod --force
```

---

**作成日時**: 2025年10月30日 11:00 JST  
**次回更新**: Phase 33f 完了時  
**重要度**: 🔴 Critical - これが動かないとプロジェクト全体が進まない  
**推定所要時間**: 修正・デプロイ・テストで約30-60分

---

**[完全版引き継ぎドキュメント]**
