# ✅ Phase 22準備完了チェックリスト

**プロジェクト**: 138DataGate  
**Phase**: 22準備（ノーコストAV仕込み）  
**作成日**: 2025年10月23日

---

## 📋 適用前の確認

### 環境確認
- [ ] Node.js 18.x以上がインストール済み
- [ ] Vercel CLIがインストール済み
- [ ] Gitリポジトリが最新の状態
- [ ] .env ファイルが存在する
- [ ] Vercel環境変数が設定済み（既存16個）

### バックアップ
- [ ] api/upload.js のバックアップ作成
- [ ] api/download.js のバックアップ作成
- [ ] .env のバックアップ作成
- [ ] データベース（KV）のバックアップ確認

---

## 🚀 パッチ適用

### ファイル置き換え
- [ ] api/upload.js を新版に置き換え
- [ ] api/download.js を新版に置き換え

### 環境変数追加
- [ ] Vercel: `AV_ENABLED=false` を追加
- [ ] Vercel: `AV_FAIL_OPEN=false` を追加
- [ ] ローカル(.env): `AV_ENABLED=false` を追加（オプション）
- [ ] ローカル(.env): `AV_FAIL_OPEN=false` を追加（オプション）

### Git操作
- [ ] `git add api/upload.js api/download.js .env`
- [ ] `git commit -m "chore: add no-cost AV scaffolding"`
- [ ] `git push origin main`

### デプロイ
- [ ] `vercel --prod` 実行
- [ ] デプロイ成功確認
- [ ] 本番URLにアクセス可能

---

## 🧪 動作確認

### テスト1: 正常なファイルアップロード
- [ ] テストファイル作成（test.txt）
- [ ] ヘッダー付きでアップロード
  - X-File-Name: test.txt
  - X-File-Type: text/plain
- [ ] レスポンスに `scanStatus` が含まれる
- [ ] `scanStatus` が `not_scanned` である

### テスト2: ファイル情報取得（GET）
- [ ] GET /api/download?id={fileId} 実行
- [ ] レスポンスに `scanStatus` が含まれる
- [ ] `remainingDownloads` が 3 である

### テスト3: ファイルダウンロード（POST）
- [ ] POST /api/download（OTP付き）実行
- [ ] ファイルが正常にダウンロードされる
- [ ] 内容が元のファイルと一致する

### テスト4: 禁止拡張子の拒否
- [ ] .exe ファイルのアップロード試行
- [ ] 400エラーが返る
- [ ] エラーメッセージ: "拡張子 .exe は許可されていません"
- [ ] .js ファイルのアップロード試行
- [ ] 400エラーが返る

### テスト5: 許可拡張子の受理
- [ ] .pdf ファイルのアップロード試行
- [ ] 正常にアップロードされる
- [ ] `scanStatus: not_scanned` が返る
- [ ] .docx ファイルのアップロード試行
- [ ] 正常にアップロードされる

### テスト6: 既存機能の維持
- [ ] OTP認証が正常に動作
- [ ] ダウンロード回数制限（3回）が正常に動作
- [ ] ファイル保持期間（7日TTL）が正常に動作
- [ ] 既存ファイルがダウンロード可能

### テスト7: 自動テストスクリプト
- [ ] `test-noav-patch.ps1` 実行
- [ ] すべてのテストが成功（緑表示）
- [ ] 成功率 100%

---

## 📊 確認項目

### コード確認
- [ ] api/upload.js に `AV_ENABLED` が定義されている
- [ ] api/upload.js に `ALLOWED_EXTENSIONS` が定義されている
- [ ] api/upload.js に `computeSha256()` が定義されている
- [ ] api/upload.js に `scanBuffer()` が定義されている
- [ ] api/upload.js の fileInfo に `scanStatus` が含まれる
- [ ] api/upload.js の fileInfo に `sha256` が含まれる
- [ ] api/download.js に `AV_ENABLED` が定義されている
- [ ] api/download.js の GET応答に `scanStatus` が含まれる
- [ ] api/download.js の POST配布前に AVゲートが存在する

### 環境変数確認
- [ ] Vercel Dashboard で `AV_ENABLED` を確認
- [ ] Vercel Dashboard で `AV_FAIL_OPEN` を確認
- [ ] ローカル .env で `AV_ENABLED` を確認（オプション）
- [ ] vercel env ls で環境変数一覧を確認

### ログ確認
- [ ] Vercel Logs でエラーがないことを確認
- [ ] `[Upload] Success` ログに `scanStatus` が含まれる
- [ ] `[Upload] Success` ログに `sha256` が含まれる

---

## 📝 ドキュメント確認

### ドキュメント作成
- [ ] README-PATCH-NOAV.md を確認
- [ ] env-template-phase22.txt を確認
- [ ] datagate-noav-setup.patch を確認
- [ ] test-noav-patch.ps1 を確認

### ドキュメント保存
- [ ] docs/ ディレクトリに保存
- [ ] Git commit
- [ ] Git push

---

## 🔮 将来の準備（参考）

### AV有効化時の手順
- [ ] `AV_ENABLED=true` に変更
- [ ] `scanBuffer()` の中身を実装
  - VirusTotal API、または
  - ClamAV REST API、または
  - Cloudmersive API
- [ ] 環境変数に API Key を追加
- [ ] 再デプロイ
- [ ] テスト実行

### 追加予定の環境変数（参考）
- [ ] `VIRUSTOTAL_API_KEY` (VirusTotal使用時)
- [ ] `CLAMAV_API_URL` (ClamAV使用時)
- [ ] `CLOUDMERSIVE_API_KEY` (Cloudmersive使用時)

---

## ⚠️ トラブルシューティング

### 問題発生時の確認
- [ ] ブラウザキャッシュをクリア（Ctrl+F5）
- [ ] Vercel Logs でエラー確認
- [ ] 環境変数が反映されているか確認
- [ ] 再デプロイ実行
- [ ] バックアップから復元（最終手段）

---

## ✅ 完了確認

### 最終チェック
- [ ] すべてのテストが成功
- [ ] 本番環境で動作確認完了
- [ ] ドキュメントが最新
- [ ] チームメンバーへの連絡完了
- [ ] 次のPhase（Phase 22本格実装）の計画作成

---

## 📞 連絡先

**問題が発生した場合**:
- メール: 138data@gmail.com
- プロジェクト: 138DataGate
- Phase: 22準備（ノーコストAV仕込み）

---

## 📊 進捗状況

```
Phase 22準備: ノーコストAV仕込み

□ 適用前の確認              [ ] / [ ]
□ パッチ適用                [ ] / [ ]
□ 動作確認                  [ ] / [ ]
□ ドキュメント確認          [ ] / [ ]
□ 最終チェック              [ ] / [ ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 22準備 完了率: [ ]%
```

---

**チェックリスト作成日**: 2025年10月23日  
**最終更新日**: 2025年10月23日  
**ステータス**: Phase 22準備中

---

*このチェックリストを使用して、Phase 22準備を確実に完了させてください。*
