export type GameCommand =
  | { type: "CLEAN_DIRT"; zoneId: string; targetId: string; solutionId?: string }
  | { type: "HARVEST_DAILY_PILE" }
  | { type: "BUILD_HOUSE"; slotId: string; buildingId: string }
  | { type: "REMOVE_HOUSE"; slotId: string }
  | { type: "CRAFT_RECIPE"; recipeId: string }
  | { type: "MIX_LIQUIDS"; ingredients: [string, string, string] }
  | { type: "CRAFT_ACCESSORY"; accessoryId: string }
  | { type: "EQUIP_ACCESSORY"; accessoryId: string }
  | { type: "END_DAY" };

export const commands = {
  cleanDirt: (zoneId: string, targetId: string, solutionId?: string): GameCommand => ({
    type: "CLEAN_DIRT",
    zoneId,
    targetId,
    ...(solutionId ? { solutionId } : {}),
  }),
  harvestDailyPile: (): GameCommand => ({ type: "HARVEST_DAILY_PILE" }),
  buildHouse: (slotId: string, buildingId: string): GameCommand => ({
    type: "BUILD_HOUSE",
    slotId,
    buildingId,
  }),
  removeHouse: (slotId: string): GameCommand => ({ type: "REMOVE_HOUSE", slotId }),
  craftRecipe: (recipeId: string): GameCommand => ({ type: "CRAFT_RECIPE", recipeId }),
  mixLiquids: (ingredients: [string, string, string]): GameCommand => ({ type: "MIX_LIQUIDS", ingredients }),
  craftAccessory: (accessoryId: string): GameCommand => ({ type: "CRAFT_ACCESSORY", accessoryId }),
  equipAccessory: (accessoryId: string): GameCommand => ({ type: "EQUIP_ACCESSORY", accessoryId }),
  endDay: (): GameCommand => ({ type: "END_DAY" }),
};
