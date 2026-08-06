import type { CleanQuality, CleanTechnique } from "../entities/types";

export interface CleaningFeedback {
  technique: CleanTechnique;
  quality: CleanQuality;
  durationMs: number;
  assisted: boolean;
}

export type GameCommand =
  | { type: "CLEAN_DIRT"; zoneId: string; targetId: string; solutionId?: string; feedback?: CleaningFeedback }
  | { type: "HARVEST_DAILY_PILE" }
  | { type: "BUILD_HOUSE"; anchorId: string; buildingId: string }
  | { type: "REPLACE_HOUSE"; anchorId: string; buildingId: string }
  | { type: "REMOVE_HOUSE"; anchorId: string }
  | { type: "CRAFT_RECIPE"; recipeId: string }
  | { type: "MIX_LIQUIDS"; ingredients: [string, string, string] }
  | { type: "CRAFT_ACCESSORY"; accessoryId: string }
  | { type: "EQUIP_ACCESSORY"; accessoryId: string }
  | { type: "UPDATE_PREFERENCES"; masterVolume?: number; reducedMotion?: boolean; simpleCleaning?: boolean }
  | { type: "END_DAY" };

export const commands = {
  cleanDirt: (zoneId: string, targetId: string, solutionId?: string, feedback?: CleaningFeedback): GameCommand => ({
    type: "CLEAN_DIRT",
    zoneId,
    targetId,
    ...(solutionId ? { solutionId } : {}),
    ...(feedback ? { feedback } : {}),
  }),
  harvestDailyPile: (): GameCommand => ({ type: "HARVEST_DAILY_PILE" }),
  buildHouse: (anchorId: string, buildingId: string): GameCommand => ({
    type: "BUILD_HOUSE",
    anchorId,
    buildingId,
  }),
  replaceHouse: (anchorId: string, buildingId: string): GameCommand => ({
    type: "REPLACE_HOUSE",
    anchorId,
    buildingId,
  }),
  removeHouse: (anchorId: string): GameCommand => ({ type: "REMOVE_HOUSE", anchorId }),
  craftRecipe: (recipeId: string): GameCommand => ({ type: "CRAFT_RECIPE", recipeId }),
  mixLiquids: (ingredients: [string, string, string]): GameCommand => ({ type: "MIX_LIQUIDS", ingredients }),
  craftAccessory: (accessoryId: string): GameCommand => ({ type: "CRAFT_ACCESSORY", accessoryId }),
  equipAccessory: (accessoryId: string): GameCommand => ({ type: "EQUIP_ACCESSORY", accessoryId }),
  updatePreferences: (preferences: Omit<Extract<GameCommand, { type: "UPDATE_PREFERENCES" }>, "type">): GameCommand => ({
    type: "UPDATE_PREFERENCES",
    ...preferences,
  }),
  endDay: (): GameCommand => ({ type: "END_DAY" }),
};
