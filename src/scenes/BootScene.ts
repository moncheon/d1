import * as Phaser from "phaser";
import { ConsoleAnalytics } from "../analytics/analytics";
import { setGameEngine } from "../core/gameContext";
import { GameEngine } from "../core/gameEngine";
import { createInitialGameState } from "../core/gameState";
import { BrowserSaveRepository } from "../systems/saving";

export class BootScene extends Phaser.Scene {
  public constructor() {
    super("BootScene");
  }

  public create(): void {
    const saveRepository = new BrowserSaveRepository(window.localStorage);
    const state = saveRepository.load() ?? createInitialGameState();
    setGameEngine(
      new GameEngine({
        initialState: state,
        saveRepository,
        analytics: new ConsoleAnalytics(),
      }),
    );
    this.scene.start("HomeScene");
  }
}

