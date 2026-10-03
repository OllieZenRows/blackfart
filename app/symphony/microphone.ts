/** Device-only energy readings. No recording, uploads, or microphone monitoring. */
export type EnergyFrame = { time: number; energy: number };
export class MusicListener {
  private generation = 0;
  private stream?: MediaStream;
  private nodes: AudioNode[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private getContext: () => AudioContext;

  constructor(getContext: () => AudioContext) { this.getContext = getContext; }

  async start(onRead: (frames: EnergyFrame[], level: number) => void, onEnded: () => void): Promise<boolean> {
    this.stop();
    const token = this.generation;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is unavailable here. Open EFM in a browser with microphone support.');
    const context = this.getContext();
    // Resume in the button gesture; permission may arrive much later.
    const resumed = context.resume();
    void resumed.catch(() => {});
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    } catch (cause) {
      await resumed.catch(() => {});
      if (token !== this.generation) return false;
      const name = cause instanceof Error ? cause.name : '';
      throw new Error(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Microphone blocked. Allow microphone access in your browser’s site settings, then try again.'
        : name === 'NotFoundError' ? 'No microphone found. Connect one and try again.'
        : 'Could not open the microphone. Check whether another app is using it.');
    }
    if (token !== this.generation) { stream.getTracks().forEach(track => track.stop()); return false; }
    this.stream = stream;
    try {
      await resumed;
      if (token !== this.generation) return false;
      const source = context.createMediaStreamSource(stream);
      this.nodes.push(source);
      const filter = context.createBiquadFilter();
      this.nodes.push(filter);
      filter.type = 'bandpass'; filter.frequency.value = 140; filter.Q.value = 0.7;
      const analyser = context.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0;
      this.nodes.push(analyser);
      source.connect(filter); filter.connect(analyser); // Intentionally never connected to speakers.
      const samples = new Float32Array(analyser.fftSize);
      const frames: EnergyFrame[] = [];
      let lastReport = -Infinity;
      this.timer = setInterval(() => {
        if (token !== this.generation || context.state !== 'running') return;
        analyser.getFloatTimeDomainData(samples);
        const time = context.currentTime;
        if (frames.length && time <= frames[frames.length - 1].time) return;
        let sum = 0;
        for (const value of samples) sum += value * value;
        // Fixed gain makes the onset floor useful for ordinary room-level music.
        const energy = Math.min(1, Math.sqrt(sum / samples.length) * 8);
        frames.push({ time, energy });
        while (frames.length > 600 || (frames[0] && frames[0].time < time - 12)) frames.shift();
        if (time - lastReport >= 1) { lastReport = time; onRead([...frames], Math.min(1, energy * 14)); }
      }, 25);
      for (const track of stream.getTracks()) track.onended = () => {
        if (token !== this.generation) return;
        this.stop(); onEnded();
      };
      return true;
    } catch (cause) {
      if (token === this.generation) this.stop();
      throw cause;
    }
  }

  stop(): void {
    this.generation++;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    for (const track of this.stream?.getTracks() ?? []) { track.onended = null; track.stop(); }
    this.stream = undefined;
    this.nodes.forEach(node => node.disconnect()); this.nodes = [];
  }
}
