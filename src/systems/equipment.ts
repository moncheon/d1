import accessoriesJson from "../data/accessories.json";
import type { GameState } from "../core/gameState";
import { GameRuleError } from "../core/errors";
import { gameEvent, type GameEvent } from "../core/events";
import type { AccessoryDefinition } from "../entities/types";
import { spendItems } from "./inventory";

const accessories = accessoriesJson as unknown as AccessoryDefinition[];

export function craftAccessory(state: GameState, accessoryId: string): GameEvent[] {
  if (state.currentActivity <= 0) {
    throw new GameRuleError("NO_ACTIVITY", "액세서리를 제작할 활동력이 없습니다.");
  }
  const accessory = accessories.find((candidate) => candidate.id === accessoryId);
  if (!accessory) throw new GameRuleError("ACCESSORY_NOT_FOUND", "액세서리 데이터를 찾을 수 없습니다.");
  if (state.ownedAccessories.includes(accessoryId)) {
    throw new GameRuleError("ACCESSORY_OWNED", "이미 제작한 액세서리입니다.");
  }
  if (state.cleanerLevel < accessory.requiredCleanerLevel) {
    throw new GameRuleError("CLEANER_TOO_WEAK", `청소기 ${accessory.requiredCleanerLevel}단계가 필요합니다.`);
  }

  spendItems(state, accessory.cost);
  state.ownedAccessories.push(accessoryId);
  state.equippedAccessories = [accessoryId];
  state.currentActivity -= 1;
  return [
    gameEvent("ACCESSORY_CRAFTED", `${accessory.name} 제작 완료!`, { accessoryId }),
    gameEvent("ACCESSORY_EQUIPPED", `${accessory.name}을(를) 장착했습니다.`, { accessoryId }),
    gameEvent("ACTIVITY_CHANGED", `활동력 ${state.currentActivity} 남음`, {
      currentActivity: state.currentActivity,
      maxActivity: state.maxActivity,
    }),
  ];
}

export function equipAccessory(state: GameState, accessoryId: string): GameEvent[] {
  const accessory = accessories.find((candidate) => candidate.id === accessoryId);
  if (!accessory || !state.ownedAccessories.includes(accessoryId)) {
    throw new GameRuleError("ACCESSORY_NOT_OWNED", "먼저 액세서리를 제작해야 합니다.");
  }
  state.equippedAccessories = [accessoryId];
  return [gameEvent("ACCESSORY_EQUIPPED", `${accessory.name}을(를) 장착했습니다.`, { accessoryId })];
}
