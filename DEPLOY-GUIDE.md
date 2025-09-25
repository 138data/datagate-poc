# 📋 DataGate Phase 1 デプロイ手順書

## 🚀 クイックデプロイ手順

### 1. ローカルでの準備
```bash
# Windowsの場合（D:\datagate-poc）
cd D:\datagate-poc
git pull origin main

# 変更をコミット
git add .
git commit -m "Phase 1: ファイルアップロード/ダウンロード機能実装"
git push origin main
```

### 2. Vercelでの自動デプロイ
GitHubにプッシュすると、Vercelが自動的に以下を実行：
- コードの取得
- 依存関係のインストール
- ビルド
- デプロイ

### 3. 動作確認
```bash
# ヘルスチェック
curl https://datagate-poc.vercel.app/api/health

# ブラウザでアクセス
start https://datagate-poc.vercel.app
```

## 📦 手動デプロイ（必要な場合）

### Vercel CLIを使用
```bash
# Vercel CLIインストール（初回のみ）
npm i -g vercel

# プロジェクトディレクトリに移動
cd D:\datagate-poc

# デプロイ実行
vercel --prod
```

## ✅ デプロイ後の確認事項

### 基本機能テスト
1. [ ] トップページが表示される
2. [ ] ファイルアップロードフォームが動作
3. [ ] アップロード後にセキュアリンクが生成される
4. [ ] ダウンロードページが表示される
5. [ ] OTP入力フォームが動作

### セキュリティテスト
1. [ ] 不正なOTPでダウンロードできないことを確認
2. [ ] ダウンロード回数制限（3回）が機能
3. [ ] HTTPSで通信されている

## 🔧 トラブルシューティング

### ビルドエラーの場合
```bash
# package-lock.jsonを削除して再インストール
rm package-lock.json
npm install
git add package.json package-lock.json
git commit -m "Fix: 依存関係の更新"
git push
```

### デプロイが反映されない場合
1. Vercelダッシュボードにアクセス
2. プロジェクトを選択
3. "Deployments"タブを確認
4. 最新のデプロイが成功しているか確認

### ファイルアップロードが失敗する場合
- ファイルサイズが10MBを超えていないか確認
- Vercelの無料プランの制限を確認

## 📊 監視とログ

### Vercelダッシュボードで確認できる項目
- デプロイ履歴
- ランタイムログ
- 関数の実行時間
- エラーログ

### ローカルでのテスト
```bash
# ローカルサーバー起動
npm run dev

# 別ターミナルでテスト
curl http://localhost:3000/api/health
```

## 🔄 ロールバック手順

問題が発生した場合のロールバック：

1. Vercelダッシュボードにアクセス
2. "Deployments"タブを開く
3. 以前の安定版デプロイを選択
4. "..." メニューから "Promote to Production" を選択

または、Gitでロールバック：
```bash
# 前のコミットに戻す
git revert HEAD
git push origin main
```

## 📝 注意事項

### 現在の制限事項
- ファイルは一時的にメモリに保存（再起動で消失）
- メール送信は未実装（OTPはコンソールログに出力）
- 最大ファイルサイズ: 10MB
- Vercel無料プランの制限が適用

### 次のPhaseで対応予定
- 永続的なストレージ（AWS S3等）
- メール送信機能（SendGrid連携）
- データベース連携（MongoDB Atlas等）
- 管理画面の実装

## 🆘 サポート

問題が発生した場合：
1. GitHubのIssuesに報告
2. Vercelのログを確認
3. このドキュメントのトラブルシューティングを参照

---
最終更新: 2025年9月25日
Phase 1 実装完了
