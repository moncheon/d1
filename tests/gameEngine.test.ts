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
    expect(state.inventory.leaf).toBeGreaterThanOrEqual(2);
    expect(state.inventory.leaf).toBeLessThanOrEqual(4);
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

  it("automatically ends the day after the fifth activity", () => {
    const engine = new GameEngine();
    for (let index = 1; index <= 5; index += 1) {
      engine.dispatch(commands.cleanDirt("pipe-entrance", `entrance-0${index}`));
    }

    const state = engine.getState();
    expect(state.day).toBe(2);
    expect(state.currentActivity).toBe(5);
    expect(state.dailyLeafPileRemaining).toBe(2);
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
  });

  it("builds with shared materials and applies higher activity on the next day", () => {
    const initialState = createInitialGameState();
    initialState.inventory = { leaf: 20, grass: 20, soil: 20 };
    const engine = new GameEngine({ initialState });

    engine.dispatch(commands.buildHouse("bed-1", "leaf_bed"));
    engine.dispatch(commands.buildHouse("wall-1", "shrub_wall"));

    expect(engine.getState().happiness).toBe(6);
    expect(engine.getState().maxActivity).toBe(5);
    expect(engine.getState().inventory.leaf).toBe(16);

    engine.dispatch(commands.endDay());
    expect(engine.getState().maxActivity).toBe(6);
    expect(engine.getState().currentActivity).toBe(6);
  });

  it("refunds all building materials without spending activity", () => {
    const initialState = createInitialGameState();
    initialState.inventory = { leaf: 4, grass: 2 };
    const engine = new GameEngine({ initialState });
    engine.dispatch(commands.buildHouse("bed-1", "leaf_bed"));
    const activityAfterBuild = engine.getState().currentActivity;

    engine.dispatch(commands.removeHouse("bed-1"));

    expect(engine.getState().inventory).toMatchObject({ leaf: 4, grass: 2 });
    expect(engine.getState().currentActivity).toBe(activityAfterBuild);
    expect(engine.getState().houseSlots["bed-1"]).toBeNull();
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

  it("emits the ending once all four completion conditions are met", () => {
    const initialState = createInitialGameState();
    initialState.cleanerLevel = 3;
    initialState.happiness = 48;
    initialState.discoveredRecipes = [
      "compressed_leaf_mix",
      "root_grass_mix",
      "stable_clay_mix",
      "mixed_organic_mix",
      "resin_release_mix",
    ];
    const finalTargets = initialState.zoneCleaningState["blocked-connector"]?.targets;
    if (!finalTargets) throw new Error("fixture zone missing");
    Object.values(finalTargets).slice(0, 9).forEach((target) => {
      target.surfaceCleaned = true;
      target.deepestLayer = 1;
    });
    const engine = new GameEngine({ initialState });

    const events = engine.dispatch(commands.endDay());

    expect(events.some((event) => event.type === "GAME_COMPLETED")).toBe(true);
    expect(engine.getState().gameCompleted).toBe(true);
  });
});
