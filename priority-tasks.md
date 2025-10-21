# 🎯 138DataGate - 緊急度順タスクリスト

**作成日**: 2025年10月9日  
**対象Phase**: Phase 16以降  
**目的**: 本番リリース前の必須対応項目整理

---

## 🔴 P0（本番デプロイ前に必須）

### 1. 送信方式の一本化（仕様"SMTPのみ"へ）

**優先度**: 🔴 最優先

**現状の問題**:
- ドキュメント: 「初期リリースはSMTP版のみ」
- 実装: `admin-settings.html` にSendGridテスト送信UIが存在
- 不一致により混乱の可能性

**対応内容**:
1. **UI修正**: `admin-settings.html`
   - SendGridテスト送信ボタンを非表示化
   - または、SMTPの実送テストに差し替え
   
2. **API統一**: `/api/settings/test-mail.js`
   - `nodemailer` でSMTP送信のみに統一
   - SendGrid関連コードを削除またはコメントアウト

3. **環境変数整理**: `.env.local`
   - SMTP関連のみ残す
   - SendGrid変数は将来用にコメント化

**実施Phase**: Phase 16

**チェックリスト**:
- [ ] `admin-settings.html` のSendGridボタン削除/非表示
- [ ] `/api/settings/test-mail.js` をSMTPのみに修正
- [ ] テストメール送信確認（SMTP経由）
- [ ] ドキュメント更新

---

### 2. ストレージ方針の統一

**優先度**: 🔴 最優先

**現状の問題**:
- ドキュメント: 「開発＝JSONファイル」
- Phase 14 UI: 「KV対応」の記述あり
- 本番でどちらを使うか未確定

**推奨方針**: **Vercel KV（Redis）への統一**

**理由**:
- ✅ Vercelとの親和性が高い
- ✅ スケーラビリティ
- ✅ パフォーマンス向上
- ✅ JSONファイルの競合問題解消

**対応内容**:
1. **Vercel KV セットアップ**
   - VercelダッシュボードでKV作成
   - 環境変数設定（KV_REST_API_URL, KV_REST_API_TOKEN）

2. **API群の移行**:
   - `/api/settings/` → KV対応
   - `/api/files/` → KV対応
   - `/api/users/` → KV対応
   - `/api/logs/` → KV対応

3. **データマイグレーション**:
   - 既存JSONデータをKVへインポート
   - マイグレーションスクリプト作成

**実施Phase**: Phase 16-17

**チェックリスト**:
- [ ] Vercel KV作成
- [ ] 環境変数設定
- [ ] 各API群のKV対応実装
- [ ] データマイグレーション実行
- [ ] 全機能の動作確認

**代替案（簡易）**: 
開発初期はJSONファイルのまま進め、Phase 19以降でKV移行

---

### 3. JWT/管理者初期パスの見直し

**優先度**: 🔴 最優先

**現状の問題**:
- `JWT_SECRET`: デフォルト値が弱い
- 管理者初期パス: `admin / Admin123!` が固定
- セキュリティリスク大

**対応内容**:

#### 3-1. JWT_SECRET強化
```env
# 現在（弱い）
JWT_SECRET=138datagate-secret-key-2025

# 本番用（強い）
JWT_SECRET=3f8a9d2e1b7c4f6a8d2e1b7c4f6a8d2e1b7c4f6a8d2e1b7c4f6a8d2e1b7c
```

**生成方法**:
```bash
# Node.jsで生成
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 3-2. 管理者初期パス強制変更
1. **初回ログイン時の処理追加**:
   - `admin / Admin123!` でログイン成功時
   - パスワード変更画面へ強制リダイレクト
   - 新パスワード設定まで他機能にアクセス不可

2. **実装ファイル**:
   - `/api/auth/login.js` に判定ロジック追加
   - `admin.html` にパスワード変更モーダル追加

3. **手順書への明記**:
   - デプロイ後の初回ログイン手順
   - パスワード変更必須であることを明記

**実施Phase**: Phase 16

**チェックリスト**:
- [ ] JWT_SECRET を強力な乱数に変更
- [ ] Vercel環境変数に設定
- [ ] 初回ログイン時のパスワード強制変更機能実装
- [ ] 管理者マニュアルに手順記載

---

### 4. 本番環境での疎通チェック

**優先度**: 🔴 最優先

**目的**: デプロイ後の全機能動作確認

**スモークテストチェックリスト**:

#### Phase 1: 認証テスト
- [ ] `/admin-login.html` にアクセス
- [ ] 管理者ログイン成功
- [ ] JWT トークン発行確認（DevTools）
- [ ] セッション有効期限確認

#### Phase 2: ダッシュボード
- [ ] `/admin.html` 表示確認
- [ ] 統計カード4つの表示
- [ ] データ取得成功（`/api/stats`）
- [ ] ナビゲーションメニュー動作

#### Phase 3: ユーザー管理
- [ ] `/admin-users.html` 表示
- [ ] ユーザー一覧取得
- [ ] 新規ユーザー作成
- [ ] ユーザー編集
- [ ] ユーザー削除
- [ ] 検索機能

#### Phase 4: ファイル管理
- [ ] `/admin-files.html` 表示
- [ ] ファイル一覧取得
- [ ] ファイルアップロード
- [ ] ファイルダウンロード
- [ ] ファイル削除
- [ ] 統計カード更新

#### Phase 5: ログ管理
- [ ] `/admin-logs.html` 表示
- [ ] ログ一覧取得
- [ ] フィルター機能
- [ ] 検索機能

#### Phase 6: システム設定
- [ ] `/admin-settings.html` 表示
- [ ] 各設定タブ表示
- [ ] 設定値取得
- [ ] 設定値更新
- [ ] テストメール送信（SMTP）
- [ ] 設定エクスポート
- [ ] 設定インポート

**実施Phase**: Phase 17

**所要時間**: 30-60分

---

## 🟡 P1（できるだけ本番前）

### 5. IP許可リストの"実適用"

**優先度**: 🟡 高

**現状の問題**:
- UI上で設定保存はできる
- しかし、実際のアクセス制御は未実装

**対応内容**:

1. **ミドルウェア作成**: `/api/middleware/ipCheck.js`
```javascript
// IPチェックミドルウェア（実装予定）
export function checkIPAllowList(req, res, next) {
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const allowedIPs = await getSettings('security.ipAllowList');
  
  if (allowedIPs.enabled && !allowedIPs.ips.includes(clientIP)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  next();
}
```

2. **各API入口に適用**:
   - `/api/auth/login.js`
   - `/api/users/*`
   - `/api/files/*`
   - `/api/settings/*`

3. **X-Forwarded-For考慮**:
   - Vercel経由のIPアドレス取得
   - プロキシ経由の正しいIP取得

**実施Phase**: Phase 17-18

**チェックリスト**:
- [ ] IPチェックミドルウェア実装
- [ ] 全APIに適用
- [ ] テスト（許可IP/拒否IP）
- [ ] ログ記録（拒否ログ）

---

### 6. レート制限

**優先度**: 🟡 高

**対象API**:
- `/api/auth/login` - ブルートフォース対策
- `/api/auth/otp` - OTP総当たり対策（将来）
- `/api/files/download` - ダウンロード乱用対策

**対応内容**:

1. **簡易レート制限実装**:
```javascript
// レート制限ミドルウェア（実装予定）
const rateLimitStore = new Map();

export function rateLimit(options) {
  return (req, res, next) => {
    const key = req.ip || req.headers['x-forwarded-for'];
    const now = Date.now();
    
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetTime: now + options.windowMs });
      return next();
    }
    
    const record = rateLimitStore.get(key);
    
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + options.windowMs;
      return next();
    }
    
    if (record.count >= options.max) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    
    record.count++;
    next();
  };
}
```

2. **適用例**:
```javascript
// /api/auth/login.js
import { rateLimit } from '../middleware/rateLimit.js';

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 5 // 5回まで
});

export default loginRateLimit(async (req, res) => {
  // ログイン処理
});
```

**実施Phase**: Phase 18

**チェックリスト**:
- [ ] レート制限ミドルウェア実装
- [ ] ログインAPIに適用（5回/15分）
- [ ] ダウンロードAPIに適用（10回/時間）
- [ ] 429エラーの適切な表示
- [ ] ログ記録

---

### 7. ログの網羅

**優先度**: 🟡 高

**現状の問題**:
- 一部のAPIでログ記録が未実装
- 失敗ログが記録されていない場合がある

**対応内容**:

1. **共通ロガー作成**: `/api/utils/logger.js`（既存）の拡張
```javascript
// ログ記録の統一インターフェース
export async function log(type, action, userId, details, success = true) {
  const logEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    type, // 'auth', 'file', 'user', 'settings'
    action, // 'login', 'upload', 'delete', 'update'
    userId,
    details,
    success,
    ip: details.ip,
    userAgent: details.userAgent
  };
  
  await saveLog(logEntry);
}
```

2. **各APIへの適用**:

**未実装箇所**:
- [ ] `/api/files/download` - ダウンロードログ
- [ ] `/api/users/create` - ユーザー作成ログ
- [ ] `/api/users/update` - ユーザー編集ログ
- [ ] `/api/users/delete` - ユーザー削除ログ
- [ ] `/api/files/delete` - ファイル削除ログ
- [ ] `/api/settings/update` - 設定変更ログ

**失敗ログ追加**:
- [ ] ログイン失敗
- [ ] 認証失敗（JWT無効）
- [ ] アップロード失敗
- [ ] 削除失敗

**実施Phase**: Phase 17

**チェックリスト**:
- [ ] 共通ロガー拡張
- [ ] 全APIにログ追加
- [ ] 失敗ログの記録確認
- [ ] ログ管理画面での表示確認

---

### 8. メール送信の本番品質

**優先度**: 🟡 高（SMTP使用の場合）

**目的**: 迷惑メール判定を防ぐ

**対応内容**:

#### 8-1. SPF/DKIM設定
1. **SPFレコード追加**（DNSに設定）:
```
v=spf1 include:_spf.google.com ~all
```

2. **DKIM設定**:
- Gmailの場合: Google Workspaceで設定
- 独自SMTPの場合: SMTPサーバーで設定

3. **DMARCレコード追加**（推奨）:
```
v=DMARC1; p=quarantine; rua=mailto:dmarc@138datagate.com
```

#### 8-2. 送信元ドメイン整備
- `noreply@138datagate.com` 等、専用ドメイン使用
- Gmail個人アカウントからの送信は避ける

#### 8-3. バウンス/迷惑振り分け率の監視
- 送信ログで確認
- 必要に応じてSendGridへの移行検討（Phase 18以降）

**実施Phase**: Phase 16-17

**チェックリスト**:
- [ ] SPFレコード設定
- [ ] DKIM設定
- [ ] DMARCレコード設定（任意）
- [ ] テストメール送信
- [ ] 迷惑メールフォルダに入らないか確認

---

### 9. ファイル保持・誤配サーキットブレーカー

**優先度**: 🟡 高

**目的**: ファイル流出リスクの最小化

**対応内容**:

#### 9-1. 即時URL無効化機能
1. **緊急停止ボタン追加**: `admin-files.html`
   - ファイル一覧に「緊急停止」ボタン
   - クリックで即座にダウンロードURL無効化

2. **API実装**: `/api/files/emergency-disable`
```javascript
// ファイルの緊急無効化
export default async (req, res) => {
  const { fileId } = req.body;
  
  // ファイルステータスを「無効化」に変更
  await updateFileStatus(fileId, 'disabled');
  
  // ログ記録
  await log('file', 'emergency_disable', req.user.id, { fileId });
  
  res.json({ success: true });
};
```

#### 9-2. 自動削除機能
1. **設定項目追加**: `admin-settings.html`
   - 「ファイル保持期間」設定（デフォルト: 30日）
   - 「自動削除を有効化」チェックボックス

2. **定期実行ジョブ**（Vercel Cron）:
```javascript
// /api/cron/cleanup-files.js
export default async (req, res) => {
  const retentionDays = await getSetting('files.retentionDays');
  const expiredFiles = await getExpiredFiles(retentionDays);
  
  for (const file of expiredFiles) {
    await deleteFile(file.id);
    await log('file', 'auto_delete', 'system', { fileId: file.id });
  }
  
  res.json({ deleted: expiredFiles.length });
};
```

3. **vercel.json に追加**:
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-files",
      "schedule": "0 0 * * *"
    }
  ]
}
```

**実施Phase**: Phase 18

**チェックリスト**:
- [ ] 緊急停止ボタン実装
- [ ] 緊急無効化API実装
- [ ] ファイル保持期間設定追加
- [ ] 自動削除ジョブ実装
- [ ] Vercel Cron設定
- [ ] テスト実行

---

## 🟢 P2（本番後〜順次）

### 10. 監査エクスポート

**優先度**: 🟢 中

**対応内容**:
1. **期間指定エクスポート機能**:
   - 開始日・終了日を指定
   - CSV形式でダウンロード

2. **監査ビュー追加**:
   - フィルター機能強化
   - ユーザー別、アクション別絞り込み
   - CSV一括ダウンロード

**実施Phase**: Phase 19

---

### 11. バックアップ/リストアの運用化

**優先度**: 🟢 中

**対応内容**:
1. **自動スナップショット**:
   - 週1回、全設定JSONを自動バックアップ
   - Vercel Cron使用

2. **リストア手順書**:
   - バックアップからの復元手順
   - 緊急時の対応フロー

**実施Phase**: Phase 19

---

### 12. UI/UXの安全配慮

**優先度**: 🟢 中

**対応内容**:
1. **二段階確認**:
   - ユーザー削除時
   - ファイル削除時
   - 設定初期化時
   - 「本当に削除しますか？」モーダル表示

2. **設定画面の改善**:
   - 現在の適用値表示
   - 保存前/保存後の差分表示
   - 変更未保存の警告

**実施Phase**: Phase 19-20

---

## 📊 タスク実施スケジュール

### Phase 16（本番デプロイ準備）
**P0タスク**:
- [x] 1. 送信方式の一本化（SMTPのみ）
- [x] 2. ストレージ方針の決定（JSON or KV）
- [x] 3. JWT/管理者パスの見直し

**所要時間**: 1-2セッション

---

### Phase 17（本番環境テスト＆調整）
**P0タスク**:
- [x] 4. 本番環境での疎通チェック

**P1タスク**:
- [x] 7. ログの網羅
- [x] 8. メール送信の本番品質（SPF/DKIM）

**所要時間**: 1-2セッション

---

### Phase 18（セキュリティ強化＆完成）
**P1タスク**:
- [x] 5. IP許可リストの実適用
- [x] 6. レート制限
- [x] 9. ファイル保持・誤配サーキットブレーカー

**所要時間**: 2-3セッション

---

### Phase 19-20（運用強化）
**P2タスク**:
- [ ] 10. 監査エクスポート
- [ ] 11. バックアップ/リストア運用化
- [ ] 12. UI/UXの安全配慮

**所要時間**: 2-3セッション

---

## 🎯 最優先対応（Phase 16で必須）

### 🔴 Phase 16開始前に決定すべき3つ

1. **送信方式**: SMTPのみで確定 ✅
2. **ストレージ**: JSON or KV どちらにするか？
3. **JWT_SECRET**: 強力な乱数に変更 + 管理者パス強制変更

---

## 📝 決定事項メモ

### 確定済み
- ✅ 送信方式: **SMTPのみ**（SendGridは将来対応）

### 未確定（Phase 16開始前に決定必要）
- ❓ ストレージ: **JSON** or **KV**？
  - 推奨: KV（Vercel KV）
  - 代替: JSON（簡易スタート）

---

## 🎉 まとめ

このタスクリストに従って、Phase 16以降を順次実施します。

**重要ポイント**:
1. **P0タスク**は本番デプロイ前に必須
2. **P1タスク**はセキュリティ・品質向上のため早期実施推奨
3. **P2タスク**は本番稼働後、順次対応

**次のアクション**:
- Phase 16開始
- ストレージ方針の決定（JSON or KV）

---

**作成者**: Claude  
**プロジェクト**: 138DataGate  
**最終更新**: 2025年10月9日
