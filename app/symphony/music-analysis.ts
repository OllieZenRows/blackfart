/** Approximate live beat estimation. Input timestamps use the AudioContext clock.
 * Energies must be normalized to 0..1. Analyzes the most recent 12 seconds /
 * 600 readings; no key/downbeat claims. Weak signals intentionally return null.
 */
export type PulseFrame = { time: number; energy: number };
export function estimatePulse(frames: PulseFrame[]): { bpm: number; beatTime: number; confidence: number } | null {
  const tail = frames.slice(-600).filter(f => Number.isFinite(f.time) && Number.isFinite(f.energy) && f.energy >= 0);
  if (tail.length < 40) return null;
  const end = tail[tail.length - 1].time;
  const recent = tail.filter(f => f.time >= end - 12);
  if (recent.length < 40 || end - recent[0].time < 4) return null;
  for (let i = 1; i < recent.length; i++) if (recent[i].time <= recent[i - 1].time) return null;
  // Positive energy flux rejects steady energy and focuses on rising transients.
  const rises = recent.map((f, i) => i ? Math.max(0, f.energy - recent[i - 1].energy) : 0);
  const mean = rises.reduce((a,b) => a+b,0) / rises.length;
  const deviation = Math.sqrt(rises.reduce((a,b) => a + (b-mean)**2,0) / rises.length);
  const threshold = Math.max(0.008, mean + deviation * 0.8);
  if (deviation < 1e-8 || !recent.some(f => end - f.time <= 1.5 && f.energy >= 0.015)) return null;
  const hits: {time:number; strength:number}[] = [];
  for (let i = 1; i < recent.length - 1; i++) {
    const strength = rises[i];
    if (strength < threshold || strength < rises[i-1] || strength <= rises[i+1]) continue;
    const hit = { time:recent[i].time, strength };
    const previous = hits[hits.length-1];
    if (previous && hit.time - previous.time < 0.2) {
      if (strength > previous.strength) hits[hits.length-1] = hit;
    } else hits.push(hit);
  }
  if (hits.length < 5) return null;
  const total = hits.reduce((sum, hit) => sum + hit.strength, 0);
  let best: {period:number; phase:number; score:number; fraction:number; coverage:number} | null = null;
  // Search a bounded period grid, matching both transient energy and occupied beats.
  for (let bpm = 60; bpm <= 180; bpm += 0.5) {
    const period = 60 / bpm;
    for (const origin of hits.slice(0, 8)) {
      let weight=0, matched=0, residual=0;
      const occupied = new Set<number>();
      for (const hit of hits) {
        const beat = Math.round((hit.time-origin.time)/period);
        const error = Math.abs(hit.time - (origin.time + beat*period));
        if (error <= 0.055) { weight+=hit.strength; matched++; occupied.add(beat); residual+=error*hit.strength; }
      }
      const expected = Math.max(1, Math.round((hits[hits.length-1].time-hits[0].time)/period)+1);
      const fraction = weight/total, coverage=Math.min(1,occupied.size/expected);
      const score = fraction*coverage - (weight ? residual/weight : 1)*0.5;
      if (matched >= 5 && (!best || score > best.score)) best={period,phase:origin.time,score,fraction,coverage};
    }
  }
  if (!best || best.fraction < 0.72 || best.coverage < 0.65 || best.score < 0.64) return null;
  // Linear fit of matched onsets improves sub-frame tempo/phase accuracy.
  const aligned = hits.map(hit => ({time:hit.time,index:Math.round((hit.time-best!.phase)/best!.period)})).filter(hit => Math.abs(hit.time-best!.phase-hit.index*best!.period)<0.055);
  // Recent matched onsets must support the grid; an unrelated sound after silence
  // must not revive a stale estimate from the earlier rhythmic window.
  if (end - aligned[aligned.length - 1].time > Math.min(1.5, best.period * 1.5)) return null;
  const n=aligned.length, meanIndex=aligned.reduce((s,h)=>s+h.index,0)/n, meanTime=aligned.reduce((s,h)=>s+h.time,0)/n;
  let numerator=0,denominator=0;
  for (const hit of aligned) { numerator+=(hit.index-meanIndex)*(hit.time-meanTime); denominator+=(hit.index-meanIndex)**2; }
  const period=denominator ? numerator/denominator : best.period;
  const bpm=60/period;
  if (bpm < 59.5 || bpm > 180.5) return null;
  const phase=meanTime-meanIndex*period;
  const lastBeat=phase+Math.floor((end-phase)/period)*period;
  return {bpm:Math.round(Math.max(60,Math.min(180,bpm))*10)/10,beatTime:lastBeat,confidence:Math.min(1,Math.max(0,best.score))};
}

type GrooveTrack = { id: string; sample: string; steps: boolean[]; pitch: number; volume: number; muted: boolean };
type GrooveScore = { tempo: number; tracks: GrooveTrack[] };
const patterns = [
  [[0, 4, 8, 12], [0, 6, 8], [0, 8, 11]],
  [[4, 12], [4, 12, 15], [4, 10, 12]],
  [[2, 6, 10, 14], [2, 10, 14], [2, 6, 14]],
  [[7, 15], [15], [3, 11]],
];
const voices = [['low-puff.wav', 'warm-rumble.wav'], ['soft-pop.wav', 'dry-tap.wav'], ['airy-tick.wav', 'dry-tap.wav'], ['mellow-squeak.wav', 'soft-pop.wav']];
/** New four-row pattern, keeping tempo and existing uploaded (blob) samples. */
export function generateGroove(currentScore: GrooveScore, rng: () => number = Math.random): GrooveScore {
  const choose = <T,>(items: T[]): T => { const n = rng(); return items[Math.floor(Math.max(0, Math.min(0.999999, Number.isFinite(n) ? n : 0)) * items.length)]; };
  return { tempo: currentScore.tempo, tracks: patterns.map((options, row) => {
    const hits = choose(options), original = currentScore.tracks[row];
    const chosen = `/audio/efm/${choose(voices[row])}`;
    return { id: original?.id ?? ['bass', 'beat', 'solo', 'extra'][row], sample: original?.sample.startsWith('blob:') ? original.sample : chosen, steps: Array.from({ length: 16 }, (_, i) => hits.includes(i)), pitch: 0, volume: [0.75, 0.5, 0.35, 0.25][row], muted: false };
  }) };
}
