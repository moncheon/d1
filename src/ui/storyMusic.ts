import * as Phaser from "phaser";
import { introStory } from "../data/introStory";

export interface StoryMusicController {
  setEpisode(index: number): void;
  resume(): void;
  stop(): void;
}

const CROSSFADE_MS = 450;

export function createStoryMusic(scene: Phaser.Scene, masterVolume: number): StoryMusicController {
  const targetVolume = Phaser.Math.Clamp(masterVolume, 0, 1) * 0.38;
  const sounds = introStory.map((episode) => scene.sound.add(episode.musicKey, {
    loop: true,
    volume: 0,
  }));
  let desired: Phaser.Sound.BaseSound | undefined;
  let current: Phaser.Sound.BaseSound | undefined;
  let stopped = false;

  const fadeTo = (sound: Phaser.Sound.BaseSound, volume: number, onComplete?: () => void): void => {
    scene.tweens.killTweensOf(sound);
    if (getVolume(sound) === volume) {
      onComplete?.();
      return;
    }
    scene.tweens.add({
      targets: sound,
      volume,
      duration: CROSSFADE_MS,
      ease: "Sine.InOut",
      onComplete,
    });
  };

  const beginDesired = (): void => {
    if (stopped || !desired || targetVolume <= 0) return;
    if (!desired.isPlaying) {
      const started = desired.play({ loop: true, volume: 0 });
      if (!started) return;
    }
    current = desired;
    fadeTo(desired, targetVolume);
  };

  return {
    setEpisode(index: number): void {
      if (stopped) return;
      const next = sounds[Phaser.Math.Clamp(index, 0, sounds.length - 1)];
      if (!next) return;
      const previous = current;
      desired = next;
      if (previous && previous !== next) {
        fadeTo(previous, 0, () => {
          if (previous !== desired && previous.isPlaying) previous.stop();
        });
      }
      beginDesired();
    },
    resume(): void {
      if (stopped) return;
      scene.sound.resumeAll();
      beginDesired();
    },
    stop(): void {
      if (stopped) return;
      stopped = true;
      for (const sound of sounds) {
        scene.tweens.killTweensOf(sound);
        if (sound.isPlaying) sound.stop();
        sound.destroy();
      }
      desired = undefined;
      current = undefined;
    },
  };
}

function getVolume(sound: Phaser.Sound.BaseSound): number {
  return "volume" in sound && typeof sound.volume === "number" ? sound.volume : 0;
}
