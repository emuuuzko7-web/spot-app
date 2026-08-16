import type { Spot } from "./types";

// 大分市が公式に情報提供している学習スペース。
// 出典: 大分市「大分市の学習スペース情報をお知らせします」
export const knownStudySpots: Spot[] = [
  {
    id: -1,
    name: "大分市民図書館(ホルトホール大分内)",
    lat: 33.2368,
    lng: 131.6109,
    walkMinutes: 0,
    hasWifi: true,
    category: "library",
    hasPower: false,
    note: "学習席96席・誰でも利用可(学外者OK)",
  },
  {
    id: -2,
    name: "大分市民図書館 コンパルホール分館",
    lat: 33.2412,
    lng: 131.6067,
    walkMinutes: 0,
    hasWifi: false,
    category: "library",
    hasPower: false,
    note: "比較的空いている穴場との情報あり・誰でも利用可",
  },
  {
    id: -3,
    name: "大分県立図書館",
    lat: 33.2603,
    lng: 131.6255,
    walkMinutes: 0,
    hasWifi: false,
    category: "library",
    hasPower: false,
    note: "独立館で静かとの情報あり・誰でも利用可",
  },
];