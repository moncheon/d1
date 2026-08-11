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

  public create(): void {
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
