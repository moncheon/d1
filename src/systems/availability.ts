import type { GameState } from "../core/gameState";
import dirtJson from "../data/dirt.json";
import mapsJson from "../data/maps.json";
import type {
  AccessoryDefinition,
  CleanTechnique,
  Cost,
  DirtDefinition,
  LiquidId,
  RecipeDefinition,
  ZoneDefinition,
} from "../entities/types";
import { inventoryAmount } from "./inventory";

const dirtDefinitions = dirtJson as unknown as DirtDefinition[];
const zones = (mapsJson as unknown as { zones: ZoneDefinition[] }).zones;

export type ActionBlocker = "no_activity" | "cleaner_level" | "materials" | "liquids" | "already_equipped";

export interface ActionAvailability {
  enabled: boolean;
  blocker?: ActionBlocker;
  missing: Cost[];
}

export type CleaningBlocker =
  | "no_activity"
  | "zone_locked"
  | "target_missing"
  | "fully_clean"
  | "cleaner_level"
  | "accessory"
  | "solution"
  | "no_solution";

export type CleaningChallengeKind = "surface_first" | "rare_layer_first";
export type CleaningRemedy = "rest" | "workshop" | "solution";

export interface CleaningAvailability {
  enabled: boolean;
  blocker?: CleaningBlocker;
  errorCode?: string;
  message: string;
  remedy?: CleaningRemedy;
  requiredCleanerLevel?: number;
  requiredAccessoryId?: string;
  requiredSolutionId?: string;
  layer?: number;
  technique?: CleanTechnique;
  challenge?: CleaningChallengeKind;
}

function hasCleanedDirtLayer(state: GameState, dirtTypeId: string, layer: number): boolean {
  return zones.some((zone) => zone.targets.some((target) => (
    target.dirtTypeId === dirtTypeId
    && (state.zoneCleaningState[zone.id]?.targets[target.id]?.deepestLayer ?? 0) >= layer
  )));
}

export function cleaningAvailability(
  state: GameState,
  zoneId: string,
  targetId: string,
  solutionId?: string,
): CleaningAvailability {
  if (state.currentActivity <= 0) {
    return {
      enabled: false,
      blocker: "no_activity",
      errorCode: "NO_ACTIVITY",
      message: "활동력이 없어요. 덤불집에서 쉬고 내일 다시 와요.",
      remedy: "rest",
    };
  }
  if (!state.unlockedZones.includes(zoneId)) {
    return {
      enabled: false,
      blocker: "zone_locked",
      errorCode: "ZONE_LOCKED",
      message: "아직 열리지 않은 구역이에요.",
    };
  }

  const zone = zones.find((candidate) => candidate.id === zoneId);
  const target = zone?.targets.find((candidate) => candidate.id === targetId);
  const targetState = state.zoneCleaningState[zoneId]?.targets[targetId];
  const dirt = dirtDefinitions.find((candidate) => candidate.id === target?.dirtTypeId);
  if (!zone || !target || !targetState || !dirt) {
    return {
      enabled: false,
      blocker: "target_missing",
      errorCode: "TARGET_NOT_FOUND",
      message: "청소 대상을 찾을 수 없어요.",
    };
  }

  if (!targetState.surfaceCleaned) {
    return {
      enabled: true,
      message: `${dirt.name}의 표면을 청소할 수 있어요.`,
      layer: 1,
      technique: dirt.interaction,
      challenge: hasCleanedDirtLayer(state, dirt.id, 1) ? undefined : "surface_first",
    };
  }

  const layer = dirt.layers.find((candidate) => candidate.level === targetState.deepestLayer + 1);
  if (!layer) {
    return {
      enabled: false,
      blocker: "fully_clean",
      errorCode: "FULLY_CLEAN",
      message: "이곳은 가장 깊은 층까지 깨끗해요.",
    };
  }
  if (state.cleanerLevel < layer.requiredCleanerLevel) {
    return {
      enabled: false,
      blocker: "cleaner_level",
      errorCode: "CLEANER_TOO_WEAK",
      message: `${layer.name}: 청소기 ${layer.requiredCleanerLevel}단계가 필요해요. 작업실 수첩을 확인해요.`,
      remedy: "workshop",
      requiredCleanerLevel: layer.requiredCleanerLevel,
      layer: layer.level,
      technique: dirt.interaction,
    };
  }
  if (layer.requiredAccessoryId && !state.equippedAccessories.includes(layer.requiredAccessoryId)) {
    return {
      enabled: false,
      blocker: "accessory",
      errorCode: "ACCESSORY_REQUIRED",
      message: `${layer.name}: ${layer.hint}`,
      remedy: "workshop",
      requiredAccessoryId: layer.requiredAccessoryId,
      layer: layer.level,
      technique: dirt.interaction,
    };
  }
  if (layer.requiredSolutionId && (state.preparedSolutions[layer.requiredSolutionId] ?? 0) <= 0) {
    return {
      enabled: false,
      blocker: "no_solution",
      errorCode: "NO_SOLUTION",
      message: "필요한 세정액이 없어요. 작업실에서 수첩의 조합대로 만들어요.",
      remedy: "workshop",
      requiredSolutionId: layer.requiredSolutionId,
      layer: layer.level,
      technique: dirt.interaction,
    };
  }
  if (layer.requiredSolutionId && solutionId !== layer.requiredSolutionId) {
    return {
      enabled: false,
      blocker: "solution",
      errorCode: "SOLUTION_REQUIRED",
      message: `${layer.name}: ${layer.hint}`,
      remedy: "solution",
      requiredSolutionId: layer.requiredSolutionId,
      layer: layer.level,
      technique: dirt.interaction,
    };
  }
  return {
    enabled: true,
    message: `${dirt.name}의 ${layer.name}을 청소할 수 있어요.`,
    layer: layer.level,
    technique: dirt.interaction,
    requiredAccessoryId: layer.requiredAccessoryId,
    requiredSolutionId: layer.requiredSolutionId,
    challenge: layer.level === 4 && !hasCleanedDirtLayer(state, dirt.id, 4)
      ? "rare_layer_first"
      : undefined,
  };
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
