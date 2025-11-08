# Phase 50 → Phase 51 完全引き継ぎ資料

**作成日時**: 2025-11-06 JST  
**現在フェーズ**: Phase 50 完了  
**次フェーズ**: Phase 51（ダウンロードUI / 管理画面 / Domain Reputation）

---

## 📊 プロジェクト概要

### プロジェクト名
**138DataGate** - PPAP代替システム

### 目的
パスワード付きZIPファイルの代わりに、暗号化されたファイルをセキュアに転送するシステム

### 主要機能
1. ファイルアップロード（AES-256-GCM暗号化）
2. OTP認証によるダウンロード
3. SendGrid経由のメール送信
4. 7日間自動削除
5. ダウンロード回数制限（最大3回）
6. 誤送信対策（管理リンク）

---

## ✅ Phase 50 完了内容

### Phase 50の目的
SendGrid Domain Authentication完了後のメール配信品質検証

### 達成した主目的
- ✅ **フィッシング警告が表示されない**
- ✅ SendGrid Domain Authentication正常動作
- ✅ SPF/DKIM/DMARC認証通過
- ✅ VPS → Vercel → SendGrid → 受信者のE2Eフロー動作確認

### 検証結果
- ✅ @138io.com: 配信成功、フィッシング警告なし
- ⚠️ @outlook.jp: Domain Reputationでブロック（技術的問題ではない）

### 作成したファイル
- VPS: `/opt/138datagate-smtp/test-phase50-multipart.js`
- ローカル: `docs/phase50-completion-report.md`

---

## 🖥️ 環境情報

### 1. Vercel（本番環境）

**プロジェクト名**: datagate-poc  
**Production URL**: `https://datagate-poc.vercel.app`  
**プラン**: Pro ($20/月)

**最新デプロイ情報**:
```
URL: https://datagate-1ijarxwak-138datas-projects.vercel.app
Status: Ready
Environment: Production
```

**環境変数（Production）**:
```
SENDGRID_API_KEY=<設定済み>
SENDGRID_FROM_EMAIL=noreply@138data.com
KV_REST_API_URL=<Upstash設定済み>
KV_REST_API_TOKEN=<Upstash設定済み>
FILE_ENCRYPT_KEY=<設定済み>
ENABLE_EMAIL_SENDING=true
ENABLE_DIRECT_ATTACH=true
DIRECT_ATTACH_MAX_SIZE=4500000
ALLOWED_DOMAINS=138io.com,138data.com
```

### 2. VPS（Xserver）

**IP**: 162.43.28.209  
**OS**: Ubuntu 24.04  
**プラン**: 2GBメモリ（月額1,150円）  
**用途**: SMTPゲートウェイ（現在は未使用、テスト専用）

**プロジェクトディレクトリ**: `/opt/138datagate-smtp`

**アクセス方法**:
- SSH: `ssh root@162.43.28.209`（パスワード認証失敗中）
- シリアルコンソール: Xserver管理画面から

**テストスクリプト**:
- `/opt/138datagate-smtp/test-phase50-multipart.js` - Phase 50検証用

### 3. ローカル開発環境

**作業ディレクトリ**: `D:\datagate-poc`

**Gitリポジトリ**: `https://github.com/138data/datagate-poc.git`

**最新コミット**:
- Phase 49完了後のコミット
- `lib/email-service.js` - SendGrid送信元設定変更

### 4. SendGrid

**Domain Authentication**: ✅ Verified  
**Domain**: `138data.com`  
**送信元**: `noreply@138data.com`

**DNS設定（MuuMuu Domain）**:
```
em8473.138data.com → u52396596.wl231.sendgrid.net (CNAME)
s1._domainkey.138data.com → s1.domainkey.u52396596.wl231.sendgrid.net (CNAME)
s2._domainkey.138data.com → s2.domainkey.u52396596.wl231.sendgrid.net (CNAME)
url9508.138data.com → sendgrid.net (CNAME)
```

**Activity Feed**: https://app.sendgrid.com/email_activity

---

## 📂 重要なファイル一覧

### API エンドポイント

```
api/
├── upload.js                      # ファイルアップロード（multipart/form-data）
├── files/
│   ├── download.js               # ファイル情報取得 & ダウンロード
│   ├── info.js                   # ファイル情報取得のみ
│   ├── list.js                   # ファイル一覧
│   ├── revoke.js                 # ファイル失効
│   └── download/
│       └── request-otp.js        # OTP再送信
├── admin/
│   └── config.js                 # 管理画面設定API
├── auth/
│   └── login.js                  # 管理者ログイン
└── kpi/
    ├── get.js                    # KPI取得
    └── realtime.js               # リアルタイムKPI
```

### ライブラリ

```
lib/
├── encryption.js                 # AES-256-GCM暗号化・復号化
├── email-service.js              # SendGridメール送信
├── environment.js                # 環境変数管理
└── audit-log.js                  # 監査ログ
```

### フロントエンド

```
public/
├── index.html                    # アップロード画面
├── download-v2.html              # ダウンロード画面（OTP入力）
├── manage.html                   # 管理画面（ファイル失効）
└── admin/
    └── index.html                # 管理者ダッシュボード
```

### ドキュメント

```
docs/
├── phase49-completion-report.md  # Phase 49完了報告
├── phase50-completion-report.md  # Phase 50完了報告
├── slo-kpi.md                    # SLO/KPI定義
├── docsthreat-model.md           # 脅威モデル
├── docsretention-audit.md        # データ保持と監査
├── env-matrix.md                 # 環境マトリクス
├── incident-response.md          # インシデント対応
└── jp-encoding-playbook.md       # 日本語エンコーディング
```

---

## 🎯 Phase 51 候補タスク

### Phase 51a: ダウンロードUI完成（推奨）

**目的**: ブラウザでのダウンロードフロー完全実装

**タスク**:
1. `download-v2.html` の確認・動作テスト
2. OTP入力フォームのUI/UX改善
3. エラーハンドリング強化（OTP誤入力、期限切れ等）
4. 日本語ファイル名の表示確認
5. ダウンロード回数制限の表示
6. レスポンシブデザイン対応

**期待される成果**:
- ユーザーがブラウザでファイルをダウンロードできる
- OTP認証が正常に機能する
- エラーメッセージが適切に表示される

**テスト手順**:
```powershell
# 1. ファイルアップロード
cd D:\datagate-poc
$response = curl.exe -X POST "https://datagate-poc.vercel.app/api/upload" `
  -F "file=@test-small.txt" `
  -F "recipient=datagate@138io.com" `
  --silent
$json = $response | ConvertFrom-Json
$downloadUrl = $json.downloadUrl
$otp = $json.otp

# 2. ブラウザでダウンロードURLを開く
Start-Process $downloadUrl

# 3. OTPを入力してダウンロード
Write-Host "OTP: $otp"
```

---

### Phase 51b: 管理画面実装

**目的**: 送信者専用の管理機能実装

**タスク**:
1. `manage.html` の実装確認
2. ファイル失効機能のテスト
3. ダウンロード状況確認機能
4. 管理トークン検証の実装
5. UIデザイン改善

**期待される成果**:
- 送信者が管理リンクからファイルを失効できる
- ダウンロード状況を確認できる
- 誤送信時の即座の対応が可能

**テスト手順**:
```powershell
# 1. ファイルアップロード
$response = curl.exe -X POST "https://datagate-poc.vercel.app/api/upload" `
  -F "file=@test-small.txt" `
  -F "recipient=datagate@138io.com" `
  --silent
$json = $response | ConvertFrom-Json
$manageUrl = $json.manageUrl

# 2. 管理ページを開く
Start-Process $manageUrl

# 3. ファイル失効ボタンをクリック
# 4. ダウンロードURLで403エラーを確認
```

---

### Phase 51c: Domain Reputation構築

**目的**: Outlook.jp配信成功率の向上

**タスク**:
1. Microsoft SNDS (Smart Network Data Services) 登録
2. 送信パターンの最適化
3. メール送信量の段階的増加
4. バウンス率のモニタリング
5. エンゲージメント向上施策

**期待される成果**:
- Outlook.jpへのメール配信成功率向上
- Domain Reputationスコアの改善
- 長期的な配信安定性の確保

**実施手順**:
1. Microsoft SNDS登録: https://postmaster.live.com/snds/
2. 送信IPアドレスの評価確認
3. 送信量を段階的に増やす（週単位）
4. バウンス率を5%以下に保つ
5. 3-6ヶ月継続

---

## ⚠️ 既知の問題と対応

### 1. Outlook.jp配信ブロック（Domain Reputation）

**症状**:
- 送信先: `datagate@outlook.jp`
- SendGrid Status: **Blocked**
- ブロック箇所: `apc.olc.protection.outlook.com`

**原因**:
- `138data.com` のDomain Reputationが低い（新しいドメイン）
- Outlook.jpの厳格なフィルタリング

**対応**:
- 短期: 他のメールサービス（Gmail、独自ドメイン）を使用
- 中長期: Phase 51cでDomain Reputation構築

**技術的状態**:
- ✅ DNS設定: 正常
- ✅ SendGrid Domain Authentication: Verified
- ✅ SPF/DKIM/DMARC: 正常
- ⚠️ Domain Reputation: 構築中

---

### 2. VPS SSH接続失敗

**症状**:
- `ssh root@162.43.28.209` でパスワード認証が拒否される

**対応**:
- Xserver管理画面からシリアルコンソール経由でアクセス
- または、SSHキー認証の設定を検討

**現状**:
- VPSは主にSMTPゲートウェイ用（現在は未使用）
- Phase 50のテストにのみ使用
- 本番運用では直接Vercel APIを使用

---

## 🔧 よく使うコマンド

### PowerShell（ローカル）

```powershell
# 作業ディレクトリ移動
cd D:\datagate-poc

# Vercelデプロイ一覧
vercel ls

# Vercelログ確認
vercel logs --prod --limit 20

# ファイルアップロードテスト
curl.exe -X POST "https://datagate-poc.vercel.app/api/upload" `
  -F "file=@test-small.txt" `
  -F "recipient=datagate@138io.com" `
  --silent

# Git操作
git status
git add .
git commit -m "Phase XX: 説明"
git push origin main

# Vercel Production デプロイ
vercel --prod
```

### VPS（シリアルコンソール）

```bash
# プロジェクトディレクトリ移動
cd /opt/138datagate-smtp

# ファイル一覧
ls -la

# テストスクリプト実行
node test-phase50-multipart.js

# ログ確認
tail -f logs/*.log
```

---

## 📊 プロジェクト進捗サマリー

| Phase | タスク | 状態 |
|---|---|---|
| Phase 1-30 | 基本機能実装 | ✅ 完了 |
| Phase 31-32 | ダウンロード機能・管理画面 | ✅ 完了 |
| Phase 33-40 | 各種機能追加・改善 | ✅ 完了 |
| Phase 41-48 | バグ修正・最適化 | ✅ 完了 |
| Phase 49 | SendGrid Domain Authentication | ✅ 完了 |
| Phase 50 | HTMLメール最終検証 | ✅ 完了 |
| **Phase 51** | **ダウンロードUI / 管理画面 / Reputation** | **⏳ 次回** |

---

## 💬 新しい会話での開始メッセージ（推奨）

```
138DataGateプロジェクトの続きです。

【プロジェクト】
PPAP代替システム - 暗号化ファイル転送サービス

【前回の状況】
Phase 50 完了:
- SendGrid Domain Authentication検証完了
- フィッシング警告が表示されないことを確認（@138io.com）
- VPS → Vercel → SendGrid → 受信者のE2Eフロー動作確認
- Outlook.jp: Domain Reputationでブロック（技術的問題ではない）

【環境】
- Vercel Production: https://datagate-poc.vercel.app
- VPS: 162.43.28.209（テスト専用）
- ローカル: D:\datagate-poc
- Git: https://github.com/138data/datagate-poc.git

【完了している機能】
✅ ファイルアップロード（AES-256-GCM暗号化）
✅ OTP生成・検証
✅ SendGrid経由メール送信（Domain Authentication済み）
✅ フィッシング警告解除確認
✅ 7日間自動削除
✅ ダウンロード回数制限（最大3回）

【次のフェーズ候補】
Phase 51a: ダウンロードUI完成（推奨）
Phase 51b: 管理画面実装
Phase 51c: Domain Reputation構築

【引き継ぎドキュメント】
docs/phase50-to-phase51-handover.md を参照してください。

今回はどのフェーズを進めますか？
または、他に確認・実装したい機能はありますか？
```

---

## 🔍 トラブルシューティング

### メールが届かない場合

1. **SendGrid Activity Feed確認**:
   ```
   https://app.sendgrid.com/email_activity
   ```
   - Delivered: 配信成功（受信側の問題）
   - Blocked: ブロック（Domain Reputation）
   - Bounced: バウンス（メールアドレスエラー）

2. **Vercelログ確認**:
   ```powershell
   vercel logs --prod --limit 20 | Select-String "email|sendgrid"
   ```

3. **環境変数確認**:
   ```
   Vercel Dashboard → Settings → Environment Variables
   ```

### ファイルアップロード失敗

1. **ファイルサイズ確認**:
   - Vercel制限: 4.5MB（Pro プラン）

2. **Content-Type確認**:
   - `/api/upload` は `multipart/form-data` を期待

3. **Vercelログ確認**:
   ```powershell
   vercel logs --prod --limit 20
   ```

### VPSアクセスできない

1. **シリアルコンソール使用**:
   - Xserver管理画面 → VPS → コンソール

2. **SSHキー認証設定**（今後の対応）:
   ```bash
   ssh-keygen -t rsa -b 4096
   # 公開鍵をVPSに追加
   ```

---

## 📚 参考ドキュメント

### プロジェクトドキュメント（最新）

- `docs/phase49-completion-report.md` - SendGrid Domain Authentication完了
- `docs/phase50-completion-report.md` - HTMLメール最終検証完了
- `docs/slo-kpi.md` - SLO/KPI定義
- `docs/docsthreat-model.md` - 脅威モデルと対策
- `docs/docsretention-audit.md` - データ保持と監査
- `docs/env-matrix.md` - 環境マトリクス
- `docs/incident-response.md` - インシデント対応
- `docs/jp-encoding-playbook.md` - 日本語エンコーディング

### 外部リンク

- Vercel Dashboard: https://vercel.com/138datas-projects/datagate-poc
- SendGrid Dashboard: https://app.sendgrid.com
- SendGrid Activity: https://app.sendgrid.com/email_activity
- Xserver VPS: https://secure.xserver.ne.jp/xapanel/login/xvps/
- GitHub Repository: https://github.com/138data/datagate-poc

---

## 🎯 Phase 51 開始時のチェックリスト

### 事前確認

- [ ] Vercel Productionが正常稼働しているか
- [ ] SendGrid Domain Authentication Verifiedか
- [ ] ローカル環境が最新状態か（`git pull`）
- [ ] 前回の完了報告書を確認したか

### Phase 51a開始時

- [ ] `download-v2.html` の現状確認
- [ ] テストファイル作成（`test-small.txt`）
- [ ] ブラウザ開発者ツール準備

### Phase 51b開始時

- [ ] `manage.html` の現状確認
- [ ] 管理トークン生成ロジック確認
- [ ] ファイル失効API確認

### Phase 51c開始時

- [ ] SendGrid Activity Feed確認
- [ ] Microsoft SNDS登録準備
- [ ] 送信量計測開始

---

## 📝 メモ・注意事項

### 重要な設計原則

1. **メールアドレス入力は不要**
   - 受信者は `metadata.recipient` としてサーバー側に保存済み
   - ダウンロードページではマスク表示のみ

2. **送信者専用管理リンク**
   - `manageUrl` で送信者のみがファイルを失効可能
   - `metadata.manageToken` でトークン検証

3. **OTP送信フロー**
   - POST `/api/files/download/request-otp` に `email` パラメータ不要
   - `fileId` のみで `metadata.recipient` 宛てに送信

4. **失効チェック**
   - すべてのダウンロードエンドポイントで `metadata.revokedAt` をチェック

### セキュリティ

- 暗号化: AES-256-GCM
- 鍵導出: PBKDF2
- OTP: 6桁数値
- TTL: 7日間
- ダウンロード回数: 最大3回

---

**作成日時**: 2025-11-06 JST  
**次回更新**: Phase 51完了時  
**重要度**: 🔴 High - Phase 51への完全引き継ぎ資料  

---

**[完全版引き継ぎドキュメント]**
