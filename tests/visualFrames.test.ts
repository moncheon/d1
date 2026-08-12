import { describe, expect, it } from "vitest";
import accessoriesJson from "../src/data/accessories.json";
import dirtJson from "../src/data/dirt.json";
import itemsJson from "../src/data/items.json";
import recipesJson from "../src/data/recipes.json";
import {
  cleanerIconFrame,
  dirtVisualFrame,
  equipmentIconFrames,
  liquidIconFrames,
  materialIconFrames,
} from "../src/data/visualFrames";

describe("visual frame mappings", () => {
  it("covers every item, liquid, solution, cleaner, and accessory exactly once", () => {
    expect(itemsJson.map((item) => item.id).every((id) => materialIconFrames[id] !== undefined)).toBe(true);
    const recipeOutputs = recipesJson
      .filter((recipe) => recipe.kind === "liquid" || recipe.kind === "mixture")
      .map((recipe) => recipe.outputId);
    expect(["water", ...recipeOutputs].every((id) => liquidIconFrames[id] !== undefined)).toBe(true);
    expect(accessoriesJson.every((accessory) => equipmentIconFrames[accessory.id] !== undefined)).toBe(true);
    expect([1, 2, 3].map(cleanerIconFrame)).toEqual([0, 1, 2]);
  });

  it("maps surface and deep dirt states to the four available frames", () => {
    expect([-1, 0, 1, 2, 3, 4, 99].map(dirtVisualFrame)).toEqual([0, 0, 1, 2, 3, 3, 3]);
    expect(dirtJson.every((definition) => definition.layers.map((layer) => layer.level).join(",") === "2,3,4")).toBe(true);
  });
});
