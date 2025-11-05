# Phase 44 技術仕様書

**フェーズ名**: Phase 44 – 推奨ロジック精度向上＆統計UI堅牢化  
**作成日**: 2025年11月05日  
**ステータス**: 実装準備完了

---

## 📋 1. 目的とスコープ

### 1.1 目的

Phase 43で構築したデータドリブンなポリシー調整基盤の精度と堅牢性を向上させる。

### 1.2 スコープ

| 機能 | 優先度 | 概要 |
|------|--------|------|
| 推奨サイズ計算ロジックの改善 | **高** | 欠損値/外れ値に対する耐性強化 |
| 統計UIのエラーハンドリング | **高** | null安全化、契約名の統一 |
| A/Bテスト基盤（v0） | 中 | Feature Flag付き最小実装 |
| ダッシュボードUX改善 | 低 | 信頼度表示、プレースホルダ |

### 1.3 対象外

- 本格的なA/Bテストの実験管理UI（Phase 45で実装）
- 機械学習による推奨値算出（将来フェーズ）

---

## 🔑 2. 命名規則（KVキー）

### 2.1 基本原則

- **コロン区切り**: `namespace:entity:identifier`
- **単数形→具体化**: `policy:current` (○) / `policies:currents` (×)
- **タイムスタンプ**: UNIX時間（ミリ秒）
- **日付**: `YYYY-MM-DD` 形式

### 2.2 既存キー（Phase 43で確立）

\\\
policy:current                   # 現在のポリシー（無期限）
policy:history:{timestamp}       # ポリシー変更履歴（TTL: 14日）
audit:event:{timestamp}          # 監査イベント（TTL: 14日）
audit:stats:{YYYY-MM-DD}         # 日別統計（TTL: 14日）
file:{fileId}:meta               # ファイルメタデータ（TTL: 7日）
file:{fileId}:data               # ファイル本体（TTL: 7日）
\\\

### 2.3 新規キー（Phase 44で追加）

\\\
# 推奨値関連
policy:recommendations:cache:{days}              # 推奨値キャッシュ（TTL: 24h）
policy:recommendations:snap:{YYYY-MM-DD}         # 推奨値スナップショット（TTL: 30日）

# A/Bテスト基盤（v0）
policy:experiment:{expId}:config                 # 実験設定（TTL: 実験終了+90日）
policy:experiment:{expId}:allocation             # 割当比率（TTL: 同上）
policy:experiment:{expId}:metrics:{YYYY-MM-DD}   # 実験メトリクス（TTL: 180日）
policy:assignment:{expId}:{actorHash}            # Sticky割当（TTL: 実験期間+14日）
\\\

### 2.4 予約済み名前空間

\\\
policy:v2:*        # 将来の互換性のため予約
admin:*            # 管理機能用に予約
system:*           # システム設定用に予約
\\\

### 2.5 禁止事項

- ❌ `modeStats` → `modeBreakdown` が正式名称
- ❌ ハイフン（`-`）の混在 → コロン（`:`）に統一
- ❌ 複数形の使用 → 単数形に統一

---

## ⏰ 3. TTLポリシー

### 3.1 TTL一覧

| データ種別 | KVキー例 | TTL | 単位 | 理由 |
|-----------|---------|-----|------|------|
| ファイル本体/メタ | `file:{id}:*` | 7日 | 秒 | ユーザー要件 |
| 監査ログ | `audit:event:*` | 14日 | 秒 | コンプライアンス |
| 日別統計 | `audit:stats:*` | 14日 | 秒 | ダッシュボード表示範囲 |
| ポリシー履歴 | `policy:history:*` | 14日 | 秒 | 監査証跡 |
| 推奨値キャッシュ | `policy:recommendations:cache:*` | 24時間 | 秒 | 再計算コスト削減 |
| 推奨値スナップショット | `policy:recommendations:snap:*` | 30日 | 秒 | バックテスト用 |
| 実験設定 | `policy:experiment:*:config` | 無期限 | - | 監査・分析用（アーカイブ時に90日TTL付与）|
| 実験メトリクス | `policy:experiment:*:metrics:*` | 180日 | 秒 | 長期分析用 |
| Sticky割当 | `policy:assignment:*` | 実験期間+14日 | 秒 | 後追い分析 |

### 3.2 TTL設定の実装

\\\javascript
// KV書き込み時の例
await kv.set('policy:recommendations:cache:7', data, { ex: 86400 }); // 24時間
await kv.set('audit:event:' + timestamp, event, { ex: 1209600 }); // 14日
\\\

### 3.3 TTL単位の統一

- **時間**: 秒（TTL指定時）
- **タイムスタンプ**: ミリ秒（数値）
- **日付文字列**: `YYYY-MM-DD`

---

## 📡 4. API契約

### 4.1 既存API（Phase 43）の拡張

#### 4.1.1 推奨値取得API

**エンドポイント**: `GET /api/admin/recommendations?days=7`

**既存レスポンス**:
\\\json
{
  "success": true,
  "recommendations": {
    "enableDirectAttach": true,
    "directAttachMaxSize": 4718592
  },
  "analysis": {
    "period": "7日間",
    "totalFiles": 37,
    "avgSize": 0,
    "medianSize": 0,
    "p95Size": 0,
    "directAttachSuccessRate": 0
  },
  "insights": ["..."]
}
\\\

**Phase 44での追加フィールド**（後方互換）:
\\\json
{
  "success": true,
  "recommendations": { /* 既存と同じ */ },
  "analysis": { /* 既存と同じ */ },
  "insights": ["..."],
  
  // ↓ 新規追加フィールド
  "unit": "bytes",              // サイズの単位
  "samples": 37,                // サンプル数
  "confidence": "medium",       // 信頼度: "high" | "medium" | "low"
  "p50": 1048576,               // P50（中央値）バイト単位
  "p95": 4194304,               // P95（95パーセンタイル）バイト単位
  "fallbackReason": null        // フォールバック理由（通常はnull）
}
\\\

**信頼度の定義**:
- `high`: サンプル数 ≥ 50
- `medium`: 30 ≤ サンプル数 < 50
- `low`: サンプル数 < 30（フォールバック値使用）

---

#### 4.1.2 統計取得API（契約名の修正）

**エンドポイント**: `GET /api/admin/stats?days=7`

**重要な変更**: `modeStats` → `modeBreakdown` に統一

**Phase 43（旧）**:
\\\json
{
  "modeStats": { "link": 30, "attach": 5, "blocked": 2 }
}
\\\

**Phase 44（新）**:
\\\json
{
  "modeBreakdown": { "link": 30, "attach": 5, "blocked": 2 },
  "modeStats": { "link": 30, "attach": 5, "blocked": 2 }  // 互換性のため残す
}
\\\

**ゼロ埋め保証**:
\\\javascript
// API側の実装例
const modeBreakdown = {
  link: Number(rawData.link) || 0,
  attach: Number(rawData.attach) || 0,
  blocked: Number(rawData.blocked) || 0
};
\\\

---

### 4.2 新規API（Phase 44）

#### 4.2.1 実験管理API（v0 - Feature Flag付き）

**デフォルト状態**: OFF（環境変数 `ENABLE_AB_EXPERIMENTS=false`）

\\\
GET  /api/admin/experiments           # 実験一覧
POST /api/admin/experiments           # 実験作成
GET  /api/admin/experiments/:id       # 実験詳細
PUT  /api/admin/experiments/:id       # 実験更新（開始/停止/割当変更）
GET  /api/admin/experiments/:id/metrics?days=7  # 実験メトリクス
\\\

**実装時の注意**:
- すべてのエンドポイントでJWT認証必須
- Feature Flag OFFの場合は `503 Service Unavailable` を返す
- リクエストヘッダに `X-API-Version: 1` を付与

---

## 📊 5. データ構造

### 5.1 推奨値の内部構造

\\\javascript
{
  enableDirectAttach: boolean,
  directAttachMaxSize: number,  // bytes
  
  // Phase 44追加
  analysis: {
    samples: number,
    p50: number,      // bytes
    p95: number,      // bytes
    p99: number,      // bytes
    mean: number,     // bytes
    stddev: number    // bytes
  },
  confidence: 'high' | 'medium' | 'low',
  fallbackReason: string | null,
  calculatedAt: number,  // timestamp (ms)
  unit: 'bytes'
}
\\\

### 5.2 監査ログの構造（`size`フィールド必須化）

\\\javascript
{
  timestamp: number,        // ms
  event: 'upload' | 'download' | 'delete',
  actor: string,            // email
  fileId: string,
  fileName: string,
  size: number,             // ★ 必須（bytes）
  mode: 'link' | 'attach' | 'blocked',
  reason: string | null,
  metadata: object
}
\\\

---

## 🔨 6. 実装要件

### 6.1 推奨サイズ計算ロジック（`lib/policy-analytics.js`）

#### 6.1.1 入力サニタイゼーション

\\\javascript
function sanitizeSizes(events) {
  return events
    .map(e => e.size)
    .filter(size => Number.isFinite(size) && size > 0);
}
\\\

#### 6.1.2 外れ値除去（IQR法）

\\\javascript
function removeOutliers(sizes) {
  const sorted = [...sizes].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  
  return sizes.filter(s => s >= lower && s <= upper);
}
\\\

#### 6.1.3 フォールバック戦略

\\\javascript
function calculateRecommendedSize(sizes) {
  const MIN_SAMPLES = 30;
  const DEFAULT_SIZE = 4718592; // 4.5MB
  const MIN_SIZE = 1048576;     // 1MB
  const MAX_SIZE = 26214400;    // 25MB
  
  if (sizes.length < MIN_SAMPLES) {
    return {
      size: DEFAULT_SIZE,
      confidence: 'low',
      fallbackReason: 'insufficient_samples'
    };
  }
  
  const sorted = [...sizes].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted[p95Index];
  const recommended = Math.ceil(p95 * 1.2); // 20%バッファ
  
  return {
    size: Math.max(MIN_SIZE, Math.min(MAX_SIZE, recommended)),
    confidence: sizes.length >= 50 ? 'high' : 'medium',
    fallbackReason: null
  };
}
\\\

---

### 6.2 統計UIのエラーハンドリング（`admin/index.html`）

#### 6.2.1 契約名の統一

\\\javascript
async function loadStats() {
  try {
    const response = await fetch('/api/admin/stats?days=7', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    const data = await response.json();
    
    // modeBreakdown を優先、modeStats はフォールバック
    const mb = data.modeBreakdown || data.modeStats || {};
    const link = Number(mb?.link ?? 0);
    const attach = Number(mb?.attach ?? 0);
    const blocked = Number(mb?.blocked ?? 0);
    
    renderChart({ link, attach, blocked });
  } catch (error) {
    console.error('Failed to load stats:', error);
    showPlaceholder('統計データの読み込みに失敗しました');
  }
}
\\\

#### 6.2.2 Chart描画の防御

\\\javascript
function renderChart(data) {
  if (data.link === 0 && data.attach === 0 && data.blocked === 0) {
    showPlaceholder('対象期間にデータがありません');
    return;
  }
  
  // Chart.js等での描画処理
  // ...
}
\\\

---

### 6.3 A/Bテスト基盤（Feature Flag）

#### 6.3.1 環境変数

\\\
ENABLE_AB_EXPERIMENTS=false  # デフォルトOFF
\\\

#### 6.3.2 Feature Flagチェック

\\\javascript
// api/admin/experiments.js
export default async function handler(req, res) {
  if (process.env.ENABLE_AB_EXPERIMENTS !== 'true') {
    return res.status(503).json({
      error: 'A/B experiments feature is not enabled'
    });
  }
  
  // 実装処理...
}
\\\

---

## 🧪 7. テスト要件

### 7.1 単体テスト

| テストケース | 期待結果 |
|-------------|---------|
| サニタイゼーション: size=0 | 除外される |
| サニタイゼーション: size='abc' | 除外される |
| サニタイゼーション: size=負値 | 除外される |
| 外れ値除去: 極端に大きい値 | 除外される |
| フォールバック: N<30 | DEFAULT_SIZE、confidence='low' |
| P95計算: N=50 | 正しいP95値、confidence='high' |
| ガードレール: 計算結果が25MBを超える | MAX_SIZE (25MB) に制限 |

### 7.2 統合テスト

| テストケース | 期待結果 |
|-------------|---------|
| GET /api/admin/recommendations?days=7 | unit, samples, confidence が含まれる |
| GET /api/admin/stats?days=7 | modeBreakdown がゼロ埋めで返る |
| JWT なしで /api/admin/recommendations | 401 Unauthorized |
| Feature Flag OFF で /api/admin/experiments | 503 Service Unavailable |

### 7.3 E2Eテスト

| テストケース | 期待結果 |
|-------------|---------|
| ファイルアップロード → 推奨値再計算 | size フィールドが監査ログに記録される |
| 統計タブ表示（データあり） | コンソールエラーなし |
| 統計タブ表示（データなし） | プレースホルダ表示 |
| 推奨値カード表示 | 信頼度・サンプル数が表示される |

---

## ✅ 8. 受け入れ基準（DoD）

| 基準 | 確認方法 |
|------|---------|
| 推奨サイズが0.0MBにならない | 連続3回の再計算で確認 |
| 統計タブでコンソールエラーなし | ブラウザDevToolsで確認 |
| API契約の一貫性 | `/api/admin/stats` がゼロ埋めで返却 |
| A/B基盤が動作 | Feature Flag ONで実験API動作 |
| ドキュメント完備 | 本仕様書 + 実装完了報告書 |
| 単体テストカバレッジ | 主要ロジックで80%以上 |
| E2Eテスト | 全シナリオパス |

---

## 📚 9. 参考資料

- [Phase 43 完了報告書](./phase43-completion-report.md)
- [Phase 43→44 引き継ぎ資料](./phase43-to-phase44-handover.md)
- [プロジェクトルール](./PROJECT-RULES.md)
- [SLO/KPI定義](./slo-kpi.md)
- [脅威モデル](./docsthreat-model.md)

---

**[Phase 44 技術仕様書 - 完全版]**
