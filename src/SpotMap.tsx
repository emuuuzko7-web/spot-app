import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { Spot } from "./types";

type Props = {
  center: { lat: number; lng: number };
  spots: Spot[]; // 呼び出し側で必ずランキング順(スコアの高い順)に並べて渡すこと
};

function spotPopupHtml(spot: Spot): string {
  return `${spot.name}<br>
    徒歩 ${spot.walkMinutes}分<br>
    ${spot.hasWifi ? "📶 Wi-Fiあり" : "📶 Wi-Fi不明"}<br>
    ${spot.hasPower ? "🔌 電源あり" : "🔌 電源不明"}`;
}

export function SpotMap({ center, spots }: Props) {
  const mapElement = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapElement.current) return;

    const map = L.map(mapElement.current).setView([center.lat, center.lng], 15);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    // 現在地: 他のピンと混同しないよう、脈動する専用マーカーにする
    const currentLocationIcon = L.divIcon({
      className: "",
      html: `<div class="current-location-marker"><div class="pulse"></div><div class="dot"></div></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    L.marker([center.lat, center.lng], { icon: currentLocationIcon })
      .addTo(map)
      .bindPopup("📍 現在地");

    // トップ3は常に個別のピン(番号タイル)として表示する
    const top3 = spots.slice(0, 3);
    top3.forEach((spot, index) => {
      const icon = L.divIcon({
        className: "",
        html: `<div class="rank-marker">${index + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([spot.lat, spot.lng], { icon }).addTo(map).bindPopup(spotPopupHtml(spot));
    });

    // トップ3以外は、地図が混雑しないようクラスター(近いピンをまとめる)表示にする
    const others = spots.slice(3);
    if (others.length > 0) {
      const clusterGroup = (L as any).markerClusterGroup({
        maxClusterRadius: 50,
        showCoverageOnHover: false,
        iconCreateFunction: (cluster: any) =>
          L.divIcon({
            className: "",
            html: `<div class="cluster-tile">${cluster.getChildCount()}</div>`,
            iconSize: [36, 36],
          }),
      });

      others.forEach((spot) => {
        const icon = L.divIcon({
          className: "",
          html: `<div class="spot-dot"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const marker = L.marker([spot.lat, spot.lng], { icon }).bindPopup(spotPopupHtml(spot));
        clusterGroup.addLayer(marker);
      });

      map.addLayer(clusterGroup);
    }

    return () => {
      map.remove();
    };
  }, [center.lat, center.lng, spots]);

  return <div ref={mapElement} style={{ height: "400px", width: "100%" }} />;
}