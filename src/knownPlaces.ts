// Nominatim(住所検索)は、知名度の低い固有名詞だと無関係な場所を
// 返してしまうことがある(例: 「大分大学」で検索すると別の県の大学がヒットする等)。
// そのため、よく検索されそうな大分の主要施設は、先にこちらで確実な座標を返す。
type KnownPlace = { keywords: string[]; lat: number; lng: number; label: string };

const knownPlaces: KnownPlace[] = [
  {
    keywords: ["大分大学", "旦野原キャンパス"],
    lat: 33.177355,
    lng: 131.615055,
    label: "大分大学 旦野原キャンパス",
  },
  // 今後、誤検索が見つかった施設があればここに追加していく
];

export function findKnownPlace(query: string): KnownPlace | null {
  const normalized = query.trim();
  return knownPlaces.find((place) => place.keywords.some((k) => normalized.includes(k))) ?? null;
}