import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Props = {
  initialLat: number;
  initialLng: number;
  onSelect: (lat: number, lng: number) => void;
};

// クリックした地点にピンを立てて、その座標を親コンポーネントに伝える地図
export function PickLocationMap({ initialLat, initialLng, onSelect }: Props) {
  const mapElement = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapElement.current) return;

    const map = L.map(mapElement.current).setView([initialLat, initialLng], 15);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const pinIcon = L.divIcon({
      className: "",
      html: `<div style="font-size:28px;line-height:1;transform:translateY(-6px);">📍</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });

    let marker: L.Marker | null = null;

    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (marker) {
        marker.setLatLng([lat, lng]);
      } else {
        marker = L.marker([lat, lng], { icon: pinIcon }).addTo(map);
      }
      onSelect(lat, lng);
    });

    return () => {
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLat, initialLng]);

  return (
    <div
      ref={mapElement}
      style={{ height: "260px", width: "100%", borderRadius: "10px", overflow: "hidden" }}
    />
  );
}