import { useState, useMemo, useEffect } from "react";
import { distanceMeters, distanceToWalkMinutes } from "./geo";
import { knownStudySpots } from "./knownSpots";
import { findKnownPlace } from "./knownPlaces";
import { scoreSpot } from "./ranking";
import { reverseGeocode } from "./geocode";
import { searchAddressCandidates, type AddressCandidate } from "./adressSearch";
import { useDebounce } from "./useDebounce";
import { fetchUserSpots, addUserSpot, findSimilarUserSpot, appendNoteToUserSpot } from "./userSpots";
import type { Spot } from "./types";
import { SpotMap } from "./SpotMap";
import "leaflet/dist/leaflet.css";
import "./App.css";

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

        {(isStudyMode || spot.isUserSubmitted) && (
          <div className="badge-row">
            {isStudyMode && (
              <>
                <WifiBadge has={spot.hasWifi} />
                <PowerBadge has={spot.hasPower} />
              </>
            )}
            {spot.isUserSubmitted && <span className="badge badge--community">🏴 みんなの投稿</span>}
          </div>
        )}

        {spot.note &&
          (spot.isUserSubmitted ? (
            <span className="user-note">💬 {spot.note}</span>
          ) : (
            <span className="note-flag">⚠️ {spot.note}</span>
          ))}
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
  const [locationCandidates, setLocationCandidates] = useState<AddressCandidate[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAllSpots, setShowAllSpots] = useState(false);

  // 穴場スポット投稿フォーム用のstate
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSpotName, setNewSpotName] = useState("");
  const [newSpotAddress, setNewSpotAddress] = useState("");
  const [newSpotCandidates, setNewSpotCandidates] = useState<AddressCandidate[]>([]);
  const [isLoadingSpotCandidates, setIsLoadingSpotCandidates] = useState(false);
  const [newSpotSelected, setNewSpotSelected] = useState<AddressCandidate | null>(null);
  const [newSpotCategory, setNewSpotCategory] = useState<Spot["category"]>("cafe");
  const [newSpotWifi, setNewSpotWifi] = useState(false);
  const [newSpotPower, setNewSpotPower] = useState(false);
  const [newSpotNote, setNewSpotNote] = useState("");
  const [isSubmittingSpot, setIsSubmittingSpot] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

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

  // ===== 現在地入力: 入力しながらの候補検索(オートコンプリート) =====
  const debouncedManualAddress = useDebounce(manualAddress, 400);

  useEffect(() => {
    if (debouncedManualAddress.trim().length < 2) {
      setLocationCandidates([]);
      return;
    }

    const known = findKnownPlace(debouncedManualAddress);
    if (known) {
      setLocationCandidates([{ label: known.label, lat: known.lat, lng: known.lng }]);
      return;
    }

    let cancelled = false;
    setIsLoadingCandidates(true);

    searchAddressCandidates(debouncedManualAddress).then((results) => {
      if (!cancelled) {
        setLocationCandidates(results);
        setIsLoadingCandidates(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedManualAddress]);

  // ===== 穴場スポット投稿フォーム: 同様にオートコンプリート =====
  const debouncedNewSpotAddress = useDebounce(newSpotAddress, 400);

  useEffect(() => {
    if (newSpotSelected) return; // 既に選択済みなら再検索しない
    if (debouncedNewSpotAddress.trim().length < 2) {
      setNewSpotCandidates([]);
      return;
    }

    let cancelled = false;
    setIsLoadingSpotCandidates(true);

    searchAddressCandidates(debouncedNewSpotAddress).then((results) => {
      if (!cancelled) {
        setNewSpotCandidates(results);
        setIsLoadingSpotCandidates(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedNewSpotAddress, newSpotSelected]);

  function handleGetLocation() {
    setLocation({ status: "loading" });
    setLocationCandidates([]);

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

        const label = await reverseGeocode(lat, lng);
        if (label) {
          setLocation((prev) =>
            prev.status === "success" && prev.lat === lat && prev.lng === lng ? { ...prev, label } : prev
          );
        }
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "位置情報の利用が許可されていません。ブラウザのサイト設定を確認してください。"
            : "現在地を取得できませんでした。住所を入力して検索することもできます。";
        setLocation({ status: "error", message });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleSelectLocationCandidate(candidate: AddressCandidate) {
    setLocation({
      status: "success",
      lat: candidate.lat,
      lng: candidate.lng,
      source: "manual",
      label: candidate.label,
    });
    setManualAddress(candidate.label);
    setLocationCandidates([]);
  }

  function handleSelectSpotCandidate(candidate: AddressCandidate) {
    setNewSpotSelected(candidate);
    setNewSpotAddress(candidate.label);
    setNewSpotCandidates([]);
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
      const [overpassRes, userSpotsRaw] = await Promise.all([
        fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: query }),
        fetchUserSpots(),
      ]);
      const data = await overpassRes.json();

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

      const userSpotsWithDistance: Spot[] = userSpotsRaw.map((spot) => {
        const dist = distanceMeters(lat, lng, spot.lat, spot.lng);
        return { ...spot, walkMinutes: distanceToWalkMinutes(dist) };
      });

      const curated = [...knownWithDistance, ...userSpotsWithDistance];

      const dedupedOsmResults = converted.filter((osmSpot) => {
        const isDuplicate = curated.some(
          (known) => known.name.includes(osmSpot.name) || osmSpot.name.includes(known.name)
        );
        return !isDuplicate;
      });

      setSpots([...curated, ...dedupedOsmResults]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleAddSpot() {
    if (!newSpotName || !newSpotSelected) return;
    setIsSubmittingSpot(true);
    setSubmitMessage(null);

    try {
      const { lat, lng } = newSpotSelected;
      const similar = await findSimilarUserSpot(newSpotName, lat, lng);

      if (similar) {
        if (newSpotNote) {
          const appendResult = await appendNoteToUserSpot(similar.id, newSpotNote, similar.note);
          setSubmitMessage(
            appendResult.success
              ? "既に投稿されている場所だったため、コメントを追記しました！"
              : `追記に失敗しました: ${appendResult.error}`
          );
        } else {
          setSubmitMessage("既に投稿されている場所です(新しいコメントがなかったため、追加の変更はありません)。");
        }
      } else {
        const insertResult = await addUserSpot({
          name: newSpotName,
          lat,
          lng,
          category: newSpotCategory,
          hasWifi: newSpotWifi,
          hasPower: newSpotPower,
          note: newSpotNote || undefined,
        });

        if (!insertResult.success) {
          setSubmitMessage(`投稿に失敗しました: ${insertResult.error}`);
          return;
        }
        setSubmitMessage("投稿しました！次の検索から反映されます。");
      }

      setNewSpotName("");
      setNewSpotAddress("");
      setNewSpotNote("");
      setNewSpotWifi(false);
      setNewSpotPower(false);
      setNewSpotSelected(null);
    } catch (e) {
      setSubmitMessage("エラーが発生しました");
    } finally {
      setIsSubmittingSpot(false);
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

        <div className="location-input-row address-autocomplete">
          <input
            type="text"
            placeholder="住所や地名を入力(例: 大分駅)"
            value={manualAddress}
            onChange={(e) => setManualAddress(e.target.value)}
          />

          {isLoadingCandidates && <p className="location-status">検索中...</p>}

          {locationCandidates.length > 0 && (
            <ul className="candidate-list">
              {locationCandidates.map((c, i) => (
                <li key={i}>
                  <button className="candidate-btn" onClick={() => handleSelectLocationCandidate(c)}>
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {location.status === "loading" && <p className="location-status">取得中...</p>}
        {location.status === "success" && (
          <div>
            <p className="location-name">📍 {location.label ?? "現在地を取得しました"}</p>
            <p className="location-coords">
              緯度{location.lat.toFixed(4)} / 経度{location.lng.toFixed(4)}
              {location.accuracy && <> ・誤差 約{Math.round(location.accuracy)}m</>}
            </p>
            {location.source === "gps" && location.accuracy && location.accuracy > 50 && (
              <p className="location-status">
                精度が低いため、表示位置がずれる可能性があります。屋外で再取得するか、住所を入力してください。
              </p>
            )}
          </div>
        )}
        {location.status === "error" && (
          <p className="location-status location-status--error">{location.message}</p>
        )}
      </div>

      <div className="add-spot-panel">
        <button className="show-more-btn" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? "投稿フォームを閉じる" : "🏴 自分の穴場スポットを投稿する"}
        </button>

        {showAddForm && (
          <div className="add-spot-form">
            <input
              type="text"
              placeholder="スポット名(例: 隠れ家カフェ○○)"
              value={newSpotName}
              onChange={(e) => setNewSpotName(e.target.value)}
            />

            <div className="address-autocomplete">
              <input
                type="text"
                placeholder="住所や地名"
                value={newSpotAddress}
                onChange={(e) => {
                  setNewSpotAddress(e.target.value);
                  setNewSpotSelected(null);
                }}
              />

              {isLoadingSpotCandidates && <p className="location-status">検索中...</p>}

              {newSpotCandidates.length > 0 && (
                <ul className="candidate-list">
                  {newSpotCandidates.map((c, i) => (
                    <li key={i}>
                      <button type="button" className="candidate-btn" onClick={() => handleSelectSpotCandidate(c)}>
                        {c.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {newSpotSelected && <p className="location-status">✅ 選択した場所: {newSpotSelected.label}</p>}

            <div className="condition-row">
              <label className="pill">
                <input
                  type="radio"
                  name="new-category"
                  checked={newSpotCategory === "cafe"}
                  onChange={() => setNewSpotCategory("cafe")}
                />
                カフェ
              </label>
              <label className="pill">
                <input
                  type="radio"
                  name="new-category"
                  checked={newSpotCategory === "library"}
                  onChange={() => setNewSpotCategory("library")}
                />
                図書館・自習
              </label>
              <label className="pill">
                <input
                  type="radio"
                  name="new-category"
                  checked={newSpotCategory === "restaurant"}
                  onChange={() => setNewSpotCategory("restaurant")}
                />
                飲食店
              </label>
              <label className="pill">
                <input
                  type="radio"
                  name="new-category"
                  checked={newSpotCategory === "other"}
                  onChange={() => setNewSpotCategory("other")}
                />
                その他
              </label>
            </div>

            <div className="condition-row">
              <label className="pill">
                <input
                  type="checkbox"
                  checked={newSpotWifi}
                  onChange={(e) => setNewSpotWifi(e.target.checked)}
                />
                Wi-Fiあり
              </label>
              <label className="pill">
                <input
                  type="checkbox"
                  checked={newSpotPower}
                  onChange={(e) => setNewSpotPower(e.target.checked)}
                />
                電源あり
              </label>
            </div>

            <textarea
              placeholder="コメント(任意): どんな場所か、おすすめポイントなど"
              value={newSpotNote}
              onChange={(e) => setNewSpotNote(e.target.value)}
            />

            <button
              className="search-btn"
              onClick={handleAddSpot}
              disabled={!newSpotName || !newSpotSelected || isSubmittingSpot}
            >
              {isSubmittingSpot ? "投稿中..." : "この場所を投稿する"}
            </button>

            {submitMessage && <p className="location-status">{submitMessage}</p>}
          </div>
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