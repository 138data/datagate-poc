# 📚 DataGate Upload API 実装ガイド

## ✅ 作成したファイル

1. **api/upload.js** - ファイルアップロードAPI
   - マルチパートフォームデータ処理
   - セキュアID生成（64文字）
   - OTP生成（6桁）
   - メモリストレージ

2. **api/download.js** - ファイルダウンロードAPI（更新版）
   - Upload APIとストレージ共有
   - OTP認証
   - ダウンロード制限（3回）
   - ファイル有効期限

3. **datagate-test.html** - 統合テストページ
   - ドラッグ＆ドロップ対応
   - リアルタイムステータス表示
   - 完全なアップロード/ダウンロードフロー

4. **vercel.json** - Vercel設定
   - APIルーティング
   - CORS設定
   - リダイレクト設定

## 🚀 デプロイ手順

### 1. ファイルをプロジェクトに配置

```powershell
# PowerShellで実行
cd D:\datagate-poc

# APIファイルをコピー
Copy-Item "api_upload.js" -Destination "api\upload.js"
Copy-Item "api_download.js" -Destination "api\download.js"

# 設定ファイルをコピー
Copy-Item "vercel.json" -Destination "vercel.json" -Force

# テストページをコピー
Copy-Item "datagate-test.html" -Destination "public\test-integration.html"
```

### 2. Gitにコミット＆プッシュ

```powershell
git add .
git commit -m "feat: Upload API実装 - ファイルアップロード/ダウンロード完全動作"
git push origin main
```

### 3. Vercelへデプロイ

```powershell
# Vercel CLIでデプロイ（推奨）
vercel --prod

# または自動デプロイを待つ（GitHub連携済みの場合）
```

## 🧪 動作テスト

### ローカルテスト

```powershell
# Vercel開発サーバー起動
vercel dev

# ブラウザでアクセス
Start-Process "http://localhost:3000/test-integration.html"
```

### 本番テスト

```powershell
# APIヘルスチェック
Invoke-RestMethod "https://datagate-poc.vercel.app/api/health"

# テストページアクセス
Start-Process "https://datagate-poc.vercel.app/test-integration.html"
```

## 📊 API仕様

### Upload API

**エンドポイント:** `POST /api/upload`

**リクエスト:**
```
Content-Type: multipart/form-data
- file: アップロードファイル
- recipientEmail: 受信者メールアドレス
```

**レスポンス:**
```json
{
  "success": true,
  "message": "ファイルが正常にアップロードされました",
  "fileId": "abc123...",
  "downloadLink": "/download/abc123...",
  "otp": "123456",
  "fileName": "document.pdf",
  "fileSize": 1024,
  "expiryDate": "2025-10-03T12:00:00Z"
}
```

### Download API

**エンドポイント:** `GET /api/download?id={fileId}`

ファイル情報を取得

**エンドポイント:** `POST /api/download?id={fileId}`

**リクエスト:**
```json
{
  "otp": "123456"
}
```

**レスポンス:** ファイルのバイナリデータ

## ⚠️ 注意事項

### 現在の制限

1. **メモリストレージ**
   - サーバー再起動でファイル消失
   - 最大10MBまで
   - Vercel無料プランの制限

2. **メール未実装**
   - OTPは画面表示（テスト用）
   - 本番ではSendGrid連携必要

3. **セキュリティ**
   - HTTPSは自動（Vercel）
   - ファイル暗号化は未実装

### 推奨事項

1. **Phase 2で実装**
   - AWS S3連携（永続化）
   - SendGridメール送信
   - データベース（MongoDB Atlas）

2. **セキュリティ強化**
   - ファイル暗号化
   - レート制限
   - ログ記録

## 📝 テストシナリオ

### 基本フロー

1. テストページを開く
2. ファイルをドラッグ＆ドロップ
3. メールアドレス入力
4. アップロード実行
5. 表示されたID/OTPをコピー
6. ダウンロードセクションでID/OTP入力
7. ダウンロード実行

### エラーケース

- 不正なOTP → エラー表示
- ダウンロード4回目 → 制限エラー
- 存在しないID → 404エラー

## 🎯 完成度

- ✅ ファイルアップロード
- ✅ セキュアID生成
- ✅ OTP生成
- ✅ ダウンロード認証
- ✅ ダウンロード制限
- ✅ CORS対応
- ✅ エラーハンドリング

**Phase 1.5 完了！** 🎉

---
作成日: 2025-09-26
作成者: 138DataGate Team
