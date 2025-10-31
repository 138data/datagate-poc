const sgMail = require('@sendgrid/mail');

const asBool = (v) => /^true|1|yes|on$/i.test(String(v||'').trim());

async function sendEmail(opts) {
  console.log('[sendEmail] ========== START ==========');
  console.log('[sendEmail] Called with:', {
    to: opts.to,
    mode: opts.mode || 'link',
    hasAttachment: !!(opts.attachment?.buffer),
    fileName: opts.fileName
  });
  
  // Check if email sending is enabled
  const enabledRaw = process.env.ENABLE_EMAIL_SENDING;
  const enabled = asBool(enabledRaw);
  
  console.log('[sendEmail] Environment check:');
  console.log(`  ENABLE_EMAIL_SENDING raw: "${enabledRaw}"`);
  console.log(`  Type: ${typeof enabledRaw}`);
  console.log(`  Boolean interpretation: ${enabled}`);
  
  if (!enabled) {
    console.log('[sendEmail] ❌ SKIPPED: Email sending is disabled');
    return { skipped: true, reason: 'disabled', rawValue: enabledRaw };
  }
  
  // Check API key
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.log('[sendEmail] ❌ SKIPPED: SENDGRID_API_KEY is missing');
    return { skipped: true, reason: 'no_api_key' };
  }
  
  console.log('[sendEmail] ✅ Configuration OK');
  console.log(`[sendEmail] API Key prefix: ${apiKey.slice(0, 10)}...`);
  
  try {
    sgMail.setApiKey(apiKey);
    
    const from = {
      email: process.env.SENDGRID_FROM_EMAIL || 'datagate@138io.com',
      name: process.env.SENDGRID_FROM_NAME || '138DataGate'
    };
    
    console.log('[sendEmail] From:', from);
    
    const msg = {
      to: opts.to,
      from,
      subject: '【138DataGate】ファイル受信のご案内',
      text: `ファイルが届きました。\n\nダウンロードリンク: ${opts.downloadUrl}\nワンタイムパスワード: ${opts.otp}\n\n有効期限: 7日間`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">ファイル受信のご案内</h2>
          <p>ファイルが届きました。</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>ファイル名:</strong> ${opts.fileName || 'ファイル'}</p>
            <p><strong>ダウンロードリンク:</strong><br>
            <a href="${opts.downloadUrl}" style="color: #0066cc;">${opts.downloadUrl}</a></p>
            <p><strong>ワンタイムパスワード:</strong> <code style="font-size: 18px; background: #fff; padding: 5px 10px; border: 1px solid #ddd;">${opts.otp}</code></p>
          </div>
          <p style="color: #666; font-size: 14px;">有効期限: 7日間</p>
        </div>
      `
    };
    
    // Add attachment if in direct mode
    if (opts.mode === 'attach' && opts.attachment?.buffer) {
      console.log('[sendEmail] Adding attachment:', opts.attachment.filename);
      msg.attachments = [{
        content: opts.attachment.buffer.toString('base64'),
        filename: opts.attachment.filename || 'attachment',
        type: 'application/octet-stream',
        disposition: 'attachment'
      }];
    }
    
    console.log('[sendEmail] Sending email...');
    const response = await sgMail.send(msg);
    console.log('[sendEmail] ✅ SUCCESS: Status', response[0]?.statusCode);
    console.log('[sendEmail] ========== END ==========');
    return { sent: true, status: response[0]?.statusCode };
    
  } catch (error) {
    console.error('[sendEmail] ❌ ERROR:', error.message);
    if (error.response) {
      console.error('[sendEmail] Response error:', error.response.body);
    }
    console.log('[sendEmail] ========== END (ERROR) ==========');
    throw error;
  }
}

function canUseDirectAttach(file) {
  console.log('[canUseDirectAttach] Checking file:', file.originalname);
  
  // Check if email sending is enabled first
  const emailEnabled = asBool(process.env.ENABLE_EMAIL_SENDING);
  if (!emailEnabled) {
    console.log('[canUseDirectAttach] Email disabled - no direct attach');
    return false;
  }
  
  // Direct attach disabled in sandbox mode
  if (process.env.MAIL_SANDBOX === 'true') {
    console.log('[canUseDirectAttach] Sandbox mode - direct attach disabled');
    return false;
  }
  
  // Size check (10MB limit for attachments)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    console.log('[canUseDirectAttach] File too large:', file.size);
    return false;
  }
  
  console.log('[canUseDirectAttach] ✅ Allowed for file:', file.originalname);
  return true;
}

module.exports = { sendEmail, canUseDirectAttach };
