import mapsJson from "../data/maps.json";
import type { HouseSlotDefinition, LiquidId, ZoneDefinition } from "../entities/types";

export const SAVE_VERSION = 2;

const maps = mapsJson as unknown as {
  homeSlots: HouseSlotDefinition[];
  zones: ZoneDefinition[];
};

export interface DirtTargetState {
  surfaceCleaned: boolean;
  deepestLayer: number;
}

export interface ZoneCleaningState {
  targets: Record<string, DirtTargetState>;
}

export interface MixtureAttempt {
  ingredients: LiquidId[];
  recipeId: string | null;
  success: boolean;
  day: number;
}

export interface GameState {
  saveVersion: number;
  day: number;
  currentActivity: number;
  maxActivity: number;
  happiness: number;
  inventory: Record<string, number>;
  houseSlots: Record<string, string | null>;
  cleanerLevel: number;
  ownedAccessories: string[];
  equippedAccessories: string[];
  preparedLiquids: Record<LiquidId, number>;
  preparedSolutions: Record<string, number>;
  discoveredRecipes: string[];
  mixtureAttempts: MixtureAttempt[];
  unlockedZones: string[];
  zoneCleaningState: Record<string, ZoneCleaningState>;
  dailyLeafPileRemaining: number;
  gameCompleted: boolean;
}

export function createInitialGameState(): GameState {
  return {
    saveVersion: SAVE_VERSION,
    day: 1,
    currentActivity: 5,
    maxActivity: 5,
    happiness: 0,
    inventory: {},
    houseSlots: Object.fromEntries(maps.homeSlots.map((slot) => [slot.id, null])),
    cleanerLevel: 1,
    ownedAccessories: [],
    equippedAccessories: [],
    preparedLiquids: {
      water: 0,
      leaf_enzyme: 0,
      grass_ferment: 0,
      clay_binder: 0,
    },
    preparedSolutions: {},
    discoveredRecipes: [],
    mixtureAttempts: [],
    unlockedZones: [maps.zones[0]?.id ?? "pipe-entrance"],
    zoneCleaningState: Object.fromEntries(
      maps.zones.map((zone) => [
        zone.id,
        {
          targets: Object.fromEntries(
            zone.targets.map((target) => [
              target.id,
              { surfaceCleaned: false, deepestLayer: 0 },
            ]),
          ),
        },
      ]),
    ),
    dailyLeafPileRemaining: 2,
    gameCompleted: false,
  };
}

export function cloneGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export function mergeWithInitialState(candidate: unknown): GameState | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const saved = candidate as Partial<GameState>;
  if (saved.saveVersion !== 1 && saved.saveVersion !== SAVE_VERSION) {
    return null;
  }

  const initial = createInitialGameState();
  const merged: GameState = {
    ...initial,
    ...saved,
    saveVersion: SAVE_VERSION,
    inventory: { ...initial.inventory, ...(saved.inventory ?? {}) },
    houseSlots: { ...initial.houseSlots, ...(saved.houseSlots ?? {}) },
    preparedLiquids: { ...initial.preparedLiquids, ...(saved.preparedLiquids ?? {}) },
    preparedSolutions: { ...initial.preparedSolutions, ...(saved.preparedSolutions ?? {}) },
    ownedAccessories: Array.isArray(saved.ownedAccessories) ? [...saved.ownedAccessories] : [],
    equippedAccessories: Array.isArray(saved.equippedAccessories) ? [...saved.equippedAccessories] : [],
    discoveredRecipes: Array.isArray(saved.discoveredRecipes) ? [...saved.discoveredRecipes] : [],
    mixtureAttempts: Array.isArray(saved.mixtureAttempts) ? [...saved.mixtureAttempts] : [],
    zoneCleaningState: { ...initial.zoneCleaningState },
  };

  for (const [zoneId, initialZone] of Object.entries(initial.zoneCleaningState)) {
    const savedZone = saved.zoneCleaningState?.[zoneId];
    merged.zoneCleaningState[zoneId] = {
      targets: {
        ...initialZone.targets,
        ...(savedZone?.targets ?? {}),
      },
    };
  }

  delete (merged as unknown as Record<string, unknown>).settings;

  if (
    !Number.isInteger(merged.day) ||
    merged.day < 1 ||
    !Number.isInteger(merged.currentActivity) ||
    merged.currentActivity < 0 ||
    !Number.isInteger(merged.maxActivity) ||
    merged.maxActivity < 5 ||
    merged.maxActivity > 10
  ) {
    return null;
  }

  return merged;
}
