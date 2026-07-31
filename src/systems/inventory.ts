import type { GameState } from "../core/gameState";
import { GameRuleError } from "../core/errors";
import type { Cost } from "../entities/types";

export function inventoryAmount(state: GameState, itemId: string): number {
  return state.inventory[itemId] ?? 0;
}

export function addItem(state: GameState, itemId: string, amount: number): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new GameRuleError("INVALID_AMOUNT", "획득 수량이 올바르지 않습니다.");
  }
  state.inventory[itemId] = inventoryAmount(state, itemId) + amount;
}

export function canAfford(state: GameState, costs: Cost[]): boolean {
  return costs.every((cost) => inventoryAmount(state, cost.itemId) >= cost.amount);
}

export function spendItems(state: GameState, costs: Cost[]): void {
  if (!canAfford(state, costs)) {
    throw new GameRuleError("NOT_ENOUGH_MATERIALS", "재료가 부족합니다.");
  }
  for (const cost of costs) {
    state.inventory[cost.itemId] = inventoryAmount(state, cost.itemId) - cost.amount;
  }
}

export function refundItems(state: GameState, costs: Cost[]): void {
  for (const cost of costs) {
    addItem(state, cost.itemId, cost.amount);
  }
}

