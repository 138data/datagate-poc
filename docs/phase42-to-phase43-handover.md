# Phase 42 → Phase 43 引き継ぎ資料

作成日時: 2025年11月05日 19:55 JST  
現在のフェーズ: Phase 42 完了 → Phase 43 準備中  
プロジェクト状態: ✅ 本番稼働中

---

## 📊 プロジェクト現状サマリー

### プロジェクト概要

**138DataGate** は、PPAP（Password-Protected Archive Protocol）を代替する安全なファイル受け渡しシステムです。従来のパスワード付きZIPファイルのメール送信に代わり、AES-256-GCM暗号化とOTP（6桁数値）による認証を組み合わせたクラウドベースのソリューションを提供しています。

**主要機能**:
- ✅ ファイルアップロード（暗号化・KV保存）
- ✅ OTPによる安全なダウンロード
- ✅ 7日間自動削除（TTL）
- ✅ メール送信（リンク＋OTP / 添付直送）
- ✅ 管理ダッシュボード（JWT認証）
- ✅ 監査ログ＋統計分析

**技術スタック**:
- **フロントエンド**: HTML/CSS/JavaScript（Vanilla JS）
- **バックエンド**: Vercel Serverless Functions（Node.js）
- **ストレージ**: Upstash Redis（Vercel KV）
- **暗号化**: AES-256-GCM + PBKDF2
- **メール送信**: SendGrid API
- **認証**: JWT（HS256）+ bcrypt

---

## 🎯 Phase 42 完了状況

### Phase 42 全体のマイルストーン

```
Phase 42-P0: ✅ 完了（2025/11/03）
  - 監査ログシステム強化
  - 統計API実装（/api/admin/stats）
  - 日別集計・モード別・理由別集計

Phase 42-P1: ✅ 完了（2025/11/04）
  - 管理UIダッシュボード実装
  - Chart.js によるグラフ表示
  - リアルタイム統計表示

Phase 42-P2: ✅ 完了（2025/11/05 午前）
  - フォールバックE2Eテスト
  - 添付直送→リンク送付フォールバック検証
  - エラーハンドリング改善

Phase 42-P3: ✅ 完了（2025/11/05 午後）
  - JWT認証システム導入
  - bcryptパスワードハッシュ
  - 未認証アクセス遮断
  - 監査ログ構造修正
```

**Phase 42 完全完了日**: 2025年11月05日 19:50 JST

---

## 🔧 現在の環境設定

### Production 環境変数（Vercel）

```bash
# JWT認証（Phase 42-P3）
ADMIN_USER=admin
ADMIN_PASSWORD=$2b$10$XtVbgtkUvuKCj/wQXs5zj.fuauk/ghffh/BVsZAFtosg3SU2tBHli
ADMIN_JWT_SECRET=0906ae58e0d97d350b42a1ca2540b3d3ea7c54b4306b9207a1e8d8de00629c22

# 添付直送設定（Phase 42-P0～P2）
ENABLE_DIRECT_ATTACH=true
ALLOWED_DIRECT_DOMAINS=@138io.com,@138data.com
DIRECT_ATTACH_MAX_SIZE=4718592

# メール送信（SendGrid）
SENDGRID_API_KEY=<設定済み>
SENDGRID_FROM_EMAIL=<設定済み>

# Vercel KV（Upstash Redis）
KV_REST_API_URL=<設定済み>
KV_REST_API_TOKEN=<設定済み>

# 暗号化
FILE_ENCRYPT_KEY=<設定済み>
```

**環境変数の確認コマンド**:
```powershell
vercel env ls
```

**環境変数の追加コマンド**:
```powershell
vercel env add <変数名> production
```

---

### 認証情報（Phase 42-P3）

**管理者ログイン**:
- **ユーザー名**: `admin`
- **パスワード**: `Admin138Data@2025`
- **管理ダッシュボードURL**: https://datagate-poc.vercel.app/admin/index.html

**JWT トークン仕様**:
- **アルゴリズム**: HS256
- **有効期限**: 24時間
- **Issuer**: `138datagate`
- **Audience**: `admin-dashboard`

**パスワードハッシュ生成方法**:
```powershell
node -e "console.log(require('bcryptjs').hashSync('パスワード', 10))"
```

**JWT シークレット生成方法**:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📂 プロジェクト構造（Phase 42 完了時点）

```
D:\datagate-poc/
├── api/
│   ├── admin/
│   │   ├── login.js           # JWT認証API（Phase 42-P3）
│   │   └── stats.js           # 統計API + JWT検証（Phase 42-P0, P3）
│   ├── files/
│   │   └── download.js        # ファイルダウンロードAPI
│   ├── upload.js              # ファイルアップロードAPI（Phase 42-P3修正）
│   └── validate-otp.js        # OTP検証API
├── lib/
│   ├── audit-log.js           # 監査ログユーティリティ（Phase 42-P0, P3）
│   ├── encryption.js          # AES-256-GCM暗号化
│   └── email-validator.js     # メールアドレス検証
├── service/
│   └── email/
│       └── send.js            # メール送信ロジック（Phase 41）
├── admin/
│   ├── index.html             # 管理ダッシュボード（Phase 42-P1, P3）
│   └── index.html.backup      # バックアップ
├── docs/
│   ├── phase40-prep-completion.md
│   ├── phase40-to-phase41-handover.md
│   ├── phase42-p1-completion-report.md
│   ├── phase42-p1-to-p2-handover.md
│   ├── phase42-p2-completion-report.md
│   ├── phase42-p2-to-p3-handover.md
│   ├── phase42-p3-completion-report.md
│   └── phase42-to-phase43-handover.md  # 本ドキュメント
├── public/
│   ├── index.html             # ファイルアップロード画面
│   └── download.html          # ファイルダウンロード画面
├── package.json               # 依存パッケージ定義
├── package-lock.json          # 依存パッケージロック
├── vercel.json                # Vercel設定
└── .gitignore                 # Git除外設定
```

---

## 🔍 主要APIエンドポイント

### 1. ファイルアップロード

**エンドポイント**: `POST /api/upload`

**リクエスト**:
```bash
curl -X POST "https://datagate-poc.vercel.app/api/upload" \
  -F "file=@test.txt" \
  -F "recipientEmail=user@138io.com"
```

**レスポンス**:
```json
{
  "success": true,
  "fileId": "uuid",
  "fileName": "test.txt",
  "fileSize": 1234,
  "downloadLink": "/download.html?id=uuid",
  "mode": "attach",
  "reason": "allowed_domain_and_size",
  "expiresIn": "7 days"
}
```

---

### 2. ファイルダウンロード

**エンドポイント**: `POST /api/files/download`

**リクエスト**:
```json
{
  "fileId": "uuid",
  "otp": "123456"
}
```

**レスポンス**: バイナリデータ（`Content-Disposition: attachment`）

---

### 3. 管理者ログイン

**エンドポイント**: `POST /api/admin/login`

**リクエスト**:
```json
{
  "username": "admin",
  "password": "Admin138Data@2025"
}
```

**レスポンス**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 4. 統計データ取得

**エンドポイント**: `GET /api/admin/stats?days=7`

**ヘッダー**:
```
Authorization: Bearer <JWT_TOKEN>
```

**レスポンス**:
```json
{
  "summary": {
    "total": 10,
    "link": 5,
    "attach": 4,
    "blocked": 1
  },
  "modeBreakdown": {
    "link": 5,
    "attach": 4,
    "blocked": 1
  },
  "reasonBreakdown": {
    "allowed_domain_and_size": 4,
    "size_exceeded": 3,
    "disallowed_domain": 2,
    "feature_disabled": 1
  },
  "dailyStats": [...],
  "recentEvents": [...]
}
```

---

## 🚀 デプロイメント手順

### 標準デプロイ手順

```powershell
# 作業ディレクトリ移動
Set-Location D:\datagate-poc

# ファイル変更確認
git status

# 変更をステージング
git add .

# コミット
git commit -m "feat: 機能追加の説明"

# プッシュ
git push origin main

# Production デプロイ
vercel --prod --force
```

**期待結果**:
```
✅  Production: https://datagate-poc.vercel.app [3-10s]
```

---

### 環境変数更新時の手順

```powershell
# 既存の環境変数削除
vercel env rm <変数名> production

# 新しい環境変数追加
vercel env add <変数名> production
# プロンプトで値を入力

# 再デプロイ（環境変数を反映）
vercel --prod --force
```

---

## 🐛 トラブルシューティング

### 問題1: ダッシュボードにログインできない

**症状**: 「Invalid credentials」エラー

**原因**: パスワードハッシュが不正

**対処**:
1. 新しいハッシュを生成
```powershell
node -e "console.log(require('bcryptjs').hashSync('Admin138Data@2025', 10))"
```

2. 環境変数を更新
```powershell
vercel env rm ADMIN_PASSWORD production
vercel env add ADMIN_PASSWORD production
# 生成したハッシュを入力
```

3. 再デプロイ
```powershell
vercel --prod --force
```

---

### 問題2: 統計データが表示されない

**症状**: ダッシュボードに「-」が表示される

**原因**: 監査ログが生成されていない

**対処**:
1. アップロードテストを実行
```powershell
curl.exe -X POST "https://datagate-poc.vercel.app/api/upload" `
  -F "file=@test.txt" `
  -F "recipientEmail=datagate@138io.com"
```

2. Vercelログを確認
```powershell
vercel logs --prod
```

3. `lib/audit-log.js` の `saveAuditLog` 関数が呼ばれているか確認

---

### 問題3: ファイルダウンロードでOTPエラー

**症状**: 「OTP verification failed」エラー

**原因**: OTPが不正または有効期限切れ

**対処**:
1. OTPが6桁の数値であることを確認
2. OTPの有効期限（15分）を確認
3. 試行回数制限（5回）に到達していないか確認
4. KVに保存されているOTPを確認（デバッグ時）:
```powershell
curl -X GET "https://datagate-poc.vercel.app/api/admin/stats?days=7" `
  -H "Authorization: Bearer <token>"
```

---

### 問題4: メールが送信されない

**症状**: アップロード成功だがメールが届かない

**原因**: SendGrid API キーが無効

**対処**:
1. SendGrid ダッシュボードでAPI キーを確認
2. 環境変数を更新
```powershell
vercel env rm SENDGRID_API_KEY production
vercel env add SENDGRID_API_KEY production
```

3. SendGrid のログを確認（Activity Feed）

---

### 問題5: Git push エラー

**症状**: `error: failed to push some refs`

**原因**: リモートブランチが進んでいる

**対処**:
```powershell
# リモートの変更を取得
git pull origin main --rebase

# コンフリクト解消（必要な場合）
git add .
git rebase --continue

# 再度プッシュ
git push origin main
```

---

## 📊 監査ログとKPI

### 監査ログの構造

```javascript
{
  event: 'upload_success',     // イベント種別
  actor: 'user@example.com',   // アクター（メールアドレス）
  fileId: 'uuid',              // ファイルID
  fileName: 'test.txt',        // ファイル名
  to: 'recipient@example.com', // 宛先
  mode: 'attach',              // モード（link/attach/blocked）
  reason: 'allowed_domain_and_size', // 理由
  size: 1234,                  // ファイルサイズ（バイト）
  status: 'success',           // ステータス
  timestamp: 1730816937000     // タイムスタンプ（ミリ秒）
}
```

**KVキー形式**: `audit:<timestamp>:<fileId>`

**TTL**: 14日（1,209,600秒）

---

### 主要KPI

1. **配信成功率**: 99.9% / 30日
2. **リンク→ダウンロード完了の p95 所要時間**: ≤ 120秒
3. **OTP失敗→ロックまでの試行回数**: 5回（15分クールダウン）
4. **API の p99 レイテンシ**: ≤ 800ms

**KPI確認方法**: 管理ダッシュボードの統計データを参照

---

## 🎯 Phase 43 準備状況

### Phase 43 の目的

**サイズ閾値の動的調整** - データドリブンなポリシー最適化

**実装予定内容**:
1. **KVベースのポリシー管理**
   - 環境変数ではなくKVにポリシーを保存
   - リアルタイムでの変更反映

2. **ダッシュボードからの閾値調整UI**
   - 管理画面で `DIRECT_ATTACH_MAX_SIZE` を変更
   - プレビュー機能（影響範囲の事前確認）

3. **ポリシー変更履歴の記録**
   - 誰が、いつ、何を変更したかを記録
   - 監査証跡の強化

4. **ポリシー適用のテスト機能**
   - 新しいポリシーの段階的ロールアウト
   - A/Bテストのサポート

5. **統計データに基づく推奨値の提示**
   - 過去のアップロード履歴から最適なサイズを算出
   - ダッシュボードに推奨値を表示

---

### Phase 43 の実装計画

**Step 1: KVポリシー管理機能**
- `lib/policy-manager.js` 作成
- KVキー: `policy:direct_attach_max_size`
- デフォルト値: 4718592（4.5MB）

**Step 2: ポリシー取得API**
- `api/admin/policy/get.js` 作成
- JWT認証必須
- 現在のポリシー値を返却

**Step 3: ポリシー更新API**
- `api/admin/policy/update.js` 作成
- JWT認証必須
- ポリシー変更履歴を記録

**Step 4: ダッシュボードUI拡張**
- `admin/index.html` に設定タブ追加
- スライダーUIでサイズ調整
- プレビュー機能（影響範囲の表示）

**Step 5: 統計ベースの推奨値算出**
- 過去7日間のアップロード履歴を分析
- 95パーセンタイル値を推奨値として表示

**所要時間**: 約2時間（各Step約20分）

---

## 📋 次回セッション開始時の推奨アクション

### パターン1: Phase 43 を開始する場合

**次回セッション開始時のメッセージ例**:
```
Phase 42 完了の引き継ぎ資料を確認しました。

【現在の状況】
- Phase 42 完了（JWT認証まで実装済み）
- 本番環境で正常稼働中
- 次は Phase 43（サイズ閾値の動的調整）に進む準備ができています

【Phase 43 の実装内容】
1. KVベースのポリシー管理
2. ダッシュボードからの閾値調整UI
3. ポリシー変更履歴の記録
4. 統計データに基づく推奨値の提示

【最初のステップ】
Phase 43-Step 1（KVポリシー管理機能）から開始します。
まず、現在のプロジェクト状態を確認しましょう：

```powershell
Set-Location D:\datagate-poc
git status
git log --oneline -5
```

実行結果を共有してください。
```

---

### パターン2: バグ修正や改善を行う場合

**次回セッション開始時のメッセージ例**:
```
Phase 42 完了の引き継ぎ資料を確認しました。

【報告したい問題】
（ここに問題の詳細を記載）

【再現手順】
1. ...
2. ...
3. ...

【期待する動作】
...

【実際の動作】
...

【エラーメッセージ（あれば）】
...
```

---

### パターン3: 運用タスクを行う場合

**次回セッション開始時のメッセージ例**:
```
Phase 42 完了の引き継ぎ資料を確認しました。

【実施したい運用タスク】
- [ ] パスワード変更
- [ ] 環境変数の更新
- [ ] 監査ログの確認
- [ ] その他: ...

最初に何から始めますか？
```

---

## 🔗 重要なURL

### Production 環境
- **メインサイト**: https://datagate-poc.vercel.app
- **アップロード画面**: https://datagate-poc.vercel.app/index.html
- **管理ダッシュボード**: https://datagate-poc.vercel.app/admin/index.html

### Vercel ダッシュボード
- **プロジェクト**: https://vercel.com/138datas-projects/datagate-poc
- **Deployments**: https://vercel.com/138datas-projects/datagate-poc/deployments
- **Settings**: https://vercel.com/138datas-projects/datagate-poc/settings

### GitHub リポジトリ
- **リポジトリ**: https://github.com/138data/datagate-poc
- **コミット履歴**: https://github.com/138data/datagate-poc/commits/main

### SendGrid ダッシュボード
- **Activity Feed**: https://app.sendgrid.com/email_activity

---

## 📚 関連ドキュメント

### Phase 42 関連
1. `docs/phase42-p1-completion-report.md` - Phase 42-P1 完了報告書
2. `docs/phase42-p1-to-p2-handover.md` - Phase 42-P1 → P2 引き継ぎ
3. `docs/phase42-p2-completion-report.md` - Phase 42-P2 完了報告書
4. `docs/phase42-p2-to-p3-handover.md` - Phase 42-P2 → P3 引き継ぎ
5. `docs/phase42-p3-completion-report.md` - Phase 42-P3 完了報告書

### プロジェクト全体
1. `PROJECT-RULES.md` - プロジェクト全体のルール
2. `docsretention-audit.md` - データ保持ポリシー
3. `docsthreat-model.md` - 脅威モデルと対策
4. `incident-response.md` - インシデント対応手順
5. `jp-encoding-playbook.md` - 日本語文字エンコーディング
6. `env-matrix.md` - 環境マトリックス
7. `slo-kpi.md` - SLO/KPI定義

---

## ❓ よくある質問（FAQ）

### Q1: 環境変数を変更した後、再デプロイは必要ですか？

**A**: はい、必要です。環境変数の変更は再デプロイで反映されます。

```powershell
vercel --prod --force
```

---

### Q2: ダッシュボードのログイン画面が表示されません。

**A**: ブラウザのキャッシュをクリアしてください。

**Chrome の場合**:
1. F12 を押して開発者ツールを開く
2. ページを右クリック → 「再読み込み」を選択
3. 「キャッシュの消去とハード再読み込み」を選択

または:
```
Ctrl + Shift + Delete → キャッシュをクリア
```

---

### Q3: Git push で認証エラーが発生します。

**A**: GitHub の Personal Access Token を確認してください。

**対処**:
1. GitHub で Personal Access Token を再生成
2. Git の認証情報を更新
```powershell
git remote set-url origin https://<TOKEN>@github.com/138data/datagate-poc.git
```

---

### Q4: KVのデータを直接確認する方法はありますか？

**A**: Vercel ダッシュボードまたは Upstash ダッシュボードで確認できます。

**Vercel ダッシュボード**:
1. https://vercel.com/138datas-projects/datagate-poc にアクセス
2. 「Storage」タブを選択
3. KV データベースを選択

**Upstash ダッシュボード**:
1. https://console.upstash.com/ にアクセス
2. Redis データベースを選択
3. 「Data Browser」でキーを検索

---

### Q5: Production と Preview の違いは何ですか？

**A**: Preview は Git プッシュごとに自動作成される一時的なデプロイメントです。

| 項目 | Production | Preview |
|------|-----------|---------|
| URL | datagate-poc.vercel.app | datagate-...-preview.vercel.app |
| 環境変数 | Production 用 | Preview 用 |
| 用途 | 本番運用 | テスト・検証 |
| デプロイ | `vercel --prod` | 自動（Git push時） |

---

### Q6: 監査ログはいつ削除されますか？

**A**: 14日後に自動削除されます（TTL: 1,209,600秒）。

**延長方法**:
`lib/audit-log.js` の TTL を変更してから再デプロイ。

```javascript
const ttlSeconds = 30 * 24 * 60 * 60; // 30日に延長
```

---

### Q7: ファイルの最大サイズ制限はありますか？

**A**: はい、現在は4.5MBです。

**変更方法**:
Phase 43 実装後、ダッシュボードから変更可能になります。
それまでは環境変数 `DIRECT_ATTACH_MAX_SIZE` を変更してください。

---

### Q8: OTPの有効期限を変更できますか？

**A**: はい、`api/upload.js` の `otpExpiry` を変更してください。

```javascript
const otpExpiry = 30 * 60 * 1000; // 30分に延長（ミリ秒）
```

変更後、再デプロイが必要です。

---

## 🔐 セキュリティチェックリスト

Phase 43 開始前に以下を確認してください：

- [ ] 管理者パスワードが強固である（大文字・小文字・数字・記号を含む）
- [ ] JWT シークレットが十分にランダムである（32バイト以上）
- [ ] 環境変数がGitリポジトリにコミットされていない（`.gitignore`で除外）
- [ ] Production 環境の `ENABLE_DIRECT_ATTACH` が適切に設定されている
- [ ] SendGrid API キーが有効である
- [ ] ダッシュボードがHTTPSでアクセスされている
- [ ] 監査ログが正常に記録されている（ダッシュボードで確認）
- [ ] ファイルが7日後に自動削除されている（TTL動作確認）

---

## 📞 問い合わせ先

**技術的な質問**:
- GitHub Issues: https://github.com/138data/datagate-poc/issues
- ドキュメント: `D:\datagate-poc\docs\`

**運用上の問題**:
- Vercel サポート: https://vercel.com/support
- SendGrid サポート: https://support.sendgrid.com/

**緊急時の連絡先**:
- （連絡先情報を記載）

---

## 🎉 Phase 42 完了を祝して

Phase 42 の完了、おめでとうございます！ 🎉

138DataGate は以下の機能を備えた完全なPPAP代替システムとなりました：

✅ **セキュア**: AES-256-GCM暗号化 + JWT認証  
✅ **監査可能**: 詳細な監査ログ + 統計ダッシュボード  
✅ **スケーラブル**: Vercel Serverless Functions + Upstash Redis  
✅ **使いやすい**: シンプルなUI + OTP認証  
✅ **運用しやすい**: 自動削除 + メール通知

次は Phase 43 でさらなる改善を目指しましょう！

---

**Phase 42 → Phase 43 引き継ぎ資料 - 完全版**  
**作成日時**: 2025年11月05日 19:55 JST  
**最終更新**: 2025年11月05日 19:55 JST  
**次回更新**: Phase 43 完了時
