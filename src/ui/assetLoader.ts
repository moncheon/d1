import * as Phaser from "phaser";
import {
  assetGroups,
  storyAudioKeys,
  storyTextureKeys,
  type AssetDefinition,
  type AssetGroup,
} from "../data/assetManifest";
import { UI_FONT_FAMILY } from "./typography";

export function queueAssetGroups(scene: Phaser.Scene, groups: readonly AssetGroup[], label: string): void {
  const assets = uniqueAssets(groups.flatMap((group) => assetGroups[group]));
  const queued = assets.filter((asset) => !isLoaded(scene, asset));
  if (queued.length === 0) return;

  for (const asset of queued) {
    if (asset.kind === "image") scene.load.image(asset.key, asset.url);
    else if (asset.kind === "spritesheet") {
      scene.load.spritesheet(asset.key, asset.url, {
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight,
      });
    } else scene.load.audio(asset.key, [...asset.urls]);
  }
  addLoadingOverlay(scene, label);
}

export function registerHomeFrames(scene: Phaser.Scene): void {
  const houseTexture = scene.textures.exists("house-objects") ? scene.textures.get("house-objects") : undefined;
  if (houseTexture && !houseTexture.has("leaf_bed")) {
    const frames = [
      "leaf_bed", "shrub_wall", "leaf_roof", "dirt_path",
      "flower_bed", "moss_decor", "moss_nest", "woven_wall",
      "flower_canopy", "clay_steps", "sprout_bed", "resin_chime",
    ];
    const xEdges = [0, 314, 627, 941, 1254];
    const yEdges = [0, 418, 836, 1254];
    frames.forEach((frame, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      houseTexture.add(frame, 0, xEdges[column]!, yEdges[row]!, xEdges[column + 1]! - xEdges[column]!, yEdges[row + 1]! - yEdges[row]!);
    });
  }

  const newTexture = scene.textures.exists("home-items-new") ? scene.textures.get("home-items-new") : undefined;
  if (newTexture && !newTexture.has("woven_hammock")) {
    const frames = ["woven_hammock", "clay_root_wall", "fiber_canopy", "moss_mat", "moss_garden", "flower_garland"];
    const xEdges = [0, 418, 836, 1254];
    const yEdges = [0, 627, 1254];
    frames.forEach((frame, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      newTexture.add(frame, 0, xEdges[column]!, yEdges[row]!, xEdges[column + 1]! - xEdges[column]!, yEdges[row + 1]! - yEdges[row]!);
    });
  }
}

export function releaseStoryAssets(scene: Phaser.Scene): void {
  for (const key of storyTextureKeys) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  }
  for (const key of storyAudioKeys) {
    if (scene.cache.audio.exists(key)) scene.cache.audio.remove(key);
  }
}

function uniqueAssets(assets: readonly AssetDefinition[]): AssetDefinition[] {
  return [...new Map(assets.map((asset) => [asset.key, asset])).values()];
}

function isLoaded(scene: Phaser.Scene, asset: AssetDefinition): boolean {
  return asset.kind === "audio" ? scene.cache.audio.exists(asset.key) : scene.textures.exists(asset.key);
}

function addLoadingOverlay(scene: Phaser.Scene, label: string): void {
  const overlay = scene.add.container(0, 0).setDepth(5000);
  const veil = scene.add.rectangle(512, 288, 1024, 576, 0x17201d, 1).setInteractive();
  const glow = scene.add.circle(512, 238, 54, 0xd6a95f, 0.16).setStrokeStyle(3, 0xb99561, 0.7);
  const leaf = scene.add.text(512, 238, "❧", {
    color: "#e9d39a",
    fontFamily: UI_FONT_FAMILY,
    fontSize: "48px",
  }).setOrigin(0.5).setResolution(2);
  const title = scene.add.text(512, 318, label, {
    color: "#f7e9c8",
    fontFamily: UI_FONT_FAMILY,
    fontSize: "18px",
    fontStyle: "bold",
  }).setOrigin(0.5).setResolution(2);
  const track = scene.add.rectangle(512, 360, 360, 12, 0x34483d, 1).setStrokeStyle(1, 0x829b5b, 0.8);
  const fill = scene.add.rectangle(332, 360, 0, 8, 0x9eb36f, 1).setOrigin(0, 0.5);
  const percent = scene.add.text(512, 388, "0%", {
    color: "#b9c7b0",
    fontFamily: UI_FONT_FAMILY,
    fontSize: "12px",
  }).setOrigin(0.5).setResolution(2);
  overlay.add([veil, glow, leaf, title, track, fill, percent]);

  let failed = false;
  const onProgress = (value: number): void => {
    fill.width = 360 * value;
    percent.setText(`${Math.round(value * 100)}%`);
  };
  const onError = (): void => {
    failed = true;
  };
  const onComplete = (): void => {
    scene.load.off(Phaser.Loader.Events.PROGRESS, onProgress);
    scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    if (!failed) {
      overlay.destroy(true);
      return;
    }
    title.setText("재료를 가져오지 못했어요");
    percent.setText("연결을 확인하고 다시 불러와 주세요");
    fill.setFillStyle(0xc76e62).setSize(360, 8);
    const retry = scene.add.rectangle(512, 440, 220, 46, 0x8b5639, 1)
      .setStrokeStyle(2, 0xf6edd8, 0.8)
      .setInteractive({ useHandCursor: true });
    const retryLabel = scene.add.text(512, 440, "다시 불러오기", {
      color: "#f6edd8",
      fontFamily: UI_FONT_FAMILY,
      fontSize: "14px",
      fontStyle: "bold",
    }).setOrigin(0.5).setResolution(2);
    retry.on("pointerdown", () => window.location.reload());
    overlay.add([retry, retryLabel]);
  };
  scene.load.on(Phaser.Loader.Events.PROGRESS, onProgress);
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
  scene.load.once(Phaser.Loader.Events.COMPLETE, onComplete);
}
