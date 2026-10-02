"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap, Marker } from "leaflet";

type MapPoint = { id: string; latitude: number | null; longitude: number | null };
type MapArea = { latitude: number; longitude: number; count: number };
export type MapLocation = { latitude: number; longitude: number };

function approximateLocation(latitude: number, longitude: number): MapLocation {
  return {
    latitude: Math.max(-90, Math.min(90, Math.round(latitude * 2) / 2)),
    longitude: ((Math.round(longitude * 2) / 2 + 180) % 360 + 360) % 360 - 180,
  };
}

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

export function WorldMap({ points, draftPin, onSelectPin, disabled = false }: {
  points: MapPoint[];
  draftPin: MapLocation | null;
  onSelectPin: (location: MapLocation) => void;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const draftMarkerRef = useRef<Marker | null>(null);
  const onSelectPinRef = useRef(onSelectPin);
  const disabledRef = useRef(disabled);
  const hintId = useId();
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const areas = useMemo(() => groupPoints(points), [points]);

  useEffect(() => { onSelectPinRef.current = onSelectPin; }, [onSelectPin]);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);

  function selectMapCenter() {
    if (disabledRef.current) return;
    const center = mapRef.current?.getCenter();
    if (center) onSelectPinRef.current(approximateLocation(center.lat, center.lng));
  }

  useEffect(() => {
    let active = true;
    let resizeObserver: ResizeObserver | undefined;

    void import("leaflet").then((L) => {
      if (!active || !containerRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, {
        minZoom: 0,
        maxZoom: 18,
        zoomSnap: 0.25,
        scrollWheelZoom: false,
        worldCopyJump: true,
        zoomControl: true,
      });
      // Fit only on first mount: later data and pin changes must preserve navigation.
      map.fitBounds([[-65, -180], [75, 180]], { padding: [12, 12], maxZoom: 2 });
      map.on("click", (event) => {
        if (disabledRef.current) return;
        const target = event.originalEvent.target;
        if (target instanceof Element && target.closest(".leaflet-marker-icon, .leaflet-popup, .leaflet-control")) return;
        onSelectPinRef.current(approximateLocation(event.latlng.lat, event.latlng.lng));
      });

      const tiles = L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      tiles.on("tileerror", () => setMapError("Some map tiles could not load. The Google Maps links below still work."));
      tiles.on("load", () => setMapError(""));

      mapRef.current = map;
      markerLayerRef.current = L.layerGroup().addTo(map);
      resizeObserver = new ResizeObserver(() => {
        if (active) map.invalidateSize({ pan: false });
      });
      resizeObserver.observe(containerRef.current);
      setMapReady(true);
    }).catch(() => {
      if (active) setMapError("The interactive map could not start. The Google Maps links below still work.");
    });

    return () => {
      active = false;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      leafletRef.current = null;
      draftMarkerRef.current = null;
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
        bubblingMouseEvents: false,
        title: `${area.count} approved ${area.count === 1 ? "log" : "logs"} in an approximate area`,
      }).bindPopup(popupContent(area), { closeButton: true, autoPan: true, maxWidth: 280 }).addTo(layer);
    }

  }, [areas, mapReady]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !L || !map) return;
    if (!draftPin) {
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      return;
    }
    if (draftMarkerRef.current) {
      draftMarkerRef.current.setLatLng([draftPin.latitude, draftPin.longitude]);
      return;
    }
    const marker = L.marker([draftPin.latitude, draftPin.longitude], {
      icon: L.divIcon({ className: "map-draft-icon", html: "<span>＋</span>", iconSize: [42, 42], iconAnchor: [21, 21] }),
      draggable: !disabledRef.current,
      keyboard: true,
      bubblingMouseEvents: false,
      title: "Your new pin. Drag to adjust the approximate area.",
      alt: "Your selected approximate area",
      zIndexOffset: 1000,
    }).addTo(map);
    marker.on("dragend", () => {
      if (disabledRef.current) return;
      const position = marker.getLatLng();
      const location = approximateLocation(position.lat, position.lng);
      marker.setLatLng([location.latitude, location.longitude]);
      onSelectPinRef.current(location);
    });
    draftMarkerRef.current = marker;
  }, [draftPin, mapReady]);

  useEffect(() => {
    if (disabled) draftMarkerRef.current?.dragging?.disable();
    else draftMarkerRef.current?.dragging?.enable();
  }, [disabled, draftPin, mapReady]);

  return <>
    <div className="map-frame">
      <div className="world-map" ref={containerRef} role="application" tabIndex={0}
        aria-label="Choose an approximate area for your log" aria-describedby={hintId}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target === event.currentTarget) {
            event.preventDefault();
            selectMapCenter();
          }
        }} />
      {!draftPin && <div className="map-pick-hint" aria-hidden="true">Tap anywhere to drop your pin</div>}
      <button type="button" className="map-center-button" disabled={!mapReady || disabled} onClick={selectMapCenter}>Pin at map centre</button>
    </div>
    <p id={hintId} className="sr-only">Click or tap the map to choose an approximate area. Use arrow keys to move the focused map, plus and minus to zoom, and Enter to place a pin at its centre. Drag your new pin or tap another area to adjust it. Locations are rounded to half a degree.</p>
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
