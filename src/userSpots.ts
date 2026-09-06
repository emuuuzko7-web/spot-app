import { supabase } from "./supabaseClient";
import type { Spot } from "./types";

export type NewUserSpot = {
  name: string;
  lat: number;
  lng: number;
  category: Spot["category"];
  hasWifi: boolean;
  hasPower: boolean;
  note?: string;
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
    id: 1000000 + row.id, // OSM・確定スポットのidと衝突しないよう大きくオフセットする
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    walkMinutes: 0, // 検索時に現在地から計算し直す
    hasWifi: row.has_wifi,
    hasPower: row.has_power,
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
    has_power: spot.hasPower,
    note: spot.note ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

// 近く(50m以内)に、似た名前の投稿が既にあるか確認する
export async function findSimilarUserSpot(
  name: string,
  lat: number,
  lng: number
): Promise<{ id: number; note: string | null } | null> {
  const { data, error } = await supabase.from("user_spots").select("id, name, lat, lng, note");

  if (error || !data) return null;

  const match = data.find((row) => {
    const isSameName = row.name.includes(name) || name.includes(row.name);
    const dist = Math.sqrt((row.lat - lat) ** 2 + (row.lng - lng) ** 2) * 111000; // ざっくりメートル換算
    return isSameName && dist < 50;
  });

  return match ? { id: match.id, note: match.note } : null;
}

// 既存の投稿にコメントを追記する
export async function appendNoteToUserSpot(id: number, newNote: string, existingNote: string | null) {
  const combined = existingNote ? `${existingNote} / ${newNote}` : newNote;
  const { error } = await supabase.from("user_spots").update({ note: combined }).eq("id", id);
  return { success: !error, error: error?.message };
}