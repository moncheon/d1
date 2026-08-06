import { describe, expect, it } from "vitest";
import accessoriesJson from "../src/data/accessories.json";
import recipesJson from "../src/data/recipes.json";
import { createInitialGameState } from "../src/core/gameState";
import type { AccessoryDefinition, RecipeDefinition } from "../src/entities/types";
import {
  accessoryAvailability,
  cleaningAvailability,
  mixtureAvailability,
  recipeAvailability,
} from "../src/systems/availability";
import { hasAffordableHousePart, shouldAutoSleepAtHome } from "../src/systems/building";

const accessories = accessoriesJson as unknown as AccessoryDefinition[];
const recipes = recipesJson as unknown as RecipeDefinition[];

describe("action availability", () => {
  it("explains that an affordable narrow nozzle is blocked by depleted activity", () => {
    const state = createInitialGameState();
    state.currentActivity = 0;
    state.cleanerLevel = 3;
    state.inventory = { grass: 6, fiber: 2 };
    const nozzle = accessories.find((accessory) => accessory.id === "narrow_nozzle");
    if (!nozzle) throw new Error("narrow nozzle fixture missing");

    expect(accessoryAvailability(state, nozzle)).toEqual({
      enabled: false,
      blocker: "no_activity",
      missing: [],
    });
  });

  it("allows an owned accessory to be equipped without activity", () => {
    const state = createInitialGameState();
    state.currentActivity = 0;
    state.ownedAccessories = ["narrow_nozzle"];
    const nozzle = accessories.find((accessory) => accessory.id === "narrow_nozzle");
    if (!nozzle) throw new Error("narrow nozzle fixture missing");

    expect(accessoryAvailability(state, nozzle).enabled).toBe(true);
  });

  it("reports missing materials and mixture drops before commands are attempted", () => {
    const state = createInitialGameState();
    const leafBatch = recipes.find((recipe) => recipe.id === "leaf_enzyme_batch");
    if (!leafBatch) throw new Error("leaf batch fixture missing");

    expect(recipeAvailability(state, leafBatch)).toMatchObject({
      enabled: false,
      blocker: "materials",
      missing: [{ itemId: "leaf", amount: 3 }],
    });
    expect(mixtureAvailability(state, ["leaf_enzyme", "leaf_enzyme", "water"])).toMatchObject({
      enabled: false,
      blocker: "liquids",
      missing: [{ itemId: "leaf_enzyme", amount: 2 }],
    });
  });

  it("preflights cleaning blockers before the interaction starts", () => {
    const state = createInitialGameState();
    state.currentActivity = 0;
    expect(cleaningAvailability(state, "pipe-entrance", "entrance-01")).toMatchObject({
      enabled: false,
      blocker: "no_activity",
      remedy: "rest",
    });

    state.currentActivity = 5;
    const target = state.zoneCleaningState["pipe-entrance"]?.targets["entrance-01"];
    if (!target) throw new Error("cleaning target fixture missing");
    target.surfaceCleaned = true;
    target.deepestLayer = 1;
    expect(cleaningAvailability(state, "pipe-entrance", "entrance-01")).toMatchObject({
      enabled: false,
      blocker: "cleaner_level",
      requiredCleanerLevel: 2,
      remedy: "workshop",
    });
  });

  it("offers challenges only for the first surface and first rare layer of each dirt type", () => {
    const state = createInitialGameState();
    expect(cleaningAvailability(state, "pipe-entrance", "entrance-01")).toMatchObject({
      enabled: true,
      challenge: "surface_first",
    });

    const firstLeaf = state.zoneCleaningState["pipe-entrance"]?.targets["entrance-01"];
    if (!firstLeaf) throw new Error("leaf fixture missing");
    firstLeaf.surfaceCleaned = true;
    firstLeaf.deepestLayer = 1;
    expect(cleaningAvailability(state, "pipe-entrance", "entrance-03")).toMatchObject({
      enabled: true,
      challenge: undefined,
    });

    state.cleanerLevel = 3;
    firstLeaf.deepestLayer = 3;
    state.equippedAccessories = ["narrow_nozzle"];
    state.preparedSolutions.resin_release_solution = 1;
    expect(cleaningAvailability(state, "pipe-entrance", "entrance-01", "resin_release_solution")).toMatchObject({
      enabled: true,
      layer: 4,
      challenge: "rare_layer_first",
    });
  });
});

describe("home auto-sleep eligibility", () => {
  it("sleeps in the evening only when no empty house slot is affordable", () => {
    const state = createInitialGameState();
    state.dayPhase = "evening";
    state.currentActivity = 0;

    expect(hasAffordableHousePart(state)).toBe(false);
    expect(shouldAutoSleepAtHome(state)).toBe(true);

    state.inventory = { leaf: 4, grass: 2 };
    expect(hasAffordableHousePart(state)).toBe(true);
    expect(shouldAutoSleepAtHome(state)).toBe(false);

    state.homeAnchors["rest-nook"] = "leaf_bed";
    expect(hasAffordableHousePart(state)).toBe(false);
    expect(shouldAutoSleepAtHome(state)).toBe(true);
  });

  it("does not auto-sleep during working hours", () => {
    const state = createInitialGameState();
    state.currentActivity = 0;
    state.dayPhase = "working";

    expect(shouldAutoSleepAtHome(state)).toBe(false);
  });
});
