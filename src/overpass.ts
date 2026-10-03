const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];

const TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Overpass APIの公開サーバーは無料ゆえに、混雑時にCORSエラーや406、
// またはタイムアウトで応答しないことがある。複数のミラーサーバーを
// 順番に試し、1つあたり15秒で諦めて次を試すことで、
// 「検索中…」のまま固まって見える状態を避ける。
export async function queryOverpass(query: string): Promise<any> {
  let lastError: unknown = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(endpoint, { method: "POST", body: query });
      if (!res.ok) {
        lastError = new Error(`${endpoint} returned ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError ?? new Error("すべてのOverpassサーバーへの接続に失敗しました");
}