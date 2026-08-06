import buildingsJson from "../data/buildings.json";
import mapsJson from "../data/maps.json";
import type { GameState } from "../core/gameState";
import { GameRuleError } from "../core/errors";
import { gameEvent, type GameEvent } from "../core/events";
import type { BuildingDefinition, HouseAnchorDefinition } from "../entities/types";
import { canAfford, refundItems, spendItems } from "./inventory";
import { calculateHappiness } from "./progression";

const buildings = buildingsJson as unknown as BuildingDefinition[];
const anchors = (mapsJson as unknown as { homeAnchors: HouseAnchorDefinition[] }).homeAnchors;

export function hasAffordableHousePart(state: GameState): boolean {
  return anchors.some((anchor) => {
    if (state.homeAnchors[anchor.id] !== null) return false;
    return anchor.buildingOptions.some((buildingId) => {
      const building = buildings.find((candidate) => candidate.id === buildingId);
      return Boolean(building && canAfford(state, building.cost));
    });
  });
}

export function shouldAutoSleepAtHome(state: GameState): boolean {
  return state.dayPhase === "evening" && state.currentActivity <= 0 && !hasAffordableHousePart(state);
}

export function buildHousePart(state: GameState, anchorId: string, buildingId: string): GameEvent[] {
  const anchor = anchors.find((candidate) => candidate.id === anchorId);
  const building = buildings.find((candidate) => candidate.id === buildingId);
  if (!anchor || !building) {
    throw new GameRuleError("BUILD_DATA_MISSING", "집 부품 데이터를 찾을 수 없습니다.");
  }
  if (anchor.category !== building.category) {
    throw new GameRuleError("WRONG_SLOT", "이 슬롯에는 해당 부품을 설치할 수 없습니다.");
  }
  if (!anchor.buildingOptions.includes(building.id)) {
    throw new GameRuleError("WRONG_SLOT", "이 자리에서 고를 수 없는 집 부품입니다.");
  }
  if (state.homeAnchors[anchorId]) {
    throw new GameRuleError("SLOT_OCCUPIED", "이미 부품이 설치된 슬롯입니다.");
  }

  const previousHappiness = state.happiness;
  spendItems(state, building.cost);
  state.homeAnchors[anchorId] = building.id;
  state.happiness = calculateHappiness(state);
  if (!state.experiencedBuildCategories.includes(building.category)) {
    state.experiencedBuildCategories.push(building.category);
  }

  const events: GameEvent[] = [
    gameEvent("HOUSE_BUILT", `${building.name}을(를) 설치했습니다.`, { anchorId, buildingId }),
    gameEvent("HAPPINESS_CHANGED", `행복도가 ${state.happiness}이 되었습니다.`, {
      previousHappiness,
      happiness: state.happiness,
      delta: state.happiness - previousHappiness,
      buildingHappiness: building.happiness,
      synergyBonus: state.happiness - previousHappiness - building.happiness,
    }),
  ];
  if (!state.homeCompletionCelebrated && anchors.every((candidate) => Boolean(state.homeAnchors[candidate.id]))) {
    state.homeCompletionCelebrated = true;
    events.push(gameEvent("HOME_COMPLETED", "우리 손으로 덤불집을 모두 완성했습니다!", {
      happiness: state.happiness,
    }));
  }
  return events;
}

export function removeHousePart(state: GameState, anchorId: string): GameEvent[] {
  const buildingId = state.homeAnchors[anchorId];
  if (!buildingId) {
    throw new GameRuleError("SLOT_EMPTY", "회수할 집 부품이 없습니다.");
  }
  const building = buildings.find((candidate) => candidate.id === buildingId);
  if (!building) {
    throw new GameRuleError("BUILD_DATA_MISSING", "집 부품 데이터를 찾을 수 없습니다.");
  }

  const previousHappiness = state.happiness;
  refundItems(state, building.cost);
  state.homeAnchors[anchorId] = null;
  state.happiness = calculateHappiness(state);

  return [
    gameEvent("HOUSE_REMOVED", `${building.name}을(를) 회수해 재료를 돌려받았습니다.`, {
      anchorId,
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
