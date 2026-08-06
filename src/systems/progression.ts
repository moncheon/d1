import buildingsJson from "../data/buildings.json";
import dirtJson from "../data/dirt.json";
import mapsJson from "../data/maps.json";
import type { GameState } from "../core/gameState";
import type { BuildingDefinition, DirtDefinition, ZoneDefinition } from "../entities/types";

const buildings = buildingsJson as unknown as BuildingDefinition[];
const dirtDefinitions = dirtJson as unknown as DirtDefinition[];
const zones = (mapsJson as unknown as { zones: ZoneDefinition[] }).zones;

export function activityForHappiness(happiness: number): number {
  if (happiness >= 48) return 10;
  if (happiness >= 33) return 9;
  if (happiness >= 21) return 8;
  if (happiness >= 12) return 7;
  if (happiness >= 5) return 6;
  return 5;
}

export function calculateHappiness(state: GameState): number {
  const installed = Object.values(state.houseSlots)
    .filter((id): id is string => id !== null)
    .map((id) => buildings.find((building) => building.id === id))
    .filter((building): building is BuildingDefinition => building !== undefined);

  let happiness = installed.reduce((sum, building) => sum + building.happiness, 0);
  const categoryCount = (category: BuildingDefinition["category"]): number =>
    installed.filter((building) => building.category === category).length;

  if (categoryCount("bed") >= 1 && categoryCount("roof") >= 1) happiness += 2;
  if (categoryCount("wall") >= 4) happiness += 3;
  if (categoryCount("path") >= 5) happiness += 2;

  const themeCounts = new Map<string, number>();
  for (const building of installed) {
    themeCounts.set(building.theme, (themeCounts.get(building.theme) ?? 0) + 1);
  }
  if ([...themeCounts.values()].some((count) => count >= 3)) happiness += 3;
  if (categoryCount("decor") >= 4) happiness += 2;

  return happiness;
}

export function surfaceCleaningRate(state: GameState, zoneId: string): number {
  const zone = zones.find((candidate) => candidate.id === zoneId);
  if (!zone || zone.targets.length === 0) return 0;
  const cleaned = zone.targets.filter(
    (target) => state.zoneCleaningState[zoneId]?.targets[target.id]?.surfaceCleaned,
  ).length;
  return cleaned / zone.targets.length;
}

export function precisionCleaningRate(state: GameState, zoneId: string): number {
  const zone = zones.find((candidate) => candidate.id === zoneId);
  if (!zone || zone.targets.length === 0) return 0;
  const totalDeepLayers = zone.targets.length * 3;
  const cleanedDeepLayers = zone.targets.reduce((sum, target) => {
    const deepest = state.zoneCleaningState[zoneId]?.targets[target.id]?.deepestLayer ?? 0;
    return sum + Math.max(0, deepest - 1);
  }, 0);
  return cleanedDeepLayers / totalDeepLayers;
}

export interface ZoneUnlock {
  zoneId: string;
  sourceZoneId: string;
  surfaceRate: number;
  name: string;
}

export function reconcileUnlockedZones(state: GameState): ZoneUnlock[] {
  const unlocked: ZoneUnlock[] = [];

  for (const zone of zones) {
    if (!state.unlockedZones.includes(zone.id) || !zone.nextZoneIds?.length) continue;

    const surfaceRate = surfaceCleaningRate(state, zone.id);
    if (surfaceRate < zone.unlockSurfaceRate) continue;
    for (const nextZoneId of zone.nextZoneIds) {
      if (state.unlockedZones.includes(nextZoneId)) continue;
      const nextZone = zones.find((candidate) => candidate.id === nextZoneId);
      state.unlockedZones.push(nextZoneId);
      unlocked.push({
        zoneId: nextZoneId,
        sourceZoneId: zone.id,
        surfaceRate,
        name: nextZone?.name ?? "다음 구역",
      });
    }
  }

  return unlocked;
}

export interface CompletionProgress {
  allZonesSurfaceReady: boolean;
  coreTargetsReady: boolean;
}

export function isCoreTargetComplete(state: GameState, zone: ZoneDefinition): boolean {
  const target = zone.targets.find((candidate) => candidate.id === zone.completionTargetId);
  const dirt = dirtDefinitions.find((candidate) => candidate.id === target?.dirtTypeId);
  const deepest = state.zoneCleaningState[zone.id]?.targets[zone.completionTargetId]?.deepestLayer ?? 0;
  const maximum = dirt ? Math.max(1, ...dirt.layers.map((layer) => layer.level)) : Number.POSITIVE_INFINITY;
  return deepest >= maximum;
}

export function completionProgress(state: GameState): CompletionProgress {
  const allZonesSurfaceReady = zones.every((zone) => surfaceCleaningRate(state, zone.id) >= 1);
  const coreTargetsReady = zones.every((zone) => isCoreTargetComplete(state, zone));
  return {
    allZonesSurfaceReady,
    coreTargetsReady,
  };
}

export function isGameComplete(state: GameState): boolean {
  return Object.values(completionProgress(state)).every(Boolean);
}
