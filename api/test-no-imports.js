// KVのインポートなし
export default async function handler(request) {
  try {
    const now = new Date().toISOString();
    const response = {
      success: true,
      message: 'API is working (no KV import)',
      timestamp: now,
      method: request.method,
      url: request.url
    };
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}
