// Edge Runtimeで実行する(通常のサーバー関数とは異なるネットワーク経路を使うため、
// Overpass側のIPブロックを回避できる可能性がある)
export const config = { runtime: "edge" };

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];

const PER_REQUEST_TIMEOUT_MS = 8000;

async function fetchOne(endpoint: string, query: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "*/*",
        "User-Agent": "Mozilla/5.0 (compatible; spot-app/1.0)",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`${endpoint} returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const body = await req.json().catch(() => null);
  const query = body?.query;
  if (!query) {
    return new Response(JSON.stringify({ error: "query is required" }), { status: 400 });
  }

  try {
    const data = await Promise.any(OVERPASS_ENDPOINTS.map((endpoint) => fetchOne(endpoint, query)));
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "すべてのOverpassサーバーへの接続に失敗しました" }), {
      status: 502,
    });
  }
}