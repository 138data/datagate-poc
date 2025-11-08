# 📋 Phase 46 → Phase 47 引き継ぎ資料

**作成日時**: 2025-11-05 23:00 JST  
**前セッション**: Phase 46（SMTPゲートウェイ方式への転換）  
**重要度**: 🔴 Critical - システムアーキテクチャ変更中

---

## 🎯 重要な方針転換

### ❌ 誤った方向（Phase 1-45）
- Webブラウザでのファイルアップロード
- 手動でのファイル選択・送信
- 一般公開されたアップロードページ

### ✅ 正しい方向（Phase 46以降）
```
【本来の要件】
1. OutlookやGmailのSMTP設定を変更（mail.138data.com）
2. 通常通りメール送信（ファイル添付）
3. 自動的にセキュア化（透過的処理）
```

---

## 🔴 必須要件（絶対に実装）

### 1. 開封通知メール機能 ✉️
```
受信者がファイルをダウンロードしたら
→ 送信者に「開封しました」メールを自動送信
```

**実装箇所**:
- `api/files/download.js` のPOSTメソッド内
- ダウンロード成功時にトリガー
- SendGrid経由で送信者へ通知

### 2. 誤送信対策・削除リンク 🗑️
```
送信者専用の削除リンク
→ クリックするとサーバーのファイルが即座に削除
```

**実装箇所**:
- `manageUrl` として送信者に提供
- `api/files/revoke.js` で処理
- トークン認証で送信者のみアクセス可

---

## 📊 現在のシステム状態

### 完成している機能 ✅
```
【ダウンロード系】
- download.html - OTP入力・ダウンロード画面
- api/files/download.js - ファイル取得API
- api/files/request-otp.js - OTP送信API
- 暗号化・復号化（AES-256-GCM）

【管理系】
- admin/* - 管理画面（契約者専用）
- 監査ログ機能
- 統計表示
```

### 作成済みだが未デプロイ 📦
```
【VPSサーバー用】
- vps-setup/postfix-gateway.sh - Postfix設定スクリプト
- vps-setup/smtp-processor.py - メール処理スクリプト（Python）

【ドキュメント】
- docs/client-setup-guide.md - Outlook/Gmail設定手順
- phase46-smtp-deployment-guide.md - デプロイ手順
```

### 削除対象（セキュリティリスク）❌
```
- public/index.html - 公開アップロードページ
- public/upload.html - 旧アップロードページ
- api/upload.js - 公開アップロードAPI
- api/upload-start.js, api/upload-complete.js
- api/test-*.js, api/hello.js
```

---

## 🔧 技術仕様

### VPSサーバー情報
```
IP: 162.43.28.209
OS: Ubuntu 24.04 LTS
役割: SMTPゲートウェイ
必要ポート: 25, 587, 465（SMTP）
```

### Vercel環境
```
URL: https://datagate-poc.vercel.app
KV: Upstash Redis
役割: ファイル暗号化・保存・ダウンロード提供
```

### 暗号化仕様
```
アルゴリズム: AES-256-GCM
KDF: PBKDF2（100,000イテレーション）
OTP: 6桁数字
TTL: 7日間自動削除
```

---

## 📝 次回セッション開始手順

### 1. 作業ディレクトリ確認
```powershell
Set-Location D:\datagate-poc
git status
git log --oneline -5
```

### 2. 現在のデプロイ状態確認
```powershell
# Vercel最新URL確認
vercel ls | Select-Object -First 3

# ファイル構造確認
Get-ChildItem -Recurse -Include "*.js","*.html" | Select-Object FullName
```

### 3. VPS接続確認
```powershell
# SSH接続テスト（または Xserverシリアルコンソール使用）
Test-NetConnection 162.43.28.209 -Port 22
```

---

## 🚀 Phase 47 実装タスク

### 優先度1: SMTPゲートウェイ完成
1. **VPS Postfix設定**
   - postfix-gateway.sh 実行
   - SMTP認証設定
   - SSL証明書取得

2. **メール処理スクリプト配置**
   - smtp-processor.py インストール
   - 環境変数設定（KV接続情報）
   - 開封通知・削除リンク機能確認

### 優先度2: 必須機能の実装確認
1. **開封通知メール**
   ```javascript
   // api/files/download.js に実装済みか確認
   if (downloadSuccess) {
     await sendOpenNotificationEmail(metadata.sender, {
       fileName: metadata.fileName,
       downloadedBy: maskEmail(metadata.recipient),
       downloadedAt: new Date().toISOString()
     });
   }
   ```

2. **削除リンク（manageUrl）**
   ```javascript
   // メール本文に含める
   削除リンク（誤送信の場合）: ${manageUrl}
   // api/files/revoke.js で処理
   ```

### 優先度3: クリーンアップ
1. 不要ファイル削除
2. セキュリティ強化（IP制限等）
3. 本番デプロイ

---

## 🔐 環境変数チェックリスト

### VPSサーバー（/etc/environment）
```bash
VERCEL_API_URL=https://datagate-poc.vercel.app
KV_REST_API_URL=[Upstash REST URL]
KV_REST_API_TOKEN=[Upstash Token]
FILE_ENCRYPT_KEY=[暗号化キー]
SENDGRID_API_KEY=[SendGrid APIキー]
```

### Vercel環境変数
```
✓ SENDGRID_API_KEY
✓ SENDGRID_FROM_EMAIL
✓ KV_REST_API_URL
✓ KV_REST_API_TOKEN
✓ FILE_ENCRYPT_KEY
✓ ADMIN_PASSWORD
```

---

## 📋 新セッション開始メッセージ

```
138DataGate Phase 47の続きです。

【前回の作業】
Phase 46でSMTPゲートウェイ方式への転換を開始。
Webアップロード機能を削除し、メールクライアント（Outlook/Gmail）の
SMTP設定変更だけでセキュア送信される方式に変更中。

【必須要件】
1. 開封通知メール（ダウンロード時に送信者へ通知）
2. 誤送信対策削除リンク（即座にファイル削除）

【現在の状態】
- SMTPゲートウェイスクリプト作成済み（未デプロイ）
- ダウンロード機能は完成済み
- VPS（162.43.28.209）の設定が必要

【今回の作業】
1. VPSにSMTPゲートウェイをデプロイ
2. 開封通知・削除リンク機能の動作確認
3. Outlookでのテスト実施

作業ディレクトリ: D:\datagate-poc
よろしくお願いします。
```

---

## 📂 提供済みファイル

### ZIPアーカイブ
- `datagate-poc-phase46-fix.zip` - ダウンロード機能修正版
- `datagate-smtp-gateway.zip` - SMTPゲートウェイ実装一式

### ドキュメント
- `phase46-deployment-guide.md` - 旧デプロイ手順
- `phase46-smtp-deployment-guide.md` - SMTPゲートウェイデプロイ手順
- `client-setup-guide.md` - エンドユーザー向け設定ガイド

---

## ⚠️ 注意事項

1. **公開アップロード機能は完全削除**
   - セキュリティリスクのため
   - SMTPゲートウェイのみ使用

2. **管理画面は契約者のみアクセス可**
   - IP制限追加推奨
   - 強固なパスワード必須

3. **開封通知と削除リンクは必須**
   - コンプライアンス要件
   - 誤送信対策

---

## 🎯 最終ゴール

```
ユーザー体験:
1. メールクライアントのSMTP設定を一度変更（5分）
2. あとは通常通りメール送信するだけ
3. 自動的にファイルがセキュア化される
4. 誤送信しても即座に削除可能
5. 開封確認で安心
```

---

**[Phase 46 → Phase 47 引き継ぎ資料 完全版]**

この資料があれば、新しい会話でもスムーズに作業を続けられます。
成功を祈っています！ 🚀
