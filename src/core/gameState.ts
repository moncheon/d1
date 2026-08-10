import mapsJson from "../data/maps.json";
import buildingsJson from "../data/buildings.json";
import type { BuildingCategory, BuildingDefinition, CleanTechnique, HouseAnchorDefinition, LiquidId, ZoneDefinition } from "../entities/types";
import { normalizeProtagonistName } from "./protagonistName";

export const SAVE_VERSION = 6;

export type DayPhase = "working" | "evening";

const maps = mapsJson as unknown as {
  homeAnchors: HouseAnchorDefinition[];
  zones: ZoneDefinition[];
};
const buildings = buildingsJson as unknown as BuildingDefinition[];

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

export interface QuokkaMemoryEntry {
  id: string;
  day: number;
}

export interface GamePreferences {
  masterVolume: number;
  reducedMotion: boolean;
  simpleCleaning: boolean;
}

export interface CleaningStat {
  completed: number;
  careful: number;
  assisted: number;
}

export interface GameState {
  saveVersion: number;
  protagonistName: string;
  day: number;
  dayPhase: DayPhase;
  currentActivity: number;
  maxActivity: number;
  happiness: number;
  inventory: Record<string, number>;
  homeAnchors: Record<string, string | null>;
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
  experiencedBuildCategories: BuildingCategory[];
  homeCompletionCelebrated: boolean;
  memories: QuokkaMemoryEntry[];
  cleaningStats: Record<CleanTechnique, CleaningStat>;
  preferences: GamePreferences;
}

export function createInitialGameState(protagonistName = ""): GameState {
  return {
    saveVersion: SAVE_VERSION,
    protagonistName: normalizeProtagonistName(protagonistName),
    day: 1,
    dayPhase: "working",
    currentActivity: 5,
    maxActivity: 5,
    happiness: 0,
    inventory: {},
    homeAnchors: Object.fromEntries(maps.homeAnchors.map((anchor) => [anchor.id, null])),
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
    experiencedBuildCategories: [],
    homeCompletionCelebrated: false,
    memories: [],
    cleaningStats: {
      sweep: { completed: 0, careful: 0, assisted: 0 },
      loosen: { completed: 0, careful: 0, assisted: 0 },
      soak: { completed: 0, careful: 0, assisted: 0 },
    },
    preferences: {
      masterVolume: 0.7,
      reducedMotion: false,
      simpleCleaning: false,
    },
  };
}

export function cloneGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

interface LegacySave extends Partial<GameState> {
  houseSlots?: Record<string, string | null>;
}

function migrateLegacyHome(
  legacySlots: Record<string, string | null>,
  inventory: Record<string, number>,
): Record<string, string | null> {
  const migrated = Object.fromEntries(maps.homeAnchors.map((anchor) => [anchor.id, null])) as Record<string, string | null>;
  const installedByCategory = new Map<BuildingCategory, Array<{ building: BuildingDefinition; order: number }>>();

  Object.values(legacySlots).forEach((buildingId, order) => {
    if (!buildingId) return;
    const building = buildings.find((candidate) => candidate.id === buildingId);
    if (!building) return;
    const candidates = installedByCategory.get(building.category) ?? [];
    candidates.push({ building, order });
    installedByCategory.set(building.category, candidates);
  });

  for (const [category, candidates] of installedByCategory) {
    const anchors = maps.homeAnchors.filter((anchor) => anchor.category === category);
    candidates.sort((left, right) => right.building.happiness - left.building.happiness || left.order - right.order);
    candidates.forEach(({ building }, index) => {
      const anchor = anchors[index];
      if (anchor) {
        migrated[anchor.id] = building.id;
        return;
      }
      for (const cost of building.cost) {
        inventory[cost.itemId] = (inventory[cost.itemId] ?? 0) + cost.amount;
      }
    });
  }

  return migrated;
}

export function mergeWithInitialState(candidate: unknown): GameState | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const saved = candidate as LegacySave;
  if (![1, 2, 3, 4, 5, SAVE_VERSION].includes(saved.saveVersion ?? -1)) {
    return null;
  }

  const initial = createInitialGameState();
  const inventory = { ...initial.inventory, ...(saved.inventory ?? {}) };
  const homeAnchors = (saved.saveVersion ?? 0) >= 5
    ? { ...initial.homeAnchors, ...(saved.homeAnchors ?? {}) }
    : migrateLegacyHome(saved.houseSlots ?? {}, inventory);
  const merged: GameState = {
    ...initial,
    ...saved,
    saveVersion: SAVE_VERSION,
    protagonistName: normalizeProtagonistName(saved.protagonistName),
    dayPhase: saved.dayPhase === "evening" || saved.currentActivity === 0 ? "evening" : "working",
    gameCompleted: (saved.saveVersion ?? 0) >= 3 ? Boolean(saved.gameCompleted) : false,
    inventory,
    homeAnchors,
    preparedLiquids: { ...initial.preparedLiquids, ...(saved.preparedLiquids ?? {}) },
    preparedSolutions: { ...initial.preparedSolutions, ...(saved.preparedSolutions ?? {}) },
    ownedAccessories: Array.isArray(saved.ownedAccessories) ? [...saved.ownedAccessories] : [],
    equippedAccessories: Array.isArray(saved.equippedAccessories) ? [...saved.equippedAccessories] : [],
    discoveredRecipes: Array.isArray(saved.discoveredRecipes) ? [...saved.discoveredRecipes] : [],
    mixtureAttempts: Array.isArray(saved.mixtureAttempts) ? [...saved.mixtureAttempts] : [],
    experiencedBuildCategories: Array.isArray(saved.experiencedBuildCategories)
      ? [...saved.experiencedBuildCategories]
      : [],
    memories: Array.isArray(saved.memories) ? saved.memories.filter(
      (entry): entry is QuokkaMemoryEntry => Boolean(entry && typeof entry.id === "string" && Number.isInteger(entry.day)),
    ) : [],
    cleaningStats: {
      sweep: { ...initial.cleaningStats.sweep, ...(saved.cleaningStats?.sweep ?? {}) },
      loosen: { ...initial.cleaningStats.loosen, ...(saved.cleaningStats?.loosen ?? {}) },
      soak: { ...initial.cleaningStats.soak, ...(saved.cleaningStats?.soak ?? {}) },
    },
    preferences: {
      ...initial.preferences,
      ...(saved.preferences ?? {}),
      masterVolume: Math.max(0, Math.min(1, saved.preferences?.masterVolume ?? initial.preferences.masterVolume)),
    },
    zoneCleaningState: { ...initial.zoneCleaningState },
  };

  if (saved.saveVersion !== SAVE_VERSION) {
    merged.happiness = calculateHomeHappiness(merged.homeAnchors);
  }

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
  delete (merged as unknown as Record<string, unknown>).houseSlots;

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

export function calculateHomeHappiness(homeAnchors: Record<string, string | null>): number {
  const installed = Object.values(homeAnchors)
    .filter((id): id is string => id !== null)
    .map((id) => buildings.find((building) => building.id === id))
    .filter((building): building is BuildingDefinition => building !== undefined);
  const hasRole = (role: HouseAnchorDefinition["role"]): boolean => maps.homeAnchors.some(
    (anchor) => anchor.role === role && Boolean(homeAnchors[anchor.id]),
  );
  const filledRoleCount = (role: HouseAnchorDefinition["role"]): number => maps.homeAnchors.filter(
    (anchor) => anchor.role === role && Boolean(homeAnchors[anchor.id]),
  ).length;

  let happiness = installed.reduce((sum, building) => sum + building.happiness, 0);
  if (hasRole("rest") && hasRole("canopy")) happiness += 2;
  if (filledRoleCount("shell") === 3) happiness += 3;
  if (hasRole("threshold") && hasRole("garden")) happiness += 2;
  if (filledRoleCount("charm") === 2) happiness += 2;

  const themeCounts = new Map<string, number>();
  for (const building of installed) {
    themeCounts.set(building.theme, (themeCounts.get(building.theme) ?? 0) + 1);
  }
  if ([...themeCounts.values()].some((count) => count >= 3)) happiness += 3;
  if (maps.homeAnchors.every((anchor) => Boolean(homeAnchors[anchor.id]))) happiness += 3;
  return happiness;
}
