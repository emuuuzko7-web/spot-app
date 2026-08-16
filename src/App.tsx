import { useState } from "react";
import { distanceMeters, distanceToWalkMinutes } from "./geo";
import { knownStudySpots } from "./knownSpots";
import type { Spot } from "./types";

type LocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; lat: number; lng: number; accuracy?: number; source: "gps" | "manual" }
  | { status: "error"; message: string };

function App() {
  const [selectedPurpose, setSelectedPurpose] = useState<string | null>(null);
  const [remainingMinutes, setRemainingMinutes] = useState(60);
  const [needsWifi, setNeedsWifi] = useState(false);
  const [needsPower, setNeedsPower] = useState(false);
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [manualAddress, setManualAddress] = useState("");
  const [spots, setSpots] = useState<Spot[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const purposes = [
    { key: "study", label: "📚 勉強したい" },
    { key: "work", label: "💻 作業したい" },
    { key: "break", label: "☕ 休憩したい" },
    { key: "hangout", label: "🧑‍🤝‍🧑 友達と過ごしたい" },
    { key: "kill_time", label: "🕐 時間をつぶしたい" },
  ];

  const filteredSpots = spots.filter((spot) => {
    if (needsWifi && !spot.hasWifi) return false;
    if (needsPower && !spot.hasPower) return false;
    if (spot.walkMinutes > remainingMinutes) return false;
    return true;
  });

  // GPS(ブラウザ標準)で現在地を取得する
  function handleGetLocation() {
    setLocation({ status: "loading" });

    if (!navigator.geolocation) {
      setLocation({ status: "error", message: "このブラウザは位置情報に対応していません" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          status: "success",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: "gps",
        });
      },
      () => {
        setLocation({ status: "error", message: "位置情報の取得が許可されませんでした" });
      }
    );
  }

  // 住所や地名を手入力して、Nominatim(無料のジオコーディングAPI)で座標に変換する
  async function handleManualLocation() {
    if (!manualAddress) return;
    setLocation({ status: "loading" });

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(manualAddress)}`,
        { headers: { "Accept-Language": "ja" } }
      );
      const data = await res.json();

      if (data.length === 0) {
        setLocation({ status: "error", message: "場所が見つかりませんでした" });
        return;
      }

      setLocation({
        status: "success",
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        source: "manual",
      });
    } catch (e) {
      setLocation({ status: "error", message: "検索中にエラーが発生しました" });
    }
  }

  // OpenStreetMap(Overpass API)から現在地周辺のカフェ・図書館を取得し、
  // 大分市の確定スポット情報と合体させる
  async function handleSearchSpots() {
    if (location.status !== "success") return;
    setIsSearching(true);

    const { lat, lng } = location;
    const radius = 1500;

    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="cafe"](around:${radius},${lat},${lng});
        node["amenity"="library"](around:${radius},${lat},${lng});
      );
      out body;
    `;

    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query,
      });
      const data = await res.json();

      const converted: Spot[] = data.elements
        .filter((el: any) => el.tags?.name)
        .map((el: any) => {
          const dist = distanceMeters(lat, lng, el.lat, el.lon);
          const name = el.tags.name;
          const isUniversityFacility = name.includes("大学");

          return {
            id: el.id,
            name,
            walkMinutes: distanceToWalkMinutes(dist),
            hasWifi: el.tags.internet_access === "wlan" || el.tags.internet_access === "yes",
            hasPower: false,
            note: isUniversityFacility ? "学外利用制限の可能性あり(要確認)" : undefined,
          };
        });

      // 確定スポットも、現在地からの実際の徒歩時間を計算し直す
      const knownWithDistance: Spot[] = knownStudySpots.map((spot) => {
        const dist = distanceMeters(lat, lng, spot.lat, spot.lng);
        return { ...spot, walkMinutes: distanceToWalkMinutes(dist) };
      });

      // 修正後：完全一致ではなく、名前が互いに一部でも含まれていたら「同じ施設」とみなす
    const dedupedOsmResults = converted.filter((osmSpot) => {
      const isDuplicate = knownWithDistance.some(
        (known) => known.name.includes(osmSpot.name) || osmSpot.name.includes(known.name)
      );
      return !isDuplicate;
    });

      setSpots([...knownWithDistance, ...dedupedOsmResults]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div>
      <h1>今、どうする？</h1>

      <div>
        <button onClick={handleGetLocation}>📍 現在地を取得</button>

        <div>
          <input
            type="text"
            placeholder="住所や地名を入力(例: 大分駅)"
            value={manualAddress}
            onChange={(e) => setManualAddress(e.target.value)}
          />
          <button onClick={handleManualLocation}>この場所で検索</button>
        </div>

        {location.status === "loading" && <p>取得中...</p>}
        {location.status === "success" && (
          <p>
            現在地({location.source === "gps" ? "GPS推定" : "手入力"}): 緯度
            {location.lat.toFixed(4)} / 経度{location.lng.toFixed(4)}
            {location.accuracy && <> / 誤差 約{Math.round(location.accuracy)}m</>}
          </p>
        )}
        {location.status === "error" && <p style={{ color: "red" }}>{location.message}</p>}
      </div>

      <div>
        {purposes.map((p) => (
          <button
            key={p.key}
            onClick={() => setSelectedPurpose(p.key)}
            style={{
              backgroundColor: selectedPurpose === p.key ? "#4E6B4A" : "#eee",
              color: selectedPurpose === p.key ? "white" : "black",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {selectedPurpose && (
        <div>
          <p>選んだ目的: {selectedPurpose}</p>

          <label>
            残り時間(分):
            <input
              type="number"
              value={remainingMinutes}
              onChange={(e) => setRemainingMinutes(Number(e.target.value))}
            />
          </label>

          <div>
            <label>
              <input
                type="checkbox"
                checked={needsWifi}
                onChange={(e) => setNeedsWifi(e.target.checked)}
              />
              Wi-Fi必須
            </label>

            <label>
              <input
                type="checkbox"
                checked={needsPower}
                onChange={(e) => setNeedsPower(e.target.checked)}
              />
              コンセント必須
            </label>
          </div>

          <button onClick={handleSearchSpots} disabled={location.status !== "success" || isSearching}>
            {isSearching ? "検索中..." : "この条件で探す"}
          </button>

          <h2>候補: {filteredSpots.length}件</h2>
          <ul>
            {filteredSpots.map((spot) => (
              <li key={spot.id}>
                {spot.name}(徒歩{spot.walkMinutes}分 / Wi-Fi:
                {spot.hasWifi ? "○" : "不明"} / 電源:
                {spot.hasPower ? "○" : "不明"})
                {spot.note && (
                  <span style={{ color: "#B8623D", marginLeft: "8px" }}>⚠️ {spot.note}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;