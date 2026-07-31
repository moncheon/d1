import * as Phaser from "phaser";
import "./style.css";
import { BootScene } from "./scenes/BootScene";
import { HomeScene } from "./scenes/home/HomeScene";
import { WorkshopScene } from "./scenes/home/WorkshopScene";
import { WorkplaceScene } from "./scenes/workplace/WorkplaceScene";
import { ResultScene } from "./scenes/ResultScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: 1024,
  height: 576,
  backgroundColor: "#243238",
  pixelArt: true,
  antialias: false,
  scene: [BootScene, HomeScene, WorkshopScene, WorkplaceScene, ResultScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1024,
    height: 576,
  },
  input: {
    activePointers: 2,
  },
};

new Phaser.Game(config);
