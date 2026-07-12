import { BlockId } from './types';

type SoundKind = 'break' | 'place' | 'step' | 'click' | 'splash' | 'hiss' | 'explosion';

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.55;
  private lastStepAt = 0;

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master) this.master.gain.value = this.volume;
  }

  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (context.state === 'suspended') await context.resume();
  }

  playBreak(block: BlockId): void {
    const woody = block === BlockId.Wood || block === BlockId.Planks || block === BlockId.Leaves;
    this.playNoise('break', woody ? 520 : 220, woody ? 0.075 : 0.11, woody ? 0.34 : 0.48);
  }

  playPlace(block: BlockId): void {
    const glassy = block === BlockId.Glass;
    this.playTone(glassy ? 760 : 155, 0.055, glassy ? 'triangle' : 'square', 0.12, -34);
  }

  playStep(block: BlockId, sprinting = false): void {
    const now = performance.now();
    const minimumGap = sprinting ? 230 : 330;
    if (now - this.lastStepAt < minimumGap) return;
    this.lastStepAt = now;
    const soft = block === BlockId.Grass || block === BlockId.Dirt || block === BlockId.Sand || block === BlockId.Leaves;
    this.playNoise('step', soft ? 680 : 260, sprinting ? 0.055 : 0.045, soft ? 0.09 : 0.12);
  }

  playClick(): void {
    this.playTone(440, 0.035, 'square', 0.055, 70);
  }

  playSplash(): void {
    this.playNoise('splash', 920, 0.16, 0.18);
  }

  playPlayerHurt(): void {
    this.playTone(118, 0.14, 'sawtooth', 0.16, -54);
    this.playNoise('break', 340, 0.09, 0.12);
  }

  playMobHurt(kind: 'pig' | 'sheep' | 'cow' | 'zombie' | 'creeper', killed = false): void {
    const frequency = kind === 'zombie'
      ? 92
      : kind === 'creeper'
        ? 126
        : kind === 'cow'
          ? 148
          : kind === 'pig'
            ? 210
            : 255;
    const type = kind === 'zombie' || kind === 'creeper' ? 'sawtooth' : 'square';
    this.playTone(frequency, killed ? 0.22 : 0.1, type, 0.11, killed ? -48 : 24);
  }

  playCreeperPrime(): void {
    this.playNoise('hiss', 1650, 1.35, 0.11);
  }

  playExplosion(): void {
    this.playNoise('explosion', 170, 0.58, 0.34);
    this.playTone(54, 0.34, 'sawtooth', 0.13, -24);
  }

  playPickup(): void {
    this.playTone(540, 0.055, 'square', 0.08, 160);
    window.setTimeout(() => this.playTone(720, 0.05, 'square', 0.06, 120), 42);
  }

  playCraft(): void {
    this.playTone(330, 0.06, 'square', 0.07, 80);
    window.setTimeout(() => this.playTone(495, 0.08, 'triangle', 0.08, 110), 55);
  }

  playEat(): void {
    this.playNoise('step', 720, 0.08, 0.11);
  }

  playDeath(): void {
    this.playTone(145, 0.48, 'sawtooth', 0.16, -105);
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
    this.master = null;
  }

  private ensureContext(): AudioContext {
    if (this.context && this.master) return this.context;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.context.destination);
    return this.context;
  }

  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    frequencySlide = 0
  ): void {
    const context = this.ensureContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(24, frequency + frequencySlide),
      context.currentTime + duration
    );
    gain.gain.setValueAtTime(gainValue, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(this.master!);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }

  private playNoise(kind: SoundKind, cutoff: number, duration: number, gainValue: number): void {
    const context = this.ensureContext();
    const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) {
      const envelope = 1 - i / frameCount;
      const grit = kind === 'break' || kind === 'explosion'
        ? Math.sign(Math.sin(i * 0.47)) * 0.22
        : 0;
      data[i] = (Math.random() * 2 - 1 + grit) * envelope;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = kind === 'splash' || kind === 'explosion'
      ? 'lowpass'
      : kind === 'hiss'
        ? 'highpass'
        : 'bandpass';
    filter.frequency.value = cutoff;
    filter.Q.value = kind === 'step' || kind === 'explosion' ? 0.8 : 1.5;
    gain.gain.setValueAtTime(gainValue, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    source.start();
  }
}
