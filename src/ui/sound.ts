import * as Phaser from "phaser";
import { getAudioContext } from "./audioContext";

export type SoundCue = "tap" | "clean" | "build" | "memory" | "unlock" | "sleep";

export function playSoundCue(cue: SoundCue, masterVolume: number): void {
  if (masterVolume <= 0) return;
  const audio = getAudioContext();
  if (!audio) return;
  const frequencies: Record<SoundCue, [number, number]> = {
    tap: [330, 390],
    clean: [260, 520],
    build: [180, 310],
    memory: [440, 660],
    unlock: [390, 780],
    sleep: [280, 190],
  };
  const [start, end] = frequencies[cue];
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;
  oscillator.type = cue === "build" ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(start, now);
  oscillator.frequency.exponentialRampToValueAtTime(end, now + 0.16);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, masterVolume * 0.08), now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.24);
}

export function bindAmbient(scene: Phaser.Scene, kind: "home" | "pipe", masterVolume: number): void {
  if (masterVolume <= 0) return;
  let started = false;
  scene.input.once("pointerdown", () => {
    if (started) return;
    started = true;
    playSoundCue(kind === "home" ? "memory" : "tap", masterVolume * 0.28);
    const timer = scene.time.addEvent({
      delay: kind === "home" ? 9200 : 6700,
      loop: true,
      callback: () => playSoundCue(kind === "home" ? "memory" : "clean", masterVolume * 0.16),
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => timer.destroy());
  });
}
