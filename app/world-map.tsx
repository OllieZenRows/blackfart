type MapPoint = { id: string; title: string; category: string; latitude: number | null; longitude: number | null };

const land = [
  "M64 104 84 82 119 70 146 78 164 94 188 92 204 108 196 126 174 132 163 148 145 150 137 174 119 189 111 218 99 228 91 206 78 190 73 163 61 149 54 126Z",
  "M171 238 190 244 201 264 198 286 210 301 205 327 194 346 188 372 174 395 164 376 167 355 155 336 158 312 148 295 152 273Z",
  "M338 103 350 91 371 95 382 111 379 128 363 138 352 127Z",
  "M344 151 361 139 384 143 397 159 393 180 382 195 375 222 360 249 348 247 343 222 333 205 336 182 328 164Z",
  "M383 99 407 85 437 87 453 98 474 94 492 108 523 111 548 125 576 127 601 145 631 146 654 161 683 160 707 173 725 192 709 209 680 203 663 215 637 207 620 217 594 209 577 224 556 216 539 199 515 195 503 180 480 177 468 157 445 155 428 139 410 143 400 128Z",
  "M514 233 535 223 555 229 569 244 565 264 549 274 536 263 520 266 510 250Z",
  "M716 286 739 276 759 283 770 298 762 313 744 315 729 307Z",
];

function project(latitude: number, longitude: number) {
  return { x: Math.max(14, Math.min(786, ((longitude + 180) / 360) * 800)), y: Math.max(14, Math.min(386, ((80 - latitude) / 160) * 400)) };
}

export function WorldMap({ points }: { points: MapPoint[] }) {
  return (
    <svg className="world-map" viewBox="0 0 800 400" role="img" aria-label="World map showing approximate locations of approved community submissions">
      <defs><pattern id="dots" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#77806c" opacity=".38" /></pattern></defs>
      <rect width="800" height="400" fill="url(#dots)" />
      {[100, 200, 300].map((y) => <line key={`h${y}`} x1="0" y1={y} x2="800" y2={y} className="map-grid" />)}
      {[160, 320, 480, 640].map((x) => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="400" className="map-grid" />)}
      <g className="map-land">{land.map((d, i) => <path key={i} d={d} />)}</g>
      {points.filter((point) => point.latitude !== null && point.longitude !== null).map((point) => {
        const pos = project(point.latitude!, point.longitude!);
        return <g key={point.id} className="map-marker" transform={`translate(${pos.x} ${pos.y})`}><circle r="12" /><circle r="4" /><title>{point.title} · approximate location</title></g>;
      })}
      {points.filter((point) => point.latitude !== null && point.longitude !== null).length === 0 && <g className="map-empty"><circle cx="400" cy="200" r="4" /><text x="400" y="227" textAnchor="middle">YOUR ROUGH PIN GOES HERE</text></g>}
    </svg>
  );
}
