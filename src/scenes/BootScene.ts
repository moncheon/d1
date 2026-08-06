import * as Phaser from "phaser";
import { ConsoleAnalytics } from "../analytics/analytics";
import { setGameEngine } from "../core/gameContext";
import { GameEngine } from "../core/gameEngine";
import { createInitialGameState } from "../core/gameState";
import { BrowserSaveRepository } from "../systems/saving";
import { calculateHappiness } from "../systems/progression";
import { memoryDefinitions } from "../systems/memories";

export class BootScene extends Phaser.Scene {
  public constructor() {
    super("BootScene");
  }

  public preload(): void {
    this.load.image("home-diorama", "assets/visuals/home-diorama.png");
    this.load.image("pipe-organic", "assets/visuals/pipe-organic.png");
    this.load.image("pipe-mineral", "assets/visuals/pipe-mineral.png");
    this.load.spritesheet("quokka-poses", "assets/visuals/quokka-poses.png", {
      frameWidth: 364,
      frameHeight: 360,
    });
    this.load.image("house-objects", "assets/visuals/house-objects.png");
  }

  public create(): void {
    const houseTexture = this.textures.get("house-objects");
    const buildingFrames = [
      "leaf_bed", "shrub_wall", "leaf_roof", "dirt_path",
      "flower_bed", "moss_decor", "moss_nest", "woven_wall",
      "flower_canopy", "clay_steps", "sprout_bed", "resin_chime",
    ];
    const xEdges = [0, 314, 627, 941, 1254];
    const yEdges = [0, 418, 836, 1254];
    buildingFrames.forEach((buildingId, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      houseTexture.add(
        buildingId,
        0,
        xEdges[column] ?? 0,
        yEdges[row] ?? 0,
        (xEdges[column + 1] ?? 1254) - (xEdges[column] ?? 0),
        (yEdges[row + 1] ?? 1254) - (yEdges[row] ?? 0),
      );
    });
    const saveRepository = new BrowserSaveRepository(window.localStorage);
    const state = saveRepository.load() ?? createInitialGameState();
    const qa = import.meta.env.DEV ? new URLSearchParams(window.location.search) : undefined;
    if (qa?.get("routes") === "all") {
      state.unlockedZones = ["pipe-entrance", "curved-drain", "blocked-connector"];
    }
    if (qa?.get("home") === "full") {
      for (const slotId of Object.keys(state.houseSlots)) {
        state.houseSlots[slotId] = slotId.startsWith("bed") ? "moss_nest"
          : slotId.startsWith("wall") ? "woven_wall"
            : slotId.startsWith("roof") ? "flower_canopy"
              : slotId.startsWith("path") ? "clay_steps"
                : slotId.startsWith("flower") ? "flower_bed"
                  : "resin_chime";
      }
      state.happiness = calculateHappiness(state);
    }
    if (qa?.get("memories") === "all") {
      state.memories = memoryDefinitions.map((memory, index) => ({ id: memory.id, day: index + 1 }));
    }
    setGameEngine(
      new GameEngine({
        initialState: state,
        saveRepository,
        analytics: new ConsoleAnalytics(),
      }),
    );
    const scene = qa?.get("scene");
    if (scene === "map") {
      this.scene.start("PipeMapScene", { focusZoneId: qa?.get("zone") ?? "curved-drain" });
    } else if (scene === "workplace") {
      this.scene.start("WorkplaceScene", {
        zoneId: qa?.get("zone") ?? "pipe-entrance",
        demoCleaning: qa?.get("cleaning") === "1",
      });
    } else {
      this.scene.start("HomeScene", { demoPicker: qa?.get("modal") === "builder" });
    }
  }
}
