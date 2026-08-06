import buildingsJson from "../data/buildings.json";
import mapsJson from "../data/maps.json";
import type { GameState } from "../core/gameState";
import { GameRuleError } from "../core/errors";
import { gameEvent, type GameEvent } from "../core/events";
import type { BuildingDefinition, HouseSlotDefinition } from "../entities/types";
import { canAfford, refundItems, spendItems } from "./inventory";
import { calculateHappiness } from "./progression";

const buildings = buildingsJson as unknown as BuildingDefinition[];
const slots = (mapsJson as unknown as { homeSlots: HouseSlotDefinition[] }).homeSlots;

export function hasAffordableHousePart(state: GameState): boolean {
  return slots.some((slot) => {
    if (state.houseSlots[slot.id] !== null) return false;
    return slot.buildingOptions.some((buildingId) => {
      const building = buildings.find((candidate) => candidate.id === buildingId);
      return Boolean(building && canAfford(state, building.cost));
    });
  });
}

export function shouldAutoSleepAtHome(state: GameState): boolean {
  return state.dayPhase === "evening" && state.currentActivity <= 0 && !hasAffordableHousePart(state);
}

export function buildHousePart(state: GameState, slotId: string, buildingId: string): GameEvent[] {
  const slot = slots.find((candidate) => candidate.id === slotId);
  const building = buildings.find((candidate) => candidate.id === buildingId);
  if (!slot || !building) {
    throw new GameRuleError("BUILD_DATA_MISSING", "집 부품 데이터를 찾을 수 없습니다.");
  }
  if (slot.category !== building.category) {
    throw new GameRuleError("WRONG_SLOT", "이 슬롯에는 해당 부품을 설치할 수 없습니다.");
  }
  if (!slot.buildingOptions.includes(building.id)) {
    throw new GameRuleError("WRONG_SLOT", "이 자리에서 고를 수 없는 집 부품입니다.");
  }
  if (state.houseSlots[slotId]) {
    throw new GameRuleError("SLOT_OCCUPIED", "이미 부품이 설치된 슬롯입니다.");
  }

  const previousHappiness = state.happiness;
  spendItems(state, building.cost);
  state.houseSlots[slotId] = building.id;
  state.happiness = calculateHappiness(state);
  if (!state.experiencedBuildCategories.includes(building.category)) {
    state.experiencedBuildCategories.push(building.category);
  }

  const events: GameEvent[] = [
    gameEvent("HOUSE_BUILT", `${building.name}을(를) 설치했습니다.`, { slotId, buildingId }),
    gameEvent("HAPPINESS_CHANGED", `행복도가 ${state.happiness}이 되었습니다.`, {
      previousHappiness,
      happiness: state.happiness,
      delta: state.happiness - previousHappiness,
      buildingHappiness: building.happiness,
      synergyBonus: state.happiness - previousHappiness - building.happiness,
    }),
  ];
  if (!state.homeCompletionCelebrated && Object.values(state.houseSlots).every((id) => id !== null)) {
    state.homeCompletionCelebrated = true;
    events.push(gameEvent("HOME_COMPLETED", "우리 손으로 덤불집을 모두 완성했습니다!", {
      happiness: state.happiness,
    }));
  }
  return events;
}

export function removeHousePart(state: GameState, slotId: string): GameEvent[] {
  const buildingId = state.houseSlots[slotId];
  if (!buildingId) {
    throw new GameRuleError("SLOT_EMPTY", "회수할 집 부품이 없습니다.");
  }
  const building = buildings.find((candidate) => candidate.id === buildingId);
  if (!building) {
    throw new GameRuleError("BUILD_DATA_MISSING", "집 부품 데이터를 찾을 수 없습니다.");
  }

  const previousHappiness = state.happiness;
  refundItems(state, building.cost);
  state.houseSlots[slotId] = null;
  state.happiness = calculateHappiness(state);

  return [
    gameEvent("HOUSE_REMOVED", `${building.name}을(를) 회수해 재료를 돌려받았습니다.`, {
      slotId,
      buildingId,
    }),
    gameEvent("HAPPINESS_CHANGED", `행복도가 ${state.happiness}이 되었습니다.`, {
      previousHappiness,
      happiness: state.happiness,
      delta: state.happiness - previousHappiness,
      buildingHappiness: -building.happiness,
      synergyBonus: state.happiness - previousHappiness + building.happiness,
    }),
  ];
}
