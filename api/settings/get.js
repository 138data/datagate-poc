import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'settings-custom.json');

const DEFAULT_SETTINGS = {
  siteName: '138DataGate',
  logoUrl: '',
  notice: '',
  sessionTimeout: 60,
  jwtExpiry: 60,
  passwordPolicy: 'medium',
  ipAllowlist: [],
  mailProvider: 'smtp',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: process.env.SMTP_PORT || 587,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || '',
  storageType: 'Vercel KV',
  updatedAt: new Date().toISOString()
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    let settings = { ...DEFAULT_SETTINGS };

    if (fs.existsSync(SETTINGS_FILE)) {
      const fileContent = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const customSettings = JSON.parse(fileContent);
      settings = { ...settings, ...customSettings };
    }

    console.log('Settings loaded successfully');

    res.status(200).json({
      success: true,
      settings
    });

  } catch (error) {
    console.error('Settings get error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load settings',
      details: error.message
    });
  }
}