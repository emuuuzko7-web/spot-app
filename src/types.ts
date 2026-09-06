export type Spot = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  walkMinutes: number;
  hasWifi: boolean;
  hasPower: boolean;
  category: "cafe" | "library" | "restaurant" | "bar" | "other";
  note?: string;
  isUserSubmitted?: boolean;
};