import dirtJson from "../data/dirt.json";
import mapsJson from "../data/maps.json";
import type { GameState } from "../core/gameState";
import { GameRuleError } from "../core/errors";
import { gameEvent, type GameEvent } from "../core/events";
import type { DirtDefinition, DirtLayerDefinition, ZoneDefinition } from "../entities/types";
import { addItem } from "./inventory";
import type { CleaningFeedback } from "../core/commands";
import { cleaningAvailability, type CleaningChallengeKind } from "./availability";

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
  multiplier = 1,
): Record<string, number> {
  const gained: Record<string, number> = {};
  for (const reward of rewards) {
    const amount = deterministicAmount(reward.min, reward.max, `${state.day}:${targetId}:${layer}:${reward.itemId}`) * multiplier;
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
  feedback?: CleaningFeedback,
): GameEvent[] {
  const availability = cleaningAvailability(state, zoneId, targetId, solutionId);
  if (!availability.enabled) {
    throw new GameRuleError(availability.errorCode ?? "CLEANING_BLOCKED", availability.message);
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
    return cleanDeepLayer(state, zoneId, targetId, dirt, solutionId, feedback, availability.challenge);
  }

  targetState.surfaceCleaned = true;
  targetState.deepestLayer = 1;
  state.currentActivity -= 1;
  const rewardMultiplier = availability.challenge ? 2 : 1;
  const gained = rewardLayer(state, target.id, 1, dirt.rewards, rewardMultiplier);
  const validFeedback = feedback?.technique === dirt.interaction ? feedback : undefined;
  const carefulBonus = availability.challenge && validFeedback?.quality === "careful" ? dirt.rewards[0] : undefined;
  if (carefulBonus) {
    addItem(state, carefulBonus.itemId, 1);
    gained[carefulBonus.itemId] = (gained[carefulBonus.itemId] ?? 0) + 1;
  }
  recordCleaning(state, dirt, validFeedback);

  const events: GameEvent[] = [
    gameEvent("DIRT_CLEANED", `${dirt.name}의 표면을 깨끗하게 만들었습니다.`, {
      zoneId,
      targetId,
      dirtTypeId: dirt.id,
      technique: dirt.interaction,
      quality: validFeedback?.quality ?? "standard",
      durationMs: validFeedback?.durationMs ?? 0,
      assisted: validFeedback?.assisted ?? false,
      challenge: availability.challenge ?? null,
      rewardMultiplier,
      bonusGained: carefulBonus ? { [carefulBonus.itemId]: 1 } : {},
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
  feedback?: CleaningFeedback,
  challenge?: CleaningChallengeKind,
): GameEvent[] {
  const targetState = state.zoneCleaningState[zoneId]?.targets[targetId];
  if (!targetState) {
    throw new GameRuleError("TARGET_STATE_NOT_FOUND", "청소 상태를 찾을 수 없습니다.");
  }
  const layer = dirt.layers.find((candidate) => candidate.level === targetState.deepestLayer + 1);
  if (!layer) throw new GameRuleError("FULLY_CLEAN", "이 오염물은 모든 층을 청소했습니다.");
  if (layer.requiredSolutionId) {
    if (!solutionId) throw new GameRuleError("SOLUTION_REQUIRED", `${layer.name}: ${layer.hint}`);
    state.preparedSolutions[solutionId] = (state.preparedSolutions[solutionId] ?? 0) - 1;
  }

  targetState.deepestLayer = layer.level;
  state.currentActivity -= 1;
  const rewardMultiplier = challenge ? 2 : 1;
  const gained = rewardLayer(state, targetId, layer.level, layer.rewards, rewardMultiplier);
  const validFeedback = feedback?.technique === dirt.interaction ? feedback : undefined;
  const carefulBonus = challenge && validFeedback?.quality === "careful" ? layer.rewards[0] : undefined;
  if (carefulBonus) {
    addItem(state, carefulBonus.itemId, 1);
    gained[carefulBonus.itemId] = (gained[carefulBonus.itemId] ?? 0) + 1;
  }
  recordCleaning(state, dirt, validFeedback);
  return [
    gameEvent("DEEP_LAYER_CLEANED", `${dirt.name}의 ${layer.name}을(를) 제거했습니다.`, {
      zoneId,
      targetId,
      dirtTypeId: dirt.id,
      layer: layer.level,
      solutionId: layer.requiredSolutionId ?? null,
      accessoryId: layer.requiredAccessoryId ?? null,
      technique: dirt.interaction,
      quality: validFeedback?.quality ?? "standard",
      durationMs: validFeedback?.durationMs ?? 0,
      assisted: validFeedback?.assisted ?? false,
      challenge: challenge ?? null,
      rewardMultiplier,
      bonusGained: carefulBonus ? { [carefulBonus.itemId]: 1 } : {},
    }),
    gameEvent("MATERIAL_GAINED", "깊은 층에서 새로운 재료를 얻었습니다.", { gained }),
    gameEvent("ACTIVITY_CHANGED", `활동력 ${state.currentActivity} 남음`, {
      currentActivity: state.currentActivity,
      maxActivity: state.maxActivity,
    }),
  ];
}

function recordCleaning(
  state: GameState,
  dirt: DirtDefinition,
  feedback?: CleaningFeedback,
): void {
  const stat = state.cleaningStats[dirt.interaction];
  stat.completed += 1;
  if (feedback?.quality === "careful") stat.careful += 1;
  if (feedback?.assisted) stat.assisted += 1;
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
