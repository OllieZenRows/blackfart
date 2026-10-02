"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { samples } from "../samples";
import { SymphonyEngine, type SymphonyScore, type SymphonyTrack } from "./engine";

const parts = ["The bass section", "The backbeat", "The squeaky solo", "The finishing touch"];
const steps = (hits: number[]) => Array.from({ length: 16 }, (_, i) => hits.includes(i));
const track = (id: string, file: string, hits: number[], pitch = 0, volume = 0.7): SymphonyTrack => ({ id, sample: `/audio/${file}`, steps: steps(hits), pitch, volume, muted: false });
const presets = [
  { name: "The Grand Entrance", tempo: 108, tracks: [track("bass", "subterranean.mp3", [0, 6, 8, 14], -7), track("beat", "original.mp3", [4, 12], 3), track("solo", "squeaky.mp3", [2, 5, 10, 13, 15], 7, 0.55), track("extra", "pocket-thunder.mp3", [0, 7, 8, 11], 12, 0.35)] },
  { name: "Squeak Sonata", tempo: 88, tracks: [track("bass", "cosmic.mp3", [0, 8], -12), track("beat", "loose.mp3", [4, 12], -2, 0.5), track("solo", "squeaky.mp3", [0, 3, 6, 8, 11, 14], 5), track("extra", "squeaky.mp3", [2, 5, 10, 13], 12, 0.4)] },
  { name: "Chaos Concerto", tempo: 136, tracks: [track("bass", "aftershock.mp3", [0, 4, 8, 12], -5), track("beat", "curry.mp3", [2, 6, 10, 14], 0), track("solo", "squeaky.mp3", [1, 3, 7, 9, 11, 15], 12, 0.55), track("extra", "mouth-made.mp3", [0, 5, 8, 13, 14], 7, 0.45)] },
];
const copyPreset = (index: number): SymphonyScore => ({ tempo: presets[index].tempo, tracks: presets[index].tracks.map((item) => ({ ...item, steps: [...item.steps] })) });
const pitches = [[-12, "One octave down"], [-7, "Lower"], [-5, "A little lower"], [0, "Original pitch"], [3, "A little higher"], [5, "Higher"], [7, "Even higher"], [12, "One octave up"]] as const;

export function SymphonyStudio() {
  const [score, setScore] = useState<SymphonyScore>(() => copyPreset(0));
  const [preset, setPreset] = useState("0");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [playhead, setPlayhead] = useState(-1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exportUrl, setExportUrl] = useState("");
  const [imports, setImports] = useState<Record<string, { url: string; name: string }>>({});
  const engineRef = useRef<SymphonyEngine | null>(null);
  const requestRef = useRef(0);
  const importUrls = useRef(new Set<string>());
  const downloads = useRef(new Set<string>());
  const mounted = useRef(true);
  const empty = !score.tracks.some((item) => !item.muted && item.volume > 0 && item.steps.some(Boolean));

  const engine = () => engineRef.current ?? (engineRef.current = new SymphonyEngine());

  useEffect(() => {
    mounted.current = true;
    const imported = importUrls.current;
    const exported = downloads.current;
    return () => {
      mounted.current = false; requestRef.current += 1; engineRef.current?.dispose();
      imported.forEach((url) => URL.revokeObjectURL(url));
      exported.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const stop = () => {
    requestRef.current += 1; engineRef.current?.stop();
    setPlaying(false); setLoading(false); setPlayhead(-1);
  };

  const change = (next: SymphonyScore) => {
    // Editing is immediate; the next scheduled notes use the new score.
    setScore(next); setPreset("custom"); setError(""); setNotice("");
    if (playing) void engine().update(next).catch((cause: unknown) => {
      if (mounted.current) { stop(); setError(cause instanceof Error ? cause.message : "That sound could not be loaded. Choose another sample."); }
    });
    else if (loading) stop();
  };

  const changeTrack = (index: number, fields: Partial<SymphonyTrack>) => change({ ...score, tracks: score.tracks.map((item, i) => i === index ? { ...item, ...fields } : item) });

  const play = async () => {
    if (playing || loading) { stop(); return; }
    if (empty) { setError("Turn on a note and an unmuted track first."); return; }
    const request = ++requestRef.current;
    setError(""); setNotice(""); setLoading(true);
    try {
      await engine().play(score, (step) => { if (mounted.current && requestRef.current === request) setPlayhead(step); });
      if (mounted.current && requestRef.current === request) { setPlaying(true); setLoading(false); }
    } catch (cause) {
      if (mounted.current && requestRef.current === request) { setLoading(false); setPlaying(false); setError(cause instanceof Error ? cause.message : "Could not start the symphony. Try again."); }
    }
  };

  const preview = async (item: SymphonyTrack) => {
    setError("");
    try { await engine().preview(item.sample, item.pitch, item.volume); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not play that sample."); }
  };

  const choosePreset = (value: string) => {
    stop(); setScore(copyPreset(Number(value))); setPreset(value); setError(""); setNotice("");
  };

  const importAudio = (file: File | undefined, index: number) => {
    if (!file) return;
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|ogg|webm|aac|flac)$/i.test(file.name)) { setError("Choose an audio file, such as MP3, WAV, or M4A."); return; }
    if (file.size > 8 * 1024 * 1024) { setError("Choose an audio file smaller than 8 MB."); return; }
    const url = URL.createObjectURL(file); importUrls.current.add(url);
    setImports((current) => ({ ...current, [score.tracks[index].id]: { url, name: file.name } }));
    changeTrack(index, { sample: url });
    setNotice("Your audio is ready to try. It stays on this device and is not submitted to the archive.");
  };

  const download = async () => {
    if (empty || exporting) return;
    setExporting(true); setError(""); setNotice("");
    try {
      const blob = await engine().renderWav(score);
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob); downloads.current.add(url);
      if (exportUrl) { URL.revokeObjectURL(exportUrl); downloads.current.delete(exportUrl); }
      setExportUrl(url);
      const link = document.createElement("a"); link.href = url; link.download = "blackfart-symphony.wav";
      document.body.appendChild(link); link.click(); link.remove();
      setNotice("Your WAV is ready: four bars of your composition.");
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not create the download. Try again."); }
    finally { if (mounted.current) setExporting(false); }
  };

  return <div className="app-shell symphony-shell">
    <header className="symphony-header"><Link className="brand" href="/"><span className="brand-mark">bƒ</span><span>blackfart<span className="brand-dot">.com</span></span></Link><Link href="/#sound-lab">← Back to the sound lab</Link></header>
    <main className="symphony-main">
      <div className="symphony-title"><div><p className="eyebrow">THE WORLD&apos;S LEAST DIGNIFIED ORCHESTRA</p><h1>FART<br className="symphony-title-break" /> <em>SYMPHONY.</em></h1></div><div className="symphony-opus" aria-hidden="true">ƒƒ<span>OPUS NO. 02</span></div></div>
      <p className="symphony-intro">Press play. Tap the notes. Make something magnificently stupid.</p>

      <section className="symphony-console" aria-label="Symphony composer">
        <div className="symphony-toolbar">
          <button className={`button button-lime symphony-play ${playing ? "is-playing" : ""}`} onClick={() => void play()} disabled={empty && !playing && !loading}>{loading ? "■ Cancel loading" : playing ? "■ Stop symphony" : "▶ Play symphony"}</button>
          <label className="symphony-preset"><span>Start with a composition</span><select value={preset} onChange={(event) => choosePreset(event.currentTarget.value)}>{preset === "custom" && <option value="custom" disabled>Your composition</option>}{presets.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}</select></label>
          <label className="symphony-tempo"><span>Tempo <strong>{score.tempo} <small>BPM</small></strong></span><input type="range" min="60" max="160" step="1" value={score.tempo} aria-label="Tempo" onChange={(event) => change({ ...score, tempo: Number(event.currentTarget.value) })} /></label>
        </div>
        <div className="symphony-score-meta"><span><i className={playing ? "live-dot" : ""} />{playing ? "THE ORCHESTRA IS PLAYING" : loading ? "TUNING THE ORCHESTRA…" : "FOUR PARTS. ABSOLUTELY NO DIGNITY."}</span><span>16 NOTES · 4 BEATS · LOOPS</span></div>

        <div className="symphony-tracks">{score.tracks.map((item, index) => <section className={`symphony-track ${item.muted ? "is-muted" : ""}`} key={item.id} aria-label={parts[index]}>
          <div className="symphony-instrument">
            <div className="symphony-part"><span>{String(index + 1).padStart(2, "0")}</span><h2>{parts[index]}</h2><button type="button" aria-label={`${item.muted ? "Unmute" : "Mute"} ${parts[index]}`} aria-pressed={item.muted} onClick={() => changeTrack(index, { muted: !item.muted })}>{item.muted ? "Muted" : "On"}</button></div>
            <div className="symphony-sound-picker"><select aria-label={`Sound for ${parts[index]}`} value={item.sample} onChange={(event) => changeTrack(index, { sample: event.currentTarget.value })}>{samples.map((sample) => <option key={sample.file} value={`/audio/${sample.file}`}>{sample.title}</option>)}{imports[item.id] && <option value={imports[item.id].url}>{imports[item.id].name}</option>}</select><button type="button" aria-label={`Preview ${parts[index]}`} onClick={() => void preview(item)}>▶</button></div>
            <label className="symphony-import">↑ Use my audio<input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm,.aac,.flac" className="sr-only" aria-label={`Use my audio for ${parts[index]}`} onChange={(event) => { importAudio(event.currentTarget.files?.[0], index); event.currentTarget.value = ""; }} /></label>
          </div>
          <div className="symphony-notes"><div className="symphony-step-grid" aria-label={`Notes for ${parts[index]}`}>{item.steps.map((active, step) => <button key={step} type="button" className={`symphony-step ${active ? "is-active" : ""} ${step === playhead ? "is-current" : ""} ${step % 4 === 0 ? "beat-start" : ""}`} aria-label={`${parts[index]}, beat ${Math.floor(step / 4) + 1}, note ${step % 4 + 1}`} aria-pressed={active} onClick={() => changeTrack(index, { steps: item.steps.map((value, i) => i === step ? !value : value) })}><span>{step % 4 === 0 ? Math.floor(step / 4) + 1 : "·"}</span><i aria-hidden="true" /></button>)}</div>
            <div className="symphony-track-settings"><label><span>Pitch</span><select aria-label={`Pitch for ${parts[index]}`} value={item.pitch} onChange={(event) => changeTrack(index, { pitch: Number(event.currentTarget.value) })}>{pitches.map(([value, label]) => <option key={value} value={value}>{label}</option>)}{!pitches.some(([value]) => value === item.pitch) && <option value={item.pitch}>{item.pitch > 0 ? "+" : ""}{item.pitch} semitones</option>}</select></label><label><span>Level</span><input type="range" min="0" max="1" step="0.05" aria-label={`Level for ${parts[index]}`} value={item.volume} onChange={(event) => changeTrack(index, { volume: Number(event.currentTarget.value) })} /></label></div>
          </div>
        </section>)}</div>

        <div className="symphony-bottom"><p>Lit notes play. Change the rhythm, pitch or sound while you listen.</p><button type="button" onClick={() => { stop(); change({ ...score, tracks: score.tracks.map((item) => ({ ...item, steps: steps([]) })) }); }}>Clear notes</button></div>
      </section>

      {error && <p className="symphony-message is-error" role="alert">{error}</p>}
      {notice && <p className="symphony-message" role="status">{notice}</p>}
      {exportUrl && <div className="symphony-export-ready"><span>Your last export</span><audio controls src={exportUrl} aria-label="Your exported symphony" /><a href={exportUrl} download="blackfart-symphony.wav">Save WAV ↗</a></div>}
      {empty && !error && <p className="symphony-message" role="status">Tap a note to start, or choose a composition above. At least one track needs its sound on.</p>}

      <div className="symphony-export"><div><h2>TAKE A BOW. TAKE IT WITH YOU.</h2><p>Download four bars as a WAV. No account needed.</p></div><button type="button" className="button button-lime" onClick={() => void download()} disabled={exporting || empty}>{exporting ? "Making your WAV…" : "↓ Download symphony"}</button></div>
      <footer className="symphony-footer"><span>Samples become short notes. Your own audio stays on this device.</span><a href="/audio/sources.json" target="_blank" rel="noopener noreferrer">CC0 sample credits ↗</a></footer>
    </main>
    {(playing || loading) && <button className="symphony-mobile-stop" onClick={stop} aria-label="Stop playback">■ Stop</button>}
  </div>;
}
