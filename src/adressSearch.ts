export type AddressCandidate = { label: string; lat: number; lng: number };

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 施設名としてOverpassで検索する(大分県内に限定)。
// 「大分オーパ」のような固有名詞は、住所データベースには登録されていないことが多いため、
// 施設名(nameタグ)そのものを検索できるOverpassの方が見つかりやすい。
async function searchFacilities(name: string): Promise<AddressCandidate[]> {
  const pattern = escapeForRegex(name);
  const query = `
    [out:json][timeout:25];
    (
      node["name"~"${pattern}",i](32.7,131.0,33.7,132.1);
      way["name"~"${pattern}",i](32.7,131.0,33.7,132.1);
    );
    out center 8;
  `;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: query });
    const data = await res.json();

    return (data.elements ?? [])
      .map((el: any) => {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (lat == null || lng == null || !el.tags?.name) return null;

        const city = el.tags["addr:city"] ?? el.tags["addr:province"];
        return {
          label: city ? `${el.tags.name}(${city})` : el.tags.name,
          lat,
          lng,
        };
      })
      .filter((c: AddressCandidate | null): c is AddressCandidate => c !== null);
  } catch {
    return [];
  }
}

function simplifyAddress(address: string): string {
  return address
    .replace(/[0-9\-−ー]/g, "")
    .replace(/丁目$/, "")
    .trim();
}

async function searchByAddress(q: string): Promise<AddressCandidate[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&countrycodes=jp&limit=8&q=${encodeURIComponent(q)}`,
    { headers: { "Accept-Language": "ja" } }
  );
  const data = await res.json();

  return (data as any[]).map((item) => ({
    label: item.display_name,
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
  }));
}

// 座標が近い、または表示名が完全一致する候補は重複とみなして1つにまとめる
function dedupeCandidates(candidates: AddressCandidate[]): AddressCandidate[] {
  const result: AddressCandidate[] = [];
  for (const c of candidates) {
    const isDuplicate = result.some(
      (r) =>
        r.label === c.label ||
        (Math.abs(r.lat - c.lat) < 0.003 && Math.abs(r.lng - c.lng) < 0.003)
    );
    if (!isDuplicate) result.push(c);
  }
  return result;
}

// 施設名検索(大分県内優先) + 住所検索(全国)の結果を合わせて候補として返す。
// 1つに自動で絞り込むと誤爆する(例:「オーパ」で大阪がヒットする)ため、
// 複数候補を出して人に選んでもらう設計にしている。
export async function searchAddressCandidates(query: string): Promise<AddressCandidate[]> {
  const [facilities, addresses] = await Promise.all([searchFacilities(query), searchByAddress(query)]);

  let combined = dedupeCandidates([...facilities, ...addresses]);

  if (combined.length === 0) {
    const simplified = simplifyAddress(query);
    if (simplified && simplified !== query) {
      combined = dedupeCandidates(await searchByAddress(simplified));
    }
  }

  return combined.slice(0, 8);
}