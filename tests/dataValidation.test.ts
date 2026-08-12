import { describe, expect, it } from "vitest";
import buildingsJson from "../src/data/buildings.json";
import accessoriesJson from "../src/data/accessories.json";
import dirtJson from "../src/data/dirt.json";
import itemsJson from "../src/data/items.json";
import mapsJson from "../src/data/maps.json";
import recipesJson from "../src/data/recipes.json";
import dialogueJson from "../src/data/quokka-dialogue.json";
import type {
  BuildingDefinition,
  AccessoryDefinition,
  DirtDefinition,
  HouseAnchorDefinition,
  ItemDefinition,
  RecipeDefinition,
  PipeCellDefinition,
  ZoneDefinition,
} from "../src/entities/types";

const items = itemsJson as unknown as ItemDefinition[];
const dirt = dirtJson as unknown as DirtDefinition[];
const buildings = buildingsJson as unknown as BuildingDefinition[];
const accessories = accessoriesJson as unknown as AccessoryDefinition[];
const recipes = recipesJson as unknown as RecipeDefinition[];
const maps = mapsJson as unknown as { pipeNetwork: PipeCellDefinition[]; homeAnchors: HouseAnchorDefinition[]; zones: ZoneDefinition[] };

function duplicateIds(values: Array<{ id: string }>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) duplicates.add(value.id);
    seen.add(value.id);
  }
  return [...duplicates];
}

describe("content data integrity", () => {
  it("has unique IDs in every content table", () => {
    expect(duplicateIds(items)).toEqual([]);
    expect(duplicateIds(dirt)).toEqual([]);
    expect(duplicateIds(buildings)).toEqual([]);
    expect(duplicateIds(accessories)).toEqual([]);
    expect(duplicateIds(recipes)).toEqual([]);
    expect(duplicateIds(maps.homeAnchors)).toEqual([]);
    expect(duplicateIds(maps.zones)).toEqual([]);
    expect(duplicateIds(maps.zones.flatMap((zone) => zone.targets))).toEqual([]);
    expect(duplicateIds(maps.pipeNetwork)).toEqual([]);
  });

  it("only references existing items from rewards and costs", () => {
    const itemIds = new Set(items.map((item) => item.id));
    const referencedIds = [
      ...dirt.flatMap((definition) => definition.rewards.map((reward) => reward.itemId)),
      ...buildings.flatMap((building) => building.cost.map((cost) => cost.itemId)),
      ...recipes.flatMap((recipe) => (recipe.costs ?? []).map((cost) => cost.itemId)),
      ...accessories.flatMap((accessory) => accessory.cost.map((cost) => cost.itemId)),
      ...dirt.flatMap((definition) => definition.layers.flatMap((layer) => layer.rewards.map((reward) => reward.itemId))),
    ];
    expect(referencedIds.filter((id) => !itemIds.has(id))).toEqual([]);
  });

  it("connects every deep-layer requirement to craftable data", () => {
    const solutionIds = new Set(recipes.filter((recipe) => recipe.kind === "mixture").map((recipe) => recipe.outputId));
    const accessoryIds = new Set(accessories.map((accessory) => accessory.id));
    for (const definition of dirt) {
      expect(definition.layers.map((layer) => layer.level)).toEqual([2, 3, 4]);
      for (const layer of definition.layers) {
        if (layer.requiredSolutionId) expect(solutionIds.has(layer.requiredSolutionId)).toBe(true);
        if (layer.requiredAccessoryId) expect(accessoryIds.has(layer.requiredAccessoryId)).toBe(true);
      }
    }
  });

  it("provides five valid order-independent mixture recipes for the ending", () => {
    const mixtures = recipes.filter((recipe) => recipe.kind === "mixture");
    expect(mixtures.length).toBeGreaterThanOrEqual(5);
    expect(mixtures.every((recipe) => recipe.ingredients?.length === 3)).toBe(true);
    const signatures = mixtures.map((recipe) => [...(recipe.ingredients ?? [])].sort().join("|"));
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("maps use existing dirt, zones, and category-compatible buildings", () => {
    const dirtIds = new Set(dirt.map((definition) => definition.id));
    const zoneIds = new Set(maps.zones.map((zone) => zone.id));
    const buildingById = new Map(buildings.map((building) => [building.id, building]));

    for (const zone of maps.zones) {
      expect(zone.targets.every((target) => dirtIds.has(target.dirtTypeId))).toBe(true);
      expect(zone.nextZoneIds?.every((nextZoneId) => zoneIds.has(nextZoneId)) ?? true).toBe(true);
      expect(zone.unlockSurfaceRate).toBeGreaterThan(0);
      expect(zone.unlockSurfaceRate).toBeLessThanOrEqual(1);
      expect(zone.targets.some((target) => target.id === zone.completionTargetId)).toBe(true);
    }
    expect(maps.pipeNetwork.filter((cell) => cell.zoneId).every((cell) => zoneIds.has(cell.zoneId!))).toBe(true);
    expect(maps.homeAnchors).toHaveLength(9);
    for (const anchor of maps.homeAnchors) {
      expect(anchor.buildingOptions).toHaveLength(3);
      expect(anchor.buildingOptions.every((buildingId) => buildingById.get(buildingId)?.category === anchor.category)).toBe(true);
      expect(anchor.x).toBeGreaterThanOrEqual(220);
      expect(anchor.x).toBeLessThanOrEqual(768);
      expect(anchor.y).toBeGreaterThanOrEqual(150);
      expect(anchor.y).toBeLessThanOrEqual(500);
    }
  });

  it("gives every dirt type a distinct friendly cleaning interaction", () => {
    expect(new Set(dirt.map((definition) => definition.interaction))).toEqual(new Set(["sweep", "loosen", "soak"]));
    expect(new Set(dirt.map((definition) => definition.spriteKey))).toEqual(new Set(["dirt-leaf", "dirt-grass", "dirt-mud"]));
  });

  it("keeps every surface reward available without a rare-only dependency", () => {
    const categories = new Map(items.map((item) => [item.id, item.category]));
    for (const definition of dirt) {
      expect(definition.rewards.some((reward) => categories.get(reward.itemId) === "common" && reward.min > 0)).toBe(true);
    }
  });

  it("gives every processed or rare material both a source and a gameplay use", () => {
    const produced = new Set([
      ...dirt.flatMap((definition) => definition.rewards.map((reward) => reward.itemId)),
      ...dirt.flatMap((definition) => definition.layers.flatMap((layer) => layer.rewards.map((reward) => reward.itemId))),
    ]);
    const consumed = new Set([
      ...buildings.flatMap((building) => building.cost.map((cost) => cost.itemId)),
      ...recipes.flatMap((recipe) => (recipe.costs ?? []).map((cost) => cost.itemId)),
      ...accessories.flatMap((accessory) => accessory.cost.map((cost) => cost.itemId)),
    ]);
    for (const item of items.filter((candidate) => candidate.category !== "common")) {
      expect(produced.has(item.id), `${item.id} needs a source`).toBe(true);
      expect(consumed.has(item.id), `${item.id} needs a use`).toBe(true);
    }
  });

  it("keeps friendly guidance copy varied and complete", () => {
    const dialogue = dialogueJson as unknown as Record<string, unknown>;
    for (const key of ["firstClean", "openPath", "gather", "make", "cleanDeep", "mix", "build", "complete"]) {
      expect(Array.isArray(dialogue[key]), `${key} needs dialogue variants`).toBe(true);
      expect((dialogue[key] as string[]).length).toBeGreaterThanOrEqual(2);
    }
    expect(dialogue.memory).toMatchObject({
      day: expect.any(String),
      bed: expect.any(String),
      recipe: expect.any(String),
      cleaned: expect.any(String),
    });
  });
});
