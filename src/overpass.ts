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

// 開発環境(npm run dev)では、これまで通りブラウザから直接Overpassに問い合わせる
async function queryOverpassDirect(query: string): Promise<any> {
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

// 本番環境(Vercel)では、クラウドのIPからの直接アクセスがOverpass側に
// CORSエラーとして拒否されることがあるため、自前のサーバー(api/overpass.ts)を
// 経由して問い合わせる。ブラウザからは常に同じドメインへの通信になるため、
// CORSの制約自体が発生しなくなる。
async function queryOverpassViaProxy(query: string): Promise<any> {
  const res = await fetchWithTimeout("/api/overpass", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(`プロキシ経由の検索に失敗しました(${res.status}): ${body?.error ?? "詳細不明"}`);
  }
  return res.json();
}

export async function queryOverpass(query: string): Promise<any> {
  if (import.meta.env.DEV) {
    return queryOverpassDirect(query);
  }
  return queryOverpassViaProxy(query);
}