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

    const upstream = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: query,
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Overpass returned ${upstream.status}` });
      return;
    }

    const data = await upstream.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: "Overpassサーバーへの接続に失敗しました" });
  }
}