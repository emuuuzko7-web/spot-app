import { useState, useMemo } from "react";
import { distanceMeters, distanceToWalkMinutes } from "./geo";
import { knownStudySpots } from "./knownSpots";
import { scoreSpot } from "./ranking";
import { reverseGeocode } from "./geocode";
import type { Spot } from "./types";
import { SpotMap } from "./SpotMap";
import "leaflet/dist/leaflet.css";
import "./App.css";
import { findKnownPlace } from "./knownPlaces";

type LocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; lat: number; lng: number; accuracy?: number; source: "gps" | "manual"; label?: string }
  | { status: "error"; message: string };

const medals = ["🥇", "🥈", "🥉"];

function WifiBadge({ has }: { has: boolean }) {
  return (
    <span className={`badge ${has ? "badge--wifi-on" : "badge--wifi-off"}`}>
      📶 {has ? "Wi-Fiあり" : "不明"}
    </span>
  );
}

function PowerBadge({ has }: { has: boolean }) {
  return (
    <span className={`badge ${has ? "badge--power-on" : "badge--power-off"}`}>
      🔌 {has ? "電源あり" : "不明"}
    </span>
  );
}

function SpotRow({ spot, rank, isStudyMode }: { spot: Spot; rank?: number; isStudyMode: boolean }) {
  return (
    <li className={`spot-item ${rank !== undefined ? "spot-item--top" : ""}`}>
      {rank !== undefined && <span className="rank-tile">{medals[rank]}</span>}
      <div className="spot-body">
        <div className="spot-name-row">
          <span className="spot-name">{spot.name}</span>
          <span className="spot-walk">徒歩{spot.walkMinutes}分</span>
            <a
            className="tiktok-link"
            href={`https://www.tiktok.com/search?q=${encodeURIComponent(spot.name)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            🎵 TikTok
          </a>
        </div>
        {isStudyMode && (
          <div className="badge-row">
            <WifiBadge has={spot.hasWifi} />
            <PowerBadge has={spot.hasPower} />
          </div>
        )}
        {spot.note && <span className="note-flag">⚠️ {spot.note}</span>}
      </div>
    </li>
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
  const [showAllSpots, setShowAllSpots] = useState(false);

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

  const rankedSpots = useMemo(() => {
    return [...filteredSpots].sort(
      (a, b) => scoreSpot(b, remainingMinutes, isStudyMode) - scoreSpot(a, remainingMinutes, isStudyMode)
    );
  }, [filteredSpots, remainingMinutes, isStudyMode]);

  const topThree = rankedSpots.slice(0, 3);
  const others = rankedSpots.slice(3);

  function handleGetLocation() {
    setLocation({ status: "loading" });

    if (!navigator.geolocation) {
      setLocation({ status: "error", message: "このブラウザは位置情報に対応していません" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        setLocation({ status: "success", lat, lng, accuracy, source: "gps" });

        // 地名の取得には少し時間がかかるので、座標を先に表示してから後で追記する
        const label = await reverseGeocode(lat, lng);
        if (label) {
          setLocation((prev) =>
            prev.status === "success" && prev.lat === lat && prev.lng === lng ? { ...prev, label } : prev
          );
        }
      },
      () => {
        setLocation({ status: "error", message: "位置情報の取得が許可されませんでした" });
      }
    );
  }

async function handleManualLocation() {
  if (!manualAddress) return;
  setLocation({ status: "loading" });

  // まず、誤検索が分かっている主要施設に一致するか確認する
  const known = findKnownPlace(manualAddress);
  if (known) {
    setLocation({
      status: "success",
      lat: known.lat,
      lng: known.lng,
      source: "manual",
      label: known.label,
    });
    return;
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&countrycodes=jp&q=${encodeURIComponent(manualAddress)}`,
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
      label: manualAddress,
    });
  } catch (e) {
    setLocation({ status: "error", message: "検索中にエラーが発生しました" });
  }
}

  async function handleSearchSpots() {
    if (location.status !== "success") return;
    setIsSearching(true);
    setShowAllSpots(false);

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
    <div className="app-shell">
      <p className="eyebrow">Study &amp; Hangout Spot Finder</p>
      <h1 className="title">今、どうする？</h1>
      <p className="subtitle">現在地・目的・残り時間から、今の自分に合う場所を提案します。</p>

      <div className="location-panel">
        <button className="location-btn" onClick={handleGetLocation}>
          📍 現在地を取得
        </button>

        <div className="location-input-row">
          <input
            type="text"
            placeholder="住所や地名を入力(例: 大分駅)"
            value={manualAddress}
            onChange={(e) => setManualAddress(e.target.value)}
          />
          <button onClick={handleManualLocation}>この場所で検索</button>
        </div>

        {location.status === "loading" && <p className="location-status">取得中...</p>}
        {location.status === "success" && (
          <div>
            <p className="location-name">📍 {location.label ?? "現在地を取得しました"}</p>
            <p className="location-coords">
              緯度{location.lat.toFixed(4)} / 経度{location.lng.toFixed(4)}
              {location.accuracy && <> ・誤差 約{Math.round(location.accuracy)}m</>}
            </p>
          </div>
        )}
        {location.status === "error" && (
          <p className="location-status location-status--error">{location.message}</p>
        )}
      </div>

      <div className="purpose-grid">
        {purposes.map((p) => (
          <button
            key={p.key}
            className={`purpose-btn ${selectedPurpose === p.key ? "purpose-btn--active" : ""}`}
            onClick={() => setSelectedPurpose(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {selectedPurpose && (
        <div className="condition-panel">
          <p className="selected-purpose">選んだ目的: {selectedPurpose}</p>

          <div className="time-chip">
            <label htmlFor="remaining-minutes">残り時間(分)</label>
            <input
              id="remaining-minutes"
              type="number"
              value={remainingMinutes}
              onChange={(e) => setRemainingMinutes(Number(e.target.value))}
            />
          </div>

          {isStudyMode ? (
            <div className="condition-row">
              <label className="pill">
                <input type="checkbox" checked={needsWifi} onChange={(e) => setNeedsWifi(e.target.checked)} />
                Wi-Fi必須
              </label>
              <label className="pill">
                <input type="checkbox" checked={needsPower} onChange={(e) => setNeedsPower(e.target.checked)} />
                コンセント必須
              </label>
            </div>
          ) : (
            <>
              <div className="headcount-row">
                人数:
                <input
                  type="number"
                  value={headcount}
                  min={1}
                  onChange={(e) => setHeadcount(Number(e.target.value))}
                />
                人
              </div>

              <div className="condition-row">
                <label className="pill">
                  <input type="radio" name="genre" checked={genre === "any"} onChange={() => setGenre("any")} />
                  なんでも
                </label>
                <label className="pill">
                  <input type="radio" name="genre" checked={genre === "cafe"} onChange={() => setGenre("cafe")} />
                  カフェ
                </label>
                <label className="pill">
                  <input
                    type="radio"
                    name="genre"
                    checked={genre === "restaurant"}
                    onChange={() => setGenre("restaurant")}
                  />
                  居酒屋・レストラン
                </label>
              </div>
            </>
          )}

          <button
            className="search-btn"
            onClick={handleSearchSpots}
            disabled={location.status !== "success" || isSearching}
          >
            {isSearching ? "検索中..." : "この条件で探す"}
          </button>

          <h2 className="results-heading">候補: {rankedSpots.length}件</h2>

          {rankedSpots.length === 0 ? (
            <p className="empty-state">まだ検索していないか、条件に合う場所が見つかりませんでした。</p>
          ) : (
            <>
              <ul className="spot-list">
                {topThree.map((spot, index) => (
                  <SpotRow key={spot.id} spot={spot} rank={index} isStudyMode={isStudyMode} />
                ))}
              </ul>

              {others.length > 0 && (
                <>
                  <button className="show-more-btn" onClick={() => setShowAllSpots((v) => !v)}>
                    {showAllSpots ? "その他の候補を閉じる" : `その他の候補を見る(+${others.length}件)`}
                  </button>

                  {showAllSpots && (
                    <ul className="spot-list">
                      {others.map((spot) => (
                        <SpotRow key={spot.id} spot={spot} isStudyMode={isStudyMode} />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}

          {location.status === "success" && (
            <div className="map-wrapper">
              <SpotMap center={{ lat: location.lat, lng: location.lng }} spots={rankedSpots} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;