export type PowerLevel = "unknown" | "none" | "few" | "some" | "most";

export type Spot = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  walkMinutes: number;
  hasWifi: boolean;
  hasPower: boolean;
  powerLevel?: PowerLevel;
  crowdingNote?: string;
  createdAt?: string;
  category: "cafe" | "library" | "restaurant" | "bar" | "other";
  note?: string;
  isUserSubmitted?: boolean;
};

export const POWER_LEVEL_LABELS: Record<PowerLevel, string> = {
  unknown: "電源情報なし",
  none: "電源なし",
  few: "カウンターのみ",
  some: "一部の席",
  most: "ほぼ全席",
};