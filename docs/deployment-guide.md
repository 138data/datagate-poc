# 📘 138DataGate - デプロイ手順書

**最終更新日**: 2025年10月14日  
**バージョン**: 1.0  
**対象**: 138DataGate PPAP離脱ソフト

---

## 📌 目次

1. [前提条件](#前提条件)
2. [デプロイ手順](#デプロイ手順)
3. [環境変数設定](#環境変数設定)
4. [動作確認](#動作確認)
5. [トラブルシューティング](#トラブルシューティング)
6. [ロールバック手順](#ロールバック手順)
7. [メンテナンス](#メンテナンス)

---

## 前提条件

### 必要なアカウント

| サービス | 用途 | プラン |
|---------|------|--------|
| Vercel | ホスティング | Pro ($20/月) |
| Upstash | Redis (KV) | Free〜 |
| Gmail | SMTP送信 | 無料 |

### 必要なツール

| ツール | バージョン | インストール |
|-------|-----------|-------------|
| Node.js | 18.x以上 | https://nodejs.org/ |
| Vercel CLI | 最新版 | `npm i -g vercel` |
| Git | 最新版 | https://git-scm.com/ |

### アクセス権限

- Vercelプロジェクトの管理者権限
- Upstashダッシュボードへのアクセス
- Gmailアカウント（アプリパスワード生成可能）

---

## デプロイ手順

### 手順1: プロジェクトの準備

#### 1-1. プロジェクトディレクトリに移動

```powershell
cd D:\datagate-poc
```

#### 1-2. 依存関係のインストール

```powershell
npm install
```

#### 1-3. ローカルテスト

```powershell
vercel dev
```

ブラウザで `http://localhost:3000/admin-login.html` にアクセスして動作確認。

---

### 手順2: Vercelプロジェクトの設定

#### 2-1. Vercelにログイン

```powershell
vercel login
```

メールアドレスを入力し、届いたメールのリンクをクリック。

#### 2-2. プロジェクトのリンク

```powershell
vercel
```

対話形式で以下を選択：
- Set up and deploy: **Yes**
- Scope: **138data**
- Link to existing project: **No**
- Project name: **datagate**
- Directory: **./（デフォルト）**

#### 2-3. プランのアップグレード

Vercel Dashboard → Settings → Billing → **Pro Plan ($20/月)** に変更

**理由**: Cron Jobs機能を使用するため

---

### 手順3: Upstash Redis (KV) の設定

#### 3-1. Upstashダッシュボードにログイン

https://console.upstash.com/

#### 3-2. Redisデータベース作成

1. **Create Database** をクリック
2. 設定:
   - Name: `138datagate-kv`
   - Type: `Regional`
   - Region: `ap-southeast-1` (Singapore)
   - TLS: `Enabled`

#### 3-3. 接続情報の取得

**Redis** タブから以下をコピー:
- `REDIS_URL`
- `REDIS_REST_URL`
- `REDIS_REST_TOKEN`
- `REDIS_REST_READ_ONLY_TOKEN`

**Vercel KV互換** のため、以下の環境変数名でも設定:
- `KV_URL` = `REDIS_URL`
- `KV_REST_API_URL` = `REDIS_REST_URL`
- `KV_REST_API_TOKEN` = `REDIS_REST_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN` = `REDIS_REST_READ_ONLY_TOKEN`

---

### 手順4: Gmail SMTP設定

#### 4-1. アプリパスワードの生成

1. Googleアカウント → セキュリティ
2. 2段階認証プロセスを有効化
3. アプリパスワード → 「メール」を選択
4. 生成されたパスワードをコピー（16文字）

#### 4-2. SMTP情報の確認

| 設定項目 | 値 |
|---------|-----|
| SMTP_HOST | smtp.gmail.com |
| SMTP_PORT | 587 |
| SMTP_USER | 138data@gmail.com |
| SMTP_PASS | （アプリパスワード） |
| SMTP_FROM | 138data@gmail.com |

---

### 手順5: 環境変数の設定

#### 5-1. Vercel Dashboardで設定

Vercel Dashboard → Settings → Environment Variables

以下の13個の環境変数を設定：

**認証・セキュリティ**:
```
JWT_SECRET=fd37f46bbfc56f84a4dfc5efdd78b69464036a7de70b92ec5096b30dd6010141
FILE_ENCRYPT_KEY=1a90cba0e882bba6754efb299e34368c736b27a8f63f5b679cdaf436bd97e4cf
CRON_SECRET=8551f8f77176e90113b873c641576459
```

**SMTP設定**:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=138data@gmail.com
SMTP_PASS=（Gmailアプリパスワード）
SMTP_FROM=138data@gmail.com
```

**Redis (KV) 設定**:
```
KV_URL=rediss://default:ASeLAAIncDE...@literate-badger-10123.upstash.io:6379
KV_REST_API_URL=https://literate-badger-10123.upstash.io
KV_REST_API_TOKEN=ASeLAAIncDE...
KV_REST_API_READ_ONLY_TOKEN=AieLAAIgcDE...
REDIS_URL=rediss://default:ASeLAAIncDE...@literate-badger-10123.upstash.io:6379
```

**環境の選択**:
- ✅ Production
- ✅ Preview
- ✅ Development

#### 5-2. 環境変数の生成方法（参考）

**JWT_SECRET, FILE_ENCRYPT_KEY** (64文字):
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**CRON_SECRET** (32文字):
```powershell
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

---

### 手順6: 本番環境へのデプロイ

#### 6-1. デプロイ実行

```powershell
cd D:\datagate-poc
vercel --prod
```

#### 6-2. デプロイ完了確認

出力例:
```
✅ Production: https://datagate-a136pipbb-138datas-projects.vercel.app [56s]
```

#### 6-3. 本番URLの確認

Vercel Dashboard → Deployments → Production

---

## 環境変数設定

### 環境変数一覧（13個）

| 変数名 | 説明 | 必須 | 例 |
|-------|------|------|-----|
| JWT_SECRET | JWT署名用シークレット | ✅ | `fd37f46bbfc56f84a4dfc5efdd...` (64文字) |
| FILE_ENCRYPT_KEY | ファイル暗号化キー | ✅ | `1a90cba0e882bba6754efb299e...` (64文字) |
| CRON_SECRET | Cron実行認証 | ✅ | `8551f8f77176e90113b873c641...` (32文字) |
| SMTP_HOST | SMTPサーバー | ✅ | `smtp.gmail.com` |
| SMTP_PORT | SMTPポート | ✅ | `587` |
| SMTP_USER | SMTPユーザー名 | ✅ | `138data@gmail.com` |
| SMTP_PASS | SMTPパスワード | ✅ | （Gmailアプリパスワード） |
| SMTP_FROM | 送信元アドレス | ✅ | `138data@gmail.com` |
| KV_URL | Redis接続URL | ✅ | `rediss://default:...@literate-badger-10123.upstash.io:6379` |
| KV_REST_API_URL | Redis REST API URL | ✅ | `https://literate-badger-10123.upstash.io` |
| KV_REST_API_TOKEN | Redis API トークン | ✅ | `ASeLAAIncDE...` |
| KV_REST_API_READ_ONLY_TOKEN | Redis 読み取り専用トークン | ✅ | `AieLAAIgcDE...` |
| REDIS_URL | Redis接続URL（互換用） | ✅ | （KV_URLと同じ） |

### 環境変数の追加方法

#### 方法1: Vercel Dashboard（推奨）

1. Vercel Dashboard を開く
2. プロジェクト選択
3. Settings → Environment Variables
4. **Add New** をクリック
5. Key, Value, 環境を入力
6. **Save** をクリック

#### 方法2: Vercel CLI

```powershell
vercel env add JWT_SECRET production
# 値を入力してEnter
```

### 環境変数の確認方法

```powershell
vercel env ls
```

### 環境変数の削除方法

```powershell
vercel env rm JWT_SECRET production
```

---

## 動作確認

### 1. 管理画面へのアクセス

#### 1-1. ログイン画面

URL: `https://datagate-a136pipbb-138datas-projects.vercel.app/admin-login.html`

- ユーザー名: `admin`
- パスワード: `Admin123!`

#### 1-2. ダッシュボード

ログイン後、以下が表示されることを確認:
- 統計情報（ユーザー数、ファイル数、ログ数）
- ナビゲーションメニュー

---

### 2. SMTP接続確認

#### 2-1. システム設定画面へ移動

ナビゲーション → システム設定

#### 2-2. SMTP接続テスト

1. **接続テスト** ボタンをクリック
2. 結果確認:
   - ✅ 成功: `SMTP接続成功！ (XX ms)`
   - ❌ 失敗: エラーメッセージ表示

---

### 3. ファイルアップロード・ダウンロードテスト

#### 3-1. テストファイルの準備

```powershell
# テストファイル作成
echo "This is a test file for 138DataGate encryption." > test-upload.txt
```

#### 3-2. アップロード

ファイル管理画面 → **アップロード** ボタン → test-upload.txt を選択

確認事項:
- ✅ アップロード成功メッセージ
- ✅ ファイル一覧に表示される
- ✅ storageディレクトリに `.enc` ファイルが作成される

#### 3-3. ダウンロード

ファイル一覧 → **ダウンロード** ボタン

確認事項:
- ✅ ダウンロード成功
- ✅ ファイル名が正しい
- ✅ ファイル内容が元と一致

---

### 4. 自動削除テスト

#### 4-1. クリーンアップAPIの手動実行

```powershell
# PowerShellで実行
$headers = @{
    "X-Cron-Secret" = "8551f8f77176e90113b873c641576459"
}
Invoke-RestMethod -Uri "https://datagate-a136pipbb-138datas-projects.vercel.app/api/cron/cleanup" -Headers $headers
```

#### 4-2. 結果確認

レスポンス例:
```json
{
  "success": true,
  "summary": {
    "total": 2,
    "deleted": 0,
    "skipped": 2,
    "errors": 0
  },
  "deletedFiles": [],
  "timestamp": "2025-10-14T10:47:52.000Z"
}
```

---

## トラブルシューティング

### 問題1: デプロイが失敗する

**エラー例**:
```
Error: Build failed
```

**原因**:
- package.jsonの依存関係エラー
- vercel.jsonの設定エラー

**解決方法**:
```powershell
# 依存関係を再インストール
rm -rf node_modules
rm package-lock.json
npm install

# 再デプロイ
vercel --prod
```

---

### 問題2: 環境変数が反映されない

**現象**:
- APIエラー: `Missing required environment variables`

**原因**:
- 環境変数が設定されていない
- 設定後に再デプロイしていない

**解決方法**:
1. Vercel Dashboard → Settings → Environment Variables で確認
2. 不足している変数を追加
3. 再デプロイ:
   ```powershell
   vercel --prod
   ```

---

### 問題3: SMTP接続エラー

**エラー例**:
```
Error: Invalid login: 535-5.7.8 Username and Password not accepted
```

**原因**:
- Gmailアプリパスワードが間違っている
- 2段階認証が有効になっていない

**解決方法**:
1. Googleアカウント → セキュリティ → 2段階認証を有効化
2. アプリパスワードを再生成
3. `SMTP_PASS` 環境変数を更新
4. 再デプロイ

---

### 問題4: ファイルアップロードエラー

**エラー例**:
```
Error: File encryption failed
```

**原因**:
- `FILE_ENCRYPT_KEY` が設定されていない
- storageディレクトリの書き込み権限エラー

**解決方法**:
1. `FILE_ENCRYPT_KEY` 環境変数を確認
2. 再デプロイ
3. ローカルで `vercel dev` して動作確認

---

### 問題5: Cron Jobが実行されない

**現象**:
- 自動削除が実行されない

**原因**:
- Vercel Proプランでない
- vercel.jsonのCron設定エラー
- `CRON_SECRET` が設定されていない

**解決方法**:
1. Vercel Dashboard → Settings → Billing → **Pro Plan** に変更
2. vercel.jsonを確認:
   ```json
   {
     "crons": [
       {
         "path": "/api/cron/cleanup",
         "schedule": "0 2 * * *"
       }
     ]
   }
   ```
3. `CRON_SECRET` 環境変数を設定
4. 再デプロイ

---

### 問題6: KV (Redis) 接続エラー

**エラー例**:
```
Error: Unable to connect to Redis
```

**原因**:
- KV_URL などの環境変数が間違っている
- Upstash Redisが削除された

**解決方法**:
1. Upstash Dashboard でRedisが存在するか確認
2. 接続情報を再取得
3. Vercel環境変数を更新:
   - `KV_URL`
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - `KV_REST_API_READ_ONLY_TOKEN`
   - `REDIS_URL`
4. 再デプロイ

---

## ロールバック手順

### 前提条件
- デプロイ履歴がVercel Dashboardに残っている

### 手順

#### 1. Vercel Dashboardへアクセス

https://vercel.com/dashboard → プロジェクト選択

#### 2. Deploymentsタブを開く

過去のデプロイ一覧が表示される

#### 3. ロールバックしたいデプロイを選択

- デプロイ日時
- コミットハッシュ
- ステータス

を確認

#### 4. **Promote to Production** をクリック

確認ダイアログで **Promote** をクリック

#### 5. ロールバック完了確認

本番URLにアクセスして動作確認

---

## メンテナンス

### 定期メンテナンス（月次）

#### 1. 依存関係の更新

```powershell
# パッケージの更新確認
npm outdated

# 更新実行
npm update

# 脆弱性チェック
npm audit

# 脆弱性修正
npm audit fix
```

#### 2. ログの確認

Vercel Dashboard → Logs

- エラーログの確認
- パフォーマンスの確認
- 異常なアクセスの確認

#### 3. ストレージ使用量の確認

Upstash Dashboard → Redisデータベース → Metrics

- メモリ使用量
- キー数
- リクエスト数

#### 4. Cron Jobの実行履歴確認

Vercel Dashboard → Cron Jobs

- 実行回数
- 成功/失敗率
- 実行時間

---

### 緊急メンテナンス

#### サービス停止手順

1. Vercel Dashboard → Settings → Domains
2. ドメインを削除または一時的に無効化

#### サービス再開手順

1. 問題を修正
2. 再デプロイ:
   ```powershell
   vercel --prod
   ```
3. 動作確認

---

### バックアップ

#### 1. コードのバックアップ

```powershell
# Gitリポジトリにコミット
git add .
git commit -m "Backup: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git push origin main
```

#### 2. データのバックアップ

**Redisデータ**:
```powershell
# Upstash Dashboardから手動エクスポート
# または、Redis CLIで実行:
redis-cli --rdb dump.rdb
```

**ファイルデータ**:
```powershell
# storageディレクトリをバックアップ
Copy-Item -Path "D:\datagate-poc\storage" -Destination "D:\backup\storage-$(Get-Date -Format 'yyyyMMdd')" -Recurse
```

---

### リストア

#### 1. コードのリストア

```powershell
# 特定のコミットに戻す
git checkout <commit-hash>
vercel --prod
```

#### 2. データのリストア

**Redisデータ**:
```powershell
# Upstash Dashboardから手動インポート
# または、Redis CLIで実行:
redis-cli --pipe < dump.rdb
```

**ファイルデータ**:
```powershell
# バックアップからリストア
Copy-Item -Path "D:\backup\storage-20251014\*" -Destination "D:\datagate-poc\storage\" -Recurse
```

---

## 付録

### A. vercel.jsonの全体構成

```json
{
  "rewrites": [
    {
      "source": "/",
      "destination": "/index.html"
    }
  ],
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "0 2 * * *"
    }
  ]
}
```

### B. package.jsonの主要な依存関係

```json
{
  "dependencies": {
    "@vercel/kv": "^2.0.0",
    "bcryptjs": "^2.4.3",
    "formidable": "^3.5.2",
    "jsonwebtoken": "^9.0.2",
    "nodemailer": "^6.9.16"
  }
}
```

### C. ディレクトリ構造

```
D:\datagate-poc\
├── api\               ← APIエンドポイント
├── lib\               ← 共通ライブラリ
├── storage\           ← 暗号化ファイル
├── data\              ← データファイル
├── docs\              ← ドキュメント
├── admin-*.html       ← 管理画面
├── .env               ← 環境変数（ローカル）
├── package.json       ← 依存関係
└── vercel.json        ← Vercel設定
```

---

## チェックリスト

### デプロイ前チェックリスト

- [ ] Node.js (18.x以上) インストール済み
- [ ] Vercel CLI インストール済み
- [ ] Vercelアカウント作成済み
- [ ] Upstashアカウント作成済み
- [ ] Gmail アプリパスワード生成済み
- [ ] 環境変数13個準備完了
- [ ] ローカルテスト成功

### デプロイ後チェックリスト

- [ ] 管理画面ログイン成功
- [ ] ダッシュボード表示確認
- [ ] SMTP接続確認成功
- [ ] ファイルアップロード成功
- [ ] ファイルダウンロード成功
- [ ] クリーンアップAPI動作確認
- [ ] Cron Job設定確認

---

**ドキュメント作成日**: 2025年10月14日  
**最終更新日**: 2025年10月14日  
**バージョン**: 1.0

---

*本ドキュメントは138DataGateプロジェクトのデプロイ手順書です。*
