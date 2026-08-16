// 2点間の距離をメートルで計算する関数(Haversine公式)
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 地球の半径(メートル)
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 直線距離ではなく実際の道のりを見積もる(係数1.3倍で簡易補正)。徒歩速度は分速80mで計算
export function distanceToWalkMinutes(meters: number): number {
  const estimatedRouteDistance = meters * 1.3;
  return Math.round(estimatedRouteDistance / 80);
}