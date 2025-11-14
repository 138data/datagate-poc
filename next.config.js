// next.config.js - Phase 74 修正版
// Pages Router 明示化 + Vercel 最適化
module.exports = {
  // ページファイル拡張子の明示
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  
  // トレイリングスラッシュ設定（URLの末尾の/）
  trailingSlash: false,
  
  // その他のVercel最適化
  poweredByHeader: false,
  compress: true,
  
  // 環境変数の設定（必要に応じて）
  env: {
    // NEXT_PUBLIC_* 変数をここに追加可能
  },
  
  // カスタムWebpack設定（必要に応じて）
  webpack: (config, { isServer }) => {
    // 必要に応じてカスタマイズ
    return config;
  },
  
  // リダイレクト設定（管理画面へのアクセスを保護）
  async redirects() {
    return [];
  },
  
  // ヘッダー設定（セキュリティ強化）
  async headers() {
    return [
      {
        source: '/admin/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};
