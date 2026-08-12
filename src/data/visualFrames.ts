export const materialIconIds = [
  "leaf", "grass", "soil", "fiber", "clay", "plant_enzyme", "seed", "flower", "resin", "moss",
] as const;

export const liquidIconIds = [
  "water", "leaf_enzyme", "grass_ferment", "clay_binder",
  "compressed_leaf_solution", "root_grass_solution", "stable_clay_solution",
  "mixed_organic_solution", "resin_release_solution",
] as const;

export const equipmentIconIds = [
  "cleaner_1", "cleaner_2", "cleaner_3", "narrow_nozzle", "root_brush", "pressure_disc",
] as const;

function indexById(ids: readonly string[]): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(ids.map((id, index) => [id, index])));
}

export const materialIconFrames = indexById(materialIconIds);
export const liquidIconFrames = indexById(liquidIconIds);
export const equipmentIconFrames = indexById(equipmentIconIds);

export function dirtVisualFrame(deepestLayer: number | undefined): number {
  return Math.max(0, Math.min(3, Math.floor(deepestLayer ?? 0)));
}

export function cleanerIconFrame(level: number): number {
  return equipmentIconFrames[`cleaner_${Math.max(1, Math.min(3, Math.floor(level)))}`] ?? 0;
}
