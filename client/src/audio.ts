export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private ambientStarted = false;
  enabled = true;

  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.55 : 0;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoiseBuffer(3);
      this.startAmbient();
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(enabled ? 0.55 : 0, this.ctx.currentTime, 0.08);
    }
    if (enabled) this.ensure();
  }

  private makeNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.04) * 0.995;
      data[i] = last;
    }
    return buffer;
  }

  private startAmbient(): void {
    if (!this.ctx || !this.master || !this.noise || this.ambientStarted) return;
    this.ambientStarted = true;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.4;
    const gain = ctx.createGain();
    gain.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 130;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    lfo.start();
    // distant industrial hum
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 47;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.022;
    hum.connect(humGain);
    humGain.connect(this.master);
    hum.start();
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private tone(
    freq: number,
    dur: number,
    gainValue: number,
    type: OscillatorType = 'sine',
    slideTo?: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const ctx = this.ctx;
    const t = this.now() + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue), t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private burst(freq: number, q: number, gainValue: number, dur: number, type: BiquadFilterType = 'bandpass', delay = 0): void {
    if (!this.ctx || !this.master || !this.noise || !this.enabled) return;
    const ctx = this.ctx;
    const t = this.now() + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(gainValue, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.03);
  }

  footstep(vol = 1): void {
    this.burst(220, 0.9, 0.045 * vol, 0.11, 'lowpass');
    this.tone(70 + Math.random() * 20, 0.06, 0.02 * vol, 'sine');
  }

  swing(vol = 1): void {
    this.burst(1100, 1.4, 0.055 * vol, 0.16);
    this.tone(150, 0.09, 0.015 * vol, 'triangle', 90);
  }

  hit(vol = 1): void {
    this.tone(110, 0.16, 0.09 * vol, 'sine', 55);
    this.burst(300, 0.7, 0.08 * vol, 0.14, 'lowpass');
  }

  shot(vol = 1): void {
    this.burst(900, 0.4, 0.28 * vol, 0.22, 'lowpass');
    this.burst(2400, 0.8, 0.12 * vol, 0.08, 'highpass');
    this.tone(70, 0.24, 0.16 * vol, 'triangle', 38);
  }

  growl(vol = 1): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const ctx = this.ctx;
    const t = this.now();
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(58 + Math.random() * 12, t);
    osc.frequency.linearRampToValueAtTime(44, t + 0.9);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.035 * vol, t + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.2);
  }

  door(vol = 1): void {
    this.burst(700, 2.2, 0.05 * vol, 0.25, 'bandpass');
    this.tone(180, 0.12, 0.02 * vol, 'triangle', 130);
  }

  pickup(): void {
    this.tone(520, 0.08, 0.03, 'sine', 720);
  }

  equip(): void {
    this.burst(1600, 2, 0.03, 0.08);
    this.tone(300, 0.06, 0.02, 'triangle', 420);
  }

  consume(): void {
    this.burst(450, 1, 0.04, 0.18, 'lowpass');
  }

  hurt(vol = 1): void {
    this.tone(180, 0.22, 0.06 * vol, 'sawtooth', 90);
    this.burst(500, 0.8, 0.05 * vol, 0.18);
  }

  death(): void {
    this.tone(140, 0.9, 0.06, 'sawtooth', 40);
  }

  empty(): void {
    this.tone(900, 0.04, 0.025, 'square', 400);
  }
}
