"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { persistPinDraft, type PinDraft } from "./pin-draft";

type Props = {
  draft: PinDraft;
  isSignedIn: boolean;
  signInHref: string;
  categories: string[][];
  onChange: (draft: PinDraft) => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
  onSubmitted: (message: string) => void;
};

export function PinComposer({ draft, isSignedIn, signInHref, categories, onChange, onCancel, onBusyChange, onSubmitted }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sourceRef = useRef("upload");
  const durationRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (recorderRef.current) recorderRef.current.onstop = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const chooseFile = (next: File | null, source = "upload") => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next ? URL.createObjectURL(next) : "";
    setFile(next); setPreview(previewRef.current); sourceRef.current = source;
    if (source === "upload") durationRef.current = 0;
  };

  const recordAudio = async () => {
    setError(""); setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("Recording is unavailable in this browser. You can upload a clip instead.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      const startedAt = Date.now();
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        stream.getTracks().forEach((track) => track.stop()); streamRef.current = null;
        if (!mountedRef.current) return;
        const type = (recorder.mimeType || "audio/webm").split(";")[0];
        const extension = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
        durationRef.current = Math.min(30000, Date.now() - startedAt);
        chooseFile(new File(chunks, `blackfart-recording.${extension}`, { type }), "capture");
        setRecording(false);
      };
      recorderRef.current = recorder; recorder.start(250); setRecording(true);
      timerRef.current = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 30000);
    } catch (cause) {
      streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : "Microphone access was not available.");
    } finally { if (mountedRef.current) setStarting(false); }
  };

  const signIn = () => {
    if (!persistPinDraft(draft)) { setError("Your browser blocked draft storage. Allow site storage so your pin and text can survive sign-in."); return; }
    const url = new URL(signInHref, window.location.origin);
    url.searchParams.set("return_to", "/?compose=1#world");
    window.location.assign(url.href);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (!draft.story.trim()) { setError("Add a short story to go with your pin."); return; }
    if (!isSignedIn) { signIn(); return; }
    const form = new FormData(event.currentTarget);
    form.set("entryMode", "map");
    form.set("title", draft.story.trim().slice(0, 90)); form.set("category", draft.category); form.set("story", draft.story.trim());
    form.set("shareLocation", "yes");
    form.set("latitude", String(draft.location.latitude)); form.set("longitude", String(draft.location.longitude));
    if (file) { form.set("media", file, file.name); form.set("mediaSource", sourceRef.current); }
    if (durationRef.current) form.set("durationMs", String(durationRef.current));
    setBusy(true); onBusyChange(true);
    try {
      const response = await fetch("/api/entries", { method: "POST", body: form });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || "Couldn't save your fart. Your pin and draft are still here.");
      onSubmitted("Fart logged. Your pin will appear publicly after review.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't save your fart. Try again."); }
    finally { onBusyChange(false); if (mountedRef.current) setBusy(false); }
  };

  const locked = busy || recording || starting;
  return <section className="pin-composer" aria-labelledby="pin-composer-title">
    <div className="pin-composer-heading"><div><span className="pin-draft-label">YOUR DRAFT PIN · NOT POSTED</span><h3 id="pin-composer-title">A fart happened here.</h3><p>Drag your pin or tap another spot to move it. Only the broad area is shared.</p></div><button type="button" className="pin-cancel" onClick={onCancel} disabled={locked}>Cancel pin</button></div>
    <form onSubmit={submit} className="pin-quick-form">
      <label className="pin-story-label" htmlFor="pin-story">What happened? <span>A short story is enough.</span></label>
      <textarea id="pin-story" name="story" rows={2} maxLength={3000} required value={draft.story} onChange={(event) => onChange({ ...draft, story: event.currentTarget.value })} placeholder="The 11-second one that should have stopped at 3…" disabled={busy} />
      {isSignedIn && <div className="pin-media-actions">
        {recording ? <button type="button" className="pin-recording" onClick={() => recorderRef.current?.stop()}>● Stop recording</button> : <button type="button" onClick={() => void recordAudio()} disabled={locked}>{starting ? "Opening microphone…" : "◉ Record audio"}</button>}
        <label className={`pin-upload ${locked ? "is-disabled" : ""}`}>↑ Add audio or video<input className="sr-only" type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/ogg,audio/webm,video/mp4,video/webm,video/quicktime" disabled={locked} onChange={(event) => { chooseFile(event.currentTarget.files?.[0] ?? null); setError(""); event.currentTarget.value = ""; }} /></label>
        <label className="pin-category"><span className="sr-only">Circumstance</span><select value={draft.category} disabled={busy} onChange={(event) => onChange({ ...draft, category: event.currentTarget.value })}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>}
      {recording && <p className="pin-helper" role="status">Recording… stops after 30 seconds.</p>}
      {file && <div className="pin-clip"><div><span>{file.name}</span><button type="button" onClick={() => chooseFile(null)} disabled={locked} aria-label="Remove clip">Remove</button></div>{file.type.startsWith("video/") ? <video controls src={preview} /> : <audio controls src={preview} />}</div>}
      {isSignedIn ? <label className="consent-check"><input type="checkbox" name="consent" value="yes" required disabled={busy} /><span>This is my own log or recording and I agree to share it after review.</span></label> : <p className="pin-helper">Sign in when you&apos;re ready. Your pin and story will be waiting; you can add a recording then.</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <div className="pin-form-footer"><span>{isSignedIn ? "Your pin and story are reviewed before going public." : "Your draft stays in this browser until you submit."}</span><button className="button button-lime" disabled={locked}>{busy ? "Logging…" : isSignedIn ? "Log fart here ↗" : "Sign in to log here ↗"}</button></div>
    </form>
  </section>;
}
