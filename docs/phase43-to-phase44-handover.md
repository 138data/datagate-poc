# Phase 43 → 44 引き継ぎ資料（実装手順・命名/TTL/契約ポリシー付き）

**対象フェーズ**: Phase 44 – 推奨ロジック精度向上＆統計UI堅牢化  
**前提**: Phase 43は主要機能が動作済（KVポリシー/ダッシュボード/推奨値UI/API）。既知の制限：①推奨サイズが0.0MBになるケース、②統計UI「modeStats.link」参照の例外。

---

## 📋 関連仕様/現状（抜粋）

- 管理ダッシュボードはJWT保護下（`/api/admin/login`、HS256、24h、有効なissuer/audience）で稼働中。
- 統計API `/api/admin/stats?days=7` の契約は `modeBreakdown` / `reasonBreakdown` / `summary` 等（UIで参照すべきは `modeBreakdown`）。
- 監査ログには `size` フィールドが含まれることが契約（推奨ロジックの前提データ）。
- KVはVercel/Upstash（TTL可、`file:{id}:meta|data` で保存・取得の実装例あり）。

---

## 0) フェーズ方針と完了基準（DoD）

### 目的（再確認）

1. **推奨サイズ計算ロジックの精度向上**（優先度: 高）
2. **統計UIのエラーハンドリング強化**（優先度: 高）
3. **A/Bテスト基盤の構築**（優先度: 中）
4. **ダッシュボードUX改善**（優先度: 低）

### Definition of Done（Phase 44）

- ✅ 推奨サイズAPIが欠損や外れ値に強い（非数→除外、サンプル不足→安全な既定値へフォールバック）
- ✅ 推奨サイズが0.0MBになる既知事象を再現→回避（単体/結合/E2E）
- ✅ 統計UIは`modeBreakdown`基準でnull/欠損に耐性、例外をconsoleエラーにしない
- ✅ A/B割当と実験メトリクスの最小骨格が動作（オフにできるFeature Flag付き）
- ✅ 命名・TTL・API契約の衝突回避ルールをドキュメント化し、コード/テストに反映

---

## 1) すぐ着手するタスク（Day 1～）

### 1-1. 推奨サイズ計算ロジックの堅牢化（`lib/policy-analytics.js`）

#### 課題仮説

- 監査ログのsize未記録/0/文字列など欠損・型不整合で分位数計算が壊れる
- 標本数が閾値未満（例：N<10）で0MBへ落ちるフォールバック

#### 対応

**入力サニタイズ**:
- `Number.isFinite(size)` の行単位フィルタ、0/負値除外。
- size不在の場合は互換フィールド（例：過去の`fileSize`）をフォールバック検索。
- 監査ログの構造（event/size/…）は既存仕様に準拠。

**分位数（p95/p90）計算**:
- サンプル不足時は安全既定値（現行ポリシー or p50×係数、下限4.5MB等）を返す。

**極端値除外**:
- IQR*1.5等の外れ値除去オプションをONに。

**単位の一貫性**:
- 内部はbytes、UIはMB。APIレスポンスには`unit: "bytes"`を明示（後方互換のため追加フィールドで対応）。

**最小サンプル閾値**:
- `minSamples=30`（例）未満なら**「信頼度: low」**で既定へフォールバック。

#### テスト

- 欠損/0/文字列/極端値/少数標本の5パターンをfixture化
- 回帰テスト：0.0MBが二度と出ないこと
- 負荷テスト：7/14/30日データ量に対する応答時間

#### 成果物

- `policy-analytics.js`改修、単体テスト
- `GET /api/admin/recommendations`のレスポンスに `unit`, `confidence`, `samples` を追加（非破壊的追加）

---

### 1-2. 統計UIの例外対策（`admin/index.html`）

#### 現象
「Cannot read properties of undefined (reading 'link')」

#### 原因
UIが`modeStats.link`を参照しているがAPI契約は`modeBreakdown`。

#### 対応

**契約順守**:
```javascript
const mb = data.modeBreakdown || data.modeStats || {};
```

**null安全**:
```javascript
const link = mb?.link ?? 0;
const attach = mb?.attach ?? 0;
const blocked = mb?.blocked ?? 0;
```

**Chart描画の防御**:
- データ不足時は空データのグラフ/プレースホルダを描画し、consoleエラーは出さない

#### UIテスト
JWTログイン後に`/api/admin/stats`へ正常/空/不正スキーマをモックし、例外が出ないことを確認（JWT/保護下での呼び出しは既存仕様を踏襲）。

---

## 2) A/Bテスト基盤（最小骨格）

### 2-1. 機能概要

**目的**: 推奨サイズを実配信で検証し、実績で閾値を磨く

**スコープ（v0）**:
- サイズ閾値のみ（Direct Attach許可/サイズ上限）を2～3アームで検証
- sticky assignment（受信者ドメイン or 送信者メールhash）で割当固定、ロールオーバー可能

**ダッシュボード**:
- 実験のON/OFF、割当比、主要KPI（成功率/フォールバック率/p95レイテンシ）

---

### 2-2. KV命名設計（衝突回避）

#### 既存キー例
```
policy:current
policy:history:{timestamp}
audit:stats:{date}
audit:event:{timestamp}（14日保持）
```

#### 追加（v0提案）
```
policy:experiment:{expId}:config（TTL: 実験終了+90日）
policy:experiment:{expId}:allocation（割当比、stickyハッシュseed）
policy:experiment:{expId}:metrics:{date}（日次KPI集計、TTL: 180日）
policy:assignment:{expId}:{actorHash}（sticky割当、TTL: 実験期間+14日）
policy:recommendation:snap:{yyyymmdd}（推奨スナップショット、TTL: 30日）
```

#### 原則

- コロン区切り・単数→具体の順で命名。
- 将来のバージョニング用に `policy:v2:*` を予約。
- 単位はサイズ=bytes、時間=秒（TTL）、タイムスタンプ=ms数値に統一。

---

### 2-3. TTLポリシー（衝突回避）

| データ種別 | TTL | 理由 |
|-----------|-----|------|
| 監査イベント/日次統計 | 14日 | 既存踏襲 |
| 実験設定 | 無期限（アーカイブ時に手動TTL=90日付与） | 監査・再解析 |
| 割当レコード | 実験期間+14日 | 後追い分析 |
| 推奨スナップショット | 30日 | バックテスト用 |

**理由**: コスト/監査/再解析のバランス（無料枠の制限・TTL対応はKV仕様に適合）。

---

### 2-4. API契約（衝突回避）

#### 既存
`GET /api/admin/recommendations?days=7`
- 追加フィールドのみ（例：`unit`, `confidence`, `samples`, `p95`, `p50`）、破壊的変更は不可。

#### 新設（v0）
```
GET /api/admin/experiments（一覧/状態）
POST /api/admin/experiments（作成/開始/停止/割当変更）
GET /api/admin/experiments/:id/metrics?days=7（KPI取得）
```

**ヘッダ**: `X-API-Version: 1`（将来の互換性確保）

**単位**: サイズ=bytes（UIでMB換算）、TTL=秒、時刻=ms（数値）

---

## 3) ダッシュボードUX（最小の改善点）

- **推奨カードの信頼度/サンプル数表示**（「信頼度: high/med/low（N=37）」）
- **A/Bセクション**: 実験ON/OFF、配分、「推奨適用（実験）」ボタン
- **統計タブ**: 空データ時のプレースホルダ/説明文（「対象期間にデータがありません」）、再計算ボタン

---

## 4) 実装WBS（29h内訳の目安）

| タスク | 所要時間 |
|-------|---------|
| 推奨ロジック堅牢化 | 8h（ロジック/テスト/回帰）|
| 統計UI堅牢化 | 6h（null安全/描画防御/E2E）|
| A/Bテスト基盤v0 | 8h（KV設計・API・割当・最少UI）|
| ダッシュボードUX小改善 | 4h |
| 文書/運用Runbook更新 | 3h |
| **合計** | **29h** |

---

## 5) 衝突しやすい箇所（チェックリスト）

### 5-1. 命名

- ❌ **禁止**: `modeStats` など実態に合わないキー名（正は`modeBreakdown`）。
- 🔒 **予約**: `policy:v2:*`（将来互換用）
- ✅ **キーの一貫性**: `policy:*`は設定/実験/割当のみ、監査/統計は`audit:*/stats:*`系に限定

### 5-2. TTL

- 監査/統計は14日を既定に短命キー
- 設定/履歴は長命/無期限（アーカイブポリシー別）
- 実験割当は期間+14日で後追い分析可能に

### 5-3. 契約（Contract）

- **APIの後方互換**: フィールド追加のみで対応
- **単位の厳格化**: サイズ=bytes、UI換算=MB、TTL=秒、時刻=ms（数値）
- **JWT保護**: `/api/admin/*` は全てJWT必須（既存のissuer/audience/algに準拠）。

---

## 6) リリース手順（本番を落とさない流れ）

1. **ブランチ作成**: `feature/phase44-reco-robustness`
2. **契約テスト先行**: Recommendations/Statsのスキーマスナップショットテスト
3. **推奨ロジック修正** → 単体/結合 → ダッシュボード結線
4. **統計UIの防御実装** → UI/E2E
5. **A/B（v0）実装**（デフォルトOFF） → 管理UIにトグル追加
6. **KVキー・TTLのdry-run**（Vercel KVのData Browserで目視、TTLが意図通りか）
7. **本番デプロイ**（JWT/認可の回帰確認）。既存のヘルスエンドポイント/ページで最小確認可能：`/api/health`、`/index.html`、`/download.html`。

---

## 7) テスト計画（抜粋）

### ユニット
- サニタイズ/分位数/外れ値除外/フォールバック（0MBを返さない）

### 契約（API Schema）
- `GET /api/admin/stats` は `modeBreakdown` を最低保証（UIのlink/attach/blocked参照に耐性）。
- `GET /api/admin/recommendations` は `unit/samples/confidence` が追加されても既存UIが崩れない

### E2E
- アップロード→監査ログ生成→推奨再計算→UI反映
- 空/少数データ期間でのUI例外なし
- JWTなしアクセスが401で弾かれること。

---

## 8) 運用ノート / 既知の制限の扱い

- **推奨サイズ=0.0MB**はPhase 44の回避対象。size欠損時はフォールバック値・信頼度を明示。監査ログ構造にsizeが入る前提は既存資料どおり。
- **統計UI例外**は契約名の不一致が主因。`modeBreakdown` へ寄せる。
- **KV**: 無料枠の容量/リクエスト/帯域/TTLに注意（Storageタブで確認・TTL設定可）。

---

## 9) 追加の実装メモ（参考スニペットの方針）

### UIの防御（例）
```javascript
const mb = data.modeBreakdown || data.modeStats || {};
const link = Number(mb?.link ?? 0);
const attach = Number(mb?.attach ?? 0);
const blocked = Number(mb?.blocked ?? 0);
// 描画は0件でも空グラフ/説明文を出す
```

**※ `modeBreakdown` が契約の正式名称。**

---

### 推奨API（非破壊フィールド追加）
```json
{
  "success": true,
  "recommendations": {
    "enableDirectAttach": true,
    "directAttachMaxSize": 4718592
  },
  "analysis": { "period": "7d", "totalFiles": 37 },
  "insights": ["..."],
  "unit": "bytes",
  "samples": 37,
  "confidence": "med",
  "p50": 1048576,
  "p95": 4194304
}
```

**※ bytesを明示し、UI側でMB表示。**

---

## 10) 決定事項（この資料で凍結）

- **進め方**: A. 引き継ぎ資料ベースでPhase 44を開始
- **単位**: サイズ=bytes、TTL=秒、時刻=ms（数値）
- **キー**: `policy:*`系（設定/実験/割当）、`audit:*/stats:*`（記録/集計）を厳密に分離
- **API互換**: 追加のみで後方互換維持（破壊変更はv2で）

---

## 📚 付録：参照（現行仕様の根拠）

- 統計APIのレスポンススキーマ（`modeBreakdown` 等）と監査ログのsize構造。
- 管理系APIのJWT保護（アルゴリズム/issuer/audience/401動作）。
- KVのセットアップ/TTL/データブラウザ（Storageタブ）。
- 既存の公開ページ/ヘルスエンドポイント（疎通/回帰確認に利用）。

---

## 🚀 次アクション（このまま着手できます）

1. **ブランチ作成**: `feature/phase44-reco-robustness`
2. **1-1/1-2を実装**（推奨ロジック堅牢化 → 統計UI防御）
3. **A/B基盤v0をFeature Flag**（デフォルトOFF）でコード導入
4. **スモーク/E2E** → 本番デプロイ

---

**[Phase 43→44 引き継ぎ資料 - 完全版]**
