export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const query = req.body?.query;
    if (!query) {
      res.status(400).json({ error: "query is required" });
      return;
    }

    // "data=" を付けた形式(application/x-www-form-urlencoded)で送ると、
    // Overpass API公式のドキュメントで案内されている標準的な呼び出し方になる
    const upstream = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).json({ error: `Overpass returned ${upstream.status}: ${text.slice(0, 200)}` });
      return;
    }

    const data = await upstream.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: "Overpassサーバーへの接続に失敗しました" });
  }
}