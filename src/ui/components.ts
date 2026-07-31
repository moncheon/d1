import * as Phaser from "phaser";
import { palette } from "./palette";

export interface ButtonOptions {
  fill?: number;
  hoverFill?: number;
  border?: number;
  fontSize?: number;
  disabled?: boolean;
  align?: "center" | "left";
}

export function addPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: number = palette.panel,
  alpha = 0.96,
): Phaser.GameObjects.Rectangle {
  return scene.add
    .rectangle(x, y, width, height, fill, alpha)
    .setOrigin(0)
    .setStrokeStyle(2, palette.pipeLight, 0.65);
}

export function addButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  onClick: () => void,
  options: ButtonOptions = {},
): Phaser.GameObjects.Container {
  const fill = options.fill ?? palette.inkSoft;
  const hoverFill = options.hoverFill ?? palette.clean;
  const border = options.border ?? palette.pipeLight;
  const background = scene.add
    .rectangle(0, 0, width, height, options.disabled ? palette.ink : fill, 1)
    .setStrokeStyle(2, border, options.disabled ? 0.35 : 0.9);
  const text = scene.add
    .text(options.align === "left" ? -width / 2 + 12 : 0, 0, label, {
      color: options.disabled ? "#738181" : palette.cream,
      fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
      fontSize: `${options.fontSize ?? 15}px`,
      fontStyle: "bold",
      align: options.align ?? "center",
      wordWrap: { width: width - 20 },
    })
    .setOrigin(options.align === "left" ? 0 : 0.5, 0.5);
  const container = scene.add.container(x, y, [background, text]);
  container.setSize(width, height);

  if (!options.disabled) {
    background.setInteractive({ useHandCursor: true });
    background.on("pointerover", () => background.setFillStyle(hoverFill));
    background.on("pointerout", () => background.setFillStyle(fill));
    background.on("pointerdown", () => {
      background.setScale(0.97);
      scene.time.delayedCall(70, () => background.setScale(1));
      onClick();
    });
  }
  return container;
}

export function addTitle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 22,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, {
    color: palette.cream,
    fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
    fontSize: `${size}px`,
    fontStyle: "bold",
  });
}

export function showToast(
  scene: Phaser.Scene,
  message: string,
  tone: "normal" | "success" | "error" = "normal",
  duration = 950,
): void {
  const color = tone === "error" ? palette.danger : tone === "success" ? palette.grass : palette.ink;
  const background = scene.add
    .rectangle(512, 525, Math.min(760, Math.max(300, message.length * 16)), 48, color, 0.97)
    .setStrokeStyle(2, 0xf6edd8, 0.7)
    .setDepth(1000);
  const label = scene.add
    .text(512, 525, message, {
      color: palette.cream,
      fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
      fontSize: "16px",
      fontStyle: "bold",
      align: "center",
    })
    .setOrigin(0.5)
    .setDepth(1001);
  scene.tweens.add({ targets: [background, label], alpha: 0, delay: duration, duration: 250 });
  scene.time.delayedCall(duration + 300, () => {
    background.destroy();
    label.destroy();
  });
}

export function addQuokka(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const shadow = scene.add.ellipse(0, 22, 54, 18, 0x101719, 0.32);
  const body = scene.add.ellipse(0, 4, 48, 54, 0xa66e49);
  const leftEar = scene.add.circle(-15, -20, 10, 0x855538);
  const rightEar = scene.add.circle(15, -20, 10, 0x855538);
  const face = scene.add.circle(0, -7, 22, 0xb98258);
  const leftEye = scene.add.circle(-7, -11, 2.5, 0x172124);
  const rightEye = scene.add.circle(7, -11, 2.5, 0x172124);
  const nose = scene.add.circle(0, -4, 3, 0x263033);
  const smileLeft = scene.add.line(0, 0, -1, 0, -7, 5, 0x263033).setLineWidth(2);
  const smileRight = scene.add.line(0, 0, 1, 0, 7, 5, 0x263033).setLineWidth(2);
  return scene.add.container(x, y, [
    shadow,
    body,
    leftEar,
    rightEar,
    face,
    leftEye,
    rightEye,
    nose,
    smileLeft,
    smileRight,
  ]);
}
