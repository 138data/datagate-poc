// ecosystem.config.js
// PM2設定ファイル

module.exports = {
  apps: [
    {
      name: '138datagate-smtp',
      script: './server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/var/log/138datagate-smtp-error.log',
      out_file: '/var/log/138datagate-smtp-out.log',
      log_file: '/var/log/138datagate-smtp-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
