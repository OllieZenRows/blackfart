/** Browser-only, 16-step sampler with live score changes. */
export interface SymphonyTrack {
  id: string;
  sample: string;
  steps: boolean[];
  pitch: number;
  volume: number;
  muted: boolean;
}
export interface SymphonyScore { tempo: number; tracks: SymphonyTrack[] }

type SafariWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
};
type Voice = { source: AudioBufferSourceNode; envelope: GainNode };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
function offline(frames: number): OfflineAudioContext {
  const Constructor = window.OfflineAudioContext || (window as SafariWindow).webkitOfflineAudioContext;
  if (!Constructor) throw new Error('This browser does not support audio export.');
  return new Constructor(2, frames, 44100);
}
function snapshot(score: SymphonyScore): SymphonyScore {
  return {
    tempo: clamp(score.tempo, 50, 200),
    tracks: score.tracks.slice(0, 16).map(track => ({
      ...track, pitch: clamp(track.pitch, -24, 24), volume: clamp(track.volume, 0, 1),
      steps: Array.from({ length: 16 }, (_, i) => Boolean(track.steps[i])),
    })),
  };
}
function output(context: BaseAudioContext, trackCount: number): GainNode {
  const gain = context.createGain();
  gain.gain.value = 0.24 / Math.sqrt(Math.max(1, trackCount));
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 12;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.1;
  gain.connect(compressor);
  compressor.connect(context.destination);
  return gain;
}

export class SymphonyEngine {
  private context?: AudioContext;
  private decoder?: OfflineAudioContext;
  private cache = new Map<string, Promise<AudioBuffer>>();
  private requests = new Set<AbortController>();
  private voices = new Set<Voice>();
  private onsets = new WeakMap<AudioBuffer, number>();
  private timer?: ReturnType<typeof setInterval>;
  private generation = 0;
  private dead = false;
  private editGeneration = 0;
  private playback?: { score: SymphonyScore; buffers: Map<string, AudioBuffer> };
  private liveOutput?: GainNode;
  private previewOutput?: GainNode;

  private assertAlive(): void {
    if (this.dead) throw new Error('Audio engine has been disposed.');
  }
  private live(): AudioContext {
    this.assertAlive();
    if (!this.context) {
      const Constructor = window.AudioContext || (window as SafariWindow).webkitAudioContext;
      if (!Constructor) throw new Error('This browser does not support Web Audio.');
      this.context = new Constructor();
    }
    return this.context;
  }
  private load(url: string): Promise<AudioBuffer> {
    this.assertAlive();
    if (!(url.startsWith('/audio/') && !url.includes('..')) && !url.startsWith('blob:')) {
      return Promise.reject(new Error('Choose a supplied audio sample or an uploaded audio file.'));
    }
    const cached = this.cache.get(url);
    if (cached) return cached;
    const pending = (async () => {
      const controller = new AbortController();
      this.requests.add(controller);
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Audio sample could not load (${response.status}).`);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('Audio files must be 8 MB or smaller.');
        this.assertAlive();
        // Decoding requires no audible context and does not require a user gesture.
        this.decoder ??= offline(1);
        const buffer = await this.decoder.decodeAudioData(bytes);
        if (!buffer.duration) throw new Error('This audio file contains no sound.');
        return buffer;
      } catch (error) {
        this.cache.delete(url);
        if (error instanceof Error && error.name === 'AbortError') throw new Error('Audio loading was cancelled or timed out. Try again.');
        throw new Error(error instanceof Error ? error.message : 'This audio format could not be decoded.');
      } finally {
        clearTimeout(timeout);
        this.requests.delete(controller);
      }
    })();
    this.cache.set(url, pending);
    if (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!);
    return pending;
  }
  private onset(buffer: AudioBuffer): number {
    const saved = this.onsets.get(buffer);
    if (saved !== undefined) return saved;
    // Scan short RMS windows so a single click does not establish the onset.
    const channel = buffer.getChannelData(0);
    const windowSize = 128;
    let loudest = 0;
    const levels: number[] = [];
    for (let i = 0; i < channel.length; i += windowSize) {
      let sum = 0;
      const end = Math.min(channel.length, i + windowSize);
      for (let j = i; j < end; j++) sum += channel[j] * channel[j];
      const level = Math.sqrt(sum / (end - i));
      levels.push(level); loudest = Math.max(loudest, level);
    }
    const threshold = Math.max(0.001, loudest * 0.09);
    const first = levels.findIndex(level => level >= threshold);
    const offset = first < 0 ? 0 : Math.max(0, first * windowSize / buffer.sampleRate - 0.003);
    this.onsets.set(buffer, offset);
    return offset;
  }
  private trigger(context: BaseAudioContext, bus: GainNode, buffer: AudioBuffer,
    time: number, pitch: number, volume: number, live: boolean): void {
    if (volume <= 0) return;
    const source = context.createBufferSource();
    const envelope = context.createGain();
    const rate = Math.pow(2, clamp(pitch, -24, 24) / 12);
    // A 280 ms source slice speeds up/slows down with pitch, capped at 560 ms.
    const offset = this.onset(buffer);
    const duration = Math.min(0.56, 0.28 / rate, (buffer.duration - offset) / rate);
    const fade = Math.min(0.008, duration / 3);
    source.buffer = buffer;
    source.playbackRate.value = rate;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(clamp(volume, 0, 1), time + fade);
    envelope.gain.setValueAtTime(clamp(volume, 0, 1), time + duration - fade);
    envelope.gain.linearRampToValueAtTime(0, time + duration);
    source.connect(envelope);
    envelope.connect(bus);
    const voice = { source, envelope };
    if (live) {
      this.voices.add(voice);
      source.onended = () => {
        source.disconnect(); envelope.disconnect(); this.voices.delete(voice);
      };
    }
    source.start(time, offset);
    source.stop(time + duration);
  }

  /** Resolves after loading and starting; playback continues until stop(). */
  async play(input: SymphonyScore, onStep: (step: number) => void): Promise<void> {
    this.stop();
    const token = this.generation;
    const score = snapshot(input);
    const context = this.live();
    // Resume immediately in the initiating click gesture, before fetching.
    const resumed = context.resume();
    const tracks = score.tracks.filter(track => !track.muted && track.volume > 0 && track.steps.some(Boolean));
    const [buffers] = await Promise.all([Promise.all(tracks.map(track => this.load(track.sample))), resumed]);
    if (this.dead || token !== this.generation) return;
    const bus = output(context, score.tracks.length);
    this.liveOutput = bus;
    this.playback = { score, buffers: new Map(tracks.map((track, i) => [track.sample, buffers[i]])) };
    let nextTime = context.currentTime + 0.06;
    let nextStep = 0;
    const pending: { time: number; step: number }[] = [];
    const tick = () => {
      if (token !== this.generation || this.dead) return;
      const current = this.playback;
      if (!current) return;
      const stepDuration = 60 / current.score.tempo / 4;
      const now = context.currentTime;
      // Background throttling skips missed notes rather than emitting a burst.
      if (nextTime < now - stepDuration) {
        const missed = Math.ceil((now - nextTime) / stepDuration);
        nextStep = (nextStep + missed) % 16;
        nextTime += missed * stepDuration;
      }
      while (nextTime < now + 0.12) {
        current.score.tracks.forEach((track) => {
          const buffer = current.buffers.get(track.sample);
          if (buffer && !track.muted && track.steps[nextStep]) this.trigger(context, bus, buffer, nextTime, track.pitch, track.volume, true);
        });
        pending.push({ time: nextTime, step: nextStep });
        nextStep = (nextStep + 1) % 16;
        nextTime += stepDuration;
      }
      let visible: number | undefined;
      while (pending.length && pending[0].time <= now) visible = pending.shift()!.step;
      if (visible !== undefined) onStep(visible);
    };
    tick();
    this.timer = setInterval(tick, 25);
  }

  /** Apply edits to future notes while preserving the current musical position. */
  async update(input: SymphonyScore): Promise<void> {
    if (!this.playback) return;
    const token = this.generation;
    const edit = ++this.editGeneration;
    const score = snapshot(input);
    const tracks = score.tracks.filter(track => !track.muted && track.volume > 0 && track.steps.some(Boolean));
    try {
      const buffers = await Promise.all(tracks.map(track => this.load(track.sample)));
      if (this.dead || token !== this.generation || edit !== this.editGeneration || !this.playback) return;
      this.playback = { score, buffers: new Map(tracks.map((track, i) => [track.sample, buffers[i]])) };
    } catch (error) {
      if (!this.dead && token === this.generation && edit === this.editGeneration) throw error;
    }
  }

  /** Cancels scheduled notes, previews, timers, and any pending asynchronous start. */
  stop(): void {
    this.generation++;
    this.editGeneration++;
    this.playback = undefined;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    for (const voice of this.voices) {
      voice.source.onended = null;
      try { voice.source.stop(); } catch { /* already ended */ }
      voice.source.disconnect(); voice.envelope.disconnect();
    }
    this.voices.clear();
    this.liveOutput?.disconnect();
    this.liveOutput = undefined;
  }

  async preview(sampleUrl: string, pitch = 0, volume = 0.8): Promise<void> {
    const token = this.generation;
    const context = this.live();
    const resumed = context.resume();
    const [buffer] = await Promise.all([this.load(sampleUrl), resumed]);
    if (this.dead || token !== this.generation) return;
    this.previewOutput ??= output(context, 1);
    this.trigger(context, this.previewOutput, buffer, context.currentTime + 0.01, pitch, volume, true);
  }

  /** Four loops plus a 750 ms tail; never resumes or plays the live context. */
  async renderWav(input: SymphonyScore): Promise<Blob> {
    this.assertAlive();
    const score = snapshot(input);
    const tracks = score.tracks.filter(track => !track.muted && track.volume > 0 && track.steps.some(Boolean));
    const buffers = await Promise.all(tracks.map(track => this.load(track.sample)));
    this.assertAlive();
    const stepDuration = 60 / score.tempo / 4;
    const duration = 64 * stepDuration + 0.75;
    const context = offline(Math.ceil(duration * 44100));
    const bus = output(context, score.tracks.length);
    for (let step = 0; step < 64; step++) {
      tracks.forEach((track, i) => {
        if (track.steps[step % 16]) this.trigger(context, bus, buffers[i], step * stepDuration, track.pitch, track.volume, false);
      });
    }
    const rendered = await context.startRendering();
    this.assertAlive();
    return encodeWav(rendered);
  }

  dispose(): void {
    if (this.dead) return;
    this.stop();
    this.dead = true;
    for (const request of this.requests) request.abort();
    this.requests.clear(); this.cache.clear();
    this.previewOutput?.disconnect();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = undefined; this.decoder = undefined;
  }
}

function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const size = buffer.length * channels * 2;
  const bytes = new ArrayBuffer(44 + size);
  const view = new DataView(bytes);
  const label = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  label(0, 'RIFF'); view.setUint32(4, 36 + size, true); label(8, 'WAVE');
  label(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  label(36, 'data'); view.setUint32(40, size, true);
  const data = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
  let peak = 1;
  for (const channel of data) for (let i = 0; i < channel.length; i++) peak = Math.max(peak, Math.abs(channel[i]));
  const scale = 0.98 / peak;
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) for (let channel = 0; channel < channels; channel++) {
    const sample = Math.max(-1, Math.min(1, data[channel][i] * scale));
    view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    offset += 2;
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
