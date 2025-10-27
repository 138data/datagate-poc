// api/test-imports.js
export default async function handler(req, res) {
  try {
    // モジュールのインポートテスト
    const env = await import('./environment.js');
    const audit = await import('./audit-log.js');
    const email = await import('./email-service.js');
    
    res.status(200).json({
      success: true,
      modules: {
        environment: Object.keys(env),
        auditLog: Object.keys(audit),
        emailService: Object.keys(email)
      },
      envConfig: env.getEnvironmentConfig()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}
