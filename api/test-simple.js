// 最もシンプルなテストエンドポイント
export default async function handler(request) {
  return new Response(JSON.stringify({
    success: true,
    message: 'Test endpoint is working',
    method: request.method,
    url: request.url
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
