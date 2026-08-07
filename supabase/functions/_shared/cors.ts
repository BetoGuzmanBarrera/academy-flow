const ALLOWED_ORIGINS: string[] = [
  'https://academy-flow-mx.bolt.host',
  'http://localhost:5173',
];

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  };

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

export function handleOptions(req: Request): Response {
  const origin = req.headers.get('Origin');
  return new Response(null, {
    status: 200,
    headers: getCorsHeaders(origin),
  });
}
