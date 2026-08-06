import { describe, expect, it } from "vitest";
import { commands } from "../src/core/commands";
import { GameEngine } from "../src/core/gameEngine";
import { createInitialGameState } from "../src/core/gameState";
import { MemorySaveRepository } from "../src/systems/saving";

describe("GameEngine core loop", () => {
  it("starts with the five-action first day", () => {
    const engine = new GameEngine();
    const state = engine.getState();

    expect(state.day).toBe(1);
    expect(state.currentActivity).toBe(5);
    expect(state.maxActivity).toBe(5);
    expect(state.unlockedZones).toEqual(["pipe-entrance"]);
  });

  it("cleans one dirt bundle, consumes activity, and grants deterministic materials", () => {
    const engine = new GameEngine();

    const events = engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01"));
    const state = engine.getState();

    expect(events.map((event) => event.type)).toContain("DIRT_CLEANED");
    expect(state.currentActivity).toBe(4);
    expect(state.zoneCleaningState["pipe-entrance"]?.targets["entrance-01"]?.surfaceCleaned).toBe(true);
    expect(state.inventory.leaf).toBeGreaterThanOrEqual(4);
    expect(state.inventory.leaf).toBeLessThanOrEqual(8);
    expect(events.find((event) => event.type === "DIRT_CLEANED")?.data).toMatchObject({
      challenge: "surface_first",
      rewardMultiplier: 2,
    });
  });

  it("does not charge twice for an already cleaned target", () => {
    const engine = new GameEngine();
    engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01"));
    const afterFirstClean = engine.snapshot();

    const events = engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01"));

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("RULE_REJECTED");
    expect(engine.snapshot()).toEqual(afterFirstClean);
  });

  it("returns home after the fifth activity and advances the day only after sleep", () => {
    const engine = new GameEngine();
    let finalEvents = [] as ReturnType<typeof engine.dispatch>;
    for (let index = 1; index <= 5; index += 1) {
      finalEvents = engine.dispatch(commands.cleanDirt("pipe-entrance", `entrance-0${index}`));
    }

    expect(finalEvents.some((event) => event.type === "WORK_ENDED")).toBe(true);
    expect(engine.getState()).toMatchObject({ day: 1, dayPhase: "evening", currentActivity: 0 });

    engine.dispatch(commands.endDay());
    expect(engine.getState()).toMatchObject({ day: 2, dayPhase: "working", currentActivity: 5 });
  });

  it("unlocks the next zone at exactly sixty percent surface cleaning", () => {
    const initialState = createInitialGameState();
    initialState.currentActivity = 10;
    initialState.maxActivity = 10;
    const engine = new GameEngine({ initialState });

    let sixthEvents = engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01"));
    for (let index = 2; index <= 6; index += 1) {
      sixthEvents = engine.dispatch(commands.cleanDirt("pipe-entrance", `entrance-0${index}`));
    }

    expect(sixthEvents.some((event) => event.type === "ZONE_UNLOCKED")).toBe(true);
    expect(engine.getState().unlockedZones).toContain("curved-drain");
    expect(engine.getState().unlockedZones).toContain("blocked-connector");
    expect(engine.getState().gameCompleted).toBe(false);
  });

  it("keeps both branch routes open regardless of which one is cleaned first", () => {
    const initialState = createInitialGameState();
    initialState.currentActivity = 20;
    initialState.maxActivity = 10;
    const engine = new GameEngine({ initialState });

    for (let index = 1; index <= 6; index += 1) {
      engine.dispatch(commands.cleanDirt("pipe-entrance", `entrance-0${index}`));
    }
    engine.dispatch(commands.cleanDirt("blocked-connector", "connector-01"));

    expect(engine.getState().unlockedZones).toContain("curved-drain");
    expect(engine.getState().unlockedZones).toContain("blocked-connector");
  });

  it("repairs and saves stale unlock data when completed areas are loaded", () => {
    const initialState = createInitialGameState();
    const entranceTargets = initialState.zoneCleaningState["pipe-entrance"]?.targets;
    const drainTargets = initialState.zoneCleaningState["curved-drain"]?.targets;
    if (!entranceTargets || !drainTargets) throw new Error("fixture zones missing");
    Object.values(entranceTargets).slice(0, 6).forEach((target) => {
      target.surfaceCleaned = true;
      target.deepestLayer = 1;
    });
    Object.values(drainTargets).slice(0, 8).forEach((target) => {
      target.surfaceCleaned = true;
      target.deepestLayer = 1;
    });
    const saveRepository = new MemorySaveRepository();

    const engine = new GameEngine({ initialState, saveRepository });

    expect(engine.getState().unlockedZones).toEqual([
      "pipe-entrance",
      "curved-drain",
      "blocked-connector",
    ]);
    expect(saveRepository.load()).toEqual(engine.snapshot());
  });

  it("builds with shared materials and applies higher activity on the next day", () => {
    const initialState = createInitialGameState();
    initialState.inventory = { leaf: 20, grass: 20, soil: 20 };
    const engine = new GameEngine({ initialState });

    engine.dispatch(commands.buildHouse("rest-nook", "leaf_bed"));
    engine.dispatch(commands.buildHouse("shell-left", "shrub_wall"));

    expect(engine.getState().happiness).toBe(6);
    expect(engine.getState().maxActivity).toBe(5);
    expect(engine.getState().inventory.leaf).toBe(16);
    expect(engine.getState().currentActivity).toBe(5);
    expect(engine.getState().experiencedBuildCategories).toEqual(expect.arrayContaining(["bed", "wall"]));

    engine.dispatch(commands.endDay());
    expect(engine.getState().maxActivity).toBe(6);
    expect(engine.getState().currentActivity).toBe(6);
  });

  it("replaces a house part atomically after refunding the old choice", () => {
    const initialState = createInitialGameState();
    initialState.inventory = { leaf: 20, grass: 20, moss: 1 };
    const engine = new GameEngine({ initialState });

    engine.dispatch(commands.buildHouse("rest-nook", "leaf_bed"));
    const events = engine.dispatch(commands.replaceHouse("rest-nook", "moss_nest"));

    expect(events.some((event) => event.type === "HOUSE_REMOVED")).toBe(true);
    expect(events.some((event) => event.type === "HOUSE_BUILT")).toBe(true);
    expect(engine.getState()).toMatchObject({
      homeAnchors: { "rest-nook": "moss_nest" },
      inventory: { leaf: 18, grass: 17, moss: 0 },
      happiness: 4,
    });
  });

  it("awards one representative material for careful cleaning", () => {
    const standard = new GameEngine({ initialState: createInitialGameState() });
    const careful = new GameEngine({ initialState: createInitialGameState() });
    standard.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01"));
    const events = careful.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01", undefined, {
      technique: "sweep",
      quality: "careful",
      durationMs: 2400,
      assisted: false,
    }));

    expect(careful.getState().inventory.leaf).toBe((standard.getState().inventory.leaf ?? 0) + 1);
    expect(events.find((event) => event.type === "DIRT_CLEANED")?.data).toMatchObject({
      technique: "sweep",
      quality: "careful",
      bonusGained: { leaf: 1 },
    });
  });

  it("skips the challenge and bonus multiplier after that dirt type was experienced", () => {
    const initialState = createInitialGameState();
    initialState.currentActivity = 10;
    initialState.maxActivity = 10;
    const engine = new GameEngine({ initialState });
    engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01"));

    const events = engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-03"));

    expect(events.find((event) => event.type === "DIRT_CLEANED")?.data).toMatchObject({
      challenge: null,
      rewardMultiplier: 1,
      quality: "standard",
    });
  });

  it("doubles the first rare-layer reward and adds one item for careful completion", () => {
    const standardState = createInitialGameState();
    standardState.cleanerLevel = 3;
    standardState.currentActivity = 10;
    standardState.maxActivity = 10;
    standardState.equippedAccessories = ["narrow_nozzle"];
    standardState.preparedSolutions.resin_release_solution = 1;
    const target = standardState.zoneCleaningState["pipe-entrance"]?.targets["entrance-01"];
    if (!target) throw new Error("rare layer fixture missing");
    target.surfaceCleaned = true;
    target.deepestLayer = 3;
    const assisted = new GameEngine({ initialState: standardState });
    const careful = new GameEngine({ initialState: standardState });

    assisted.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01", "resin_release_solution", {
      technique: "sweep", quality: "standard", durationMs: 5000, assisted: true,
    }));
    const events = careful.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01", "resin_release_solution", {
      technique: "sweep", quality: "careful", durationMs: 2200, assisted: false,
    }));

    expect(careful.getState().inventory.resin).toBe((assisted.getState().inventory.resin ?? 0) + 1);
    expect(events.find((event) => event.type === "DEEP_LAYER_CLEANED")?.data).toMatchObject({
      challenge: "rare_layer_first",
      rewardMultiplier: 2,
      bonusGained: { resin: 1 },
    });
  });

  it("stores shared memories once even when the same kind of event repeats", () => {
    const initialState = createInitialGameState();
    initialState.currentActivity = 5;
    const engine = new GameEngine({ initialState });
    const first = engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01"));
    const second = engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-02"));

    expect(first.some((event) => event.type === "MEMORY_UNLOCKED")).toBe(true);
    expect(second.some((event) => event.type === "MEMORY_UNLOCKED")).toBe(false);
    expect(engine.getState().memories.filter((entry) => entry.id === "first-clean")).toHaveLength(1);
  });

  it("refunds all building materials without spending activity", () => {
    const initialState = createInitialGameState();
    initialState.inventory = { leaf: 4, grass: 2 };
    const engine = new GameEngine({ initialState });
    engine.dispatch(commands.buildHouse("rest-nook", "leaf_bed"));
    const activityAfterBuild = engine.getState().currentActivity;

    engine.dispatch(commands.removeHouse("rest-nook"));

    expect(engine.getState().inventory).toMatchObject({ leaf: 4, grass: 2 });
    expect(engine.getState().currentActivity).toBe(activityAfterBuild);
    expect(engine.getState().homeAnchors["rest-nook"]).toBeNull();
  });

  it("allows hand-building after work ends without consuming activity", () => {
    const initialState = createInitialGameState();
    initialState.dayPhase = "evening";
    initialState.currentActivity = 0;
    initialState.inventory = { leaf: 4, grass: 2 };
    const engine = new GameEngine({ initialState });

    const events = engine.dispatch(commands.buildHouse("rest-nook", "leaf_bed"));

    expect(events.some((event) => event.type === "HOUSE_BUILT")).toBe(true);
    expect(engine.getState()).toMatchObject({ dayPhase: "evening", currentActivity: 0, happiness: 3 });
  });

  it("completes the home when all nine living anchors are filled", () => {
    const initialState = createInitialGameState();
    initialState.inventory = { leaf: 99, grass: 99, soil: 99, seed: 99, moss: 99 };
    const engine = new GameEngine({ initialState });
    const choices: Array<[string, string]> = [
      ["rest-nook", "leaf_bed"],
      ["shell-left", "shrub_wall"],
      ["shell-back", "shrub_wall"],
      ["shell-right", "shrub_wall"],
      ["canopy-top", "leaf_roof"],
      ["threshold", "dirt_path"],
      ["garden-pocket", "sprout_bed"],
      ["charm-left", "moss_decor"],
      ["charm-right", "moss_decor"],
    ];

    let finalEvents = engine.dispatch(commands.buildHouse(choices[0]![0], choices[0]![1]));
    for (const [anchorId, buildingId] of choices.slice(1)) {
      finalEvents = engine.dispatch(commands.buildHouse(anchorId, buildingId));
    }

    expect(finalEvents.some((event) => event.type === "HOME_COMPLETED")).toBe(true);
    expect(engine.getState()).toMatchObject({ happiness: 44, homeCompletionCelebrated: true });
    expect(engine.getState().memories.some((memory) => memory.id === "home-complete")).toBe(true);
  });

  it("autosaves successful commands", () => {
    const saveRepository = new MemorySaveRepository();
    const engine = new GameEngine({ saveRepository });

    engine.dispatch(commands.harvestDailyPile());

    expect(saveRepository.load()).toEqual(engine.snapshot());
  });

  it("blocks a deep layer until the cleaner is strong enough", () => {
    const initialState = createInitialGameState();
    initialState.currentActivity = 10;
    initialState.maxActivity = 10;
    const engine = new GameEngine({ initialState });
    engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01"));
    const beforeAttempt = engine.snapshot();

    const events = engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01"));

    expect(events[0]).toMatchObject({ type: "RULE_REJECTED", data: { code: "CLEANER_TOO_WEAK" } });
    expect(engine.snapshot()).toEqual(beforeAttempt);
  });

  it("makes fiber reachable by cleaning layer two with cleaner level two", () => {
    const initialState = createInitialGameState();
    initialState.cleanerLevel = 2;
    initialState.currentActivity = 10;
    initialState.maxActivity = 10;
    const engine = new GameEngine({ initialState });
    engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01"));

    const events = engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01"));

    expect(events.some((event) => event.type === "DEEP_LAYER_CLEANED")).toBe(true);
    expect(engine.getState().zoneCleaningState["pipe-entrance"]?.targets["entrance-01"]?.deepestLayer).toBe(2);
    expect(engine.getState().inventory.fiber).toBeGreaterThanOrEqual(1);
  });

  it("discovers an order-independent mixture and consumes only paid liquids", () => {
    const initialState = createInitialGameState();
    initialState.preparedLiquids.leaf_enzyme = 2;
    const engine = new GameEngine({ initialState });

    const events = engine.dispatch(commands.mixLiquids(["leaf_enzyme", "water", "leaf_enzyme"]));

    expect(events.some((event) => event.type === "RECIPE_DISCOVERED")).toBe(true);
    expect(engine.getState().discoveredRecipes).toContain("compressed_leaf_mix");
    expect(engine.getState().preparedSolutions.compressed_leaf_solution).toBe(1);
    expect(engine.getState().preparedLiquids.leaf_enzyme).toBe(0);
    expect(engine.getState().preparedLiquids.water).toBe(0);
  });

  it("records a failed mixture with actionable feedback", () => {
    const engine = new GameEngine();

    const events = engine.dispatch(commands.mixLiquids(["water", "water", "water"]));

    expect(events.find((event) => event.type === "MIXTURE_ATTEMPTED")?.message).toContain("반응 없음");
    expect(engine.getState().mixtureAttempts).toHaveLength(1);
    expect(engine.getState().mixtureAttempts[0]?.success).toBe(false);
  });

  it("requires and consumes the correct solution for layer three", () => {
    const initialState = createInitialGameState();
    initialState.cleanerLevel = 3;
    initialState.currentActivity = 10;
    initialState.maxActivity = 10;
    const target = initialState.zoneCleaningState["pipe-entrance"]?.targets["entrance-01"];
    if (!target) throw new Error("fixture target missing");
    target.surfaceCleaned = true;
    target.deepestLayer = 2;
    initialState.preparedSolutions.compressed_leaf_solution = 1;
    const engine = new GameEngine({ initialState });

    const wrong = engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01", "root_grass_solution"));
    expect(wrong[0]).toMatchObject({ type: "RULE_REJECTED", data: { code: "SOLUTION_REQUIRED" } });
    const success = engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01", "compressed_leaf_solution"));

    expect(success.some((event) => event.type === "DEEP_LAYER_CLEANED")).toBe(true);
    expect(engine.getState().preparedSolutions.compressed_leaf_solution).toBe(0);
    expect(engine.getState().zoneCleaningState["pipe-entrance"]?.targets["entrance-01"]?.deepestLayer).toBe(3);
  });

  it("crafts, owns, and equips a permanent accessory", () => {
    const initialState = createInitialGameState();
    initialState.cleanerLevel = 3;
    initialState.inventory = { grass: 6, fiber: 2 };
    const engine = new GameEngine({ initialState });

    const events = engine.dispatch(commands.craftAccessory("narrow_nozzle"));

    expect(events.some((event) => event.type === "ACCESSORY_CRAFTED")).toBe(true);
    expect(engine.getState().ownedAccessories).toContain("narrow_nozzle");
    expect(engine.getState().equippedAccessories).toEqual(["narrow_nozzle"]);
  });

  it("requires the matching accessory and solution for layer four", () => {
    const initialState = createInitialGameState();
    initialState.cleanerLevel = 3;
    initialState.currentActivity = 10;
    initialState.maxActivity = 10;
    const target = initialState.zoneCleaningState["pipe-entrance"]?.targets["entrance-01"];
    if (!target) throw new Error("fixture target missing");
    target.surfaceCleaned = true;
    target.deepestLayer = 3;
    initialState.preparedSolutions.resin_release_solution = 1;
    const engine = new GameEngine({ initialState });

    const blocked = engine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01", "resin_release_solution"));
    expect(blocked[0]).toMatchObject({ type: "RULE_REJECTED", data: { code: "ACCESSORY_REQUIRED" } });

    const equippedState = engine.snapshot();
    equippedState.ownedAccessories = ["narrow_nozzle"];
    equippedState.equippedAccessories = ["narrow_nozzle"];
    const equippedEngine = new GameEngine({ initialState: equippedState });
    const success = equippedEngine.dispatch(commands.cleanDirt("pipe-entrance", "entrance-01", "resin_release_solution"));
    expect(success.some((event) => event.type === "DEEP_LAYER_CLEANED")).toBe(true);
    expect(equippedEngine.getState().zoneCleaningState["pipe-entrance"]?.targets["entrance-01"]?.deepestLayer).toBe(4);
  });

  it("completes step one only at one hundred percent surface cleaning plus all core targets", () => {
    const initialState = createInitialGameState();
    initialState.unlockedZones = ["pipe-entrance", "curved-drain", "blocked-connector"];
    for (const zone of Object.values(initialState.zoneCleaningState)) {
      for (const target of Object.values(zone.targets)) {
        target.surfaceCleaned = true;
        target.deepestLayer = 1;
      }
    }
    initialState.zoneCleaningState["pipe-entrance"]!.targets["entrance-01"]!.deepestLayer = 4;
    initialState.zoneCleaningState["curved-drain"]!.targets["drain-04"]!.deepestLayer = 4;
    initialState.zoneCleaningState["blocked-connector"]!.targets["connector-04"]!.deepestLayer = 4;
    const engine = new GameEngine({ initialState });

    const events = engine.dispatch(commands.endDay());

    expect(events.some((event) => event.type === "STEP_ONE_COMPLETED")).toBe(true);
    expect(events.some((event) => event.type === "GAME_COMPLETED")).toBe(true);
    expect(engine.getState().gameCompleted).toBe(true);
  });
});
