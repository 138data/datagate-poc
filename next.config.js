// next.config.js - Phase 54 設定
// Pages Router 明示化 + Vercel 最適化

module.exports = {
  // Vercel向け設定
  // 'serverless'は非推奨だが、Pages Router問題の解決に有効な場合がある
  // target: 'serverless',  // コメントアウト（最新Next.jsでは不要）
  
  // ページファイル拡張子の明示
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  
  // トレイリングスラッシュ設定（URLの末尾の/）
  trailingSlash: false,
  
  // 出力モード（通常のSSR/SSG用）
  // output: 'standalone' や 'export' を設定しないこと
  // （Vercelは自動で適切なモードを選択）
  
  // Pages Router を優先する設定
  // App Router を完全に無効化
  experimental: {
    appDir: false,  // App Router を明示的に無効化
  },
  
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
    return [
      // 例: /admin → /admin/login へのリダイレクト
      // {
      //   source: '/admin',
      //   destination: '/admin/login',
      //   permanent: false,
      // },
    ];
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
