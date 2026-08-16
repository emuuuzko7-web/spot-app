import type { Spot } from "./types";

// 残り時間に対して、どれだけ余裕を持って行けるかを0〜100点に変換する
// (近ければ近いほど高得点)
function distanceScore(walkMinutes: number, remainingMinutes: number): number {
  const ratio = walkMinutes / Math.max(remainingMinutes, 1);
  return Math.max(0, 100 * (1 - ratio));
}

// スポットの「おすすめ度」を点数にする。
// 勉強モードはWi-Fi・電源を重視、遊びモードは今のところ情報が少ないため距離を主軸にする。
export function scoreSpot(spot: Spot, remainingMinutes: number, isStudyMode: boolean): number {
  const dist = distanceScore(spot.walkMinutes, remainingMinutes);

  if (isStudyMode) {
    const wifi = spot.hasWifi ? 40 : 0;
    const power = spot.hasPower ? 40 : 0;
    return dist * 0.2 + wifi + power;
  }

  // 大分市公式データ等、noteがある(=確定情報がある)スポットは少し優先する
  const trustBonus = spot.note ? 10 : 0;
  return dist + trustBonus;
}