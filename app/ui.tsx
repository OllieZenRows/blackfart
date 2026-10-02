"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorldMap, type MapLocation } from "./world-map";
import { PinComposer } from "./pin-composer";
import { clearPinDraft, persistPinDraft, restorePinDraft, type PinDraft } from "./pin-draft";

type Entry = {
  id: string; category: string; title: string; story: string; mediaType: string | null;
  mediaSource: string; durationMs: number | null;
  latitude: number | null; longitude: number | null; createdAt: string; votes: number; verificationStatus: string;
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
  { title: "The original", file: "original.mp3", note: "Breviceps · CC0 source clip", source: "https://freesound.org/people/Breviceps/sounds/445998/" },
  { title: "Low blow", file: "subterranean.mp3", note: "DSISStudios · CC0 source clip", source: "https://freesound.org/people/DSISStudios/sounds/521092/" },
  { title: "The loose one", file: "loose.mp3", note: "DSISStudios · CC0 source clip", source: "https://freesound.org/people/DSISStudios/sounds/640803/" },
  { title: "Bali belly", file: "cosmic.mp3", note: "DSISStudios · CC0 source clip", source: "https://freesound.org/people/DSISStudios/sounds/640801/" },
  { title: "Curry regret", file: "curry.mp3", note: "DSISStudios · CC0 source clip", source: "https://freesound.org/people/DSISStudios/sounds/640799/" },
  { title: "Aftershock", file: "aftershock.mp3", note: "DSISStudios · CC0 source clip", source: "https://freesound.org/people/DSISStudios/sounds/640804/" },
  { title: "Pocket thunder", file: "pocket-thunder.mp3", note: "Agoris · sound effect, not authenticated", source: "https://freesound.org/people/Agoris/sounds/530076/" },
  { title: "Phone mic / 03", file: "phone-mic-03.mp3", note: "Creator says genuine · not independently verified", source: "https://freesound.org/people/anndszjuvupftbim/sounds/803562/" },
  { title: "Mouth-made decoy", file: "mouth-made.mp3", note: "SamsterBirdies · made with a mouth", source: "https://freesound.org/people/SamsterBirdies/sounds/558740/" },
  { title: "The squeaky one", file: "squeaky.mp3", note: "mefrancis13 · a video-game-like squeak", source: "https://freesound.org/people/mefrancis13/sounds/117606/" },
];
const labelFor = (value: string) => categories.find(([key]) => key === value)?.[1] ?? "Other circumstances";
const verificationLabel = (entry: Pick<Entry, "mediaType" | "verificationStatus">) => entry.verificationStatus === "listener-confirmed" ? "LISTENER CHECKED" : entry.mediaType ? "UNVERIFIED CLIP" : "UNVERIFIED STORY";
const verificationNote = (entry: Pick<Entry, "mediaType" | "verificationStatus">) => entry.verificationStatus === "listener-confirmed"
  ? "A moderator listened and judged this clip consistent with a fart. This is a human review, not forensic proof."
  : entry.mediaType ? "No moderator has marked this clip as sounding like a fart." : "A written story cannot be verified as a recording.";
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
  const [pinDraft, setPinDraft] = useState<PinDraft | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinNotice, setPinNotice] = useState("");
  const pinTouched = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (pinTouched.current) return;
      const saved = restorePinDraft();
      if (saved) {
        setPinDraft(saved);
        if (new URLSearchParams(window.location.search).has("compose")) {
          requestAnimationFrame(() => document.querySelector(".pin-composer")?.scrollIntoView({ block: "nearest" }));
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const changePinDraft = (next: PinDraft) => {
    pinTouched.current = true;
    setPinDraft(next); persistPinDraft(next); setPinNotice("");
  };

  const selectMapPin = (location: MapLocation) => {
    if (pinBusy) return;
    const isFirstPin = !pinDraft;
    changePinDraft({ location, story: pinDraft?.story ?? "", category: pinDraft?.category ?? "other" });
    if (isFirstPin) requestAnimationFrame(() => document.querySelector(".pin-composer")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const discardPin = () => {
    if (pinBusy) return;
    pinTouched.current = true; clearPinDraft(); setPinDraft(null); setPinNotice("");
  };

  const loadEntries = useCallback(async () => {
    try {
      const response = await fetch("/api/entries", { cache: "no-store" });
      const data = await response.json() as { entries?: Entry[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load the public chart.");
      setEntries(data.entries ?? []);
      setFeedError("");
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : "Could not load the public chart.");
    } finally { setLoading(false); }
  }, []);

  const refreshEntries = useCallback(() => {
    setLoading(true);
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    let active = true;
    void fetch("/api/entries", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { entries?: Entry[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load the public chart.");
        if (active) { setEntries(data.entries ?? []); setFeedError(""); }
      })
      .catch((error: unknown) => { if (active) setFeedError(error instanceof Error ? error.message : "Could not load the public chart."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

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
      const data = await response.json() as { entries?: PrivateEntry[] };
      setMyEntries(response.ok ? data.entries ?? [] : []);
    } catch { setMyEntries([]); }
  };

  const openReview = async () => {
    setModal("review");
    try {
      const response = await fetch("/api/moderation", { cache: "no-store" });
      const data = await response.json() as { entries?: ReviewEntry[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Review desk unavailable.");
      setReviewEntries(data.entries ?? []);
      setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Review desk unavailable."); }
  };

  const vote = async (entry: Entry) => {
    if (!isSignedIn) { setMessage("Sign in to vote on the chart."); return; }
    try {
      const response = await fetch("/api/votes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId: entry.id }) });
      const data = await response.json() as { votes: number; voted: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "Vote unavailable.");
      setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, votes: data.votes, voted: data.voted || (item as Entry & { voted?: boolean }).voted } as Entry : item));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Vote unavailable."); }
  };

  const review = async (entryId: string, decision: "approved" | "rejected", verificationStatus: "unverified" | "listener-confirmed" = "unverified") => {
    try {
      const response = await fetch("/api/moderation", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId, decision, verificationStatus }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Review could not be saved.");
      setReviewEntries((current) => current.filter((entry) => entry.id !== entryId));
      if (decision === "approved") void refreshEntries();
      setMessage(decision === "rejected" ? "Rejected and removed from the review queue." : verificationStatus === "listener-confirmed" ? "Approved with a listener check. This is not forensic proof." : "Approved and marked unverified.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Review could not be saved."); }
  };

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Blackfart home"><span className="brand-mark">bƒ</span><span>blackfart<span className="brand-dot">.com</span></span></a>
      <nav className="main-nav" aria-label="Main navigation">
        <a className="nav-active" href="#world">World map</a><a href="#chart">Fartifyty</a><a href="#sound-lab">Sound lab</a>
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
          <p className="mast-intro">The world&apos;s most serious chart for life&apos;s least dignified moments. Tell the story, submit the sound, let the community decide.</p>
          <div className="mast-actions"><a className="button button-lime" href="#world">Drop a pin, tell the story <span aria-hidden="true">↗</span></a><a className="button button-quiet" href="#chart">Hear the top hits ↓</a></div>
          <div className="cause-line"><span className="cause-star">✳</span> A portion of paid proceeds is intended to support colon-cancer research. Paid bids open after the split and recipient are published.</div>
        </div>
        <div className="hero-art"><div className="hero-art-top"><span>BF / 001</span><span>FIG. 01 · PRESSURE STUDY</span></div><div className="hero-smoke" /><div className="hero-art-bottom"><span>LOW FREQUENCY.</span><strong>HIGH IMPACT.</strong></div><div className="hero-stamp">THE<br />AIR<br />WAVES</div></div>
      </section>

      <div className="ticker"><span>✳ FARTIFYTY CHARTS</span><span>COMMUNITY-VOTED / HUMAN-SUBMITTED</span><span>FART COIN AUCTIONS / IN THE WORKS</span></div>

      <section className="world-section" id="world">
        <div className="section-heading"><div><span className="section-number">01 /</span><div><p className="eyebrow">AN ATLAS OF HUMANITY</p><h2>THE WORLD<br />AFTER THE FACT.</h2></div></div><div className="chart-meta map-meta">{mapPoints.length} APPROVED MAP LOGS<br /><small>Public pins show a broad area</small></div></div>
        <div className="map-card">
          <div className="map-card-head map-first-head"><div><span className="map-status"><i /> DROP IT ON THE MAP</span><p>Tap anywhere to drop your pin. Move it until it&apos;s right, then log your fart.</p></div><span className="map-step-label">01 PIN IT <span>→</span> 02 LOG IT</span></div>
          <WorldMap points={mapPoints} draftPin={pinDraft?.location ?? null} onSelectPin={selectMapPin} disabled={pinBusy} />
          {pinDraft && <PinComposer draft={pinDraft} isSignedIn={isSignedIn} signInHref={signInHref} categories={categories} onChange={changePinDraft} onCancel={discardPin} onBusyChange={setPinBusy} onSubmitted={(text) => { clearPinDraft(); setPinDraft(null); setPinNotice(text); void refreshEntries(); }} />}
          {pinNotice && <div className="pin-success" role="status"><strong>✓ Logged.</strong><span>{pinNotice}</span><button onClick={() => setPinNotice("")}>Got it</button></div>}
          <div className="map-legend"><span><i /> COMMUNITY PINS · CLICK TO EXPLORE</span><span>ONLY APPROXIMATE AREAS ARE PUBLIC</span></div>
        </div>
      </section>

      <section className="dashboard" id="chart">
        <div className="section-heading"><div><span className="section-number">02 /</span><div><p className="eyebrow">THE WEEKLY CHART</p><h2>THE PRESSURE<br className="mobile-only" /> TOP 10</h2></div></div><div className="chart-meta"><span className="live-dot" /> {weeklyNumber} APPROVED {weeklyNumber === 1 ? "ENTRY" : "ENTRIES"}<br /><small>Votes decide the weekly winner and prize.</small></div></div>
        {feedError && <div className="notice notice-error" role="status">{feedError} <button onClick={() => void refreshEntries()}>Try again</button></div>}
        {loading ? <div className="empty-chart"><span className="loading-ring" /><span>Warming up the charts…</span></div> : entries.length === 0 ? <div className="empty-chart"><span className="empty-art">∿</span><strong>The first hit is still out there.</strong><span>Write one line or attach a clip. A moderator reviews every entry before it appears here.</span><button className="text-link" onClick={() => { setMessage(""); setModal("submit"); }}>Quick log the first one <span aria-hidden="true">↗</span></button></div> : <div className="chart-list">{entries.slice(0, 10).map((entry, i) => <article className="chart-row" key={entry.id}>
          <div className="rank">{String(i + 1).padStart(2, "0")}<span className="rank-arrow">{i < 3 ? "↗" : "·"}</span></div>
          <div className="entry-main"><div className="entry-eyebrow"><span>{labelFor(entry.category)}</span><span>{entry.mediaSource === "recorded-in-app" ? "RECORDED HERE" : entry.mediaType ? "UPLOADED CLIP" : "STORY"}</span>{entry.durationMs ? <span>{(entry.durationMs / 1000).toFixed(1)} SEC</span> : null}<span>{readableDate(entry.createdAt)}</span></div><h3>{entry.title}</h3><span className="verification-badge" data-verification={entry.verificationStatus} title={verificationNote(entry)}>{verificationLabel(entry)}</span><span className="verification-note">{verificationNote(entry)}</span>{entry.story && <p className="entry-story">{entry.story}</p>}{entry.mediaType && <div className="entry-media">{entry.mediaType.startsWith("video/") ? <video controls preload="metadata" src={`/api/media/${entry.id}`} aria-label={`Community recording: ${entry.title}`} /> : <audio controls preload="none" src={`/api/media/${entry.id}`} aria-label={`Community recording: ${entry.title}`} />}</div>}</div>
          <div className="vote-column"><button className={`vote-button ${(entry as Entry & {voted?:boolean}).voted ? "voted" : ""}`} disabled={(entry as Entry & {voted?:boolean}).voted} onClick={() => void vote(entry)} aria-label={`Vote for ${entry.title}`}><span>▲</span> {entry.votes}</button><small>FARTS</small></div>
        </article>)}</div>}
        {isModerator && <button className="moderator-link" onClick={() => void openReview()}>Review desk <span aria-hidden="true">→</span></button>}
      </section>

      <section className="sound-lab" id="sound-lab">
        <div className="sound-lab-copy"><span className="section-number">03 /</span><p className="eyebrow">THE PRESSURE ROOM</p><h2>THE OPEN<br />SOUND LAB.</h2><p>Ten CC0 reference clips, separate from member entries. Creator descriptions are credited, but they do not verify how a sound was made.</p><a href="/audio/sources.json" target="_blank" rel="noopener noreferrer">Sound credits &amp; licence ↗</a></div>
        <div className="sample-board"><div className="sample-board-head"><span>CC0 REEL / {String(samples.length).padStart(3, "0")}</span><span>{playingSample ? "PLAYING" : "READY"}</span></div><div className="sample-now"><div className="sample-disc">∿</div><div><strong>{sample.title}</strong><span>{sample.note}</span></div><button className="sample-play" onClick={() => void playSample()} aria-label={playingSample ? "Stop sound" : `Play ${sample.title}`}>{playingSample ? "Ⅱ" : "▶"}</button></div><div className="sample-list">{samples.map((item, index) => <div className="sample-track" key={item.file}><button type="button" className={`sample-select ${item.file === sample.file ? "selected" : ""}`} aria-label={`Select sample: ${item.title}. ${item.note}`} onClick={() => { if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } setPlayingSample(false); setSample(item); }}><span>{String(index + 1).padStart(2, "0")}</span><span className="sample-copy"><strong>{item.title}</strong><small>{item.note}</small></span><span>{item.file === sample.file ? "■" : "▶"}</span></button><a className="sample-credit" href={item.source} target="_blank" rel="noopener noreferrer" aria-label={`Open source and licence for ${item.title}`} title="Source and licence">↗</a></div>)}</div><audio ref={audioRef} onEnded={() => setPlayingSample(false)} onError={() => setPlayingSample(false)} /></div>
      </section>

      <section className="launch-note"><div><span>THE DEAL</span><h2>GOOD STORIES.<br /><em>GOOD CAUSE.</em></h2></div><p>A portion of future Fart Coin proceeds is intended to support colon-cancer research. Before paid bidding opens, Blackfart will publish the exact share, conversion terms, and named recipient. For now, you can log, listen, vote, and help build the chart.</p><button className="button button-lime" onClick={() => { setMessage(""); setModal("submit"); }}>Add to the archive <span>↗</span></button></section>
    </main>

    <footer className="footer"><a className="brand" href="#top"><span className="brand-mark">bƒ</span><span>blackfart<span className="brand-dot">.com</span></span></a><span>REAL STORIES. APPROVED BEFORE AIRPLAY.</span><a href="https://github.com/OllieZenRows/blackfart" target="_blank" rel="noopener noreferrer">OPEN SOURCE / CC0 SOUND ARCHIVE ↗</a><small>Member email stays private. Map pins are approximate. Colon-cancer recipient and paid-bid terms will be published before cash bidding begins.</small></footer>

    {message && modal !== "submit" && modal !== "review" && <div className="toast" role="status">{message}<button onClick={() => setMessage("")}>×</button></div>}
    {modal === "submit" && <SubmissionDialog isSignedIn={isSignedIn} signInHref={signInHref} onClose={() => setModal(null)} onSubmitted={(text) => { setMessage(text); void refreshEntries(); }} />}
    {modal === "log" && <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setModal(null); }}><section className="dialog-card log-dialog" role="dialog" aria-modal="true" aria-labelledby="log-title"><button className="dialog-close" onClick={() => setModal(null)} aria-label="Close">×</button><p className="eyebrow">MEMBER / PRIVATE VIEW</p><h2 id="log-title">YOUR LOGBOOK.</h2><p className="dialog-lede">Only you can see your submissions and review status. Your login email is kept private.</p>{myEntries.length ? <div className="my-entry-list">{myEntries.map((entry) => <div key={entry.id}><span className={`status status-${entry.status}`}>{entry.status}</span><strong>{entry.title}</strong><small>{labelFor(entry.category)} · {entry.mediaType ? "media included" : "story"} · {readableDate(entry.createdAt)}</small></div>)}</div> : <div className="review-empty">No submissions yet. Make your first log when you’re ready.</div>}<button className="button button-lime full-button" onClick={() => setModal("submit")}>Log a moment <span>↗</span></button></section></div>}
    {modal === "coins" && <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setModal(null); }}><section className="dialog-card coin-dialog" role="dialog" aria-modal="true" aria-labelledby="coin-title"><button className="dialog-close" onClick={() => setModal(null)} aria-label="Close">×</button><span className="coin-emblem">F</span><p className="eyebrow">FART COIN / COMING SOON</p><h2 id="coin-title">THE CHART<br />WILL HAVE A STAKE.</h2><p className="dialog-lede">The Fartifyty chart is live for stories and votes. Cash-convertible coin bids will appear once the conversion terms, charity share, and payout route are ready and visible to members.</p><div className="coin-spec"><span>MEMBER VOTES</span><strong>LIVE</strong><span>FART COIN BIDS</span><strong>PREPARING</strong><span>CASH CONVERSION</span><strong>NOT OPEN</strong></div><button className="button button-quiet full-button" onClick={() => setModal(null)}>Back to the chart</button></section></div>}
    {modal === "review" && <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setModal(null); }}><section className="dialog-card review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title"><button className="dialog-close" onClick={() => setModal(null)} aria-label="Close">×</button><p className="eyebrow">BLACKFART / MODERATION</p><h2 id="review-title">THE REVIEW DESK.</h2>{message && <div className="notice" role="status">{message}</div>}{reviewEntries.length === 0 ? <div className="review-empty">The queue is clear.</div> : <div className="review-list">{reviewEntries.map((entry) => <article key={entry.id}><div className="review-meta"><span>{labelFor(entry.category)}</span><span>{entry.mediaSource === "recorded-in-app" ? "RECORDED IN APP" : entry.mediaType ? "MEMBER UPLOAD" : "STORY ONLY"}</span></div><h3>{entry.title}</h3><p>{entry.story}</p><small>Submitted by {entry.displayName || "member"} · {entry.email || "email unavailable"}</small>{entry.mediaType && <div className="entry-media">{entry.mediaType.startsWith("video/") ? <video controls preload="metadata" src={`/api/media/${entry.id}?review=1`} /> : <audio controls preload="metadata" src={`/api/media/${entry.id}?review=1`} />}</div>}<p className="review-verification-note">Listen to the clip before choosing a status. “Sounds like a fart” records a moderator’s judgment, not forensic proof. Story-only logs must stay unverified.</p><div className="review-actions"><button onClick={() => void review(entry.id, "rejected")}>Reject</button><button onClick={() => void review(entry.id, "approved", "unverified")}>Approve · unverified</button>{entry.mediaType && <button className="button-lime" onClick={() => void review(entry.id, "approved", "listener-confirmed")}>Approve · sounds like a fart</button>}</div></article>)}</div>}<button className="button button-quiet full-button" onClick={() => setModal(null)}>Close review desk</button></section></div>}
    {modal === "submit" && <></>}
    {!pinDraft && <a className="floating-log" href="#world" aria-label="Drop a pin and add your story">＋<span>Drop a pin</span></a>}
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
        const blob = new Blob(chunks, { type: (recorder.mimeType || (mode === "video" ? "video/webm" : "audio/webm")).split(";")[0] });
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
    form.set("category", String(form.get("category") || "other"));
    form.set("title", String(form.get("title") || "").trim() || "Quick log");
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
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || "Submission could not be saved.");
      setSuccess(data.message || "Sent to the review desk.");
      onSubmitted(data.message || "Sent to the review desk.");
      formElement.reset(); setMedia(null, "upload"); setApproxLocation(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the submission. Try again."); }
    finally { setBusy(false); }
  };

  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target && !busy && !recording) onClose(); }}><section className="dialog-card submit-dialog" role="dialog" aria-modal="true" aria-labelledby="submit-title"><button className="dialog-close" onClick={onClose} aria-label="Close" disabled={busy || recording}>×</button><p className="eyebrow">BLACKFART / FIELD LOG</p><h2 id="submit-title">LOG A MOMENT.</h2>
    {!isSignedIn ? <div className="signin-prompt"><p>Sign in with ChatGPT to submit and keep a private logbook. Your account email is used for member records and is never shown on the public chart.</p><a className="button button-lime" href={signInHref} target="_top">Sign in with ChatGPT ↗</a></div> : <>
      <p className="quick-submit-hint"><strong>Fastest path:</strong> write one line, leave the default tag, confirm, and send. Title, clip, and map pin are optional.</p>
      <form className="submission-form" onSubmit={submit}>
        <label>THE CIRCUMSTANCE<select name="category" defaultValue="other">{categories.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>GIVE IT A TITLE <span className="optional">(optional; we’ll call it “Quick log” if blank)</span><input name="title" maxLength={90} placeholder="The 11-second mishap" /></label>
        <label>ONE-LINE STORY <span className="optional">(or add a clip below)</span><textarea name="story" rows={3} maxLength={3000} required={!file} placeholder="One line is enough. Keep names and private details out." /></label>
        <details className="media-details"><summary>Add audio or video (optional)</summary><div className="media-field"><div className="media-field-head"><strong>THE RECORDING</strong><span>RECORD NOW OR UPLOAD A CLIP</span></div>
          <div className="record-actions"><button type="button" onClick={() => void startCapture("audio")} disabled={recording || busy}>◉ Record audio here</button><button type="button" onClick={() => void startCapture("video")} disabled={recording || busy}>▣ Record video here</button><label className="upload-label">↑ Upload previous recording<input type="file" accept="audio/*,video/webm,video/mp4,video/quicktime" onChange={(e) => { const next=e.currentTarget.files?.[0] ?? null; setMedia(next, "upload"); setDurationMs(0); if (next) detectDuration(next); }} disabled={recording || busy} /></label></div>
          {recording && <div className="recording-now"><span className="record-live" /> RECORDING {captureMode === "video" ? "VIDEO" : "AUDIO"} · 30 SECOND MAX <button type="button" onClick={stopCapture}>Stop</button></div>}
          {file && <div className="clip-preview"><div><strong>{file.name}</strong><small>{source === "capture" ? "Recorded now in Blackfart" : "Previously recorded upload"} · {(file.size / (1024 * 1024)).toFixed(1)} MB</small></div><button type="button" onClick={() => setMedia(null, "upload")} aria-label="Remove selected clip">×</button>{file.type.startsWith("video/") ? <video controls src={preview} /> : <audio controls src={preview} />}</div>}
          <p className="privacy-copy">Only submit your own recording or one you have permission to share. Clips stay private while under review. Audio limit 16 MB; video limit 24 MB. In-app recording stops at 30 seconds. Recording here does not prove what caused a sound.</p>
        </div></details>
        <details className="pin-details"><summary>{approxLocation ? "Rough map pin added ✓" : "Add a rough map pin (optional)"}</summary><div className="location-field"><div><strong>SHARE A BROAD AREA</strong><p>We round the pin to a 0.5° grid before saving it. Never enter an address.</p></div><button type="button" onClick={requestRoughLocation} disabled={busy}>{approxLocation ? "PIN ADDED ✓" : "SHARE ROUGH PIN"}</button></div></details>
        <label className="consent-check"><input type="checkbox" name="consent" value="yes" required /><span>This is my own story or recording, and I have permission to share it. I understand it goes through review before becoming public.</span></label>
        {success && <div className="notice" role="status">{success}</div>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <div className="form-footer"><span>EMAIL PRIVATE / CLIPS REVIEWED BEFORE AIRPLAY</span><button className="button button-lime" disabled={busy || recording}>{busy ? "Sending…" : "Send for review ↗"}</button></div>
      </form>
    </>}
  </section></div>;
}
