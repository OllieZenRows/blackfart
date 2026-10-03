"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { efmSamples as samples } from "./samples";
import { SymphonyEngine, type SymphonyScore, type SymphonyTrack } from "./engine";
import { estimatePulse, generateGroove } from "./music-analysis";
import { MusicListener } from "./microphone";

const parts = ["Low end", "Backbeat", "Light rhythm", "Squeak"];
const steps = (hits: number[]) => Array.from({ length: 16 }, (_, i) => hits.includes(i));
const track = (id: string, file: string, hits: number[], pitch = 0, volume = 0.7): SymphonyTrack => ({ id, sample: `/audio/efm/${file}`, steps: steps(hits), pitch, volume, muted: false });
const presets = [
  { name: "Easy Groove", tempo: 100, tracks: [track("bass", "low-puff.wav", [0, 4, 8, 12], 0, 0.8), track("beat", "soft-pop.wav", [4, 12], 0, 0.55), track("solo", "airy-tick.wav", [2, 6, 10, 14], 0, 0.4), track("extra", "mellow-squeak.wav", [15], 0, 0.3)] },
  { name: "After Hours", tempo: 88, tracks: [track("bass", "warm-rumble.wav", [0, 6, 8], 0, 0.75), track("beat", "soft-pop.wav", [4, 12], 0, 0.5), track("solo", "airy-tick.wav", [2, 10, 14], 0, 0.35), track("extra", "mellow-squeak.wav", [7, 15], 0, 0.25)] },
  { name: "Soft Bounce", tempo: 112, tracks: [track("bass", "low-puff.wav", [0, 4, 8, 12], 0, 0.75), track("beat", "dry-tap.wav", [4, 12], 0, 0.5), track("solo", "airy-tick.wav", [2, 6, 10, 14], 0, 0.35), track("extra", "mellow-squeak.wav", [7, 15], 0, 0.3)] },
];
const copyPreset = (index: number): SymphonyScore => ({ tempo: presets[index].tempo, tracks: presets[index].tracks.map((item) => ({ ...item, steps: [...item.steps] })) });
const pitches = [[-5, "Lower"], [-3, "A little lower"], [0, "Natural pitch"], [3, "A little higher"], [5, "Higher"]] as const;

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
  const [undoScore, setUndoScore] = useState<SymphonyScore | null>(null);
  const [mic, setMic] = useState<"off" | "requesting" | "listening" | "following">("off");
  const [micMessage, setMicMessage] = useState("Play music nearby. EFM listens for the beat and joins in.");
  const [micLevel, setMicLevel] = useState(0);
  const [matchedBpm, setMatchedBpm] = useState<number | null>(null);
  const engineRef = useRef<SymphonyEngine | null>(null);
  const listenerRef = useRef<MusicListener | null>(null);
  const micRequest = useRef(0);
  const scoreRef = useRef(score);
  const runningRef = useRef(false);
  const autoStart = useRef(false);
  const candidate = useRef<number | null>(null);
  const taps = useRef<number[]>([]);
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
      mounted.current = false; requestRef.current += 1; micRequest.current += 1;
      listenerRef.current?.stop(); listenerRef.current = null;
      engineRef.current?.dispose(); engineRef.current = null;
      imported.forEach((url) => URL.revokeObjectURL(url));
      exported.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const stop = () => {
    runningRef.current = false; autoStart.current = false;
    requestRef.current += 1; engineRef.current?.stop();
    setPlaying(false); setLoading(false); setPlayhead(-1);
  };

  const change = (next: SymphonyScore) => {
    // Editing is immediate; the next scheduled notes use the new score.
    scoreRef.current = next; setScore(next); setPreset("custom"); setError(""); setNotice("");
    if (playing) void engine().update(next).catch((cause: unknown) => {
      if (mounted.current) { stop(); setError(cause instanceof Error ? cause.message : "That sound could not be loaded. Choose another sample."); }
    });
    else if (loading) stop();
  };

  const changeTrack = (index: number, fields: Partial<SymphonyTrack>) => change({ ...score, tracks: score.tracks.map((item, i) => i === index ? { ...item, ...fields } : item) });

  const startPlayback = async (input: SymphonyScore) => {
    if (!input.tracks.some(item => !item.muted && item.volume > 0 && item.steps.some(Boolean))) { setError("Turn on a note and an unmuted track first."); return; }
    const request = ++requestRef.current;
    runningRef.current = true;
    setError(""); setNotice(""); setLoading(true);
    try {
      await engine().play(input, (step) => { if (mounted.current && requestRef.current === request) setPlayhead(step); });
      if (mounted.current && requestRef.current === request) { setPlaying(true); setLoading(false); }
    } catch (cause) {
      if (mounted.current && requestRef.current === request) { runningRef.current = false; setLoading(false); setPlaying(false); setError(cause instanceof Error ? cause.message : "Could not start EFM. Try again."); }
    }
  };
  const play = () => { if (runningRef.current) stop(); else void startPlayback(scoreRef.current); };

  const stopListening = () => {
    micRequest.current += 1; listenerRef.current?.stop(); engineRef.current?.releaseBeat();
    autoStart.current = false; candidate.current = null;
    setMic("off"); setMicLevel(0); setMatchedBpm(null);
    setMicMessage("Mic off. Your groove keeps its last tempo.");
  };

  const listen = async () => {
    if (mic !== "off") { stopListening(); return; }
    const request = ++micRequest.current;
    autoStart.current = true; candidate.current = null; taps.current = [];
    setError(""); setMic("requesting"); setMicMessage("Allow microphone access when your browser asks.");
    listenerRef.current ??= new MusicListener(() => engine().audioContext());
    try {
      const started = await listenerRef.current.start((frames, level) => {
        if (!mounted.current || request !== micRequest.current) return;
        setMicLevel(level);
        const pulse = estimatePulse(frames);
        if (!pulse || pulse.confidence < 0.74) {
          candidate.current = null; engineRef.current?.releaseBeat(); setMic("listening"); setMatchedBpm(null);
          setMicMessage(frames.length < 180 ? "Listening… give it a few steady beats." : "Finding the beat. Try clearer music, or tap the tempo below.");
          return;
        }
        if (candidate.current === null || Math.abs(pulse.bpm - candidate.current) > 3) {
          engineRef.current?.releaseBeat();
          candidate.current = pulse.bpm; setMic("listening"); setMatchedBpm(null);
          setMicMessage("Beat detected. Checking the tempo…"); return;
        }
        const bpm = Math.round(pulse.bpm);
        candidate.current = pulse.bpm;
        const next = { ...scoreRef.current, tempo: bpm };
        scoreRef.current = next; setScore(next);
        engine().matchBeat(bpm, pulse.beatTime);
        setMic("following"); setMatchedBpm(bpm);
        setMicMessage("Following the beat. Tempo and timing update as the music plays.");
        if (autoStart.current && !runningRef.current) { autoStart.current = false; void startPlayback(next); }
      }, () => {
        if (!mounted.current || request !== micRequest.current) return;
        stopListening(); setMicMessage("Microphone disconnected. Your groove is still available.");
      });
      if (started && mounted.current && request === micRequest.current) { setMic("listening"); setMicMessage("Listening… give it a few steady beats."); }
    } catch (cause) {
      if (mounted.current && request === micRequest.current) { stopListening(); setMicMessage(cause instanceof Error ? cause.message : "Could not open the microphone."); }
    }
  };

  const manualTempo = (bpm: number, beatTime?: number) => {
    if (mic !== "off") stopListening();
    else engineRef.current?.releaseBeat();
    const next = { ...scoreRef.current, tempo: Math.max(60, Math.min(180, bpm)) };
    change(next);
    if (beatTime !== undefined) engine().matchBeat(next.tempo, beatTime);
  };
  const tapTempo = () => {
    const time = engine().audioContext().currentTime;
    // A resumed clock is needed even when the transport has never played.
    void engine().audioContext().resume();
    if (taps.current.length && time - taps.current[taps.current.length - 1] > 2) taps.current = [];
    taps.current.push(time); taps.current = taps.current.slice(-6);
    if (taps.current.length < 3) { setNotice("Keep tapping with the beat…"); return; }
    const intervals = taps.current.slice(1).map((value, i) => value - taps.current[i]).filter(value => value > 0.25 && value < 1.2).sort((a, b) => a - b);
    if (intervals.length < 2) return;
    manualTempo(Math.round(60 / intervals[Math.floor(intervals.length / 2)]), time);
    setNotice("Tempo set from your taps. Mic off; press Listen & match to follow automatically again.");
  };

  const randomize = () => {
    setUndoScore(scoreRef.current); change(generateGroove(scoreRef.current));
    setNotice("Fresh groove. Same tempo, softer sounds.");
  };

  const preview = async (item: SymphonyTrack) => {
    setError("");
    try { await engine().preview(item.sample, item.pitch, item.volume); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not play that sample."); }
  };

  const choosePreset = (value: string) => {
    stop();
    const next = copyPreset(Number(value));
    if (mic !== "off") next.tempo = scoreRef.current.tempo;
    else engineRef.current?.releaseBeat();
    scoreRef.current = next; setScore(next); setPreset(value); setError(""); setNotice("");
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
      const link = document.createElement("a"); link.href = url; link.download = "blackfart-efm.wav";
      document.body.appendChild(link); link.click(); link.remove();
      setNotice("Your WAV is ready: four bars of your composition.");
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not create the download. Try again."); }
    finally { if (mounted.current) setExporting(false); }
  };

  return <div className="app-shell symphony-shell">
    <header className="symphony-header"><Link className="brand" href="/"><span className="brand-mark">bƒ</span><span>blackfart<span className="brand-dot">.com</span></span></Link><Link href="/#sound-lab">← Back to the sound lab</Link></header>
    <main className="symphony-main">
      <div className="symphony-title"><div><p className="eyebrow">ELECTRONIC FART MUSIC</p><h1><em>EFM.</em></h1></div><div className="symphony-opus" aria-hidden="true">bƒ<span>VOL. 01</span></div></div>
      <p className="symphony-intro">Make a groove. Or let the music lead.</p>

      <section className={`efm-listen ${mic === "following" ? "is-following" : ""}`} aria-label="Match nearby music">
        <div className="efm-listen-heading"><div><p className="eyebrow">LET IT LISTEN</p><h2>YOUR MUSIC. EFM’S BEAT.</h2></div><span className="efm-mic-state"><i className={mic !== "off" ? "live-dot" : ""} />{mic === "off" ? "MIC OFF" : mic === "requesting" ? "WAITING FOR MIC" : "MIC ON"}</span></div>
        <div className="efm-listen-main"><button type="button" className="button button-lime" onClick={() => void listen()}>{mic === "off" ? "◎ Listen & match" : mic === "requesting" ? "Cancel microphone" : "■ Stop listening"}</button><div className="efm-listen-result" role="status"><strong>{matchedBpm ? `≈ ${matchedBpm} BPM` : mic === "off" ? "Ready when you are" : "Finding your rhythm…"}</strong><span>{micMessage}</span></div><div className="efm-input-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(micLevel * 100)}><span style={{ height: `${Math.max(3, micLevel * 100)}%` }} /></div></div>
        <div className="efm-listen-footer"><p>Mic audio stays on your device. Use headphones for EFM so it follows the music around you. Works best with a clear, steady beat.</p><div><button type="button" onClick={tapTempo}>Tap tempo</button><button type="button" disabled={score.tempo / 2 < 60} onClick={() => manualTempo(Math.round(score.tempo / 2))}>½ speed</button><button type="button" disabled={score.tempo * 2 > 180} onClick={() => manualTempo(score.tempo * 2)}>2× speed</button></div></div>
      </section>

      <section className="symphony-console" aria-label="EFM beat maker">
        <div className="symphony-toolbar">
          <button className={`button button-lime symphony-play ${playing ? "is-playing" : ""}`} onClick={() => void play()} disabled={empty && !playing && !loading}>{loading ? "■ Cancel loading" : playing ? "■ Stop EFM" : "▶ Play EFM"}</button>
          <label className="symphony-preset"><span>Start with a groove</span><select value={preset} onChange={(event) => choosePreset(event.currentTarget.value)}>{preset === "custom" && <option value="custom" disabled>Your composition</option>}{presets.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}</select></label>
          <label className="symphony-tempo"><span>Tempo <strong>{score.tempo} <small>BPM</small></strong></span><input type="range" min="60" max="180" step="1" value={score.tempo} aria-label="Tempo" onChange={(event) => manualTempo(Number(event.currentTarget.value))} /></label>
        </div>
        <div className="efm-random"><button type="button" onClick={randomize}>⤨ Randomize groove</button>{undoScore && <button type="button" onClick={() => { change({ ...undoScore, tempo: scoreRef.current.tempo }); setUndoScore(null); }}>Undo randomize</button>}<span>New rhythm. Same tempo. Always mellow.</span></div>
        <div className="symphony-score-meta"><span><i className={playing ? "live-dot" : ""} />{playing ? "IN THE GROOVE" : loading ? "LOADING YOUR SOUNDS…" : "SIX SOFTER SOUNDS. FOUR TRACKS."}</span><span>16 NOTES · 4 BEATS · LOOPS</span></div>

        <div className="symphony-tracks">{score.tracks.map((item, index) => <section className={`symphony-track ${item.muted ? "is-muted" : ""}`} key={item.id} aria-label={parts[index]}>
          <div className="symphony-instrument">
            <div className="symphony-part"><span>{String(index + 1).padStart(2, "0")}</span><h2>{parts[index]}</h2><button type="button" aria-label={`${item.muted ? "Unmute" : "Mute"} ${parts[index]}`} aria-pressed={item.muted} onClick={() => changeTrack(index, { muted: !item.muted })}>{item.muted ? "Muted" : "On"}</button></div>
            <div className="symphony-sound-picker"><select aria-label={`Sound for ${parts[index]}`} value={item.sample} onChange={(event) => changeTrack(index, { sample: event.currentTarget.value })}>{samples.map((sample) => <option key={sample.file} value={`/audio/efm/${sample.file}`}>{sample.title}</option>)}{imports[item.id] && <option value={imports[item.id].url}>{imports[item.id].name}</option>}</select><button type="button" aria-label={`Preview ${parts[index]}`} onClick={() => void preview(item)}>▶</button></div>
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
      {exportUrl && <div className="symphony-export-ready"><span>Your last export</span><audio controls src={exportUrl} aria-label="Your exported EFM mix" /><a href={exportUrl} download="blackfart-efm.wav">Save WAV ↗</a></div>}
      {empty && !error && <p className="symphony-message" role="status">Tap a note to start, or choose a composition above. At least one track needs its sound on.</p>}

      <div className="symphony-export"><div><h2>KEEP YOUR GROOVE.</h2><p>Download four bars as a WAV. No account needed.</p></div><button type="button" className="button button-lime" onClick={() => void download()} disabled={exporting || empty}>{exporting ? "Making your WAV…" : "↓ Download EFM"}</button></div>
      <footer className="symphony-footer"><span>Six trimmed, softened samples with matched levels. Your own audio stays on this device.</span><a href="/audio/efm/manifest.json" target="_blank" rel="noopener noreferrer">CC0 sample credits ↗</a></footer>
    </main>
    {(playing || loading || mic !== "off") && <button className="symphony-mobile-stop" onClick={() => { stop(); stopListening(); }} aria-label="Stop playback and microphone">■ Stop all</button>}
  </div>;
}
