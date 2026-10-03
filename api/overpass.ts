// Overpass本家(overpass-api.de)がクラウドのIPアドレスをブロックしている可能性があるため、
// 運営元の異なる複数のミラーサーバーを順番に試す
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];

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

  let lastErrorText = "";

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "*/*",
          "User-Agent": "Mozilla/5.0 (compatible; spot-app/1.0)",
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!upstream.ok) {
        lastErrorText = `${endpoint} returned ${upstream.status}`;
        continue;
      }

      const data = await upstream.json();
      res.status(200).json(data);
      return;
    } catch (e) {
      lastErrorText = `${endpoint} failed: ${e}`;
    }
  }

  res.status(502).json({ error: `すべてのOverpassサーバーへの接続に失敗しました: ${lastErrorText}` });
}