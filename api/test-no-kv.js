// KVを使わない最小テスト
export default async function handler(request) {
  const now = new Date().toISOString();
  return new Response(JSON.stringify({
    success: true,
    message: 'Hello from Vercel',
    timestamp: now,
    method: request.method
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
