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
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // ブラウザが自動で付けてくれるヘッダーを、サーバー間通信でも明示的に再現する。
        // これらが無いと、Overpass側が不審なリクエストとして406で拒否することがある。
        Accept: "*/*",
        "User-Agent": "Mozilla/5.0 (compatible; spot-app/1.0)",
      },
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