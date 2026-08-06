import * as Phaser from "phaser";
import { trackGuidanceInteraction } from "../analytics/analytics";
import { getGameEngine } from "../core/gameContext";
import type { GuidanceDestination, QuokkaGuidance } from "../systems/guidance";
import { addButton, addQuokka, addTitle, playQuokkaReaction } from "./components";
import { palette } from "./palette";

export interface QuokkaGuideOptions {
  sceneName: string;
  actor?: Phaser.GameObjects.Container;
  onFollow: (destination: GuidanceDestination) => void;
}

export function addQuokkaGuide(
  scene: Phaser.Scene,
  guidance: QuokkaGuidance,
  options: QuokkaGuideOptions,
): Phaser.GameObjects.Container {
  const cloud = scene.add.container(512, 559).setDepth(850);
  const shadow = scene.add.ellipse(0, 4, 710, 30, 0x101719, 0.28);
  const bubble = scene.add.rectangle(0, 0, 700, 28, 0xf4ecd8, 0.98)
    .setStrokeStyle(2, palette.warm, 0.8)
    .setInteractive({ useHandCursor: true });
  const smallCloud = scene.add.circle(-326, -12, 7, 0xf4ecd8, 1).setStrokeStyle(1, palette.warm, 0.7);
  const tinyCloud = scene.add.circle(-340, -20, 4, 0xf4ecd8, 1).setStrokeStyle(1, palette.warm, 0.6);
  const face = scene.add.circle(-318, 0, 11, 0xb98258);
  const leftEye = scene.add.circle(-322, -2, 1.4, 0x172124);
  const rightEye = scene.add.circle(-314, -2, 1.4, 0x172124);
  const thought = scene.add.text(-298, 0, `${guidance.thought}  ·  작은 수첩 펼치기`, {
    color: "#3a3028",
    fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
    fontSize: "12px",
    fontStyle: "bold",
    wordWrap: { width: 610 },
  }).setOrigin(0, 0.5);
  cloud.add([shadow, bubble, smallCloud, tinyCloud, face, leftEye, rightEye, thought]);

  const open = (): void => {
    trackGuidanceInteraction("opened", guidance.id, options.sceneName, getGameEngine().getState());
    openNotebook(scene, guidance, options);
  };
  bubble.on("pointerdown", open);
  thought.setInteractive({ useHandCursor: true }).on("pointerdown", open);
  face.setInteractive({ useHandCursor: true }).on("pointerdown", open);
  scene.tweens.add({ targets: [smallCloud, tinyCloud], alpha: { from: 0.45, to: 1 }, duration: 720, yoyo: true, repeat: -1 });
  playQuokkaReaction(scene, options.actor, guidance.mood);
  return cloud;
}

function openNotebook(
  scene: Phaser.Scene,
  guidance: QuokkaGuidance,
  options: QuokkaGuideOptions,
): void {
  const overlay = scene.add.container(0, 0).setDepth(2200);
  const veil = scene.add.rectangle(512, 288, 1024, 576, 0x101719, 0.78).setInteractive();
  const paper = scene.add.rectangle(512, 285, 790, 450, 0xefe5cc, 1)
    .setStrokeStyle(4, palette.warmDark, 0.95);
  const fold = scene.add.rectangle(626, 285, 2, 410, 0x9b866d, 0.32);
  const portrait = addQuokka(scene, 174, 131).setScale(0.78);
  const title = addTitle(scene, 225, 82, "내 작은 수첩", 25).setColor("#4b392d");
  const close = addButton(scene, 861, 88, 66, 34, "접기", () => overlay.destroy(), {
    fill: palette.warmDark,
    fontSize: 11,
  });

  const memory = scene.add.text(225, 119, guidance.memory ?? "내 코와 발이 지나온 길을 잘 기억하고 있어.", {
    color: "#755d49",
    fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
    fontSize: "12px",
    fontStyle: "italic",
    wordWrap: { width: 360 },
  });
  const nowLabel = scene.add.text(154, 178, "지금 마음이 가는 일", {
    color: "#8b5a39", fontSize: "13px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
  });
  const now = scene.add.text(154, 204, guidance.thought, {
    color: "#342b25", fontSize: "18px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
    wordWrap: { width: 425 }, lineSpacing: 4,
  });
  const detail = scene.add.text(154, 263, guidance.detail, {
    color: "#58483c", fontSize: "12px", fontFamily: '"Malgun Gothic", sans-serif',
    wordWrap: { width: 430 }, lineSpacing: 3,
  });

  const needObjects: Phaser.GameObjects.GameObject[] = [];
  if (guidance.needs.length > 0) {
    needObjects.push(scene.add.text(154, 326, "주머니에 더 필요한 것", {
      color: "#8b5a39", fontSize: "13px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
    }));
    guidance.needs.slice(0, 2).forEach((need, index) => {
      const y = 353 + index * 48;
      needObjects.push(scene.add.text(166, y, `${need.name}  ${need.current}/${need.required}  ·  ${need.missing}개 더`, {
        color: "#3f352e", fontSize: "12px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
      }));
      needObjects.push(scene.add.text(178, y + 20, `냄새가 나는 곳 · ${need.sources[0] ?? "남은 깊은 오염"}`, {
        color: "#756654", fontSize: "10px", fontFamily: '"Malgun Gothic", sans-serif', wordWrap: { width: 410 },
      }));
    });
  } else {
    needObjects.push(scene.add.text(154, 342, "필요한 것은 내가 기억해 뒀어. 지금은 표시한 곳으로 가면 돼.", {
      color: "#756654", fontSize: "11px", fontFamily: '"Malgun Gothic", sans-serif', wordWrap: { width: 420 },
    }));
  }

  const dreamTitle = scene.add.text(657, 104, "우리 집의 꿈", {
    color: "#8b5a39", fontSize: "15px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
  });
  const dreamObjects: Phaser.GameObjects.GameObject[] = [];
  guidance.dreams.forEach((dream, index) => {
    const y = 145 + index * 69;
    const seed = scene.add.circle(677, y, 16, dream.ready ? 0x7ea36b : 0xc9b998, 1)
      .setStrokeStyle(2, dream.ready ? 0x56764d : 0x9d8a6e, 0.9);
    const sprout = scene.add.text(677, y - 1, dream.ready ? "✦" : "·", {
      color: dream.ready ? "#f7f0d4" : "#705e4a", fontSize: "17px", fontStyle: "bold",
    }).setOrigin(0.5);
    const label = scene.add.text(708, y - 14, dream.label, {
      color: "#453a31", fontSize: "11px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
    });
    const progress = scene.add.text(708, y + 6, dream.progress, {
      color: dream.ready ? "#55744d" : "#806f5a", fontSize: "11px", fontFamily: '"Malgun Gothic", sans-serif',
    });
    dreamObjects.push(seed, sprout, label, progress);
  });

  const follows = guidance.suggestions.map((destination, index) => addButton(
    scene,
    guidance.suggestions.length === 1 ? 512 : 360 + index * 304,
    480,
    guidance.suggestions.length === 1 ? 310 : 278,
    48,
    destination.label,
    () => {
      trackGuidanceInteraction("followed", `${guidance.id}:${index}`, options.sceneName, getGameEngine().getState());
      overlay.destroy();
      options.onFollow(destination);
    },
    { fill: index === 0 ? palette.grass : palette.warmDark, hoverFill: palette.clean, fontSize: 13 },
  ));

  overlay.add([
    veil, paper, fold, portrait, title, close, memory, nowLabel, now, detail,
    ...needObjects, dreamTitle, ...dreamObjects, ...follows,
  ]);
  playQuokkaReaction(scene, portrait, guidance.mood);
}
