import * as Phaser from "phaser";
import { getGameEngine } from "../core/gameContext";
import { getGameSession } from "../core/sessionContext";
import { introStory } from "../data/introStory";
import { addButton, showToast } from "../ui/components";
import { palette } from "../ui/palette";
import { createStoryAudio, type StoryAudioController } from "../ui/storySound";
import { UI_FONT_FAMILY } from "../ui/typography";

interface StorySceneData {
  episode?: number;
}

export class StoryScene extends Phaser.Scene {
  private episodeIndex = 0;
  private image?: Phaser.GameObjects.Image;
  private title?: Phaser.GameObjects.Text;
  private caption?: Phaser.GameObjects.Text;
  private progress?: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private audio?: StoryAudioController;
  private transitioning = false;
  private inputReadyAt = 0;

  public constructor() {
    super("StoryScene");
  }

  public init(data: StorySceneData): void {
    this.episodeIndex = Phaser.Math.Clamp(Number.isInteger(data.episode) ? data.episode! : 0, 0, introStory.length - 1);
    this.transitioning = false;
  }

  public create(): void {
    const state = getGameEngine().getState();
    this.cameras.main.setBackgroundColor(0x111714);
    this.image = this.add.image(512, 288, introStory[this.episodeIndex]!.textureKey).setDisplaySize(1024, 576);
    this.add.rectangle(512, 43, 1024, 86, 0x101714, 0.76);
    this.add.rectangle(512, 506, 1024, 140, 0x121813, 0.9);
    this.add.rectangle(512, 438, 1024, 3, palette.warm, 0.72);

    this.title = this.add.text(42, 42, "", {
      color: "#f7e9c8",
      fontFamily: UI_FONT_FAMILY,
      fontSize: "23px",
      fontStyle: "bold",
      stroke: "#2f241c",
      strokeThickness: 4,
    }).setOrigin(0, 0.5).setResolution(2);
    this.progress = this.add.text(770, 43, "", {
      color: "#d8d7b7",
      fontFamily: UI_FONT_FAMILY,
      fontSize: "14px",
      fontStyle: "bold",
    }).setOrigin(0.5).setResolution(2);
    this.caption = this.add.text(512, 484, "", {
      color: "#f7e9c8",
      fontFamily: UI_FONT_FAMILY,
      fontSize: "18px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 7,
      wordWrap: { width: 850 },
    }).setOrigin(0.5).setResolution(2);
    this.hint = this.add.text(512, 548, "", {
      color: "#b9c7b0",
      fontFamily: UI_FONT_FAMILY,
      fontSize: "12px",
    }).setOrigin(0.5).setResolution(2);

    addButton(this, 914, 43, 178, 38, "이야기 건너뛰기", () => this.finishStory(), {
      fill: 0x4c5b50,
      hoverFill: 0x6d8063,
      border: 0xb99561,
      fontSize: 12,
    }).setDepth(20);

    this.renderEpisode();
    this.audio = createStoryAudio(state.preferences.masterVolume);
    this.audio.setEpisode(this.episodeIndex);
    this.inputReadyAt = this.time.now + 300;
    this.input.on("pointerdown", this.handlePointerDown, this);
    this.input.keyboard?.on("keydown-ENTER", this.handleAdvanceKey, this);
    this.input.keyboard?.on("keydown-SPACE", this.handleAdvanceKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  private renderEpisode(): void {
    const episode = introStory[this.episodeIndex]!;
    this.image?.setTexture(episode.textureKey).setAlpha(1);
    this.title?.setText(episode.title).setAlpha(1);
    this.caption?.setText(episode.caption).setAlpha(1);
    this.progress?.setText(`${this.episodeIndex + 1} / ${introStory.length}`).setAlpha(1);
    this.hint?.setText(this.episodeIndex === introStory.length - 1 ? "화면을 눌러 첫날 시작" : "화면을 눌러 다음 장면");
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.audio?.resume();
    if (pointer.x >= 825 && pointer.y <= 72) return;
    this.advance();
  }

  private handleAdvanceKey(event: KeyboardEvent): void {
    event.preventDefault();
    this.audio?.resume();
    this.advance();
  }

  private advance(): void {
    if (this.transitioning || this.time.now < this.inputReadyAt) return;
    if (this.episodeIndex >= introStory.length - 1) {
      this.finishStory();
      return;
    }
    this.transitioning = true;
    const reducedMotion = getGameEngine().getState().preferences.reducedMotion;
    if (reducedMotion) {
      this.episodeIndex += 1;
      this.renderEpisode();
      this.audio?.setEpisode(this.episodeIndex);
      this.unlockInput();
      return;
    }
    const targets = [this.image, this.title, this.caption, this.progress].filter(Boolean);
    this.tweens.add({
      targets,
      alpha: 0,
      duration: 125,
      onComplete: () => {
        this.episodeIndex += 1;
        this.renderEpisode();
        this.audio?.setEpisode(this.episodeIndex);
        this.tweens.add({ targets, alpha: 1, duration: 125, onComplete: () => this.unlockInput() });
      },
    });
  }

  private unlockInput(): void {
    this.inputReadyAt = this.time.now + 300;
    this.transitioning = false;
  }

  private finishStory(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.audio?.resume();
    try {
      getGameSession().completeIntro();
      this.audio?.stop();
      this.scene.start("HomeScene");
    } catch (error) {
      this.transitioning = false;
      showToast(this, error instanceof Error ? error.message : "시작 기록을 저장하지 못했어요.", "error", 1800);
    }
  }

  private shutdown(): void {
    this.audio?.stop();
    this.audio = undefined;
    this.input.off("pointerdown", this.handlePointerDown, this);
    this.input.keyboard?.off("keydown-ENTER", this.handleAdvanceKey, this);
    this.input.keyboard?.off("keydown-SPACE", this.handleAdvanceKey, this);
  }
}
