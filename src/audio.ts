import type { DriveState } from './types';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const UP_SHIFT = [9.5, 16, 23, 29];
const GEAR_RATIOS = [3.3, 2.15, 1.55, 1.16, 0.92];

// All sources are local oscillators or filtered noise. The first Drive gesture
// unlocks the context; one master gain makes pause and volume changes click-free.
export class GameAudio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private engine?: OscillatorNode;
  private engineBody?: OscillatorNode;
  private engineGain?: GainNode;
  private muffler?: BiquadFilterNode;
  private tires?: GainNode;
  private shore?: GainNode;
  private surfFilter?: BiquadFilterNode;
  private city?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private sources: (OscillatorNode | AudioBufferSourceNode)[] = [];
  private volume = 0.52;
  private paused = false;
  private time = 0;
  private gear = 0;

  async start() {
    if (!this.ctx) {
      const AudioConstructor = window.AudioContext
        || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioConstructor) return;
      this.build(new AudioConstructor());
    }
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
    this.adjustMaster();
  }

  private build(ctx: AudioContext) {
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    this.master = master;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    compressor.connect(master).connect(ctx.destination);
    this.compressor = compressor;

    const muffler = ctx.createBiquadFilter();
    muffler.type = 'lowpass';
    muffler.frequency.value = 260;
    muffler.Q.value = 0.48;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.07;
    muffler.connect(engineGain).connect(compressor);
    this.muffler = muffler;
    this.engineGain = engineGain;
    const voice = (type: OscillatorType, hz: number, level: number, output: AudioNode) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = hz;
      gain.gain.value = level;
      osc.connect(gain).connect(output);
      osc.start();
      this.sources.push(osc);
      return osc;
    };
    this.engine = voice('sawtooth', 39, 0.72, muffler);
    this.engineBody = voice('triangle', 78, 0.49, muffler);

    // A repeatable broad-spectrum bed, looped at different offsets for each layer.
    const frames = Math.round(ctx.sampleRate * 3);
    const noise = ctx.createBuffer(1, frames, ctx.sampleRate);
    const samples = noise.getChannelData(0);
    let seed = 8372731;
    for (let i = 0; i < frames; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[i] = (seed / 4294967296) * 2 - 1;
    }
    const noiseVoice = (type: BiquadFilterType, hz: number, q: number, offset: number, pan: number) => {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      source.buffer = noise;
      source.loop = true;
      filter.type = type;
      filter.frequency.value = hz;
      filter.Q.value = q;
      gain.gain.value = 0;
      source.connect(filter).connect(gain);
      const stereo = ctx.createStereoPanner();
      stereo.pan.value = pan;
      gain.connect(stereo).connect(compressor);
      source.start(0, offset);
      this.sources.push(source);
      return { filter, gain };
    };
    const shore = noiseVoice('bandpass', 790, 0.55, 0, -0.25);
    this.surfFilter = shore.filter;
    this.shore = shore.gain;
    this.tires = noiseVoice('bandpass', 1350, 1.2, 1.13, 0).gain;
    this.city = noiseVoice('lowpass', 430, 0.5, 2.21, 0.22).gain;
    // A quiet distant service hum adds a pitched layer under the city noise.
    voice('sine', 59, 0.09, this.city);
    voice('triangle', 89, 0.025, this.city);
  }

  setVolume(v: number) {
    this.volume = clamp01(v);
    this.adjustMaster();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.adjustMaster();
  }

  private adjustMaster() {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.paused ? 0 : this.volume, this.ctx.currentTime, 0.045);
  }

  update(state: DriveState, dt: number) {
    const ctx = this.ctx;
    if (!ctx || this.paused || !this.engine || !this.engineBody || !this.muffler
      || !this.engineGain || !this.tires || !this.shore || !this.surfFilter || !this.city) return;
    this.time += Math.min(Math.max(dt, 0), 0.1);
    const speed = Math.abs(state.speed);
    if (speed > (UP_SHIFT[this.gear] ?? Infinity) && this.gear < GEAR_RATIOS.length - 1) this.gear++;
    else if (this.gear > 0 && speed < UP_SHIFT[this.gear - 1] - 2.4) this.gear--;
    const ratio = state.speed < 0 ? 3.1 : GEAR_RATIOS[this.gear];
    const pitch = 36 + speed * ratio * 3.05 + state.throttle * 10 + Math.sin(this.time * 6.4) * 0.52;
    const t = ctx.currentTime;
    this.engine.frequency.setTargetAtTime(pitch, t, 0.10);
    this.engineBody.frequency.setTargetAtTime(pitch * 2.004, t, 0.10);
    this.muffler.frequency.setTargetAtTime(200 + pitch * 1.25 + state.throttle * 240, t, 0.13);
    this.engineGain.gain.setTargetAtTime(0.062 + state.throttle * 0.075 + speed * 0.0009, t, 0.10);
    this.tires.gain.setTargetAtTime((0.014 * clamp01(speed / 18) + 0.145 * state.slip) * clamp01(speed / 3), t, 0.095);

    const nearShore = Math.exp(-Math.max(0, state.position.x + 110) / 66);
    const swell = 0.5 + 0.36 * Math.sin(this.time * 0.67) + 0.14 * Math.sin(this.time * 1.02 + 2.3);
    this.shore.gain.setTargetAtTime(nearShore * (0.09 + swell * 0.26), t, 0.22);
    this.surfFilter.frequency.setTargetAtTime(430 + swell * 850, t, 0.26);
    this.city.gain.setTargetAtTime((0.045 + 0.065 * (1 - nearShore)) * (0.85 + 0.15 * Math.sin(this.time * 0.39)), t, 0.3);
  }

  dispose() {
    for (const source of this.sources) source.stop();
    this.sources.length = 0;
    this.master?.disconnect();
    this.compressor?.disconnect();
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close();
    this.ctx = undefined;
  }
}
