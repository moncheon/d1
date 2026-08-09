export type GameEventType =
  | "DIRT_CLEANED"
  | "DEEP_LAYER_CLEANED"
  | "MATERIAL_GAINED"
  | "ACTIVITY_CHANGED"
  | "HOUSE_BUILT"
  | "HOUSE_REMOVED"
  | "HAPPINESS_CHANGED"
  | "ITEM_CRAFTED"
  | "MIXTURE_ATTEMPTED"
  | "RECIPE_DISCOVERED"
  | "ACCESSORY_CRAFTED"
  | "ACCESSORY_EQUIPPED"
  | "ZONE_UNLOCKED"
  | "WORK_ENDED"
  | "HOME_COMPLETED"
  | "STEP_ONE_COMPLETED"
  | "MEMORY_UNLOCKED"
  | "PREFERENCES_UPDATED"
  | "DAY_ENDED"
  | "GAME_COMPLETED"
  | "SAVE_COMPLETED"
  | "SAVE_FAILED"
  | "RULE_REJECTED";

export interface GameEvent<T = Record<string, unknown>> {
  type: GameEventType;
  message: string;
  data: T;
}

export function gameEvent<T extends Record<string, unknown>>(
  type: GameEventType,
  message: string,
  data: T,
): GameEvent<T> {
  return { type, message, data };
}
