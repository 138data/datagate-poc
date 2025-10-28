# 📝 Phase 32b-fix-2 完全引き継ぎドキュメント

作成日時: 2025年10月28日 18:30 JST

---

## 📅 現在の状況

### ✅ Phase 32b-fix-1 完了内容

1. ✅ `lib/email-service.js` - OTP送信メール + 開封通知メール追加
2. ✅ `api/files/download.js` - OTP送信エンドポイント + 開封通知機能
3. ✅ `api/admin/config.js` - 開封通知設定API追加
4. ✅ `api/upload.js` - レスポンスからOTP削除 + **manageUrl追加完了**
5. ✅ `public/download.html` - 2段階UI配置完了
6. ✅ `public/index.html` - OTP表示削除版配置完了
7. ✅ Git コミット・プッシュ成功 - `66b8d63`

### 🚀 現在のデプロイ状態

**デプロイURL**: `https://datagate-dhygshsgc-138datas-projects.vercel.app`

**Git最新コミット**: `66b8d63`

---

## 🔍 Phase 32b-fix-2 で発見した問題

### 問題1: FUNCTION_INVOCATION_FAILED エラー

**症状**:
```
GET /api/files/download?id={fileId}
→ A server error has occurred FUNCTION_INVOCATION_FAILED

POST /api/files/download/request-otp
→ エラー（JSON パース失敗）
```

**原因**: Vercel のルーティング問題
- `/api/files/download/request-otp` は別ファイルとして認識される
- `api/files/download.js` 内の `pathname.includes('/request-otp')` では動作しない

**対策**: `api/files/download/request-otp.js` を別ファイルとして作成する必要がある

---

### 問題2: 添付直送モードが有効

**症状**:
```json
{
  "email": {
    "mode": "attach"  // 添付直送になっている
  }
}
```

**確認事項**:
- `ENABLE_DIRECT_ATTACH=true` が設定されている
- `datagate@138io.com` は許可ドメイン内
- ファイルは直接メールに添付されている（OTP不要）

---

### 問題3: 設計仕様との不整合（重要）

ユーザーからの指摘により、以下の不整合が判明：

#### 3-1. 受信画面の「メール入力ステップ」が不要

**現状**: 
```
Step 1: メールアドレス入力 → OTP送信
Step 2: OTP入力 → ダウンロード
```

**正しい仕様**:
```
Step 1: 宛先（マスク表示）+ 「認証コードを送信」ボタン
Step 2: OTP入力 → ダウンロード
```

**理由**: 
- 宛先はサーバー側に保存済み（`metadata.recipient`）
- 受信者がメールアドレスを入力する必要はない
- メールアドレスはマスク表示のみ（例: `d***@138io.com`）

#### 3-2. manageUrl（送信者専用管理リンク）が UI に未表示

**現状**:
- `api/upload.js` のレスポンスに `manageUrl` を追加済み ✅
- しかし、`public/index.html` に表示処理がない ❌

**正しい仕様**:
```javascript
// アップロード成功時のレスポンス
{
  "success": true,
  "fileId": "...",
  "manageUrl": "https://.../manage.html?id=...&token=...",
  "email": { ... }
}
```

**UI に必要な表示**:
```
✅ 送信完了！

[管理リンク（送信者専用）]
このリンクから、誤送信時にファイルを失効できます。

📧 受信者の操作手順:
1. メールに届いたリンクをクリック
2. 「認証コードを送信」ボタンをクリック
3. 認証コード（6桁）を入力してダウンロード
```

#### 3-3. public/manage.html が未作成

**必要な機能**:
- `?id={fileId}&token={manageToken}` でアクセス
- トークン検証（`metadata.manageToken` と一致するか）
- ファイル情報表示
- **「失効」ボタン** → `metadata.revokedAt` を現在時刻に設定
- 失効後は受信者がダウンロードできなくなる（403 エラー）

---

## 🔧 Phase 32b-fix-2 で完了した作業

### ✅ 1. api/upload.js の更新

**変更内容**:
- `manageToken` 生成を追加
- `metadata.manageToken` と `metadata.revokedAt: null` を追加
- レスポンスに `manageUrl` を追加

**ファイル配置**: 完了（2025/10/28 18:22:41）

**Git 状態**: 未コミット

---

## ⏳ Phase 32b-fix-2 で残っている作業

### 1. api/files/download.js の確認

**確認コマンド**:
```powershell
# maxDownloads がレスポンスに含まれているか確認
Get-Content api/files/download.js -Encoding UTF8 | Select-String "maxDownloads" -Context 5

# revokedAt のチェックがあるか確認
Get-Content api/files/download.js -Encoding UTF8 | Select-String "revokedAt" -Context 5
```

**期待される動作**:
- GET レスポンスに `maxDownloads` が含まれる
- `metadata.revokedAt` が設定されている場合、403 エラーを返す

---

### 2. api/files/download/request-otp.js の作成

**目的**: Vercel ルーティング対応

**実装内容**:
```javascript
// POST /api/files/download/request-otp
// Body: { fileId: string }  ← email は不要
export default async function handler(request) {
  const { fileId } = await request.json();
  
  // メタデータ取得
  const metadata = await kv.get(`file:${fileId}:meta`);
  
  // revokedAt チェック
  if (metadata.revokedAt) {
    return Response(403, { error: 'ファイルは失効されています' });
  }
  
  // OTP送信（metadata.recipient 宛て）
  await sendOTPEmail({
    to: metadata.recipient,
    fileId,
    fileName: metadata.fileName,
    otp: metadata.otp
  });
  
  // 宛先のマスク表示を返す
  return Response(200, {
    success: true,
    maskedEmail: maskEmail(metadata.recipient)  // 例: "d***@138io.com"
  });
}
```

---

### 3. public/download.html の修正

**変更内容**:
- **Step 1**: メールアドレス入力を削除
- 宛先のマスク表示を追加（例: `d***@138io.com`）
- 「認証コードを送信」ボタンのみ

**修正前**:
```html
<input type="email" id="email-input" placeholder="例: user@example.com">
<button id="request-otp-btn">認証コードを送信</button>
```

**修正後**:
```html
<p>送信先: <span id="masked-email">読み込み中...</span></p>
<button id="request-otp-btn">認証コードを送信</button>
```

**JavaScript 修正**:
```javascript
// ページ読み込み時にファイル情報を取得してマスク表示
async function loadFileInfo() {
  const response = await fetch(`/api/files/download?id=${fileId}`);
  const data = await response.json();
  
  // マスク表示
  document.getElementById('masked-email').textContent = data.maskedEmail;
}

// OTP送信（emailパラメータ不要）
requestOtpBtn.addEventListener('click', async () => {
  const response = await fetch('/api/files/download/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId })  // email は送らない
  });
});
```

---

### 4. public/index.html の修正

**変更内容**:
- アップロード成功時に `manageUrl` を表示

**修正箇所**:
```javascript
// アップロード成功時
if (data.success) {
  // 既存のコード...
  
  // 管理リンクを表示
  if (data.manageUrl) {
    const manageHtml = `
      <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 8px;">
        <strong>🔑 管理リンク（送信者専用）</strong><br>
        <p style="font-size: 13px; color: #856404; margin: 10px 0;">
          誤送信の場合、このリンクからファイルを失効できます。
        </p>
        <a href="${data.manageUrl}" target="_blank" style="color: #667eea; font-weight: 600;">
          管理ページを開く →
        </a>
      </div>
    `;
    document.getElementById('result-section').insertAdjacentHTML('beforeend', manageHtml);
  }
}
```

---

### 5. public/manage.html の新規作成

**機能**:
- URL パラメータから `id` と `token` を取得
- ファイル情報を表示
- 失効ボタン → `PUT /api/files/revoke`

**実装例**:
```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>ファイル管理 - 138DataGate</title>
</head>
<body>
  <div class="container">
    <h1>📋 ファイル管理</h1>
    
    <div id="file-info"></div>
    
    <button id="revoke-btn" class="btn-danger">
      ⚠️ このファイルを失効する
    </button>
    
    <p class="warning">
      失効すると、受信者はダウンロードできなくなります。<br>
      この操作は取り消せません。
    </p>
  </div>
  
  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const fileId = urlParams.get('id');
    const token = urlParams.get('token');
    
    // 失効処理
    document.getElementById('revoke-btn').addEventListener('click', async () => {
      if (!confirm('本当に失効しますか？この操作は取り消せません。')) {
        return;
      }
      
      const response = await fetch('/api/files/revoke', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, token })
      });
      
      if (response.ok) {
        alert('ファイルを失効しました');
        location.reload();
      } else {
        alert('失効に失敗しました');
      }
    });
  </script>
</body>
</html>
```

---

### 6. api/files/revoke.js の新規作成

**実装内容**:
```javascript
// PUT /api/files/revoke
// Body: { fileId: string, token: string }
export default async function handler(request) {
  const { fileId, token } = await request.json();
  
  // メタデータ取得
  const metadata = await kv.get(`file:${fileId}:meta`);
  
  if (!metadata) {
    return Response(404, { error: 'ファイルが見つかりません' });
  }
  
  // トークン検証
  if (metadata.manageToken !== token) {
    return Response(403, { error: '無効なトークンです' });
  }
  
  // 既に失効済み
  if (metadata.revokedAt) {
    return Response(200, { success: true, message: '既に失効済みです' });
  }
  
  // 失効
  metadata.revokedAt = new Date().toISOString();
  await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata));
  
  return Response(200, { success: true });
}
```

---

## 🧪 次回セッションの開始手順

### Step 1: 状況確認コマンド

```powershell
cd D:\datagate-poc

# Git 状態確認
git status

# 現在のデプロイURL
$deployUrl = "https://datagate-dhygshsgc-138datas-projects.vercel.app"
```

---

### Step 2: api/files/download.js の確認

```powershell
# maxDownloads がレスポンスに含まれているか確認
Get-Content api/files/download.js -Encoding UTF8 | Select-String "maxDownloads" -Context 5

# revokedAt のチェックがあるか確認
Get-Content api/files/download.js -Encoding UTF8 | Select-String "revokedAt" -Context 5
```

**この結果を共有** → Claude が必要な修正を判断します

---

### Step 3: 修正ファイルのダウンロードと配置

Claude が提供する以下のファイルをダウンロード：
1. `api/files/download/request-otp.js`（新規）
2. `public/download.html`（修正版）
3. `public/index.html`（修正版）
4. `public/manage.html`（新規）
5. `api/files/revoke.js`（新規）

配置コマンド:
```powershell
$downloadFolder = "$env:USERPROFILE\Downloads"

# 各ファイルを配置
Copy-Item "$downloadFolder\request-otp.js" -Destination "D:\datagate-poc\api\files\download\request-otp.js" -Force
Copy-Item "$downloadFolder\download.html" -Destination "D:\datagate-poc\public\download.html" -Force
Copy-Item "$downloadFolder\index.html" -Destination "D:\datagate-poc\public\index.html" -Force
Copy-Item "$downloadFolder\manage.html" -Destination "D:\datagate-poc\public\manage.html" -Force
Copy-Item "$downloadFolder\revoke.js" -Destination "D:\datagate-poc\api\files\revoke.js" -Force

Write-Host "✅ すべてのファイルを配置しました" -ForegroundColor Green
```

---

### Step 4: Git コミット・プッシュ

```powershell
# 変更をステージング
git add api/upload.js
git add api/files/download.js
git add api/files/download/request-otp.js
git add api/files/revoke.js
git add public/download.html
git add public/index.html
git add public/manage.html

# コミット
git commit -m "fix: Complete OTP flow redesign + sender management feature

- Remove email input from download page (use masked email)
- Add request-otp.js as separate endpoint for Vercel routing
- Add manageUrl to upload response
- Add manage.html for sender-side file revocation
- Add revoke.js API endpoint
- Update download.html to show masked email only
- Update index.html to display management link

Security:
- Recipient email stored server-side (metadata.recipient)
- Management token for sender-only revocation
- revokedAt check in all download endpoints

UX:
- Simplified download flow (no email input required)
- Sender can revoke files immediately via management link"

# プッシュ
git push origin main
```

---

### Step 5: Vercel デプロイ

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

### Step 6: 動作テスト

```powershell
# 新しいデプロイURL
$deployUrl = "https://datagate-<新しいID>-138datas-projects.vercel.app"

# テスト1: ファイルアップロード
$response = curl.exe -X POST "$deployUrl/api/upload" `
  -F "file=@test-small.txt" `
  -F "recipient=datagate@138io.com" `
  --silent

$json = $response | ConvertFrom-Json
$fileId = $json.fileId
$manageUrl = $json.manageUrl

Write-Host "fileId: $fileId"
Write-Host "manageUrl: $manageUrl"

# テスト2: ファイル情報取得
$response = curl.exe -X GET "$deployUrl/api/files/download?id=$fileId" --silent
Write-Host $response

# テスト3: OTP送信（email パラメータなし）
$body = @{ fileId = $fileId } | ConvertTo-Json
$response = curl.exe -X POST "$deployUrl/api/files/download/request-otp" `
  -H "Content-Type: application/json" `
  -d $body `
  --silent
Write-Host $response

# テスト4: ブラウザでダウンロードページを開く
Write-Host "`n🌐 ブラウザでテスト:"
Write-Host "  $deployUrl/download.html?id=$fileId"
Write-Host "  $manageUrl"
```

---

## 📊 プロジェクト全体の進捗

| Phase | タスク | 状態 |
|---|---|---|
| Phase 1-31b | 基本機能実装 | ✅ 完了 |
| Phase 32a | 添付直送機能テスト | ✅ 完了 |
| Phase 32b | 管理画面実装 | ✅ 完了 |
| Phase 32b-fix-1 | OTP送信フロー修正 | ✅ 完了 |
| **Phase 32b-fix-2** | **設計仕様準拠への修正** | **🔄 進行中** |

---

## 🔗 重要ファイルの場所

### ローカル
- 作業ディレクトリ: `D:\datagate-poc`
- テストファイル: `test-small.txt` (245 bytes, UTF-8, 日本語＋絵文字)

### Vercel
- デプロイURL: `https://datagate-dhygshsgc-138datas-projects.vercel.app`
- プロジェクト: `https://vercel.com/138datas-projects/datagate-poc`

### Git
- リポジトリ: `https://github.com/138data/datagate-poc.git`
- 最新コミット: `66b8d63`

---

## 📝 次回セッション開始時に伝えること

```
138DataGateプロジェクトの続きです。

【前回の状況】
Phase 32b-fix-2 途中:
- api/upload.js: manageUrl追加完了（未コミット）
- 設計仕様との不整合を発見（メール入力不要、管理リンク未表示）
- api/files/download.js の確認が必要

【今回やること】
1. api/files/download.js の確認（maxDownloads, revokedAt）
2. api/files/download/request-otp.js の作成
3. public/download.html の修正（メール入力削除）
4. public/index.html の修正（管理リンク表示）
5. public/manage.html の新規作成
6. api/files/revoke.js の新規作成
7. Git コミット・デプロイ・テスト

【確認コマンド（最初に実行）】
```powershell
cd D:\datagate-poc
Get-Content api/files/download.js -Encoding UTF8 | Select-String "maxDownloads" -Context 5
Get-Content api/files/download.js -Encoding UTF8 | Select-String "revokedAt" -Context 5
```

【作業ディレクトリ】
D:\datagate-poc

【現在のデプロイURL】
https://datagate-dhygshsgc-138datas-projects.vercel.app

【環境変数（Production）】
✅ すべて設定済み
✅ ENABLE_DIRECT_ATTACH=true（添付直送有効）
✅ ADMIN_PASSWORD 設定済み

引き継ぎドキュメント: このメッセージ
```

---

## 🎯 重要な設計原則

1. **メールアドレス入力は不要**
   - 受信者は `metadata.recipient` としてサーバー側に保存済み
   - ダウンロードページではマスク表示のみ（例: `d***@138io.com`）

2. **送信者専用管理リンク**
   - `manageUrl` で送信者のみがファイルを失効可能
   - `metadata.manageToken` でトークン検証
   - `metadata.revokedAt` 設定で即座に失効

3. **OTP送信フロー**
   - POST `/api/files/download/request-otp` に `email` パラメータ不要
   - `fileId` のみで `metadata.recipient` 宛てに送信
   - レスポンスにマスク済みメールアドレスを返す

4. **失効チェック**
   - すべてのダウンロードエンドポイントで `metadata.revokedAt` をチェック
   - 失効済みの場合は 403 エラー

---

**作成日時**: 2025年10月28日 18:30 JST  
**次回更新**: Phase 32b-fix-2 完了時  
**重要度**: 🔴 High - 設計仕様準拠のための重要な修正  
**推定所要時間**: 約60分

---

**[完全版引き継ぎドキュメント]**
