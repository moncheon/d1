import { describe, expect, it } from "vitest";
import accessoriesJson from "../src/data/accessories.json";
import recipesJson from "../src/data/recipes.json";
import { createInitialGameState } from "../src/core/gameState";
import type { AccessoryDefinition, RecipeDefinition } from "../src/entities/types";
import { accessoryAvailability, mixtureAvailability, recipeAvailability } from "../src/systems/availability";
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

    state.houseSlots["bed-1"] = "leaf_bed";
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
