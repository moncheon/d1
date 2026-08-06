import type { GameState } from "../core/gameState";
import type { AccessoryDefinition, Cost, LiquidId, RecipeDefinition } from "../entities/types";
import { inventoryAmount } from "./inventory";

export type ActionBlocker = "no_activity" | "cleaner_level" | "materials" | "liquids" | "already_equipped";

export interface ActionAvailability {
  enabled: boolean;
  blocker?: ActionBlocker;
  missing: Cost[];
}

export function missingCosts(state: GameState, costs: Cost[]): Cost[] {
  return costs
    .map((cost) => ({ itemId: cost.itemId, amount: Math.max(0, cost.amount - inventoryAmount(state, cost.itemId)) }))
    .filter((cost) => cost.amount > 0);
}

export function recipeAvailability(state: GameState, recipe: RecipeDefinition): ActionAvailability {
  if (state.currentActivity <= 0) return { enabled: false, blocker: "no_activity", missing: [] };
  const missing = missingCosts(state, recipe.costs ?? []);
  return missing.length > 0
    ? { enabled: false, blocker: "materials", missing }
    : { enabled: true, missing: [] };
}

export function accessoryAvailability(state: GameState, accessory: AccessoryDefinition): ActionAvailability {
  if (state.ownedAccessories.includes(accessory.id)) {
    return state.equippedAccessories.includes(accessory.id)
      ? { enabled: false, blocker: "already_equipped", missing: [] }
      : { enabled: true, missing: [] };
  }
  if (state.currentActivity <= 0) return { enabled: false, blocker: "no_activity", missing: [] };
  if (state.cleanerLevel < accessory.requiredCleanerLevel) {
    return { enabled: false, blocker: "cleaner_level", missing: [] };
  }
  const missing = missingCosts(state, accessory.cost);
  return missing.length > 0
    ? { enabled: false, blocker: "materials", missing }
    : { enabled: true, missing: [] };
}

export function mixtureAvailability(state: GameState, ingredients: LiquidId[]): ActionAvailability {
  if (state.currentActivity <= 0) return { enabled: false, blocker: "no_activity", missing: [] };
  const counts = new Map<LiquidId, number>();
  for (const ingredient of ingredients) {
    if (ingredient !== "water") counts.set(ingredient, (counts.get(ingredient) ?? 0) + 1);
  }
  const missing = [...counts.entries()]
    .map(([itemId, required]) => ({ itemId, amount: Math.max(0, required - (state.preparedLiquids[itemId] ?? 0)) }))
    .filter((cost) => cost.amount > 0);
  return missing.length > 0
    ? { enabled: false, blocker: "liquids", missing }
    : { enabled: true, missing: [] };
}
