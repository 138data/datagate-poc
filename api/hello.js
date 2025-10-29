export default async function handler(request) {
  const now = new Date().toISOString();
  return new Response(JSON.stringify({
    success: true,
    message: 'Hello from Vercel (no KV)',
    timestamp: now,
    method: request.method,
    url: request.url
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
