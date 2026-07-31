import dirtJson from "../data/dirt.json";
import mapsJson from "../data/maps.json";
import type { GameState } from "../core/gameState";
import { GameRuleError } from "../core/errors";
import { gameEvent, type GameEvent } from "../core/events";
import type { DirtDefinition, DirtLayerDefinition, ZoneDefinition } from "../entities/types";
import { addItem } from "./inventory";

const dirtDefinitions = dirtJson as unknown as DirtDefinition[];
const zones = (mapsJson as unknown as { zones: ZoneDefinition[] }).zones;

function deterministicAmount(min: number, max: number, key: string): number {
  if (max <= min) return min;
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return min + (Math.abs(hash) % (max - min + 1));
}

function rewardLayer(
  state: GameState,
  targetId: string,
  layer: number,
  rewards: DirtDefinition["rewards"],
): Record<string, number> {
  const gained: Record<string, number> = {};
  for (const reward of rewards) {
    const amount = deterministicAmount(reward.min, reward.max, `${state.day}:${targetId}:${layer}:${reward.itemId}`);
    if (amount > 0) {
      addItem(state, reward.itemId, amount);
      gained[reward.itemId] = amount;
    }
  }
  return gained;
}

export function nextDirtLayer(
  state: GameState,
  zoneId: string,
  targetId: string,
): DirtLayerDefinition | null {
  const zone = zones.find((candidate) => candidate.id === zoneId);
  const target = zone?.targets.find((candidate) => candidate.id === targetId);
  const dirt = dirtDefinitions.find((candidate) => candidate.id === target?.dirtTypeId);
  const targetState = state.zoneCleaningState[zoneId]?.targets[targetId];
  if (!dirt || !targetState?.surfaceCleaned) return null;
  return dirt.layers.find((layer) => layer.level === targetState.deepestLayer + 1) ?? null;
}

export function cleanDirt(
  state: GameState,
  zoneId: string,
  targetId: string,
  solutionId?: string,
): GameEvent[] {
  if (state.currentActivity <= 0) {
    throw new GameRuleError("NO_ACTIVITY", "활동력이 없습니다. 집에서 쉬어야 합니다.");
  }
  if (!state.unlockedZones.includes(zoneId)) {
    throw new GameRuleError("ZONE_LOCKED", "아직 열리지 않은 구역입니다.");
  }

  const zone = zones.find((candidate) => candidate.id === zoneId);
  const target = zone?.targets.find((candidate) => candidate.id === targetId);
  if (!zone || !target) {
    throw new GameRuleError("TARGET_NOT_FOUND", "청소 대상을 찾을 수 없습니다.");
  }

  const targetState = state.zoneCleaningState[zoneId]?.targets[targetId];
  if (!targetState) {
    throw new GameRuleError("TARGET_STATE_NOT_FOUND", "청소 상태를 찾을 수 없습니다.");
  }
  const dirt = dirtDefinitions.find((candidate) => candidate.id === target.dirtTypeId);
  if (!dirt) {
    throw new GameRuleError("DIRT_DATA_MISSING", "오염물 데이터가 없습니다.");
  }

  if (targetState.surfaceCleaned) {
    return cleanDeepLayer(state, zoneId, targetId, dirt, solutionId);
  }

  targetState.surfaceCleaned = true;
  targetState.deepestLayer = 1;
  state.currentActivity -= 1;
  const gained = rewardLayer(state, target.id, 1, dirt.rewards);

  const events: GameEvent[] = [
    gameEvent("DIRT_CLEANED", `${dirt.name}의 표면을 깨끗하게 만들었습니다.`, {
      zoneId,
      targetId,
      dirtTypeId: dirt.id,
    }),
    gameEvent("MATERIAL_GAINED", "청소한 곳에서 재료를 얻었습니다.", { gained }),
    gameEvent("ACTIVITY_CHANGED", `활동력 ${state.currentActivity} 남음`, {
      currentActivity: state.currentActivity,
      maxActivity: state.maxActivity,
    }),
  ];

  return events;
}

function cleanDeepLayer(
  state: GameState,
  zoneId: string,
  targetId: string,
  dirt: DirtDefinition,
  solutionId?: string,
): GameEvent[] {
  const targetState = state.zoneCleaningState[zoneId]?.targets[targetId];
  if (!targetState) {
    throw new GameRuleError("TARGET_STATE_NOT_FOUND", "청소 상태를 찾을 수 없습니다.");
  }
  const layer = dirt.layers.find((candidate) => candidate.level === targetState.deepestLayer + 1);
  if (!layer) {
    throw new GameRuleError("FULLY_CLEAN", "이 오염물은 모든 층을 청소했습니다.");
  }
  if (state.cleanerLevel < layer.requiredCleanerLevel) {
    throw new GameRuleError(
      "CLEANER_TOO_WEAK",
      `${layer.name}: 청소기 ${layer.requiredCleanerLevel}단계가 필요합니다.`,
    );
  }
  if (layer.requiredAccessoryId && !state.equippedAccessories.includes(layer.requiredAccessoryId)) {
    throw new GameRuleError("ACCESSORY_REQUIRED", `${layer.name}: ${layer.hint}`);
  }
  if (layer.requiredSolutionId) {
    if (solutionId !== layer.requiredSolutionId) {
      throw new GameRuleError("SOLUTION_REQUIRED", `${layer.name}: ${layer.hint}`);
    }
    if ((state.preparedSolutions[solutionId] ?? 0) <= 0) {
      throw new GameRuleError("NO_SOLUTION", "선택한 세정액이 없습니다. 작업실에서 조합하세요.");
    }
    state.preparedSolutions[solutionId] = (state.preparedSolutions[solutionId] ?? 0) - 1;
  }

  targetState.deepestLayer = layer.level;
  state.currentActivity -= 1;
  const gained = rewardLayer(state, targetId, layer.level, layer.rewards);
  return [
    gameEvent("DEEP_LAYER_CLEANED", `${dirt.name}의 ${layer.name}을(를) 제거했습니다.`, {
      zoneId,
      targetId,
      dirtTypeId: dirt.id,
      layer: layer.level,
      solutionId: layer.requiredSolutionId ?? null,
      accessoryId: layer.requiredAccessoryId ?? null,
    }),
    gameEvent("MATERIAL_GAINED", "깊은 층에서 새로운 재료를 얻었습니다.", { gained }),
    gameEvent("ACTIVITY_CHANGED", `활동력 ${state.currentActivity} 남음`, {
      currentActivity: state.currentActivity,
      maxActivity: state.maxActivity,
    }),
  ];
}

export function harvestDailyPile(state: GameState): GameEvent[] {
  if (state.currentActivity <= 0) {
    throw new GameRuleError("NO_ACTIVITY", "활동력이 없습니다.");
  }
  if (state.dailyLeafPileRemaining <= 0) {
    throw new GameRuleError("PILE_EMPTY", "오늘은 낙엽 더미를 모두 정리했습니다.");
  }

  state.currentActivity -= 1;
  state.dailyLeafPileRemaining -= 1;
  addItem(state, "leaf", 2);
  addItem(state, "grass", 1);
  addItem(state, "soil", 1);

  return [
    gameEvent("DIRT_CLEANED", "집 앞 잔해 더미를 정리했습니다.", { zoneId: "home", targetId: "daily-pile" }),
    gameEvent("MATERIAL_GAINED", "낙엽 2개, 풀 1개, 흙 1개를 얻었습니다.", {
      gained: { leaf: 2, grass: 1, soil: 1 },
    }),
    gameEvent("ACTIVITY_CHANGED", `활동력 ${state.currentActivity} 남음`, {
      currentActivity: state.currentActivity,
      maxActivity: state.maxActivity,
    }),
  ];
}
