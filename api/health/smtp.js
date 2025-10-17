import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const startTime = Date.now();
    
    // 環境変数チェック
    const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    const health = {
      timestamp: new Date().toISOString(),
      checks: {},
      overall: 'healthy',
      details: []
    };
    
    // 環境変数チェック結果
    if (missingVars.length > 0) {
      health.checks.envVariables = {
        status: 'error',
        message: `Missing environment variables: ${missingVars.join(', ')}`
      };
      health.overall = 'unhealthy';
    } else {
      health.checks.envVariables = {
        status: 'ok',
        required: 5,
        present: 5,
        message: 'All required environment variables are set'
      };
    }
    
    // SMTP設定チェック
    health.checks.configuration = {
      status: 'ok',
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_PORT == 465,
      user: process.env.SMTP_USER?.replace(/(.{2})(.*)(@.*)/, '$1***$3')
    };
    
    // SMTP接続テスト
    if (missingVars.length === 0) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT),
          secure: process.env.SMTP_PORT == 465,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
        
        const connectionStart = Date.now();
        await transporter.verify();
        const connectionTime = Date.now() - connectionStart;
        
        health.checks.connection = {
          status: 'ok',
          message: 'SMTP connection successful',
          responseTime: `${connectionTime}ms`,
          server: process.env.SMTP_HOST
        };
        
        health.details.push({
          severity: 'success',
          category: 'connection',
          message: `Successfully connected to SMTP server (${process.env.SMTP_HOST})`,
          responseTime: `${connectionTime}ms`
        });
        
      } catch (error) {
        health.checks.connection = {
          status: 'error',
          message: error.message
        };
        health.overall = 'unhealthy';
        
        health.details.push({
          severity: 'error',
          category: 'connection',
          message: `Failed to connect: ${error.message}`
        });
      }
    }
    
    health.responseTime = `${Date.now() - startTime}ms`;
    
    return res.status(200).json({
      success: health.overall === 'healthy',
      health
    });
    
  } catch (error) {
    console.error('SMTP health check error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      health: {
        overall: 'unhealthy',
        details: [{
          severity: 'error',
          category: 'system',
          message: error.message
        }]
      }
    });
  }
}