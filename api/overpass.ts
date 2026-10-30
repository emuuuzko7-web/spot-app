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

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${endpoint} returned ${res.status}: ${text.slice(0, 200)}`);
    }
    return await res.json();
  } catch (e: any) {
    // タイムアウトや接続失敗も、どのサーバーかが分かるようにする
    if (e?.message?.startsWith(endpoint)) throw e;
    throw new Error(`${endpoint} failed: ${e?.name ?? ""} ${e?.message ?? e}`);
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
  } catch (e: any) {
    const details = Array.isArray(e?.errors)
      ? e.errors.map((x: any) => String(x?.message ?? x))
      : [String(e?.message ?? e)];
    return new Response(
      JSON.stringify({ error: "すべてのOverpassサーバーへの接続に失敗しました", details }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}