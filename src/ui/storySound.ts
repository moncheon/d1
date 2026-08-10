import { getAudioContext } from "./audioContext";

export const STORY_EFFECT_DURATIONS = [2.4, 1.8, 2.2] as const;

export interface StoryAudioController {
  setEpisode(index: number): void;
  resume(): void;
  stop(): void;
}

const silentController: StoryAudioController = {
  setEpisode: () => undefined,
  resume: () => undefined,
  stop: () => undefined,
};

function ramp(gain: GainNode, audio: AudioContext, peak: number, duration: number, delay = 0): void {
  const start = audio.currentTime + delay;
  gain.gain.cancelScheduledValues(start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + Math.min(0.08, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
}

function tone(
  audio: AudioContext,
  destination: AudioNode,
  frequency: number,
  duration: number,
  volume: number,
  delay = 0,
  type: OscillatorType = "sine",
): void {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.connect(gain).connect(destination);
  ramp(gain, audio, volume, duration, delay);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function createNoiseBuffer(audio: AudioContext): AudioBuffer {
  const buffer = audio.createBuffer(1, audio.sampleRate * 3, audio.sampleRate);
  const channel = buffer.getChannelData(0);
  let previous = 0;
  for (let index = 0; index < channel.length; index += 1) {
    const white = Math.random() * 2 - 1;
    previous = previous * 0.88 + white * 0.12;
    channel[index] = previous;
  }
  return buffer;
}

function noise(
  audio: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  duration: number,
  volume: number,
  cutoff: number,
  delay = 0,
): void {
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  const start = audio.currentTime + delay;
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(cutoff, start);
  source.connect(filter).connect(gain).connect(destination);
  ramp(gain, audio, volume, duration, delay);
  source.start(start);
  source.stop(start + duration + 0.03);
}

export function createStoryAudio(masterVolume: number): StoryAudioController {
  if (masterVolume <= 0) return silentController;
  const audio = getAudioContext();
  if (!audio) return silentController;

  const master = audio.createGain();
  const music = audio.createGain();
  const effects = audio.createGain();
  const musicFilter = audio.createBiquadFilter();
  const noiseBuffer = createNoiseBuffer(audio);
  let episode = 0;
  let stopped = false;
  let motifStep = 0;

  master.gain.setValueAtTime(Math.min(1, masterVolume) * 0.42, audio.currentTime);
  music.gain.setValueAtTime(0.2, audio.currentTime);
  effects.gain.setValueAtTime(0.54, audio.currentTime);
  musicFilter.type = "lowpass";
  musicFilter.frequency.setValueAtTime(950, audio.currentTime);
  music.connect(musicFilter).connect(master);
  effects.connect(master);
  master.connect(audio.destination);

  const scheduleMotif = (): void => {
    if (stopped) return;
    const roots = [146.83, 174.61, 196];
    const intervals = episode === 0 ? [1, 1.1892, 1.4983] : episode === 1 ? [1, 1.2599, 1.4983] : [1, 1.2599, 1.6818];
    const root = roots[episode] ?? roots[0]!;
    const interval = intervals[motifStep % intervals.length] ?? 1;
    tone(audio, music, root * interval, 1.45, 0.055, 0, episode === 1 ? "triangle" : "sine");
    tone(audio, music, root / 2, 1.7, 0.025, 0.04, "sine");
    motifStep += 1;
  };
  scheduleMotif();
  const motifTimer = window.setInterval(scheduleMotif, 1380);

  const playEpisodeEffect = (index: number): void => {
    const duration = STORY_EFFECT_DURATIONS[index] ?? STORY_EFFECT_DURATIONS[0];
    if (index === 0) {
      noise(audio, effects, noiseBuffer, duration, 0.09, 1100);
      tone(audio, effects, 82, 1.8, 0.045, 0.18, "sine");
      tone(audio, effects, 240, 0.16, 0.11, 1.52, "square");
      return;
    }
    if (index === 1) {
      tone(audio, effects, 210, 0.18, 0.1, 0, "triangle");
      noise(audio, effects, noiseBuffer, 1.25, 0.13, 1800, 0.18);
      tone(audio, effects, 392, 0.48, 0.07, 0.66, "triangle");
      tone(audio, effects, 523.25, 0.55, 0.065, 1.08, "triangle");
      return;
    }
    noise(audio, effects, noiseBuffer, duration, 0.055, 1450);
    tone(audio, effects, 392, 0.75, 0.065, 0.3, "sine");
    tone(audio, effects, 587.33, 0.95, 0.06, 0.72, "sine");
  };

  return {
    setEpisode(index: number): void {
      if (stopped) return;
      episode = Math.max(0, Math.min(2, index));
      motifStep = 0;
      const now = audio.currentTime;
      musicFilter.frequency.cancelScheduledValues(now);
      musicFilter.frequency.linearRampToValueAtTime([850, 1350, 1900][episode] ?? 950, now + 0.45);
      playEpisodeEffect(episode);
    },
    resume(): void {
      if (audio.state === "suspended") void audio.resume();
    },
    stop(): void {
      if (stopped) return;
      stopped = true;
      window.clearInterval(motifTimer);
      const now = audio.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      window.setTimeout(() => master.disconnect(), 450);
    },
  };
}
