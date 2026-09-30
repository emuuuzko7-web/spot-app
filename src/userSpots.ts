import { supabase } from "./supabaseClient";
import type { Spot, PowerLevel } from "./types";

export type NewUserSpot = {
  name: string;
  lat: number;
  lng: number;
  category: Spot["category"];
  hasWifi: boolean;
  powerLevel: PowerLevel;
  note?: string;
  crowdingNote?: string;
};

export async function fetchUserSpots(): Promise<Spot[]> {
  const { data, error } = await supabase
    .from("user_spots")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("スポット取得エラー:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: 1000000 + row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    walkMinutes: 0,
    hasWifi: row.has_wifi,
    hasPower: row.power_level !== "unknown" && row.power_level !== "none",
    powerLevel: (row.power_level ?? "unknown") as PowerLevel,
    crowdingNote: row.crowding_note ?? undefined,
    createdAt: row.created_at,
    category: row.category,
    note: row.note ?? undefined,
    isUserSubmitted: true,
  }));
}

export async function addUserSpot(spot: NewUserSpot): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("user_spots").insert({
    name: spot.name,
    lat: spot.lat,
    lng: spot.lng,
    category: spot.category,
    has_wifi: spot.hasWifi,
    has_power: spot.powerLevel !== "unknown" && spot.powerLevel !== "none",
    power_level: spot.powerLevel,
    note: spot.note ?? null,
    crowding_note: spot.crowdingNote ?? null,
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// 全角スペース・半角スペースの違いを無視して比較するため、名前を正規化する
function normalizeName(name: string): string {
  return name.replace(/[\u3000\s]+/g, "").trim();
}

export async function findSimilarUserSpot(
  name: string,
  lat: number,
  lng: number
): Promise<{ id: number; name: string; note: string | null; crowdingNote: string | null } | null> {
  const { data, error } = await supabase.from("user_spots").select("id, name, lat, lng, note, crowding_note");
  if (error || !data) return null;

  const normalizedInput = normalizeName(name);

  const match = data.find((row) => {
    const dist = Math.sqrt((row.lat - lat) ** 2 + (row.lng - lng) ** 2) * 111000;
    const normalizedRow = normalizeName(row.name);
    const isSameName = normalizedRow.includes(normalizedInput) || normalizedInput.includes(normalizedRow);

    // 座標が近い(150m以内)か、名前がほぼ一致していて距離もそこそこ近い(2km以内)なら同一とみなす。
    // 地図ピン留めは数百m単位でズレることがあるため、名前が一致する場合は距離の許容範囲を広げている。
    return dist < 150 || (isSameName && dist < 2000);
  });

  return match ? { id: match.id, name: match.name, note: match.note, crowdingNote: match.crowding_note } : null;
}

// 既存スポットへの2回目以降の投稿を反映する。
// Wi-Fi・電源の多さは最新の情報で上書きし(情報は変化しうるため)、
// コメント・混雑メモはこれまでの投稿に追記して積み重ねる。
export async function mergeUserSpotSubmission(
  id: number,
  existing: { name: string; note: string | null; crowdingNote: string | null },
  submission: { name: string; note?: string; hasWifi: boolean; powerLevel: PowerLevel; crowdingNote?: string }
): Promise<{ success: boolean; error?: string }> {
  const combinedNote = submission.note
    ? existing.note
      ? `${existing.note} / ${submission.note}`
      : submission.note
    : existing.note;

  const combinedCrowding = submission.crowdingNote
    ? existing.crowdingNote
      ? `${existing.crowdingNote} / ${submission.crowdingNote}`
      : submission.crowdingNote
    : existing.crowdingNote;

  // 呼び方(表記)が違う場合、両方の名前を「/」で繋いで残す(片方だけ採用して消さない)
  const isSameSpelling = existing.name.trim() === submission.name.trim();
  const combinedName = isSameSpelling ? existing.name : `${existing.name} / ${submission.name}`;

  const { error } = await supabase
    .from("user_spots")
    .update({
      name: combinedName,
      note: combinedNote ?? null,
      crowding_note: combinedCrowding ?? null,
      has_wifi: submission.hasWifi,
      power_level: submission.powerLevel,
      has_power: submission.powerLevel !== "unknown" && submission.powerLevel !== "none",
    })
    .eq("id", id);

  return { success: !error, error: error?.message };
}