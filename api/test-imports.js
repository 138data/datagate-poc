// api/test-imports.js
export default async function handler(req, res) {
  try {
    // モジュールのインポートテスト
    const env = await import('./environment.js');
    const audit = await import('./audit-log.js');
    const email = await import('./email-service.js');

    const envConfig = env.getEnvironmentConfig();
    
    // 機密情報をマスク
    const safeConfig = {
      environment: envConfig.environment,
      isProduction: envConfig.isProduction,
      isPreview: envConfig.isPreview,
      isDevelopment: envConfig.isDevelopment,
      enableEmailSending: envConfig.enableEmailSending,
      sandboxMode: envConfig.sandboxMode,
      baseUrl: envConfig.baseUrl,
      vercelUrl: envConfig.vercelUrl,
      nodeEnv: envConfig.nodeEnv,
      enableDirectAttach: envConfig.enableDirectAttach,
      allowedDirectDomains: envConfig.allowedDirectDomains,
      directAttachMaxSize: envConfig.directAttachMaxSize,
      // 機密情報はマスク
      sendgridApiKey: envConfig.sendgridApiKey ? '***MASKED***' : null,
      sendgridFromEmail: envConfig.sendgridFromEmail,
      sendgridFromName: envConfig.sendgridFromName
    };

    res.status(200).json({
      success: true,
      modules: {
        environment: Object.keys(env),
        auditLog: Object.keys(audit),
        emailService: Object.keys(email)
      },
      envConfig: safeConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}
