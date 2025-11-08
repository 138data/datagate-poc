# 📋 Phase 46-SMTP デプロイ手順

## 🎯 目標
OutlookやGmailの設定を変更するだけで、自動的にファイルがセキュア化される**SMTPゲートウェイ**を構築

---

## 📊 システム構成

```
[メールクライアント] → [SMTPゲートウェイ] → [受信者]
  (Outlook/Gmail)        (mail.138data.com)   (OTP+リンク)
                               ↓
                         [Vercel Backend]
                          - ファイル暗号化
                          - ダウンロード機能
                          - 管理画面
```

---

## 🚀 Step 1: 不要ファイルの削除（5分）

```powershell
# Windowsローカル（D:\datagate-poc）で実行

# 公開アップロード機能を削除（セキュリティリスク）
Remove-Item "public\index.html" -Force
Remove-Item "public\upload.html" -Force -ErrorAction SilentlyContinue
Remove-Item "api\upload.js" -Force
Remove-Item "api\upload-start.js" -Force -ErrorAction SilentlyContinue
Remove-Item "api\upload-complete.js" -Force -ErrorAction SilentlyContinue

# テストファイル削除
Get-ChildItem "api\test-*.js" | Remove-Item -Force
Remove-Item "api\hello.js" -Force -ErrorAction SilentlyContinue

Write-Host "✅ 不要ファイル削除完了" -ForegroundColor Green

# Git コミット
git add -A
git commit -m "security: Remove public upload interface - SMTP gateway only"
git push origin main
```

---

## 🚀 Step 2: VPSサーバー設定（30分）

### 2.1 VPSにSSH接続

```powershell
# PowerShellから（または、Xserverのシリアルコンソール使用）
ssh root@162.43.28.209
```

### 2.2 Postfix設定スクリプト実行

```bash
# VPS上で実行

# 設定スクリプトダウンロード
cd /root
wget https://raw.githubusercontent.com/138data/datagate-poc/main/vps-setup/postfix-gateway.sh
chmod +x postfix-gateway.sh

# 実行
./postfix-gateway.sh

# 確認
systemctl status postfix
systemctl status dovecot
```

### 2.3 メール処理スクリプト配置

```bash
# Pythonパッケージインストール
apt-get install -y python3-pip
pip3 install cryptography requests

# スクリプトダウンロード
wget https://raw.githubusercontent.com/138data/datagate-poc/main/vps-setup/smtp-processor.py \
  -O /usr/local/bin/smtp-processor.py
chmod +x /usr/local/bin/smtp-processor.py

# 環境変数設定
cat << 'EOF' > /etc/environment
VERCEL_API_URL=https://datagate-poc.vercel.app
KV_REST_API_URL=[Upstash Redis REST URL]
KV_REST_API_TOKEN=[Upstash Redis Token]
FILE_ENCRYPT_KEY=[暗号化キー]
EOF

# 実行ユーザー作成
useradd -r -s /bin/false -d /var/lib/gateway gateway
```

### 2.4 テストユーザー作成

```bash
# SMTPユーザー作成（例：test@138data.com）
/usr/local/bin/add-smtp-user.sh test@138data.com TestPass123!

# 確認
sasldblistusers2
```

---

## 🚀 Step 3: DNS設定（10分）

### MuuMuu Domainで設定

```
# MXレコード
mail.138data.com    IN  A       162.43.28.209
@                   IN  MX  10  mail.138data.com

# SPFレコード
@                   IN  TXT     "v=spf1 ip4:162.43.28.209 ~all"
```

---

## 🚀 Step 4: 最小限のダウンロード機能確認（5分）

```powershell
# ローカルで確認

# ダウンロードページが存在することを確認
Test-Path "public\download.html"

# APIが存在することを確認
Test-Path "api\files\download.js"
Test-Path "api\files\request-otp.js"

# Vercelデプロイ
vercel --prod --force

Write-Host "✅ ダウンロード機能確認完了" -ForegroundColor Green
```

---

## 🚀 Step 5: 管理画面セキュリティ強化（10分）

```powershell
# 管理画面のアクセス制限追加
$adminAuth = @'
// 管理者IPホワイトリスト
const ADMIN_IP_WHITELIST = [
    '::1',           // localhost
    '127.0.0.1',     // localhost
    // 管理者のIPアドレスを追加
];

export default async function handler(req, res) {
    // IP制限
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!ADMIN_IP_WHITELIST.includes(clientIp)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    // 既存の認証処理...
}
'@

# （実際の実装はファイルごとに適用）
```

---

## 🧪 Step 6: エンドツーエンドテスト（15分）

### 6.1 Outlookテスト

1. Outlookで新規メール作成
2. 小さなファイル（test.txt）を添付
3. 自分宛に送信
4. 受信確認：
   - 添付ファイルがリンクに置換されている
   - OTPが表示されている
   - リンククリックでダウンロードページが開く
5. OTP入力してダウンロード成功

### 6.2 パフォーマンステスト

```bash
# VPS上で確認
tail -f /var/log/smtp-gateway.log
tail -f /var/log/mail.log
```

---

## ✅ 完了確認チェックリスト

- [ ] VPS Postfix起動確認
- [ ] SMTP認証動作確認
- [ ] メール処理スクリプト動作確認
- [ ] ファイル暗号化・KV保存確認
- [ ] ダウンロード機能動作確認
- [ ] 管理画面アクセス制限確認
- [ ] Outlook設定・送信テスト完了
- [ ] エラーログ確認（エラーなし）

---

## 📊 運用開始後の監視

### 監視項目
```bash
# VPSで定期確認
systemctl status postfix
systemctl status dovecot
df -h                    # ディスク容量
free -m                  # メモリ使用率
```

### ログローテーション設定
```bash
cat << 'EOF' > /etc/logrotate.d/smtp-gateway
/var/log/smtp-gateway.log {
    daily
    missingok
    rotate 14
    compress
    notifempty
    create 640 gateway gateway
}
EOF
```

---

## 🎯 成功基準

1. **ユーザー体験**
   - Outlook/Gmailの設定変更のみ（5分以内）
   - 通常のメール送信操作で自動セキュア化
   - 受信者は特別なソフト不要

2. **セキュリティ**
   - すべてのファイルがAES-256-GCM暗号化
   - OTP認証必須
   - 7日間自動削除

3. **運用**
   - 管理画面で統計確認可能
   - 監査ログ完備
   - エラー時のフェイルセーフ動作

---

## 📞 トラブルシューティング

### メールが届かない
```bash
# VPS上で確認
postqueue -p              # メールキュー確認
tail -f /var/log/mail.log # メールログ確認
```

### ファイル処理エラー
```bash
tail -f /var/log/smtp-gateway.log
python3 /usr/local/bin/smtp-processor.py < test_email.txt  # 手動テスト
```

### Vercel KV接続エラー
- Upstash ダッシュボードで接続確認
- REST API トークン再生成

---

**Phase 46-SMTP デプロイ完了！** 🎉

これで、OutlookやGmailの設定を変更するだけで、自動的にファイルがセキュア化されるシステムが完成です。
