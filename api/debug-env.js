// api/debug-env.js
const asBool = (v) => /^true|1|yes|on$/i.test(String(v||'').trim());

module.exports = (req, res) => {
  const env = process.env;
  const enableEmailRaw = env.ENABLE_EMAIL_SENDING;
  const enableEmail = asBool(enableEmailRaw);
  const hasApiKey = !!env.SENDGRID_API_KEY;

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    timestamp: new Date().toISOString(),
    emailSettings: {
      ENABLE_EMAIL_SENDING_raw: enableEmailRaw,
      ENABLE_EMAIL_SENDING_bool: enableEmail,
      interpretation: enableEmail ? 'ENABLED' : 'DISABLED',
      rawType: typeof enableEmailRaw,
      isEmptyString: enableEmailRaw === '',
      isUndefined: enableEmailRaw === undefined,
      isFalseString: enableEmailRaw === 'false',
      isTrueString: enableEmailRaw === 'true'
    },
    sendgrid: {
      hasApiKey,
      apiKeyPrefix: hasApiKey ? env.SENDGRID_API_KEY.slice(0, 10) + '...' : 'NOT SET',
      fromEmail: env.SENDGRID_FROM_EMAIL || 'NOT SET',
      fromName: env.SENDGRID_FROM_NAME || 'NOT SET'
    },
    environment: {
      VERCEL_ENV: env.VERCEL_ENV || null,
      VERCEL_URL: env.VERCEL_URL || null,
      NODE_ENV: env.NODE_ENV || null,
      nodeVersion: process.versions.node
    },
    kvStore: {
      hasRestApiUrl: !!env.KV_REST_API_URL,
      hasRestApiToken: !!env.KV_REST_API_TOKEN
    },
    allEmailRelatedKeys: Object.keys(env).filter(k => 
      k.includes('EMAIL') || k.includes('SENDGRID')
    ).sort()
  });
};
