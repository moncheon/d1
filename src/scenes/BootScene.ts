import * as Phaser from "phaser";
import { setGameSession } from "../core/sessionContext";
import { BrowserGameSession } from "../systems/gameSession";
import { calculateHappiness } from "../systems/progression";
import { memoryDefinitions } from "../systems/memories";
import mapsJson from "../data/maps.json";
import type { HouseAnchorDefinition } from "../entities/types";

const homeAnchors = (mapsJson as unknown as { homeAnchors: HouseAnchorDefinition[] }).homeAnchors;

export class BootScene extends Phaser.Scene {
  public constructor() {
    super("BootScene");
  }

  public preload(): void {
    this.load.image("home-diorama", "assets/visuals/home-diorama.png");
    this.load.image("pipe-organic", "assets/visuals/pipe-organic.png");
    this.load.image("pipe-mineral", "assets/visuals/pipe-mineral.png");
    this.load.spritesheet("quokka-poses", "assets/visuals/quokka-poses.png", {
      frameWidth: 362,
      frameHeight: 362,
    });
    this.load.image("house-objects", "assets/visuals/house-objects.png");
    this.load.image("home-shell-base", "assets/visuals/home-shell-base.png");
    this.load.image("home-dome-back", "assets/visuals/home-dome-back.png");
    this.load.image("home-items-new", "assets/visuals/home-items-new.png");
    this.load.image("intro-story-1", "assets/story/intro-01.webp");
    this.load.image("intro-story-2", "assets/story/intro-02.webp");
    this.load.image("intro-story-3", "assets/story/intro-03.webp");
    this.load.audio("intro-music-1", ["assets/audio/story/story-01.ogg", "assets/audio/story/story-01.mp3"]);
    this.load.audio("intro-music-2", ["assets/audio/story/story-02.ogg", "assets/audio/story/story-02.mp3"]);
    this.load.audio("intro-music-3", ["assets/audio/story/story-03.ogg", "assets/audio/story/story-03.mp3"]);
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
    const newHouseTexture = this.textures.get("home-items-new");
    const newBuildingFrames = [
      "woven_hammock", "clay_root_wall", "fiber_canopy",
      "moss_mat", "moss_garden", "flower_garland",
    ];
    const newXEdges = [0, 418, 836, 1254];
    const newYEdges = [0, 627, 1254];
    newBuildingFrames.forEach((buildingId, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      newHouseTexture.add(
        buildingId,
        0,
        newXEdges[column] ?? 0,
        newYEdges[row] ?? 0,
        (newXEdges[column + 1] ?? 1254) - (newXEdges[column] ?? 0),
        (newYEdges[row + 1] ?? 1254) - (newYEdges[row] ?? 0),
      );
    });
    const session = new BrowserGameSession(window.localStorage);
    setGameSession(session);
    const state = session.initialize(import.meta.env.DEV).snapshot();
    const qa = import.meta.env.DEV ? new URLSearchParams(window.location.search) : undefined;
    if (qa?.get("routes") === "all") {
      state.unlockedZones = ["pipe-entrance", "curved-drain", "blocked-connector"];
    }
    if (qa?.get("home") === "full") {
      for (const anchor of homeAnchors) {
        state.homeAnchors[anchor.id] = anchor.role === "rest" ? "woven_hammock"
          : anchor.role === "shell" ? "clay_root_wall"
            : anchor.role === "canopy" ? "fiber_canopy"
              : anchor.role === "threshold" ? "moss_mat"
                : anchor.role === "garden" ? "moss_garden"
                  : anchor.id === "charm-left" ? "flower_garland" : "resin_chime";
      }
      state.happiness = calculateHappiness(state);
    } else if (qa?.get("home") === "partial") {
      state.homeAnchors["rest-nook"] = "moss_nest";
      state.homeAnchors["shell-left"] = "woven_wall";
      state.homeAnchors["canopy-top"] = "leaf_roof";
      state.homeAnchors["garden-pocket"] = "moss_garden";
      state.homeAnchors["charm-right"] = "flower_garland";
      state.happiness = calculateHappiness(state);
    }
    if (qa?.get("memories") === "all") {
      state.memories = memoryDefinitions.map((memory, index) => ({ id: memory.id, day: index + 1 }));
    }
    const qaKeys = ["scene", "routes", "home", "memories", "zone", "cleaning", "modal", "decorate"];
    const hasQaRoute = Boolean(qa && qaKeys.some((key) => qa.has(key)));
    if (hasQaRoute) session.activateQaState(state);
    const scene = qa?.get("scene");
    if (!hasQaRoute) {
      this.scene.start(session.getHealth() === "valid" && session.shouldShowIntro() ? "StoryScene" : "TitleScene");
    } else if (scene === "story") {
      const requestedEpisode = Number.parseInt(qa?.get("episode") ?? "1", 10);
      this.scene.start("StoryScene", { episode: Phaser.Math.Clamp(requestedEpisode - 1, 0, 2) });
    } else if (scene === "map") {
      this.scene.start("PipeMapScene", { focusZoneId: qa?.get("zone") ?? "curved-drain" });
    } else if (scene === "workplace") {
      this.scene.start("WorkplaceScene", {
        zoneId: qa?.get("zone") ?? "pipe-entrance",
        demoCleaning: qa?.get("cleaning") === "1",
      });
    } else {
      this.scene.start("HomeScene", {
        demoPicker: qa?.get("modal") === "builder",
        decorateMode: qa?.get("decorate") === "1",
      });
    }
  }
}
