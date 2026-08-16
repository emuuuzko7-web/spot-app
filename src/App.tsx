import { useState, useMemo } from "react";
import { distanceMeters, distanceToWalkMinutes } from "./geo";
import { knownStudySpots } from "./knownSpots";
import { scoreSpot } from "./ranking";
import type { Spot } from "./types";
import { SpotMap } from "./SpotMap";
import "leaflet/dist/leaflet.css";

type LocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; lat: number; lng: number; accuracy?: number; source: "gps" | "manual" }
  | { status: "error"; message: string };

const medals = ["🥇", "🥈", "🥉"];

function WifiBadge({ has }: { has: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        backgroundColor: has ? "#E1F5EE" : "#F1EFE8",
        color: has ? "#085041" : "#5F5E5A",
        fontSize: 12,
        marginRight: 6,
      }}
    >
      📶 {has ? "Wi-Fiあり" : "不明"}
    </span>
  );
}

function PowerBadge({ has }: { has: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        backgroundColor: has ? "#FAEEDA" : "#F1EFE8",
        color: has ? "#633806" : "#5F5E5A",
        fontSize: 12,
      }}
    >
      🔌 {has ? "電源あり" : "不明"}
    </span>
  );
}

function toCategory(amenity: string): Spot["category"] {
  if (amenity === "cafe") return "cafe";
  if (amenity === "library") return "library";
  if (amenity === "restaurant" || amenity === "fast_food") return "restaurant";
  if (amenity === "bar" || amenity === "pub" || amenity === "izakaya") return "bar";
  return "other";
}

function App() {
  const [selectedPurpose, setSelectedPurpose] = useState<string | null>(null);
  const [remainingMinutes, setRemainingMinutes] = useState(60);
  const [needsWifi, setNeedsWifi] = useState(false);
  const [needsPower, setNeedsPower] = useState(false);
  const [genre, setGenre] = useState<"any" | "cafe" | "restaurant">("any");
  const [headcount, setHeadcount] = useState(2);
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

  const isStudyMode = selectedPurpose === "study" || selectedPurpose === "work";

  const filteredSpots = useMemo(() => {
    return spots.filter((spot) => {
      if (spot.walkMinutes > remainingMinutes) return false;

      if (isStudyMode) {
        if (needsWifi && !spot.hasWifi) return false;
        if (needsPower && !spot.hasPower) return false;
      } else {
        if (genre !== "any" && spot.category !== genre) return false;
      }

      return true;
    });
  }, [spots, needsWifi, needsPower, remainingMinutes, isStudyMode, genre]);

  // 点数順に並び替えたスポット一覧。先頭3件が「おすすめトップ3」になる
  const rankedSpots = useMemo(() => {
    return [...filteredSpots].sort(
      (a, b) => scoreSpot(b, remainingMinutes, isStudyMode) - scoreSpot(a, remainingMinutes, isStudyMode)
    );
  }, [filteredSpots, remainingMinutes, isStudyMode]);

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

  async function handleSearchSpots() {
    if (location.status !== "success") return;
    setIsSearching(true);

    const { lat, lng } = location;
    const radius = 1500;

    const amenities = isStudyMode ? ["cafe", "library"] : ["cafe", "restaurant", "bar"];
    const amenityQuery = amenities
      .map((a) => `node["amenity"="${a}"](around:${radius},${lat},${lng});`)
      .join("\n");

    const query = `
      [out:json][timeout:25];
      (
        ${amenityQuery}
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
            lat: el.lat,
            lng: el.lon,
            walkMinutes: distanceToWalkMinutes(dist),
            hasWifi: el.tags.internet_access === "wlan" || el.tags.internet_access === "yes",
            hasPower: false,
            category: toCategory(el.tags.amenity),
            note: isUniversityFacility ? "学外利用制限の可能性あり(要確認)" : undefined,
          };
        });

      const knownWithDistance: Spot[] = knownStudySpots.map((spot) => {
        const dist = distanceMeters(lat, lng, spot.lat, spot.lng);
        return { ...spot, walkMinutes: distanceToWalkMinutes(dist) };
      });

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

          {isStudyMode ? (
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
          ) : (
            <div>
              <label>
                人数:
                <input
                  type="number"
                  value={headcount}
                  min={1}
                  onChange={(e) => setHeadcount(Number(e.target.value))}
                />
                人
              </label>

              <div>
                <label>
                  <input
                    type="radio"
                    name="genre"
                    checked={genre === "any"}
                    onChange={() => setGenre("any")}
                  />
                  なんでも
                </label>
                <label>
                  <input
                    type="radio"
                    name="genre"
                    checked={genre === "cafe"}
                    onChange={() => setGenre("cafe")}
                  />
                  カフェ
                </label>
                <label>
                  <input
                    type="radio"
                    name="genre"
                    checked={genre === "restaurant"}
                    onChange={() => setGenre("restaurant")}
                  />
                  居酒屋・レストラン
                </label>
              </div>
            </div>
          )}

          <button onClick={handleSearchSpots} disabled={location.status !== "success" || isSearching}>
            {isSearching ? "検索中..." : "この条件で探す"}
          </button>

          <h2>候補: {rankedSpots.length}件</h2>
          <ul>
            {rankedSpots.map((spot, index) => (
              <li key={spot.id} style={{ marginBottom: 8 }}>
                <div>
                  {index < 3 && <strong>{medals[index]} </strong>}
                  {spot.name}(徒歩{spot.walkMinutes}分)
                  <a
                    href={`https://www.tiktok.com/search?q=${encodeURIComponent(spot.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ marginLeft: 8, fontSize: 12 }}
                  >
                    🎵 TikTokで検索
                  </a>
                </div>
                {isStudyMode && (
                  <>
                    <WifiBadge has={spot.hasWifi} />
                    <PowerBadge has={spot.hasPower} />
                  </>
                )}
                {spot.note && (
                  <span style={{ color: "#B8623D", marginLeft: 6, fontSize: 12 }}>
                    ⚠️ {spot.note}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {location.status === "success" && (
            <SpotMap center={{ lat: location.lat, lng: location.lng }} spots={rankedSpots} />
          )}
        </div>
      )}
    </div>
  );
}

export default App;