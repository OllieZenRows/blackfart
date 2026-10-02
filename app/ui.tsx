"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { WorldMap } from "./world-map";

type Entry = {
  id: string; category: string; title: string; story: string; mediaType: string | null;
  mediaSource: string; durationMs: number | null;
  latitude: number | null; longitude: number | null; createdAt: string; votes: number;
};
type PrivateEntry = { id: string; category: string; title: string; status: string; mediaType: string | null; mediaSource: string; createdAt: string };
type ReviewEntry = Entry & { email: string | null; displayName: string | null };
type AppProps = { isSignedIn: boolean; displayName: string | null; isModerator: boolean; signInHref: string; signOutHref: string };

const categories = [
  ["after-fight", "After the argument", "The post-fight pressure release"],
  ["oopsie", "The oopsie", "A wardrobe malfunction"],
  ["friends-house", "At a friend's house", "The guest-bathroom chronicles"],
  ["eleven-second", "The 11-second mishap", "One that went on a little long"],
  ["other", "Other circumstances", "The story that defies categories"],
];
const samples = [
  { title: "The original", file: "original.mp3", note: "A timeless classic" },
  { title: "Low blow", file: "subterranean.mp3", note: "Short and low" },
  { title: "Morning trumpet", file: "morning-trumpet-release.wav", note: "Full-force wake-up call" },
  { title: "Bali belly", file: "cosmic.mp3", note: "Holiday cut short" },
  { title: "Curry regret", file: "curry.mp3", note: "Consequences included" },
  { title: "Aftershock", file: "aftershock.mp3", note: "There’s always another" },
];
const labelFor = (value: string) => categories.find(([key]) => key === value)?.[1] ?? "Other circumstances";
const readableDate = (value: string) => {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? "Just now" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
};

export function BlackfartApp({ isSignedIn, displayName, isModerator, signInHref, signOutHref }: AppProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [myEntries, setMyEntries] = useState<PrivateEntry[]>([]);
  const [reviewEntries, setReviewEntries] = useState<ReviewEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState("");
  const [modal, setModal] = useState<"submit" | "log" | "review" | "coins" | null>(null);
  const [sample, setSample] = useState(samples[4]);
  const [playingSample, setPlayingSample] = useState(false);
  const [message, setMessage] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const refreshEntries = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/entries", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the public chart.");
      setEntries(data.entries ?? []);
      setFeedError("");
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : "Could not load the public chart.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void refreshEntries(); }, []);

  const mapPoints = useMemo(() => entries.filter((entry) => entry.latitude !== null && entry.longitude !== null), [entries]);
  const weeklyNumber = entries.length;

  const playSample = async () => {
    if (!audioRef.current) return;
    if (playingSample) { audioRef.current.pause(); audioRef.current.currentTime = 0; setPlayingSample(false); return; }
    audioRef.current.src = `/audio/${sample.file}`;
    audioRef.current.volume = 0.72;
    try { await audioRef.current.play(); setPlayingSample(true); }
    catch { setMessage("This sample could not play in your browser."); }
  };

  const openMyLog = async () => {
    if (!isSignedIn) return;
    setModal("log");
    try {
      const response = await fetch("/api/mine", { cache: "no-store" });
      const data = await response.json();
      setMyEntries(response.ok ? data.entries ?? [] : []);
    } catch { setMyEntries([]); }
  };

  const openReview = async () => {
    setModal("review");
    try {
      const response = await fetch("/api/moderation", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Review desk unavailable.");
      setReviewEntries(data.entries ?? []);
      setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Review desk unavailable."); }
  };

  const vote = async (entry: Entry) => {
    if (!isSignedIn) { setMessage("Sign in to vote on the chart."); return; }
    try {
      const response = await fetch("/api/votes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId: entry.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Vote unavailable.");
      setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, votes: data.votes, voted: data.voted || (item as Entry & { voted?: boolean }).voted } as Entry : item));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Vote unavailable."); }
  };

  const review = async (entryId: string, decision: "approved" | "rejected") => {
    try {
      const response = await fetch("/api/moderation", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId, decision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Review could not be saved.");
      setReviewEntries((current) => current.filter((entry) => entry.id !== entryId));
      if (decision === "approved") void refreshEntries();
      setMessage(decision === "approved" ? "Approved. It is now on the chart and map." : "Rejected and removed from the review queue.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Review could not be saved."); }
  };

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Blackfart home"><span className="brand-mark">bƒ</span><span>blackfart<span className="brand-dot">.com</span></span></a>
      <nav className="main-nav" aria-label="Main navigation">
        <a className="nav-active" href="#chart">Fartifyty</a><a href="#world">World map</a><a href="#sound-lab">Sound lab</a>
      </nav>
      <div className="account-actions">
        <button className="coin-pill" onClick={() => setModal("coins")}><span className="coin-dot">F</span> FART COIN <span className="coin-soon">BIDS SOON</span></button>
        {isSignedIn ? <><button className="account-name" onClick={() => void openMyLog()} title="Open your private logbook">{displayName || "Member"}</button><a className="sign-in" href={signOutHref} target="_top">Sign out</a></> : <a className="sign-in" href={signInHref} target="_top">Sign in <span aria-hidden="true">↗</span></a>}
      </div>
    </header>

    <main id="top">
      <section className="masthead">
        <div className="mast-copy">
          <div className="eyebrow"><span className="asterisk">✳</span> COMMUNITY SOUND ARCHIVE / EST. 2026</div>
          <h1>FARTIFYTY<br /><em>THE TOP HITS.</em></h1>
          <p className="mast-intro">The world's most serious chart for life's least dignified moments. Tell the story, submit the sound, let the community decide.</p>
          <div className="mast-actions"><button className="button button-lime" onClick={() => { setMessage(""); setModal("submit"); }}>Log a moment <span aria-hidden="true">↗</span></button><a className="button button-quiet" href="#world">Explore the map ↓</a></div>
          <div className="cause-line"><span className="cause-star">✳</span> A portion of paid proceeds is intended to support colon-cancer research. Paid bids open after the split and recipient are published.</div>
        </div>
        <div className="hero-art"><div className="hero-art-top"><span>BF / 001</span><span>FIG. 01 · PRESSURE STUDY</span></div><div className="hero-smoke" /><div className="hero-art-bottom"><span>LOW FREQUENCY.</span><strong>HIGH IMPACT.</strong></div><div className="hero-stamp">THE<br />AIR<br />WAVES</div></div>
      </section>

      <div className="ticker"><span>✳ FARTIFYTY CHARTS</span><span>COMMUNITY-VOTED / HUMAN-SUBMITTED</span><span>FART COIN AUCTIONS / IN THE WORKS</span></div>

      <section className="dashboard" id="chart">
        <div className="section-heading"><div><span className="section-number">01 /</span><div><p className="eyebrow">THE WEEKLY CHART</p><h2>THE PRESSURE<br className="mobile-only" /> TOP 10</h2></div></div><div className="chart-meta"><span className="live-dot" /> {weeklyNumber} APPROVED {weeklyNumber === 1 ? "ENTRY" : "ENTRIES"}<br /><small>Votes decide the weekly winner and prize.</small></div></div>
        {feedError && <div className="notice notice-error" role="status">{feedError} <button onClick={() => void refreshEntries()}>Try again</button></div>}
        {loading ? <div className="empty-chart"><span className="loading-ring" /><span>Warming up the charts…</span></div> : entries.length === 0 ? <div className="empty-chart"><span className="empty-art">∿</span><strong>The first hit is still out there.</strong><span>Be the first to submit a real story or a real recording. Every entry is reviewed before it appears here.</span><button className="text-link" onClick={() => { setMessage(""); setModal("submit"); }}>Make the first entry <span aria-hidden="true">↗</span></button></div> : <div className="chart-list">{entries.slice(0, 10).map((entry, i) => <article className="chart-row" key={entry.id}>
          <div className="rank">{String(i + 1).padStart(2, "0")}<span className="rank-arrow">{i < 3 ? "↗" : "·"}</span></div>
          <div className="entry-main"><div className="entry-eyebrow"><span>{labelFor(entry.category)}</span><span>{entry.mediaSource === "recorded-in-app" ? "RECORDED HERE" : entry.mediaType ? "UPLOADED CLIP" : "STORY"}</span>{entry.durationMs ? <span>{(entry.durationMs / 1000).toFixed(1)} SEC</span> : null}<span>{readableDate(entry.createdAt)}</span></div><h3>{entry.title}</h3>{entry.story && <p className="entry-story">{entry.story}</p>}{entry.mediaType && <div className="entry-media">{entry.mediaType.startsWith("video/") ? <video controls preload="metadata" src={`/api/media/${entry.id}`} aria-label={`Community recording: ${entry.title}`} /> : <audio controls preload="none" src={`/api/media/${entry.id}`} aria-label={`Community recording: ${entry.title}`} />}</div>}</div>
          <div className="vote-column"><button className={`vote-button ${(entry as Entry & {voted?:boolean}).voted ? "voted" : ""}`} disabled={(entry as Entry & {voted?:boolean}).voted} onClick={() => void vote(entry)} aria-label={`Vote for ${entry.title}`}><span>▲</span> {entry.votes}</button><small>FARTS</small></div>
        </article>)}</div>}
        {isModerator && <button className="moderator-link" onClick={() => void openReview()}>Review desk <span aria-hidden="true">→</span></button>}
      </section>

      <section className="world-section" id="world">
        <div className="section-heading"><div><span className="section-number">02 /</span><div><p className="eyebrow">AN ATLAS OF HUMANITY</p><h2>THE WORLD<br />AFTER THE FACT.</h2></div></div><div className="chart-meta map-meta">{mapPoints.length} APPROXIMATE PINS<br /><small>Only with member opt-in · ~55 km grid</small></div></div>
        <div className="map-card"><div className="map-card-head"><div><span className="map-status"><i /> MEMBER LOGS</span><p>Every dot represents an approved community log. Exact location is never published.</p></div><button className="map-log-button" onClick={() => { setMessage(""); setModal("submit"); }}>Add a rough pin <span>↗</span></button></div><WorldMap points={mapPoints} /><div className="map-legend"><span><i /> APPROVED MEMBER ENTRY</span><span>ROUGH GRID ONLY / NO STREET-LEVEL LOCATION</span></div></div>
      </section>

      <section className="sound-lab" id="sound-lab">
        <div className="sound-lab-copy"><span className="section-number">03 /</span><p className="eyebrow">THE PRESSURE ROOM</p><h2>THE ORIGINAL<br />SOUND LAB.</h2><p>Six real recordings from the CC0 archive. Not synths, not edits—just weirdly good source material while we wait for yours.</p><a href="/audio/sources.json" target="_blank" rel="noopener noreferrer">Sound credits &amp; licence ↗</a></div>
        <div className="sample-board"><div className="sample-board-head"><span>OPEN REEL / 006</span><span>{playingSample ? "PLAYING" : "READY"}</span></div><div className="sample-now"><div className="sample-disc">∿</div><div><strong>{sample.title}</strong><span>{sample.note}</span></div><button className="sample-play" onClick={() => void playSample()} aria-label={playingSample ? "Stop sound" : `Play ${sample.title}`}>{playingSample ? "Ⅱ" : "▶"}</button></div><div className="sample-list">{samples.map((item, index) => <button key={item.file} className={item.file === sample.file ? "selected" : ""} onClick={() => { if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } setPlayingSample(false); setSample(item); }}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.title}</strong><small>{item.note}</small><span>↗</span></button>)}</div><audio ref={audioRef} onEnded={() => setPlayingSample(false)} onError={() => setPlayingSample(false)} /></div>
      </section>

      <section className="launch-note"><div><span>THE DEAL</span><h2>GOOD STORIES.<br /><em>GOOD CAUSE.</em></h2></div><p>A portion of future Fart Coin proceeds is intended to support colon-cancer research. Before paid bidding opens, Blackfart will publish the exact share, conversion terms, and named recipient. For now, you can log, listen, vote, and help build the chart.</p><button className="button button-lime" onClick={() => { setMessage(""); setModal("submit"); }}>Add to the archive <span>↗</span></button></section>
    </main>

    <footer className="footer"><a className="brand" href="#top"><span className="brand-mark">bƒ</span><span>blackfart<span className="brand-dot">.com</span></span></a><span>REAL STORIES. APPROVED BEFORE AIRPLAY.</span><a href="https://github.com/OllieZenRows/blackfart" target="_blank" rel="noopener noreferrer">OPEN SOURCE / CC0 SOUND ARCHIVE ↗</a><small>Member email stays private. Map pins are approximate. Colon-cancer recipient and paid-bid terms will be published before cash bidding begins.</small></footer>

    {message && modal !== "submit" && modal !== "review" && <div className="toast" role="status">{message}<button onClick={() => setMessage("")}>×</button></div>}
    {modal === "submit" && <SubmissionDialog isSignedIn={isSignedIn} signInHref={signInHref} onClose={() => setModal(null)} onSubmitted={(text) => { setMessage(text); void refreshEntries(); }} />}
    {modal === "log" && <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setModal(null); }}><section className="dialog-card log-dialog" role="dialog" aria-modal="true" aria-labelledby="log-title"><button className="dialog-close" onClick={() => setModal(null)} aria-label="Close">×</button><p className="eyebrow">MEMBER / PRIVATE VIEW</p><h2 id="log-title">YOUR LOGBOOK.</h2><p className="dialog-lede">Only you can see your submissions and review status. Your login email is kept private.</p>{myEntries.length ? <div className="my-entry-list">{myEntries.map((entry) => <div key={entry.id}><span className={`status status-${entry.status}`}>{entry.status}</span><strong>{entry.title}</strong><small>{labelFor(entry.category)} · {entry.mediaType ? "media included" : "story"} · {readableDate(entry.createdAt)}</small></div>)}</div> : <div className="review-empty">No submissions yet. Make your first log when you’re ready.</div>}<button className="button button-lime full-button" onClick={() => setModal("submit")}>Log a moment <span>↗</span></button></section></div>}
    {modal === "coins" && <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setModal(null); }}><section className="dialog-card coin-dialog" role="dialog" aria-modal="true" aria-labelledby="coin-title"><button className="dialog-close" onClick={() => setModal(null)} aria-label="Close">×</button><span className="coin-emblem">F</span><p className="eyebrow">FART COIN / COMING SOON</p><h2 id="coin-title">THE CHART<br />WILL HAVE A STAKE.</h2><p className="dialog-lede">The Fartifyty chart is live for stories and votes. Cash-convertible coin bids will appear once the conversion terms, charity share, and payout route are ready and visible to members.</p><div className="coin-spec"><span>MEMBER VOTES</span><strong>LIVE</strong><span>FART COIN BIDS</span><strong>PREPARING</strong><span>CASH CONVERSION</span><strong>NOT OPEN</strong></div><button className="button button-quiet full-button" onClick={() => setModal(null)}>Back to the chart</button></section></div>}
    {modal === "review" && <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setModal(null); }}><section className="dialog-card review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title"><button className="dialog-close" onClick={() => setModal(null)} aria-label="Close">×</button><p className="eyebrow">BLACKFART / MODERATION</p><h2 id="review-title">THE REVIEW DESK.</h2>{message && <div className="notice" role="status">{message}</div>}{reviewEntries.length === 0 ? <div className="review-empty">The queue is clear.</div> : <div className="review-list">{reviewEntries.map((entry) => <article key={entry.id}><div className="review-meta"><span>{labelFor(entry.category)}</span><span>{entry.mediaSource === "recorded-in-app" ? "RECORDED IN APP" : "MEMBER UPLOAD"}</span></div><h3>{entry.title}</h3><p>{entry.story}</p><small>Submitted by {entry.displayName || "member"} · {entry.email || "email unavailable"}</small>{entry.mediaType && <div className="entry-media">{entry.mediaType.startsWith("video/") ? <video controls preload="metadata" src={`/api/media/${entry.id}?review=1`} /> : <audio controls preload="metadata" src={`/api/media/${entry.id}?review=1`} />}</div>}<div className="review-actions"><button onClick={() => void review(entry.id, "rejected")}>Reject</button><button className="button-lime" onClick={() => void review(entry.id, "approved")}>Approve for the chart</button></div></article>)}</div>}<button className="button button-quiet full-button" onClick={() => setModal(null)}>Close review desk</button></section></div>}
    {modal === "submit" && <></>}
    {isSignedIn && <button className="floating-log" onClick={() => { setMessage(""); setModal("submit"); }} aria-label="Log a moment">＋<span>Log a moment</span></button>}
  </div>;
}

function SubmissionDialog({ isSignedIn, signInHref, onClose, onSubmitted }: { isSignedIn: boolean; signInHref: string; onClose: () => void; onSubmitted: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<"capture" | "upload">("upload");
  const [durationMs, setDurationMs] = useState(0);
  const [captureMode, setCaptureMode] = useState<"audio" | "video" | null>(null);
  const [recording, setRecording] = useState(false);
  const [approxLocation, setApproxLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const setMedia = (next: File | null, kind: "capture" | "upload") => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next); setSource(kind); setPreview(next ? URL.createObjectURL(next) : "");
  };

  const detectDuration = (next: File) => {
    const element: HTMLMediaElement = next.type.startsWith("video/") ? document.createElement("video") : new Audio();
    const url = URL.createObjectURL(next);
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      if (Number.isFinite(element.duration) && element.duration > 0) setDurationMs(Math.min(30000, Math.round(element.duration * 1000)));
      URL.revokeObjectURL(url);
    };
    element.onerror = () => URL.revokeObjectURL(url);
    element.src = url;
  };

  const startCapture = async (mode: "audio" | "video") => {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("In-app recording is not supported in this browser. Upload a clip instead.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false });
      streamRef.current = stream;
      const options = mode === "video"
        ? ["video/webm;codecs=vp8,opus", "video/webm"]
        : ["audio/webm;codecs=opus", "audio/webm"];
      const mimeType = options.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const elapsed = Math.min(30000, Date.now() - startedRef.current);
        const blob = new Blob(chunks, { type: recorder.mimeType || (mode === "video" ? "video/webm" : "audio/webm") });
        const suffix = mode === "video" ? "webm" : "webm";
        setDurationMs(elapsed);
        setMedia(new File([blob], `blackfart-capture-${Date.now()}.${suffix}`, { type: blob.type }), "capture");
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null; setRecording(false); setCaptureMode(null);
      };
      recorderRef.current = recorder;
      startedRef.current = Date.now();
      recorder.start(250); setRecording(true); setCaptureMode(mode);
      timerRef.current = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 30000);
    } catch (cause) {
      streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
      setError(cause instanceof Error ? cause.message : "Camera or microphone permission was not granted.");
    }
  };

  const stopCapture = () => { if (timerRef.current) clearTimeout(timerRef.current); if (recorderRef.current?.state === "recording") recorderRef.current.stop(); };

  const requestRoughLocation = () => {
    setError("");
    if (!navigator.geolocation) { setError("Location is not available here. You can enter a broad area name instead."); return; }
    navigator.geolocation.getCurrentPosition((position) => {
      setApproxLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    }, () => setError("Could not get location. You can submit without a pin."), { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (!isSignedIn) { setError("Sign in before submitting."); return; }
    setSuccess("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (file) form.set("media", file, file.name);
    form.set("mediaSource", source);
    if (durationMs) form.set("durationMs", String(durationMs));
    form.set("shareLocation", approxLocation ? "yes" : "no");
    if (approxLocation) {
      form.set("latitude", String(approxLocation.latitude));
      form.set("longitude", String(approxLocation.longitude));
    }
    setBusy(true);
    try {
      const response = await fetch("/api/entries", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Submission could not be saved.");
      setSuccess(data.message || "Sent to the review desk.");
      onSubmitted(data.message || "Sent to the review desk.");
      formElement.reset(); setMedia(null, "upload"); setApproxLocation(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the submission. Try again."); }
    finally { setBusy(false); }
  };

  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target && !busy && !recording) onClose(); }}><section className="dialog-card submit-dialog" role="dialog" aria-modal="true" aria-labelledby="submit-title"><button className="dialog-close" onClick={onClose} aria-label="Close" disabled={busy || recording}>×</button><p className="eyebrow">BLACKFART / FIELD LOG</p><h2 id="submit-title">LOG A MOMENT.</h2>
    {!isSignedIn ? <div className="signin-prompt"><p>Sign in with ChatGPT to submit and keep a private logbook. Your account email is used for member records and is never shown on the public chart.</p><a className="button button-lime" href={signInHref} target="_top">Sign in with ChatGPT ↗</a></div> : <>
      <p className="dialog-lede">A story, a sound, or both. Members review every entry before it reaches the chart or the map. “Recorded here” describes the capture method; it cannot prove what caused a sound.</p>
      <form className="submission-form" onSubmit={submit}>
        <label>THE CIRCUMSTANCE<select name="category" required defaultValue=""><option value="" disabled>Choose the moment</option>{categories.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>GIVE IT A TITLE<input name="title" required maxLength={90} placeholder="The 11-second mishap" /></label>
        <label>THE STORY <span className="optional">(optional with a clip)</span><textarea name="story" rows={4} maxLength={3000} placeholder="What happened? Keep names and other people's private details out of it." /></label>
        <div className="media-field"><div className="media-field-head"><strong>THE EVIDENCE</strong><span>STORY OR SOUND, YOUR CHOICE</span></div>
          <div className="record-actions"><button type="button" onClick={() => void startCapture("audio")} disabled={recording || busy}>◉ Record audio here</button><button type="button" onClick={() => void startCapture("video")} disabled={recording || busy}>▣ Record video here</button><label className="upload-label">↑ Upload previous recording<input type="file" accept="audio/*,video/webm,video/mp4,video/quicktime" onChange={(e) => { const next=e.currentTarget.files?.[0] ?? null; setMedia(next, "upload"); setDurationMs(0); if (next) detectDuration(next); }} disabled={recording || busy} /></label></div>
          {recording && <div className="recording-now"><span className="record-live" /> RECORDING {captureMode === "video" ? "VIDEO" : "AUDIO"} · 30 SECOND MAX <button type="button" onClick={stopCapture}>Stop</button></div>}
          {file && <div className="clip-preview"><div><strong>{file.name}</strong><small>{source === "capture" ? "Recorded now in Blackfart" : "Previously recorded upload"} · {(file.size / (1024 * 1024)).toFixed(1)} MB</small></div><button type="button" onClick={() => setMedia(null, "upload")} aria-label="Remove selected clip">×</button>{file.type.startsWith("video/") ? <video controls src={preview} /> : <audio controls src={preview} />}</div>}
          <p className="privacy-copy">Only submit your own story and recordings you have permission to share. Clips stay private while under review. Audio limit 16 MB; video limit 24 MB. In-app recording stops at 30 seconds.</p>
        </div>
        <div className="location-field"><div><strong>ADD A ROUGH MAP PIN?</strong><p>Optional. We round a shared pin to about a 55 km grid before saving it. Never enter an address.</p></div><button type="button" onClick={requestRoughLocation} disabled={busy}>{approxLocation ? "PIN ADDED ✓" : "SHARE ROUGH PIN"}</button></div>
        <label className="consent-check"><input type="checkbox" name="consent" value="yes" required /><span>This is my own story or recording, and I have permission to share it. I understand it goes through review before becoming public.</span></label>
        {success && <div className="notice" role="status">{success}</div>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <div className="form-footer"><span>YOUR EMAIL STAYS PRIVATE / PENDING REVIEW</span><button className="button button-lime" disabled={busy || recording}>{busy ? "Sending to review…" : "Send to the review desk ↗"}</button></div>
      </form>
    </>}
  </section></div>;
}
