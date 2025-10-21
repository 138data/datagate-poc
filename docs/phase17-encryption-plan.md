# 🔒 Phase 17: 暗号化実装 - 完全実装計画書

**作成日**: 2025年10月10日  
**開始条件**: Phase 16完了（初回デプロイ完了後）  
**所要時間**: 4-5時間（1-2セッション）  
**プロジェクト**: 138DataGate - PPAP離脱ソフト

---

## 📌 Phase 17開始時のメッセージ

### **新しいセッションで伝える文章**:

```
138DataGateプロジェクトの続きです。
Phase 17（暗号化実装＋セキュリティポリシー）を開始します。

【Phase 16完了内容】
✅ 基盤セキュリティ完成（guard.js、SMTP健全性チェック等）
✅ 初回本番デプロイ完了

【Phase 17実装内容】
⬜ Day 1: ファイル暗号化実装（AES-256-GCM）
⬜ Day 2: 自動削除ポリシー（7日保持）
⬜ Day 3: セキュリティポリシー文書化

Phase 17の実装を開始したいです。
```

---

## 🎯 Phase 17の目的

### **最終目標**
- **送信ファイルを「盗まれても読めない」状態にする**
- **自動削除で「残っていない」状態を保つ**
- **利用者の操作負担をゼロにする**

### **実装方針**
1. **透過型暗号化**: ユーザー体験を変えない
2. **多重防御**: ファイル本体 + メタデータの両方を暗号化
3. **環境変数管理**: 暗号鍵をコードに埋め込まない
4. **自動化**: 削除・ログ記録をすべて自動化

---

## 📅 Phase 17 タスクリスト

### **Day 1: ファイル暗号化実装** [2時間]

#### **1-1. 暗号化ユーティリティ作成** [30分]

**ファイル**: `D:\datagate-poc\api\utils\encryption.js`

**実装内容**:

```javascript
/**
 * 暗号化ユーティリティ
 * AES-256-GCM + PBKDF2によるファイル暗号化
 */

import crypto from 'crypto';

// 環境変数から暗号鍵を取得
const MASTER_KEY = process.env.FILE_ENCRYPT_KEY || 'default-master-key-change-in-production';

/**
 * マスターキーから派生鍵を生成
 * @param {Buffer} salt - ランダムソルト
 * @returns {Buffer} 派生鍵（32バイト）
 */
function deriveKey(salt) {
  return crypto.pbkdf2Sync(
    MASTER_KEY,
    salt,
    100000,  // 反復回数（OWASP推奨）
    32,      // キー長（256bit）
    'sha256'
  );
}

/**
 * ファイルを暗号化
 * @param {Buffer} fileBuffer - 暗号化するファイルデータ
 * @returns {Object} { encryptedData, salt, iv, authTag }
 */
export function encryptFile(fileBuffer) {
  try {
    // ランダムなsaltとIVを生成
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    
    // 派生鍵を生成
    const key = deriveKey(salt);
    
    // AES-256-GCM暗号化
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(fileBuffer),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      encryptedData: encrypted,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  } catch (error) {
    console.error('暗号化エラー:', error);
    throw new Error('ファイルの暗号化に失敗しました');
  }
}

/**
 * ファイルを復号
 * @param {Buffer} encryptedData - 暗号化されたデータ
 * @param {string} salt - Base64エンコードされたsalt
 * @param {string} iv - Base64エンコードされたIV
 * @param {string} authTag - Base64エンコードされた認証タグ
 * @returns {Buffer} 復号されたファイルデータ
 */
export function decryptFile(encryptedData, salt, iv, authTag) {
  try {
    // Base64デコード
    const saltBuffer = Buffer.from(salt, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');
    
    // 派生鍵を生成
    const key = deriveKey(saltBuffer);
    
    // AES-256-GCM復号
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);
    
    return decrypted;
  } catch (error) {
    console.error('復号エラー:', error);
    throw new Error('ファイルの復号に失敗しました');
  }
}

/**
 * 文字列を暗号化（メタデータ用）
 * @param {string} text - 暗号化する文字列
 * @returns {Object} { encrypted, salt, iv, authTag }
 */
export function encryptString(text) {
  try {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const key = deriveKey(salt);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted: encrypted.toString('base64'),
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  } catch (error) {
    console.error('文字列暗号化エラー:', error);
    throw new Error('文字列の暗号化に失敗しました');
  }
}

/**
 * 文字列を復号（メタデータ用）
 * @param {string} encrypted - Base64エンコードされた暗号化文字列
 * @param {string} salt - Base64エンコードされたsalt
 * @param {string} iv - Base64エンコードされたIV
 * @param {string} authTag - Base64エンコードされた認証タグ
 * @returns {string} 復号された文字列
 */
export function decryptString(encrypted, salt, iv, authTag) {
  try {
    const encryptedBuffer = Buffer.from(encrypted, 'base64');
    const saltBuffer = Buffer.from(salt, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');
    
    const key = deriveKey(saltBuffer);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('文字列復号エラー:', error);
    throw new Error('文字列の復号に失敗しました');
  }
}

/**
 * 暗号化キーを生成（初期セットアップ用）
 * @returns {string} Hex形式の64文字ランダム文字列
 */
export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}
```

**確認方法**:
```javascript
// テスト
import { encryptFile, decryptFile, generateEncryptionKey } from './encryption.js';

console.log('暗号化キー:', generateEncryptionKey());

const testData = Buffer.from('Hello, DataGate!', 'utf8');
const { encryptedData, salt, iv, authTag } = encryptFile(testData);
console.log('暗号化成功:', encryptedData.length, 'bytes');

const decrypted = decryptFile(encryptedData, salt, iv, authTag);
console.log('復号成功:', decrypted.toString('utf8'));
```

---

#### **1-2. upload.js 修正（暗号化対応）** [45分]

**ファイル**: `D:\datagate-poc\api\files\upload.js`

**修正内容**:

```javascript
import { encryptFile, encryptString } from '../utils/encryption.js';
import { kv } from '@vercel/kv';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ファイルアップロード処理（既存のmulter等）
    const file = req.file; // multerからのファイル
    const { sender, recipient, phase } = req.body;

    // ファイルIDを生成
    const fileId = uuidv4();

    // ファイルを読み込み
    const fileBuffer = fs.readFileSync(file.path);

    // ファイルを暗号化
    const { encryptedData, salt, iv, authTag } = encryptFile(fileBuffer);

    // 暗号化ファイルを保存
    const encryptedPath = path.join(process.cwd(), 'storage', `${fileId}.enc`);
    fs.writeFileSync(encryptedPath, encryptedData);

    // メタデータを暗号化
    const encFileName = encryptString(file.originalname);
    const encSender = encryptString(sender);
    const encRecipient = encryptString(recipient);

    // KVに暗号化メタデータを保存（7日TTL）
    const metadata = {
      fileId,
      fileName: encFileName.encrypted,
      fileNameSalt: encFileName.salt,
      fileNameIv: encFileName.iv,
      fileNameAuthTag: encFileName.authTag,
      sender: encSender.encrypted,
      senderSalt: encSender.salt,
      senderIv: encSender.iv,
      senderAuthTag: encSender.authTag,
      recipient: encRecipient.encrypted,
      recipientSalt: encRecipient.salt,
      recipientIv: encRecipient.iv,
      recipientAuthTag: encRecipient.authTag,
      phase,
      fileSalt: salt,
      fileIv: iv,
      fileAuthTag: authTag,
      fileSize: encryptedData.length,
      uploadedAt: new Date().toISOString(),
      encryptedPath
    };

    // 7日後に自動削除（TTL設定）
    const retentionDays = 7;
    const ttl = retentionDays * 24 * 60 * 60; // 秒換算

    await kv.set(`file:${fileId}`, JSON.stringify(metadata), { ex: ttl });

    // 一時ファイル削除
    fs.unlinkSync(file.path);

    // ログ記録
    console.log(`✅ ファイル暗号化アップロード成功: ${fileId}`);

    res.status(200).json({
      success: true,
      fileId,
      message: 'ファイルが安全に暗号化されました'
    });

  } catch (error) {
    console.error('アップロードエラー:', error);
    res.status(500).json({ error: 'ファイルアップロードに失敗しました' });
  }
}
```

---

#### **1-3. download.js 修正（復号対応）** [45分]

**ファイル**: `D:\datagate-poc\api\files\download.js`

**修正内容**:

```javascript
import { decryptFile, decryptString } from '../utils/encryption.js';
import { kv } from '@vercel/kv';
import fs from 'fs';

export default async function handler(req, res) {
  const { fileId, token } = req.query;

  if (!fileId || !token) {
    return res.status(400).json({ error: 'ファイルIDまたはトークンが不足しています' });
  }

  try {
    // KVからメタデータ取得
    const metadataStr = await kv.get(`file:${fileId}`);
    
    if (!metadataStr) {
      return res.status(404).json({ error: 'ファイルが見つかりません' });
    }

    const metadata = JSON.parse(metadataStr);

    // OTPトークン検証（既存の検証ロジック）
    // ... トークン検証コード ...

    // 暗号化ファイルを読み込み
    const encryptedData = fs.readFileSync(metadata.encryptedPath);

    // ファイルを復号
    const decryptedFile = decryptFile(
      encryptedData,
      metadata.fileSalt,
      metadata.fileIv,
      metadata.fileAuthTag
    );

    // ファイル名を復号
    const originalFileName = decryptString(
      metadata.fileName,
      metadata.fileNameSalt,
      metadata.fileNameIv,
      metadata.fileNameAuthTag
    );

    // ダウンロードログ記録
    console.log(`📥 ファイルダウンロード: ${fileId}, ファイル名: ${originalFileName}`);

    // レスポンスヘッダー設定
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalFileName)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', decryptedFile.length);

    // 復号されたファイルを送信
    res.status(200).send(decryptedFile);

  } catch (error) {
    console.error('ダウンロードエラー:', error);
    res.status(500).json({ error: 'ファイルのダウンロードに失敗しました' });
  }
}
```

---

### **Day 2: 自動削除ポリシー** [1時間]

#### **2-1. cleanup.js 実装** [30分]

**ファイル**: `D:\datagate-poc\api\cron\cleanup.js`

**実装内容**:

```javascript
/**
 * 期限切れファイル自動削除
 * Vercel Cron Jobsで毎日実行
 */

import { kv } from '@vercel/kv';
import fs from 'fs';

export default async function handler(req, res) {
  // Vercel Cron認証
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('🧹 自動削除ジョブ開始:', new Date().toISOString());

  try {
    let deletedCount = 0;
    let errorCount = 0;

    // KVから全ファイルキーを取得
    const keys = await kv.keys('file:*');

    for (const key of keys) {
      try {
        const metadataStr = await kv.get(key);
        
        // KVのTTLで自動削除されているが、物理ファイルは残っているので削除
        if (metadataStr) {
          const metadata = JSON.parse(metadataStr);
          
          // 期限チェック（7日以上経過）
          const uploadedAt = new Date(metadata.uploadedAt);
          const now = new Date();
          const daysPassed = (now - uploadedAt) / (1000 * 60 * 60 * 24);
          
          if (daysPassed >= 7) {
            // 物理ファイル削除
            if (fs.existsSync(metadata.encryptedPath)) {
              fs.unlinkSync(metadata.encryptedPath);
            }
            
            // KVからメタデータ削除
            await kv.del(key);
            
            deletedCount++;
            console.log(`🗑️  削除: ${key}`);
          }
        }
      } catch (error) {
        console.error(`削除エラー: ${key}`, error);
        errorCount++;
      }
    }

    console.log(`✅ 自動削除ジョブ完了: ${deletedCount}件削除, ${errorCount}件エラー`);

    res.status(200).json({
      success: true,
      deletedCount,
      errorCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('自動削除ジョブエラー:', error);
    res.status(500).json({ error: '自動削除ジョブに失敗しました' });
  }
}
```

---

#### **2-2. vercel.json にCron設定追加** [15分]

**ファイル**: `D:\datagate-poc\vercel.json`

**追加内容**:

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

**説明**:
- 毎日午前2時（UTC）に実行
- `/api/cron/cleanup` を自動呼び出し

---

#### **2-3. 管理画面に保持期間設定追加** [15分]

**ファイル**: `D:\datagate-poc\admin-settings.html`

**追加内容**:

```html
<!-- システム設定セクション内に追加 -->
<div class="section">
  <h2>📂 ファイル保持ポリシー</h2>
  
  <label>ファイル保持期間（日数）</label>
  <input type="number" id="fileRetentionDays" placeholder="7" min="1" max="30">
  <small>アップロードされたファイルが自動削除されるまでの日数</small>
  
  <div class="info-box">
    <strong>現在の設定:</strong> 7日後に自動削除<br>
    <strong>暗号化:</strong> AES-256-GCM<br>
    <strong>削除方式:</strong> 完全削除（復元不可）
  </div>
</div>
```

---

### **Day 3: セキュリティポリシー文書化** [1時間]

#### **3-1. セキュリティポリシー文書作成** [30分]

**ファイル**: `D:\datagate-poc\docs\security-policy.md`

**内容**:

```markdown
# 🔒 138DataGate セキュリティポリシー

**最終更新**: 2025年10月10日  
**バージョン**: 1.0

---

## 1. 目的

138DataGateは、PPAPに代わる安全なファイル転送ソリューションとして、
お客様の重要なファイルとデータを保護することを最優先事項としています。

---

## 2. データ暗号化

### 2.1 ファイル暗号化

- **暗号化方式**: AES-256-GCM（認証付き暗号）
- **適用範囲**: すべてのアップロードファイル
- **暗号化タイミング**: アップロード時に自動暗号化
- **復号条件**: 有効なワンタイム認証（OTP）による認証後のみ

### 2.2 メタデータ暗号化

- **対象**: ファイル名、送信者情報、受信者情報
- **方式**: 個別暗号化（ファイル本体とは異なる鍵）
- **保存場所**: Upstash Redis（TLS1.3暗号化通信）

### 2.3 暗号鍵管理

- **管理方式**: Vercel環境変数（外部安全領域）
- **鍵の種類**: マスターキー + ファイルごとの派生鍵
- **更新頻度**: 年1回ローテーション
- **アクセス制限**: 管理者のみ

---

## 3. データ保持ポリシー

### 3.1 自動削除

- **保持期間**: アップロードから7日間
- **削除方式**: 完全削除（復元不可）
- **削除対象**: ファイル本体 + メタデータ

### 3.2 手動削除

- 管理者による即時削除が可能
- 削除後は復元不可

---

## 4. アクセス制御

### 4.1 ダウンロード認証

- **方式**: ワンタイムパスワード（OTP）
- **有効期限**: 24時間
- **再利用**: 不可（使い捨て）

### 4.2 管理者認証

- **方式**: JWT（JSON Web Token）
- **有効期限**: 24時間
- **多要素認証**: 今後実装予定

---

## 5. 通信セキュリティ

### 5.1 HTTPS通信

- **TLSバージョン**: 1.2以上
- **証明書**: Let's Encrypt（自動更新）
- **適用範囲**: すべての通信

### 5.2 APIセキュリティ

- **レート制限**: 各APIに適用（DDoS対策）
- **IP許可リスト**: 管理機能で設定可能
- **アクセスログ**: すべてのリクエストを記録

---

## 6. 監査とログ

### 6.1 記録内容

- ファイルアップロード/ダウンロード
- 暗号化/復号イベント
- 管理者操作
- セキュリティイベント（失敗ログイン等）

### 6.2 ログ保持期間

- **アクセスログ**: 90日間
- **セキュリティログ**: 1年間

---

## 7. インシデント対応

### 7.1 セキュリティインシデント発生時

1. 即座にシステム管理者へ通知
2. 影響範囲の特定
3. 必要に応じてサービス一時停止
4. 該当ファイルの即時削除
5. お客様への報告（24時間以内）

### 7.2 報告内容

- インシデント発生日時
- 影響を受けたファイル数
- 講じた対策
- 再発防止策

---

## 8. コンプライアンス

### 8.1 準拠法規

- 個人情報保護法
- 不正アクセス禁止法
- 電子署名法

### 8.2 第三者機関

- 将来的にISMSなどの認証取得を検討

---

## 9. お客様の責任

### 9.1 パスワード管理

- 管理者パスワードの適切な管理
- 定期的なパスワード変更（推奨: 3ヶ月ごと）

### 9.2 ダウンロードURL管理

- ダウンロードURLは受信者のみに送信
- 不要になったURLは即座に削除

---

## 10. ポリシー更新

本ポリシーは、セキュリティ状況やサービス内容の変更に応じて更新されます。
重要な変更がある場合は、お客様に事前通知いたします。

---

## お問い合わせ

セキュリティに関するご質問・ご報告は、以下までご連絡ください。

**Email**: security@138datagate.com  
**電話**: 000-0000-0000（平日9:00-18:00）

---

**138DataGate セキュリティチーム**
```

---

#### **3-2. 顧客向け説明資料作成** [15分]

**ファイル**: `D:\datagate-poc\docs\security-for-clients.md`

**内容**:

```markdown
# 🛡️ 138DataGate - セキュリティ機能のご案内

お客様各位

138DataGateでは、お預かりするファイルの安全性を最優先に考え、
以下のセキュリティ対策を実施しております。

---

## ✅ 5つの安心ポイント

### 1. 💾 **ファイルは暗号化して保存**
- 銀行レベルの暗号化技術（AES-256）を使用
- 万が一サーバーが攻撃されても、ファイル内容は読み取れません

### 2. 🔑 **ダウンロードは認証が必須**
- URLを知っているだけではダウンロードできません
- ワンタイムパスワードによる二重の保護

### 3. 🗓️ **7日後に自動削除**
- アップロード後7日で完全削除
- 「残っていない」ので安心

### 4. 🔒 **通信は常に暗号化**
- HTTPS通信で第三者による盗聴を防止
- クレジットカード決済と同レベルのセキュリティ

### 5. 📊 **すべての操作を記録**
- いつ・誰が・何をしたかを記録
- 万が一の際も追跡可能

---

## 📄 PPAPとの比較

| 項目 | PPAP（従来方式） | 138DataGate |
|------|------------------|-------------|
| **ファイル保存** | メール添付（平文） | 暗号化保存 |
| **パスワード** | 別メールで送信 | ワンタイム認証 |
| **保存期間** | 無制限（残り続ける） | 7日で自動削除 |
| **アクセス制限** | なし | 認証必須 |
| **操作ログ** | なし | すべて記録 |

---

## 🔍 よくあるご質問

### Q1. ファイルは本当に安全ですか？
A. はい。銀行やクレジットカード会社と同じ暗号化技術（AES-256）を使用しており、
暗号化鍵がなければファイルを読み取ることはできません。

### Q2. 7日後に削除されると困る場合は？
A. 必要なファイルは7日以内にダウンロードして保存してください。
セキュリティ上、サーバーには長期保存いたしません。

### Q3. ダウンロードURLが漏れたら？
A. ワンタイム認証により、URLだけでは開けません。
また、管理者が即座にURLを無効化することも可能です。

### Q4. どのくらい安全ですか？
A. 以下の対策を実施しています：
- ファイル暗号化（AES-256-GCM）
- 通信暗号化（TLS1.3）
- ワンタイム認証
- 自動削除ポリシー
- アクセスログ記録

---

## 📞 お問い合わせ

セキュリティについてご不明な点がございましたら、
お気軽にお問い合わせください。

**Email**: support@138datagate.com  
**電話**: 000-0000-0000（平日9:00-18:00）

---

**138DataGate** - PPAPを超える、安心のファイル転送
```

---

#### **3-3. 管理画面にポリシー表示追加** [15分]

**ファイル**: `D:\datagate-poc\admin-settings.html`

**追加内容**:

```html
<!-- システム設定画面の最後に追加 -->
<div class="section">
  <h2>🔒 セキュリティポリシー</h2>
  
  <div class="policy-summary">
    <h3>現在のセキュリティ設定</h3>
    <ul>
      <li>✅ ファイル暗号化: AES-256-GCM</li>
      <li>✅ メタデータ暗号化: 有効</li>
      <li>✅ 自動削除: 7日後</li>
      <li>✅ ワンタイム認証: 有効</li>
      <li>✅ 通信暗号化: TLS1.3</li>
      <li>✅ アクセスログ: 記録中</li>
    </ul>
  </div>
  
  <div class="btns">
    <a href="/docs/security-policy.md" target="_blank" class="ghost">
      📄 完全なポリシーを表示
    </a>
    <a href="/docs/security-for-clients.md" target="_blank" class="ghost">
      👥 顧客向け説明資料
    </a>
  </div>
</div>

<style>
.policy-summary {
  background: #f5f5f5;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.policy-summary h3 {
  margin-top: 0;
  color: #333;
}

.policy-summary ul {
  list-style: none;
  padding: 0;
}

.policy-summary li {
  padding: 8px 0;
  font-size: 14px;
}
</style>
```

---

## 🔧 環境設定

### 新しい環境変数

**`.env` に追加**:

```env
# 暗号化設定
FILE_ENCRYPT_KEY=<以下のコマンドで生成>

# Cron認証
CRON_SECRET=<以下のコマンドで生成>
```

### 暗号化キー生成

```powershell
# FILE_ENCRYPT_KEY生成（64文字Hex）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# CRON_SECRET生成（32文字Hex）
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### Vercel環境変数設定

1. Vercelダッシュボード → Settings → Environment Variables
2. 以下を追加:
   - `FILE_ENCRYPT_KEY` = <生成した暗号化キー>
   - `CRON_SECRET` = <生成したCronシークレット>

---

## 🧪 テスト計画

### Day 1テスト

```powershell
# 暗号化ユーティリティテスト
node -e "
const { encryptFile, decryptFile, generateEncryptionKey } = require('./api/utils/encryption.js');
console.log('Key:', generateEncryptionKey());
const data = Buffer.from('Test');
const enc = encryptFile(data);
const dec = decryptFile(enc.encryptedData, enc.salt, enc.iv, enc.authTag);
console.log('Success:', dec.toString() === 'Test');
"
```

### Day 2テスト

```powershell
# 自動削除テスト
# 1. 7日前のダミーファイルを作成
# 2. cleanup.js を手動実行
# 3. ファイルとメタデータが削除されることを確認
```

### Day 3テスト

```powershell
# 管理画面でポリシー表示確認
# 1. admin-settings.htmlにアクセス
# 2. セキュリティポリシーセクション表示確認
# 3. リンクをクリックして文書が開くことを確認
```

---

## 📊 Phase 17完了チェックリスト

### Day 1: ファイル暗号化実装
- [ ] `encryption.js` 作成完了
- [ ] `upload.js` 暗号化対応完了
- [ ] `download.js` 復号対応完了
- [ ] 暗号化/復号テスト成功
- [ ] FILE_ENCRYPT_KEY 設定完了

### Day 2: 自動削除ポリシー
- [ ] `cleanup.js` 実装完了
- [ ] `vercel.json` Cron設定追加
- [ ] 管理画面に保持期間設定追加
- [ ] 自動削除テスト成功
- [ ] CRON_SECRET 設定完了

### Day 3: セキュリティポリシー文書化
- [ ] `security-policy.md` 作成完了
- [ ] `security-for-clients.md` 作成完了
- [ ] 管理画面にポリシー表示追加
- [ ] 文書リンク動作確認

---

## 🎯 Phase 17完了条件

### 必須条件
✅ すべてのファイルが暗号化保存される  
✅ ダウンロード時に正しく復号される  
✅ 7日後に自動削除される  
✅ セキュリティポリシーが文書化される  
✅ 顧客向け説明資料が完成する

### 確認方法
1. テストファイルをアップロード
2. `storage/` に `.enc` ファイルが保存されることを確認
3. ダウンロードして元のファイルが復元されることを確認
4. KVでTTLが7日に設定されていることを確認
5. 管理画面でポリシーが表示されることを確認

---

## 🚀 Phase 18への準備

Phase 17完了後、以下を準備してPhase 18（監査強化）へ進みます：

### Phase 18実装内容（予定）
1. **暗号化監査ログ**
   - 暗号化/復号イベントの詳細記録
   - ログ閲覧UI

2. **鍵ローテーション機能**
   - 鍵世代管理
   - 旧鍵での復号対応
   - 自動ローテーションスケジュール

3. **セキュリティダッシュボード**
   - 暗号化統計
   - 削除統計
   - セキュリティイベント表示

---

## 📞 Phase 17開始時の確認事項

### 前提条件
- [ ] Phase 16完了済み（初回デプロイ完了）
- [ ] サーバーが正常稼働中
- [ ] KV接続確認済み

### 準備物
- [ ] FILE_ENCRYPT_KEY（生成済み）
- [ ] CRON_SECRET（生成済み）
- [ ] この実装計画書

### 開始メッセージ
```
Phase 17（暗号化実装）を開始します。

【準備完了】
✅ FILE_ENCRYPT_KEY生成済み
✅ CRON_SECRET生成済み
✅ Phase 16デプロイ完了

【実装内容】
⬜ Day 1: ファイル暗号化実装
⬜ Day 2: 自動削除ポリシー
⬜ Day 3: セキュリティポリシー文書化

Phase 17の実装を開始します。
```

---

## 🎉 まとめ

Phase 17では、138DataGateに**強力なセキュリティ層**を追加します。

### 実装される機能
✅ AES-256-GCM暗号化  
✅ メタデータ暗号化  
✅ 7日自動削除ポリシー  
✅ セキュリティポリシー文書化  
✅ 顧客向け説明資料

### 所要時間
**4-5時間（1-2セッション）**

### 次のPhase
**Phase 18: 監査・運用強化**（2-4時間）

---

**作成者**: Claude  
**プロジェクト**: 138DataGate  
**作成日**: 2025年10月10日  
**対象Phase**: Phase 17

**[Phase 17実装計画書 - 完全版]** 📋✨
