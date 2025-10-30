# 📦 Phase 36: デプロイ手順（修正版）

**方針**: 短寿命URL方式（Phase 35a-v2 準拠）で実装

---

## 🎯 実装内容の確認

### ✅ 修正済み
- **API**: OTP検証 → 短寿命Blob作成 → JSON で `downloadUrl` 返却
- **フロントエンド**: JSON の `downloadUrl` で直DL（`response.blob()` 不使用）
- **KV**: `blobKey` のみ保存（`blobUrl` は都度発行）
- **multer**: 2.x に更新
- **SendGrid API キー**: ローテーション必要

### ❌ 旧方式（絶対に使わない）
- 関数がバイナリ返送
- `response.blob()` でダウンロード
- KV に `blobUrl` 恒久保存

---

## 📂 ファイル配置

### Step 1: 修正版ファイルをダウンロード

ダウンロードしたファイル:
- `download-fixed.js` → `api/files/download.js`
- `download-fixed.html` → `public/download.html`
- `vercel.json` → `vercel.json`（ルート）
- `package.json` → `package.json`（ルート）

### Step 2: ローカル作業ディレクトリに配置

```powershell
# 作業ディレクトリに移動
cd D:\datagate-poc

# ファイル配置
# 1. download-fixed.js → api/files/download.js にリネーム
# 2. download-fixed.html → public/download.html にリネーム
# 3. vercel.json → vercel.json（既存を上書き）
# 4. package.json → package.json（既存を上書き）

# ディレクトリ構造確認
Get-ChildItem -Path . -Recurse -Include download.html,download.js,vercel.json,package.json | Select-Object FullName

# 期待される出力:
# D:\datagate-poc\public\download.html
# D:\datagate-poc\api\files\download.js
# D:\datagate-poc\vercel.json
# D:\datagate-poc\package.json
```

### Step 3: 依存関係の更新（multer 2.x）

```powershell
# package-lock.json を削除
Remove-Item -Path "D:\datagate-poc\package-lock.json" -Force -ErrorAction SilentlyContinue

# 依存関係を再インストール
npm install

# multer 2.x がインストールされたか確認
npm list multer
# 期待される出力: multer@2.0.0
```

---

## 🔐 SendGrid API キーのローテーション

### ⚠️ 重要: 即座に実施してください

```powershell
# 詳細は sendgrid-key-rotation.md を参照
notepad D:\datagate-poc\sendgrid-key-rotation.md

# 手順:
# 1. SendGrid で新しい API キーを発行
# 2. Vercel 環境変数を更新（Production / Preview / Development）
# 3. ローカル .env.local を更新
# 4. SendGrid で古い API キーを削除
```

---

## 🚀 Git コミット・デプロイ

### Step 1: Git ステージング

```powershell
# ブランチ確認
git branch
# → * phase35b-client-direct-upload

# ステージング
git add public/download.html
git add api/files/download.js
git add vercel.json
git add package.json
git add package-lock.json

# ステータス確認
git status
```

### Step 2: コミット

```powershell
# コミット（詳細なメッセージ）
git commit -m "feat(phase36): implement short-lived URL download (Phase 35a-v2 compliant)

- API: OTP verification → temp Blob → JSON response with downloadUrl
- Frontend: Direct download via downloadUrl (no response.blob())
- KV: Store blobKey only (no blobUrl)
- Security: IP-based OTP rate limiting (5 attempts, 15min cooldown)
- Audit: Log download_url_issued events
- Dependencies: Upgrade multer to 2.x
- Config: Add /d rewrite rule in vercel.json

Fixes: Phase 35b download 404 error
Breaking: Remove binary response from download API"
```

### Step 3: プッシュ

```powershell
# プッシュ
git push origin phase35b-client-direct-upload

# デプロイ待機（約2分）
Write-Host "Waiting for Vercel deployment..." -ForegroundColor Yellow
Start-Sleep -Seconds 120
```

### Step 4: デプロイURL確認

```powershell
# 最新デプロイURL取得
$deployments = vercel ls --json | ConvertFrom-Json
$latestUrl = $deployments[0].url
Write-Host "Latest deployment: https://$latestUrl" -ForegroundColor Green

# ブラウザで開く
Start-Process "msedge.exe" -ArgumentList "-inprivate", "https://$latestUrl"
```

---

## 🧪 動作確認（重要）

### テスト 1: 正常系（短寿命URL方式）

```powershell
# 1. ファイルアップロード
# https://<preview-url> にアクセス
# ファイルを選択 → 宛先: 138data@gmail.com → アップロード

# 2. メール受信確認
# Gmail を開く → "File reception notification" メールを確認
# OTP（6桁数値）をメモ

# 3. ダウンロードリンクをクリック
# メール内の "Download File" ボタンをクリック
# → /download.html が表示される（404 にならない）

# 4. ファイル情報が表示される
# ファイル名、サイズ、送信元、有効期限、残りDL回数

# 5. OTP入力 → ダウンロード
# メモした OTP を入力 → "認証してダウンロード" ボタンをクリック
# → "ダウンロードリンクを発行しました！60秒以内にダウンロードが開始されます。"
# → ファイルが自動ダウンロードされる

# 6. 開発者ツールで確認
# F12 → Network タブ
# POST /api/files/download → Status 200 → Response Type: json
# Response Body: { "downloadUrl": "https://...", "fileName": "...", "expiresInSec": 60, ... }
```

### テスト 2: OTP試行回数制限

```powershell
# 1. 誤った OTP を5回入力
# → "認証コードが正しくありません。あと4回試行できます。"
# → "認証コードが正しくありません。あと3回試行できます。"
# → ...
# → "試行回数の上限に達しました。15分後に再度お試しください。"

# 2. 15分後に再度試行
# → 正常にダウンロード可能
```

### テスト 3: ダウンロード回数制限

```powershell
# 1. 同じファイルを3回ダウンロード
# → 1回目: 成功（残り2回）
# → 2回目: 成功（残り1回）
# → 3回目: 成功（残り0回）

# 2. 4回目のダウンロード試行
# → "ダウンロード回数の上限に達しました。"
```

### テスト 4: 日本語ファイル名

```powershell
# 1. 日本語ファイル名でアップロード
# ファイル名: "テスト文書_2025.txt"

# 2. ダウンロード
# → ダウンロードされたファイル名が "テスト文書_2025.txt" になる
# （文字化けしない）
```

### テスト 5: 短寿命URL の有効期限

```powershell
# 1. OTP入力 → 短寿命URL発行
# → JSON レスポンスで downloadUrl を取得

# 2. 60秒以上待機
# → ブラウザで直接 downloadUrl にアクセス
# → 404 または 403 エラー（Blob が削除されている）
```

---

## 📊 成功基準チェックリスト（修正版）

### 機能要件
- [ ] `/d?fileId=...&token=...` で 404 にならない
- [ ] ファイル情報が正しく表示される
- [ ] OTP入力 → JSON で `downloadUrl` が返却される
- [ ] `downloadUrl` で直接ダウンロードできる
- [ ] ダウンロードされたファイルが正常に開ける
- [ ] 日本語ファイル名が正しく表示される
- [ ] 試行回数制限が機能する（5回、15分クールダウン）
- [ ] ダウンロード回数制限が機能する（3回まで）
- [ ] 有効期限切れファイルはダウンロードできない

### 技術要件
- [ ] POST /api/files/download は常に JSON を返す（バイナリ返送なし）
- [ ] KV に `blobKey` のみ保存（`blobUrl` なし）
- [ ] 短寿命Blob は60秒で有効期限切れ
- [ ] 監査ログに `download_url_issued` イベントが記録される
- [ ] multer 2.x がインストールされている
- [ ] エラーハンドリングが適切
- [ ] ログが適切に出力される

### セキュリティ要件
- [ ] OTP検証が正しく機能する
- [ ] IP単位の試行回数制限が機能する
- [ ] ファイル復号化が正常に動作する
- [ ] 不正なアクセスが拒否される
- [ ] エラーメッセージが適切（情報漏洩なし）
- [ ] SendGrid API キーがローテート済み
- [ ] handover から API キーが削除済み

### Phase 35a-v2 準拠確認
- [ ] 関数がバイナリを返送しない（JSON のみ）
- [ ] `response.blob()` を使用していない
- [ ] KV に `blobUrl` を保存していない
- [ ] 短寿命URL方式で実装されている

---

## 🔄 ロールバック手順（問題発生時）

```powershell
# 1. 問題のあるコミットを特定
git log --oneline -5

# 2. 前のコミットに戻る
git revert HEAD

# 3. プッシュ
git push origin phase35b-client-direct-upload

# 4. Vercel が自動的に再デプロイ
```

---

## 📝 次のステップ（Phase 37）

### P0: Production マージ
```powershell
# main ブランチにマージ
git checkout main
git merge phase35b-client-direct-upload
git push origin main

# Production デプロイ確認
Start-Process "https://datagate-poc.vercel.app"
```

### P1: 管理画面
- ファイル一覧表示
- 監査ログ表示（`download_url_issued` イベント含む）
- 手動削除機能

### P2: エラーハンドリング強化
- より詳細なログ
- エラー通知（管理者向け）

---

**作成日時**: 2025年10月30日  
**Phase**: 36（修正版）  
**方針**: Phase 35a-v2 準拠（短寿命URL方式）  
**重要度**: 🔴 Critical - SendGrid API キーのローテーション必須
