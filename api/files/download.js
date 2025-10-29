import kv from '@vercel/kv';

const maskEmail = (mail) => {
  if (!mail || !mail.includes('@')) return '';
  const [l, d] = mail.split('@');
  const lm = l.length <= 2 ? l[0] + '*' : l[0] + '***' + l.slice(-1);
  const [d1, ...rest] = d.split('.');
  const dm = (d1.length <= 2 ? d1[0] + '*' : d1[0] + '***') + (rest.length ? '.' + rest.join('.') : '');
  return `${lm}@${dm}`;
};

const safeParseMeta = (metaVal) => {
  if (!metaVal) return null;
  // v2: object をそのまま返す / v1: string を JSON.parse
  if (typeof metaVal === 'string') {
    try { return JSON.parse(metaVal); } catch { return null; }
  }
  if (typeof metaVal === 'object') return metaVal;
  return null;
};

export default async function handler(request) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // OPTIONS
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  let responded = false;
  const send = (code, body) => {
    if (responded) {
      console.log('[WARNING] Response already sent');
      return;
    }
    responded = true;
    console.log('[DEBUG] Sending response:', code, body);
    return new Response(JSON.stringify(body), { status: code, headers });
  };

  try {
    // URL パラメータから id を取得
    const urlParts = request.url.split('?');
    let id = null;
    if (urlParts.length > 1) {
      const params = new URLSearchParams(urlParts[1]);
      id = params.get('id');
    }

    if (!id) {
      return send(400, { success: false, error: 'File ID is required' });
    }

    if (request.method === 'GET') {
      console.log('[DEBUG] GET handler - fetching metadata for:', id);

      // メタデータ取得
      const metaRaw = await kv.get(`file:${id}:meta`);
      console.log('[DEBUG] metaRaw type:', typeof metaRaw);
      
      const meta = safeParseMeta(metaRaw);
      
      if (!meta) {
        return send(404, { success: false, error: 'File not found', availableTest: true });
      }

      console.log('[DEBUG] Metadata parsed:', meta);

      // 失効チェック
      if (meta.revokedAt) {
        return send(403, { success: false, error: 'File has been revoked' });
      }

      // マスク済みメールアドレス
      const masked = maskEmail(meta.recipientEmail || meta.recipient || '');

      // レスポンス
      return send(200, {
        success: true,
        maskedEmail: masked,
        fileName: meta.fileName || 'unknown',
        fileSize: meta.fileSize || 0,
        downloadCount: meta.downloadCount || 0,
        maxDownloads: meta.maxDownloads ?? 3,
        remainingDownloads: (meta.maxDownloads ?? 3) - (meta.downloadCount || 0)
      });
    }

    // POST は後で実装
    return send(405, { success: false, error: 'Method not allowed' });

  } catch (e) {
    console.error('[files/download GET] fatal:', e);
    return send(500, { success: false, error: e.message || 'Internal error' });
  }
}
