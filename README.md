# DataGate - PPAP離脱セキュアファイル転送システム

## 🎯 概要
DataGateは、PPAP（パスワード付きZIPファイルのメール送信）から脱却し、セキュアなファイル転送を実現するWebアプリケーションです。

## 🚀 現在の機能（Phase 1）

### ✅ 実装済み機能
- **ファイルアップロード**: ブラウザから直接ファイルをアップロード
- **セキュアリンク生成**: ランダムな一意のIDでアクセス制御
- **OTP認証**: 6桁のワンタイムパスワードによる認証
- **ダウンロード制限**: 最大3回までのダウンロード制限
- **レスポンシブUI**: モバイル対応のモダンなインターフェース

### 📋 今後の実装予定（Phase 2-3）
- [ ] メール通知（SendGrid/Gmail API連携）
- [ ] ファイルの暗号化保存
- [ ] ダウンロード有効期限の設定
- [ ] 管理者ダッシュボード
- [ ] ログ記録と監査機能
- [ ] 外部ストレージ連携（AWS S3等）

## 🛠 技術スタック
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Hosting**: Vercel
- **File Upload**: Multer
- **Authentication**: OTP (One-Time Password)

## 📦 セットアップ

### ローカル開発環境
```bash
# リポジトリのクローン
git clone https://github.com/138data/datagate-poc.git
cd datagate-poc

# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```

### Vercelへのデプロイ
```bash
# Vercel CLIのインストール
npm i -g vercel

# デプロイ
vercel
```

## 🔒 セキュリティ機能
- **OTP認証**: メールアドレスに送信される6桁のコード
- **ダウンロード制限**: 不正アクセス防止のため回数制限
- **セキュアリンク**: 推測困難な64文字のランダムID
- **HTTPS通信**: Vercelによる自動SSL証明書

## 📝 使用方法

### ファイル送信者
1. DataGateにアクセス
2. ファイルを選択
3. 受信者のメールアドレスを入力
4. アップロードボタンをクリック
5. 生成されたリンクを受信者に共有

### ファイル受信者
1. 共有されたリンクにアクセス
2. メールで受信したOTPを入力
3. ダウンロードボタンをクリック

## 🌐 デプロイURL
- **本番環境**: https://datagate-poc.vercel.app
- **ヘルスチェック**: https://datagate-poc.vercel.app/api/health

## 📂 ディレクトリ構成
```
datagate-poc/
├── api/
│   └── index.js        # メインアプリケーション
├── public/             # 静的ファイル（今後追加予定）
├── vercel.json         # Vercel設定
├── package.json        # プロジェクト設定
└── README.md          # このファイル
```

## 🤝 貢献
プルリクエストや機能提案は歓迎します。

## 📄 ライセンス
MIT

## 📞 サポート
問題が発生した場合は、GitHubのIssuesでお知らせください。