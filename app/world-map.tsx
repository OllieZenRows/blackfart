"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

type MapPoint = { id: string; latitude: number | null; longitude: number | null };
type MapArea = { latitude: number; longitude: number; count: number };

const tileUrl = process.env.NEXT_PUBLIC_OSM_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function groupPoints(points: MapPoint[]): MapArea[] {
  const groups = new Map<string, MapArea>();
  for (const point of points) {
    if (point.latitude === null || point.longitude === null) continue;
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) continue;
    if (Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) continue;
    const latitude = Math.round(point.latitude * 2) / 2;
    const longitude = Math.round(point.longitude * 2) / 2;
    const key = `${latitude.toFixed(1)},${longitude.toFixed(1)}`;
    const area = groups.get(key);
    if (area) area.count += 1;
    else groups.set(key, { latitude, longitude, count: 1 });
  }
  return [...groups.values()];
}

function googleMapsUrl(area: MapArea) {
  const query = encodeURIComponent(`${area.latitude},${area.longitude}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function popupContent(area: MapArea) {
  const popup = document.createElement("div");
  popup.className = "map-popup";

  const title = document.createElement("strong");
  title.textContent = `${area.count} approved ${area.count === 1 ? "log" : "logs"} in this rough area`;

  const link = document.createElement("a");
  link.href = googleMapsUrl(area);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Open this approximate area in Google Maps ↗";

  popup.appendChild(title);
  popup.appendChild(link);
  return popup;
}

export function WorldMap({ points }: { points: MapPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const areas = useMemo(() => groupPoints(points), [points]);

  useEffect(() => {
    let active = true;

    void import("leaflet").then((L) => {
      if (!active || !containerRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, {
        minZoom: 2,
        maxZoom: 18,
        scrollWheelZoom: false,
        worldCopyJump: true,
        zoomControl: true,
      }).setView([18, 0], 2);

      const tiles = L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      tiles.on("tileerror", () => setMapError("Some map tiles could not load. The Google Maps links below still work."));
      tiles.on("load", () => setMapError(""));

      mapRef.current = map;
      markerLayerRef.current = L.layerGroup().addTo(map);
      setMapReady(true);
    }).catch(() => {
      if (active) setMapError("The interactive map could not start. The Google Maps links below still work.");
    });

    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = markerLayerRef.current;
    if (!mapReady || !L || !map || !layer) return;

    layer.clearLayers();
    for (const area of areas) {
      const icon = L.divIcon({
        className: "map-cluster-icon",
        html: `<span>${area.count}</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -16],
      });
      L.marker([area.latitude, area.longitude], {
        icon,
        keyboard: true,
        title: `${area.count} approved ${area.count === 1 ? "log" : "logs"} in an approximate area`,
      }).bindPopup(popupContent(area), { closeButton: true, autoPan: true, maxWidth: 280 }).addTo(layer);
    }

    if (areas.length > 1) {
      map.fitBounds(L.latLngBounds(areas.map((area): [number, number] => [area.latitude, area.longitude])), { padding: [36, 36], maxZoom: 4 });
    } else if (areas.length === 1) {
      map.setView([areas[0].latitude, areas[0].longitude], 4);
    } else {
      map.setView([18, 0], 2);
    }
  }, [areas, mapReady]);

  return <>
    <div className="map-frame">
      <div className="world-map" ref={containerRef} role="application" aria-label="Interactive map of approximate member-submission areas. Use plus and minus to zoom, or drag to move." />
      {areas.length === 0 && <div className="map-empty-note"><strong>No member pins yet.</strong><span>Approved, opted-in logs will appear here.</span></div>}
    </div>
    {mapError && <p className="map-warning" role="status">{mapError}</p>}
    {areas.length > 0 && <details className="map-area-details">
      <summary>Open {areas.length} approximate {areas.length === 1 ? "area" : "areas"} in Google Maps</summary>
      <ul>{areas.map((area, index) => <li key={`${area.latitude},${area.longitude}`}>
        <span>AREA {String(index + 1).padStart(2, "0")} · {area.count} {area.count === 1 ? "approved log" : "approved logs"}</span>
        <a href={googleMapsUrl(area)} target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>
      </li>)}</ul>
    </details>}
  </>;
}
