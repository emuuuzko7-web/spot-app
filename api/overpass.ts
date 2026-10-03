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

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const query = req.body?.query;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  try {
    // 3つのサーバーに同時に問い合わせ、一番早く成功したものを採用する。
    // 順番に試すとVercelの関数実行時間(10秒程度)を超えてしまうため、並行処理にしている。
    const data = await Promise.any(OVERPASS_ENDPOINTS.map((endpoint) => fetchOne(endpoint, query)));
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: "すべてのOverpassサーバーへの接続に失敗しました" });
  }
}