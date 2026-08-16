// Leaflet + Viteの組み合わせで、マーカーアイコンの画像パスが
// 正しく解決されない既知の不具合を修正するための設定。
// このファイルはApp.tsxで一度だけimportすれば効果が全体に及ぶ。
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});