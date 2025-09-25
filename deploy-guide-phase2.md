# 📋 DataGate Phase 2 - デプロイ手順書

## 1. 準備作業

```powershell
# PowerShellで実行
cd D:\datagate-poc
```

## 2. 最新状態の取得

```powershell
git pull
```

## 3. 新規ファイルの追加

以下のファイルをD:\datagate-pocフォルダに配置：

### index.js（既存ファイルを置き換え）
統合版のアプリケーションファイル（SMTP機能込み）

### package.json（既存ファイルを置き換え）
依存関係を更新（nodemailer, multer, dotenv追加）

### smtp-server.js（新規作成）
スタンドアロンSMTPサーバー（オプション）

### .env.template（新規作成）
環境変数のテンプレート

## 4. Gitコミット＆プッシュ

```powershell
# 変更を追加
git add .

# コミット
git commit -m "Phase 2: SMTP機能とPPAP検出機能を実装"

# GitHubへプッシュ
git push
```

## 5. Railway環境変数設定

Railway.appダッシュボードで以下の環境変数を設定：

```
BASE_URL = https://datagate-poc-production.up.railway.app
SECURE_LINK_EXPIRY_DAYS = 7
MAX_FILE_SIZE_MB = 10
```

## 6. 動作確認

### ローカルテスト
```powershell
npm install
node index.js
# ブラウザで http://localhost:3000 を開く
```

### 本番確認
- https://datagate-poc-production.up.railway.app にアクセス
- ヘルスチェック: https://datagate-poc-production.up.railway.app/health

## 7. テスト手順

1. ダッシュボードの「テストアップロード」セクションを使用
2. 以下を入力：
   - 送信者メール: test@example.com
   - 受信者メール: recipient@example.com
   - 件名: テストメール
   - 本文: パスワード: 12345
   - ZIPファイルを選択
3. 「テスト送信」をクリック
4. セキュアリンクが生成されることを確認
5. リンクをクリックしてダウンロードページを確認

## トラブルシューティング

### Gitプッシュでエラーが出る場合
```powershell
# Personal Access Tokenを使用
git push https://YOUR_TOKEN@github.com/138data/datagate-poc.git main
```

### npmインストールでエラーが出る場合
```powershell
# キャッシュクリア
npm cache clean --force
# 再インストール
npm install
```

### 文字化けする場合
- ファイルをUTF-8で保存し直す
- VSCodeで「ファイル」→「エンコード付きで保存」→「UTF-8」

## 完了チェックリスト

- [ ] index.js更新
- [ ] package.json更新
- [ ] smtp-server.js作成
- [ ] .env.template作成
- [ ] Gitコミット＆プッシュ
- [ ] Railway自動デプロイ確認
- [ ] ダッシュボード表示確認
- [ ] テストアップロード動作確認
- [ ] セキュアリンク生成確認
