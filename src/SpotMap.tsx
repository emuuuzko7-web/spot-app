import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Spot } from "./types";

type Props = {
  center: { lat: number; lng: number };
  spots: Spot[]; // 呼び出し側で必ずランキング順(スコアの高い順)に並べて渡すこと
};

export function SpotMap({ center, spots }: Props) {
  const mapElement = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapElement.current) return;

    const map = L.map(mapElement.current).setView([center.lat, center.lng], 15);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    L.circleMarker([center.lat, center.lng], { radius: 10 })
      .addTo(map)
      .bindPopup("📍 現在地");

    spots.forEach((spot, index) => {
      const isTop3 = index < 3;

      const marker = isTop3
        ? L.marker([spot.lat, spot.lng], {
            icon: L.divIcon({
              className: "",
              html: `<div style="background:#4E6B4A;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:bold;box-shadow:0 1px 4px rgba(0,0,0,0.4);">${
                index + 1
              }</div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            }),
          })
        : L.circleMarker([spot.lat, spot.lng], { radius: 8 });

      marker
        .addTo(map)
        .bindPopup(
          `${spot.name}<br>
           徒歩 ${spot.walkMinutes}分<br>
           ${spot.hasWifi ? "📶 Wi-Fiあり" : "📶 Wi-Fi不明"}<br>
           ${spot.hasPower ? "🔌 電源あり" : "🔌 電源不明"}`
        );
    });

    return () => {
      map.remove();
    };
  }, [center.lat, center.lng, spots]);

  return (
    <div
      ref={mapElement}
      style={{
        height: "400px",
        width: "100%",
        marginTop: "12px",
      }}
    />
  );
}