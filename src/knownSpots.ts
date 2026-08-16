import type { Spot } from "./types";

// 大分市が公式に情報提供している学習スペース。
// 出典: 大分市「大分市の学習スペース情報をお知らせします」
// https://www.city.oita.oita.jp/o197/gakushuspacejouhou.html
//
// OSM(Overpass API)のデータだけでは「学習席の有無」「学外者OKか」までは
// 分からないため、確実な情報として手動でデータ化している。
// 座標はおおよその位置(住所からの概算)。正確な位置は今後Googleマップ等で要確認。
export const knownStudySpots: (Spot & { lat: number; lng: number })[] = [
  {
    id: -1, // OSMのidと衝突しないよう負の数にしている
    name: "大分市民図書館(ホルトホール大分内)",
    lat: 33.2368,
    lng: 131.6109,
    walkMinutes: 0, // 検索時に実際の現在地から計算し直す
    hasWifi: true,
    hasPower: false, // 電源席の有無は未確認のため不明扱い
    note: "学習席96席・誰でも利用可(学外者OK)",
  },
  {
    id: -2,
    name: "大分市民図書館 コンパルホール分館",
    lat: 33.2412,
    lng: 131.6067,
    walkMinutes: 0,
    hasWifi: false, // 未確認
    hasPower: false, // 未確認
    note: "比較的空いている穴場との情報あり・誰でも利用可",
  },
  {
    id: -3,
    name: "大分県立図書館",
    lat: 33.2603,
    lng: 131.6255,
    walkMinutes: 0,
    hasWifi: false, // 未確認
    hasPower: false, // 未確認
    note: "独立館で静かとの情報あり・誰でも利用可",
  },
];