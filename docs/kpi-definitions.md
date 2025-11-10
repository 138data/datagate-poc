# DataGate KPI 定義

## KPI 指標一覧

| KPI | 説明 | 計算式 | 目標値 | データソース |
|-----|------|--------|--------|--------------|
| **アップロード成功率** | ファイル処理成功割合 | (成功/総数) × 100 | >99% | Upstash 'audit:upload:*' |
| **ダウンロード成功率** | OTP + DL成功割合 | (成功DL/総DL) × 100 | >98% | Upstash 'audit:download:*' |
| **p95 処理時間** | 95%タイルレスポンス | ソート後95%位置 | <500ms | Upstash timestamps |
| **エラー率** | 4xx/5xx 割合 | (エラー/総リクエスト) × 100 | <1% | Upstash 'audit:error:*' |
| **メール配信率** | Delivered 率 | SendGrid Activity | >95% | SendGrid API |

## 更新履歴

- 2025/11/10: Phase 57 初版作成
