export interface AudioSettings {
  master: number;
  sfx: number;
  ambient: number;
  muted: boolean;
}

const STORAGE_KEY = 'ashfall_audio_settings';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private ambientStarted = false;

  settings: AudioSettings = {
    master: 0.7,
    sfx: 0.8,
    ambient: 0.5,
    muted: false,
  };

  constructor() {
    this.loadSettings();
  }

  get enabled(): boolean {
    return !this.settings.muted;
  }

  loadSettings(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AudioSettings>;
        if (typeof parsed.master === 'number') this.settings.master = Math.max(0, Math.min(1, parsed.master));
        if (typeof parsed.sfx === 'number') this.settings.sfx = Math.max(0, Math.min(1, parsed.sfx));
        if (typeof parsed.ambient === 'number') this.settings.ambient = Math.max(0, Math.min(1, parsed.ambient));
        if (typeof parsed.muted === 'boolean') this.settings.muted = parsed.muted;
      }
    } catch {
      /* ignore */
    }
  }

  saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }

  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();

      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.ambientGain = this.ctx.createGain();
      this.uiGain = this.ctx.createGain();

      this.updateGains();

      this.sfxGain.connect(this.masterGain);
      this.ambientGain.connect(this.masterGain);
      this.uiGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.noise = this.makeNoiseBuffer(3);
      this.startAmbient();
    } catch {
      this.ctx = null;
    }
  }

  private updateGains(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.ambientGain || !this.uiGain) return;
    const t = this.ctx.currentTime;
    const m = this.settings.muted ? 0 : this.settings.master;
    this.masterGain.gain.setTargetAtTime(m * 0.7, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
    this.ambientGain.gain.setTargetAtTime(this.settings.ambient * 0.45, t, 0.05);
    this.uiGain.gain.setTargetAtTime(this.settings.sfx * 0.85, t, 0.05);
  }

  setMasterVolume(val: number): void {
    this.settings.master = Math.max(0, Math.min(1, val));
    this.updateGains();
    this.saveSettings();
  }

  setSfxVolume(val: number): void {
    this.settings.sfx = Math.max(0, Math.min(1, val));
    this.updateGains();
    this.saveSettings();
  }

  setAmbientVolume(val: number): void {
    this.settings.ambient = Math.max(0, Math.min(1, val));
    this.updateGains();
    this.saveSettings();
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.updateGains();
    this.saveSettings();
    if (!muted) this.ensure();
  }

  setEnabled(enabled: boolean): void {
    this.setMuted(!enabled);
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
    if (!this.ctx || !this.ambientGain || !this.noise || this.ambientStarted) return;
    this.ambientStarted = true;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 0.4;
    const gain = ctx.createGain();
    gain.gain.value = 0.22;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 110;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);
    src.start();
    lfo.start();

    // distant low industrial hum
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 46;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.035;
    hum.connect(humGain);
    humGain.connect(this.ambientGain);
    hum.start();
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private tone(
    bus: GainNode | null,
    freq: number,
    dur: number,
    gainValue: number,
    type: OscillatorType = 'sine',
    slideTo?: number,
    delay = 0,
  ): void {
    if (!this.ctx || !bus || this.settings.muted) return;
    const ctx = this.ctx;
    const t = this.now() + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue), t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private burst(
    bus: GainNode | null,
    freq: number,
    q: number,
    gainValue: number,
    dur: number,
    type: BiquadFilterType = 'bandpass',
    delay = 0,
  ): void {
    if (!this.ctx || !bus || !this.noise || this.settings.muted) return;
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
    gain.gain.linearRampToValueAtTime(gainValue, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    src.start(t);
    src.stop(t + dur + 0.03);
  }

  footstep(surface: 'asphalt' | 'wood' | 'grass' | 'dirt' | 'concrete' | 'interior' = 'asphalt', vol = 1): void {
    switch (surface) {
      case 'grass':
        this.burst(this.sfxGain, 1100, 1.2, 0.035 * vol, 0.1, 'bandpass');
        this.tone(this.sfxGain, 60 + Math.random() * 15, 0.05, 0.012 * vol, 'sine');
        break;
      case 'wood':
      case 'interior':
        this.tone(this.sfxGain, 130 + Math.random() * 20, 0.07, 0.035 * vol, 'triangle', 75);
        this.burst(this.sfxGain, 400, 1.8, 0.03 * vol, 0.08, 'lowpass');
        break;
      case 'dirt':
        this.burst(this.sfxGain, 320, 0.9, 0.045 * vol, 0.13, 'lowpass');
        this.tone(this.sfxGain, 65 + Math.random() * 15, 0.06, 0.018 * vol, 'sine');
        break;
      case 'asphalt':
      case 'concrete':
      default:
        this.burst(this.sfxGain, 240, 1.1, 0.05 * vol, 0.1, 'lowpass');
        this.burst(this.sfxGain, 1600, 1.8, 0.02 * vol, 0.05, 'highpass');
        this.tone(this.sfxGain, 80 + Math.random() * 25, 0.05, 0.022 * vol, 'sine');
        break;
    }
  }

  swing(vol = 1): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const ctx = this.ctx;
    const t = this.now();
    // Aerodynamic whoosh: rapid resonant bandpass filter sweep on white noise
    const buffer = this.noise;
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3.2;
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(320, t + 0.11);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.12 * vol, t + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.14);
  }

  hit(vol = 1): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const ctx = this.ctx;
    const t = this.now();
    const buffer = this.noise;

    // 1. Transient click/crack (initial bone/wood impact)
    if (buffer) {
      const snap = ctx.createBufferSource();
      snap.buffer = buffer;
      const snapFilter = ctx.createBiquadFilter();
      snapFilter.type = 'highpass';
      snapFilter.frequency.value = 1600;
      const snapGain = ctx.createGain();
      snapGain.gain.setValueAtTime(0.22 * vol, t);
      snapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      snap.connect(snapFilter);
      snapFilter.connect(snapGain);
      snapGain.connect(this.sfxGain);
      snap.start(t);
      snap.stop(t + 0.04);
    }

    // 2. Heavy blunt body (sub-thud)
    const thud = ctx.createOscillator();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(160, t);
    thud.frequency.exponentialRampToValueAtTime(38, t + 0.09);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.24 * vol, t);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    thud.connect(thudGain);
    thudGain.connect(this.sfxGain);
    thud.start(t);
    thud.stop(t + 0.11);

    // 3. Meaty mid-range crunch (bandpass noise flutter)
    if (buffer) {
      const crunch = ctx.createBufferSource();
      crunch.buffer = buffer;
      const crunchFilter = ctx.createBiquadFilter();
      crunchFilter.type = 'bandpass';
      crunchFilter.frequency.value = 460;
      crunchFilter.Q.value = 2.4;
      const crunchGain = ctx.createGain();
      crunchGain.gain.setValueAtTime(0.18 * vol, t + 0.005);
      crunchGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      crunch.connect(crunchFilter);
      crunchFilter.connect(crunchGain);
      crunchGain.connect(this.sfxGain);
      crunch.start(t);
      crunch.stop(t + 0.09);
    }
  }

  shot(vol = 1): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const ctx = this.ctx;
    const t = this.now();
    const buffer = this.noise;

    // 1. Supersonic muzzle crack
    if (buffer) {
      const crack = ctx.createBufferSource();
      crack.buffer = buffer;
      const crackFilter = ctx.createBiquadFilter();
      crackFilter.type = 'highpass';
      crackFilter.frequency.value = 1800;
      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(0.45 * vol, t);
      crackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      crack.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(this.sfxGain);
      crack.start(t);
      crack.stop(t + 0.07);
    }

    // 2. Low blast boom
    const boom = ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(140, t);
    boom.frequency.exponentialRampToValueAtTime(32, t + 0.18);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.35 * vol, t);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    boom.connect(boomGain);
    boomGain.connect(this.sfxGain);
    boom.start(t);
    boom.stop(t + 0.24);

    // 3. Environmental room echo tail
    if (buffer) {
      const tail = ctx.createBufferSource();
      tail.buffer = buffer;
      const tailFilter = ctx.createBiquadFilter();
      tailFilter.type = 'lowpass';
      tailFilter.frequency.value = 650;
      const tailGain = ctx.createGain();
      tailGain.gain.setValueAtTime(0.18 * vol, t + 0.02);
      tailGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      tail.connect(tailFilter);
      tailFilter.connect(tailGain);
      tailGain.connect(this.sfxGain);
      tail.start(t + 0.02);
      tail.stop(t + 0.34);
    }
  }

  growl(vol = 1): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
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
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 1.2);
  }

  door(open = true, vol = 1): void {
    if (open) {
      // Wood/metal creak
      this.burst(this.sfxGain, 700, 2.4, 0.05 * vol, 0.28, 'bandpass');
      this.tone(this.sfxGain, 160, 0.18, 0.025 * vol, 'triangle', 220);
    } else {
      // Solid latch shut
      this.burst(this.sfxGain, 350, 1.2, 0.07 * vol, 0.12, 'lowpass');
      this.tone(this.sfxGain, 90, 0.08, 0.03 * vol, 'triangle', 50);
    }
  }

  pickup(): void {
    this.tone(this.uiGain, 520, 0.08, 0.03, 'sine', 720);
  }

  equip(): void {
    this.burst(this.uiGain, 1600, 2, 0.03, 0.08);
    this.tone(this.uiGain, 300, 0.06, 0.02, 'triangle', 420);
  }

  consume(): void {
    this.burst(this.uiGain, 450, 1, 0.04, 0.18, 'lowpass');
  }

  hurt(vol = 1): void {
    this.tone(this.sfxGain, 180, 0.22, 0.06 * vol, 'sawtooth', 90);
    this.burst(this.sfxGain, 500, 0.8, 0.05 * vol, 0.18);
  }

  death(): void {
    this.tone(this.sfxGain, 140, 0.9, 0.06, 'sawtooth', 40);
  }

  empty(): void {
    if (!this.sfxGain) return;
    this.tone(this.sfxGain, 1200, 0.08, 0.015, 'triangle', 400);
    this.burst(this.sfxGain, 2600, 3.5, 0.02, 0.035, 'bandpass');
  }

  inventory(open = true): void {
    if (open) {
      this.burst(this.uiGain, 1400, 1.4, 0.04, 0.12, 'bandpass');
    } else {
      this.burst(this.uiGain, 950, 1.8, 0.035, 0.09, 'lowpass');
    }
  }

  container(open = true): void {
    if (open) {
      this.burst(this.sfxGain, 550, 2.0, 0.05, 0.22, 'bandpass');
      this.tone(this.sfxGain, 120, 0.14, 0.02, 'triangle', 180);
    } else {
      this.burst(this.sfxGain, 320, 1.2, 0.06, 0.12, 'lowpass');
    }
  }

  craft(): void {
    // Cloth rip + mechanical click
    this.burst(this.uiGain, 1800, 2.2, 0.05, 0.14, 'bandpass');
    this.tone(this.uiGain, 420, 0.08, 0.035, 'sine', 640, 0.06);
    this.tone(this.uiGain, 640, 0.1, 0.035, 'sine', 880, 0.12);
  }
}
