\# Service Level Objectives / KPI (138DataGate)



\- 配信成功率（メール→受信者手元）: \*\*99.9% / 30日\*\*

\- ダウンロード完了 p95: \*\*≤ 120秒\*\*

\- API p99 レイテンシ（/api/upload, /api/files/download POST）: \*\*≤ 800ms\*\*

\- エラー率（5xx）: \*\*≤ 0.1% / 日\*\*

\- OTP試行: \*\*5回\*\*で一時ロック（15分）



\## モニタリング

\- Vercel Functions / Logs / Error rate

\- SendGrid Activity / Bounce率

\- KPIダッシュボード（将来：自動集計）



