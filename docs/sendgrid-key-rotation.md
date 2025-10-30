# 🔐 SendGrid API キー 緊急ローテーション手順

**重要**: handover ドキュメントに API キーが平文で記載されていたため、即時ローテーションが必要です。

---

## 📋 手順

### Step 1: SendGrid で新しい API キーを発行

```powershell
# ブラウザで SendGrid にアクセス
Start-Process "https://app.sendgrid.com/settings/api_keys"

# 操作:
# 1. "Create API Key" をクリック
# 2. API Key Name: "DataGate-Production-2025-10-30"
# 3. API Key Permissions: "Full Access" (または "Mail Send" のみ)
# 4. "Create & View" をクリック
# 5. **新しいAPIキーをコピー** (一度しか表示されません)
```

### Step 2: 古いAPIキーを削除

```powershell
# SendGrid の API Keys ページで:
# 1. 古いキー "SG.SUC_6MzdTQqzECWeol4iVg..." を探す
# 2. "Delete" をクリック
# 3. 確認してkeyを削除
```

### Step 3: Vercel 環境変数を更新

```powershell
# Vercel CLI で更新（Production）
vercel env rm SENDGRID_API_KEY production
vercel env add SENDGRID_API_KEY production
# → 新しいAPIキーを入力

# Preview 環境も更新
vercel env rm SENDGRID_API_KEY preview
vercel env add SENDGRID_API_KEY preview
# → 新しいAPIキーを入力

# Development 環境も更新
vercel env rm SENDGRID_API_KEY development
vercel env add SENDGRID_API_KEY development
# → 新しいAPIキーを入力
```

### Step 4: ローカル環境変数を更新

```powershell
# .env.local を編集
notepad D:\datagate-poc\.env.local

# 内容を更新:
SENDGRID_API_KEY="<新しいAPIキー>"
SENDGRID_FROM_EMAIL="datagate@138io.com"
SENDGRID_FROM_NAME="138DataGate"
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_MMwyWScGxRdAA2mc_aL6dvcC2WNGAvqofeqmXwK7rpWOJ9c"
```

### Step 5: 動作確認

```powershell
# ローカルでテスト
vercel dev

# ブラウザで開く
Start-Process "http://localhost:3000"

# ファイルアップロード → メール送信テスト
# 宛先: 138data@gmail.com
```

### Step 6: Production デプロイ

```powershell
# 再デプロイ（環境変数の更新を反映）
git commit --allow-empty -m "chore: rotate SendGrid API key"
git push origin phase35b-client-direct-upload

# デプロイ待機
Start-Sleep -Seconds 120

# 動作確認
Start-Process "https://datagate-poc.vercel.app"
```

---

## ⚠️ 重要な注意事項

### ❌ 絶対にやってはいけないこと
1. **API キーをコミットしない**
   - `.env.local` を Git に追加しない
   - `vercel.json` に API キーを記載しない
   - handover やドキュメントに平文で記載しない

2. **API キーを共有しない**
   - Slack/メール/チャットで共有しない
   - スクリーンショットに含めない

3. **古い API キーを残さない**
   - SendGrid で即座に削除
   - ローカルファイルから削除

### ✅ 安全な管理方法
1. **Vercel 環境変数のみで管理**
   - Production / Preview / Development を分離
   - CLI または Web UI から設定

2. **ローテーション頻度**
   - 3ヶ月に1回（推奨）
   - 漏えい疑いがある場合は即座に

3. **アクセス制限**
   - SendGrid の API キーは "Mail Send" 権限のみに制限
   - 不要な権限は付与しない

---

## 📝 チェックリスト

- [ ] SendGrid で新しい API キーを発行
- [ ] 新しい API キーをコピー（一度しか表示されない）
- [ ] Vercel 環境変数を更新（Production / Preview / Development）
- [ ] ローカル `.env.local` を更新
- [ ] SendGrid で古い API キーを削除
- [ ] 動作確認（ローカル）
- [ ] 動作確認（Production）
- [ ] handover ドキュメントから API キーを削除
- [ ] `.vercel` ディレクトリを `.gitignore` に追加確認

---

## 🔗 参考リンク

- **SendGrid API Keys**: https://app.sendgrid.com/settings/api_keys
- **Vercel 環境変数**: https://vercel.com/138datas-projects/datagate-poc/settings/environment-variables
- **SendGrid ドキュメント**: https://docs.sendgrid.com/ui/account-and-settings/api-keys

---

**作成日時**: 2025年10月30日  
**重要度**: 🔴 Critical - 即座に実施してください
