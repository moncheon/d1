import accessoriesJson from "../data/accessories.json";
import buildingsJson from "../data/buildings.json";
import dialogueJson from "../data/quokka-dialogue.json";
import dirtJson from "../data/dirt.json";
import itemsJson from "../data/items.json";
import mapsJson from "../data/maps.json";
import recipesJson from "../data/recipes.json";
import type { GameEvent } from "../core/events";
import type { GameCommand } from "../core/commands";
import type { GameState } from "../core/gameState";
import type {
  AccessoryDefinition,
  BuildingDefinition,
  Cost,
  DirtDefinition,
  DirtLayerDefinition,
  DirtTargetDefinition,
  HouseSlotDefinition,
  ItemDefinition,
  LiquidId,
  RecipeDefinition,
  ZoneDefinition,
} from "../entities/types";
import { completionProgress, isCoreTargetComplete, surfaceCleaningRate } from "./progression";

const accessories = accessoriesJson as unknown as AccessoryDefinition[];
const buildings = buildingsJson as unknown as BuildingDefinition[];
const dirtDefinitions = dirtJson as unknown as DirtDefinition[];
const items = itemsJson as unknown as ItemDefinition[];
const recipes = recipesJson as unknown as RecipeDefinition[];
const maps = mapsJson as unknown as { homeSlots: HouseSlotDefinition[]; zones: ZoneDefinition[] };
const dialogue = dialogueJson as unknown as {
  firstClean: string[];
  openPath: string[];
  gather: string[];
  make: string[];
  cleanDeep: string[];
  mix: string[];
  build: string[];
  complete: string[];
  memory: Record<string, string>;
};

export type GuidanceScene = "home" | "workshop" | "workplace";
export type QuokkaMood = "curious" | "hopeful" | "proud" | "restful";

export interface GuidanceContext {
  scene: GuidanceScene;
  zoneId?: string;
  recentEventType?: GameEvent["type"];
  intent?: GameCommand;
}

export interface GuidanceDestination {
  scene: GuidanceScene;
  label: string;
  focusId?: string;
  zoneId?: string;
  ingredients?: LiquidId[];
}

export interface QuokkaNeed {
  itemId: string;
  name: string;
  current: number;
  required: number;
  missing: number;
  sources: string[];
}

export interface QuokkaDream {
  label: string;
  progress: string;
  ready: boolean;
}

export interface QuokkaGuidance {
  id: string;
  mood: QuokkaMood;
  thought: string;
  detail: string;
  memory?: string;
  needs: QuokkaNeed[];
  destination: GuidanceDestination;
  suggestions: GuidanceDestination[];
  dreams: QuokkaDream[];
}

interface GuidanceDraft {
  id: string;
  mood: QuokkaMood;
  thought: string;
  detail: string;
  needs?: QuokkaNeed[];
  destination: GuidanceDestination;
}

interface MaterialSource {
  zone: ZoneDefinition;
  target: DirtTargetDefinition;
  dirt: DirtDefinition;
  desiredLayer: number;
  label: string;
}

function itemName(itemId: string): string {
  return items.find((item) => item.id === itemId)?.name ?? itemId;
}

function recipeName(outputId: string): string {
  return recipes.find((recipe) => recipe.outputId === outputId)?.name ?? outputId;
}

function replaceTokens(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function stablePick(lines: string[], key: string): string {
  if (lines.length === 0) return "천천히 다음 냄새를 찾아보자.";
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return lines[hash % lines.length] ?? lines[0] ?? "천천히 다음 냄새를 찾아보자.";
}

function inventoryAmount(state: GameState, itemId: string): number {
  return state.inventory[itemId] ?? 0;
}

function sourceLabels(state: GameState, itemId: string): string[] {
  const labels: string[] = [];
  if (["leaf", "grass", "soil"].includes(itemId)) labels.push("집 앞의 매일 생기는 잔해 더미");

  for (const dirt of dirtDefinitions) {
    const unlockedZoneNames = maps.zones
      .filter((zone) => state.unlockedZones.includes(zone.id) && zone.targets.some((target) => target.dirtTypeId === dirt.id))
      .map((zone) => zone.name);
    if (unlockedZoneNames.length === 0) continue;
    const place = unlockedZoneNames.join("·");
    if (dirt.rewards.some((reward) => reward.itemId === itemId && reward.max > 0)) {
      labels.push(`${place}의 ${dirt.name} 표면`);
    }
    for (const layer of dirt.layers) {
      if (layer.rewards.some((reward) => reward.itemId === itemId && reward.max > 0)) {
        labels.push(`${place}의 ${dirt.name} · ${layer.name} ${layer.level}층`);
      }
    }
  }

  for (const slot of maps.homeSlots) {
    const buildingId = state.houseSlots[slot.id];
    const building = buildings.find((candidate) => candidate.id === buildingId);
    if (building?.cost.some((cost) => cost.itemId === itemId)) labels.push(`${building.name}을 회수`);
  }

  return [...new Set(labels)].slice(0, 3);
}

function needsForCosts(state: GameState, costs: Cost[]): QuokkaNeed[] {
  return costs
    .map((cost) => {
      const current = inventoryAmount(state, cost.itemId);
      return {
        itemId: cost.itemId,
        name: itemName(cost.itemId),
        current,
        required: cost.amount,
        missing: Math.max(0, cost.amount - current),
        sources: sourceLabels(state, cost.itemId),
      };
    })
    .filter((need) => need.missing > 0);
}

function allDreams(state: GameState): QuokkaDream[] {
  const zoneDreams = maps.zones.map((zone) => {
    const surface = Math.round(surfaceCleaningRate(state, zone.id) * 100);
    return { label: zone.name, progress: `${surface}/100%`, ready: surface >= 100 };
  });
  const coreCount = maps.zones.filter((zone) => isCoreTargetComplete(state, zone)).length;
  return [...zoneDreams, { label: "깊은 막힘 걷어내기", progress: `${coreCount}/${maps.zones.length}곳`, ready: coreCount === maps.zones.length }];
}

function memoryLine(state: GameState, context: GuidanceContext): string | undefined {
  const eventKey: Partial<Record<GameEvent["type"], string>> = {
    ZONE_UNLOCKED: "unlock",
    HOUSE_BUILT: "built",
    ACCESSORY_CRAFTED: "crafted",
    ITEM_CRAFTED: "crafted",
    RECIPE_DISCOVERED: "discovered",
    DIRT_CLEANED: "cleaned",
    DEEP_LAYER_CLEANED: "cleaned",
    DAY_ENDED: "newDay",
  };
  const key = context.recentEventType ? eventKey[context.recentEventType] : undefined;
  if (key && dialogue.memory[key]) return dialogue.memory[key];

  const installed = Object.values(state.houseSlots).filter((id): id is string => Boolean(id));
  if (installed.includes("leaf_bed")) return dialogue.memory.bed;
  if (installed.includes("leaf_roof")) return dialogue.memory.roof;
  if (installed.filter((id) => id === "shrub_wall").length >= 2) return dialogue.memory.walls;
  if (state.discoveredRecipes.length > 0) {
    return replaceTokens(dialogue.memory.recipe ?? "", { count: state.discoveredRecipes.length });
  }
  if (state.day > 1) return replaceTokens(dialogue.memory.day ?? "", { day: state.day });
  return undefined;
}

function targetState(state: GameState, zoneId: string, targetId: string) {
  return state.zoneCleaningState[zoneId]?.targets[targetId];
}

function findMaterialSource(state: GameState, itemId: string): MaterialSource | undefined {
  const candidates: MaterialSource[] = [];
  maps.zones.forEach((zone) => {
    if (!state.unlockedZones.includes(zone.id)) return;
    zone.targets.forEach((target) => {
      const dirt = dirtDefinitions.find((candidate) => candidate.id === target.dirtTypeId);
      const progress = targetState(state, zone.id, target.id);
      if (!dirt || !progress) return;
      if (!progress.surfaceCleaned && dirt.rewards.some((reward) => reward.itemId === itemId && reward.max > 0)) {
        candidates.push({ zone, target, dirt, desiredLayer: 1, label: `${zone.name}의 ${dirt.name} 표면` });
      }
      for (const layer of dirt.layers) {
        if (progress.deepestLayer < layer.level && layer.rewards.some((reward) => reward.itemId === itemId && reward.max > 0)) {
          candidates.push({
            zone,
            target,
            dirt,
            desiredLayer: layer.level,
            label: `${zone.name}의 ${dirt.name} · ${layer.name} ${layer.level}층`,
          });
        }
      }
    });
  });
  candidates.sort((left, right) => {
    const leftState = targetState(state, left.zone.id, left.target.id)?.deepestLayer ?? 0;
    const rightState = targetState(state, right.zone.id, right.target.id)?.deepestLayer ?? 0;
    return (left.desiredLayer - leftState) - (right.desiredLayer - rightState)
      || left.desiredLayer - right.desiredLayer;
  });
  return candidates[0];
}

function guideForUpgrade(state: GameState, level: number, depth: number): GuidanceDraft {
  const recipe = recipes.find((candidate) => candidate.kind === "cleaner_upgrade" && candidate.cleanerLevel === level);
  if (!recipe) return freePlayDraft(state);
  const needs = needsForCosts(state, recipe.costs ?? []);
  if (needs.length > 0 && depth < 8) return guideForMaterialNeed(state, recipe.name, needs, depth + 1);
  return {
    id: `make-${recipe.id}`,
    mood: "hopeful",
    thought: replaceTokens(stablePick(dialogue.make, `${state.day}:${recipe.id}`), { goal: recipe.name }),
    detail: `${recipe.name} 재료가 모두 모였어. 작업대에서 조립하면 더 깊은 층의 냄새를 따라갈 수 있어.`,
    destination: { scene: "workshop", label: `${recipe.name} 만들기`, focusId: recipe.id },
  };
}

function guideForAccessory(state: GameState, accessory: AccessoryDefinition, depth: number): GuidanceDraft {
  if (state.ownedAccessories.includes(accessory.id)) {
    return {
      id: `equip-${accessory.id}`,
      mood: "curious",
      thought: `${accessory.name}을 발에 맞게 챙기면 숨은 층을 건드릴 수 있겠어.`,
      detail: `${accessory.description} 작업실에서 장착한 뒤 다시 냄새가 나던 곳으로 가자.`,
      destination: { scene: "workshop", label: `${accessory.name} 장착하기`, focusId: accessory.id },
    };
  }
  const needs = needsForCosts(state, accessory.cost);
  if (needs.length > 0 && depth < 8) return guideForMaterialNeed(state, accessory.name, needs, depth + 1);
  return {
    id: `make-${accessory.id}`,
    mood: "hopeful",
    thought: replaceTokens(stablePick(dialogue.make, `${state.day}:${accessory.id}`), { goal: accessory.name }),
    detail: `${accessory.name} 재료를 모두 챙겼어. 한 번 만들면 계속 바꿔 끼울 수 있어.`,
    destination: { scene: "workshop", label: `${accessory.name} 만들기`, focusId: accessory.id },
  };
}

function ingredientCounts(ingredients: LiquidId[]): Map<LiquidId, number> {
  const counts = new Map<LiquidId, number>();
  for (const ingredient of ingredients) counts.set(ingredient, (counts.get(ingredient) ?? 0) + 1);
  return counts;
}

function guideForSolution(state: GameState, solutionId: string, depth: number): GuidanceDraft {
  const mixture = recipes.find((candidate) => candidate.kind === "mixture" && candidate.outputId === solutionId);
  if (!mixture || !mixture.ingredients) return freePlayDraft(state);
  const counts = ingredientCounts(mixture.ingredients);
  for (const [liquidId, required] of counts) {
    if (liquidId === "water" || (state.preparedLiquids[liquidId] ?? 0) >= required) continue;
    const liquidRecipe = recipes.find((candidate) => candidate.kind === "liquid" && candidate.outputId === liquidId);
    if (!liquidRecipe) continue;
    const needs = needsForCosts(state, liquidRecipe.costs ?? []);
    if (needs.length > 0 && depth < 8) return guideForMaterialNeed(state, liquidRecipe.name, needs, depth + 1);
    return {
      id: `make-${liquidRecipe.id}`,
      mood: "curious",
      thought: `${mixture.name}에 쓸 ${liquidRecipe.name}부터 향을 우려내자.`,
      detail: `${itemName(liquidRecipe.costs?.[0]?.itemId ?? "")}을 준비해 작업실에서 기초 세정액을 만들면 돼.`,
      destination: { scene: "workshop", label: `${liquidRecipe.name} 만들기`, focusId: liquidRecipe.id },
    };
  }
  return {
    id: `mix-${mixture.id}`,
    mood: "curious",
    thought: stablePick(dialogue.mix, `${state.day}:${mixture.id}`),
    detail: `${mixture.ingredients.map((id) => liquidLabel(id)).join(" + ")} — 드러난 층의 냄새를 이렇게 적어 뒀어.`,
    destination: {
      scene: "workshop",
      label: `${mixture.name} 섞기`,
      focusId: "mixer",
      ingredients: [...mixture.ingredients],
    },
  };
}

function liquidLabel(liquidId: LiquidId): string {
  return ({ water: "물", leaf_enzyme: "잎 효소", grass_ferment: "풀 발효", clay_binder: "점토 결합" })[liquidId];
}

function guideForSource(
  state: GameState,
  goal: string,
  need: QuokkaNeed,
  allNeeds: QuokkaNeed[],
  source: MaterialSource,
  depth: number,
): GuidanceDraft {
  const progress = targetState(state, source.zone.id, source.target.id);
  if (!progress) return freePlayDraft(state);
  const nextLevel = progress.surfaceCleaned ? progress.deepestLayer + 1 : 1;
  if (nextLevel > 1) {
    const layer = source.dirt.layers.find((candidate) => candidate.level === nextLevel);
    if (layer) {
      if (state.cleanerLevel < layer.requiredCleanerLevel && depth < 8) {
        return guideForUpgrade(state, layer.requiredCleanerLevel, depth + 1);
      }
      if (layer.requiredAccessoryId && !state.equippedAccessories.includes(layer.requiredAccessoryId)) {
        const accessory = accessories.find((candidate) => candidate.id === layer.requiredAccessoryId);
        if (accessory && depth < 8) return guideForAccessory(state, accessory, depth + 1);
      }
      if (layer.requiredSolutionId && (state.preparedSolutions[layer.requiredSolutionId] ?? 0) <= 0 && depth < 8) {
        return guideForSolution(state, layer.requiredSolutionId, depth + 1);
      }
    }
  }

  const deep = nextLevel > 1;
  return {
    id: `gather-${need.itemId}-${source.target.id}-${nextLevel}`,
    mood: "curious",
    thought: replaceTokens(stablePick(dialogue.gather, `${state.day}:${need.itemId}`), {
      item: need.name,
      goal,
    }),
    detail: `${need.name} ${need.missing}개가 더 필요해. ${source.label}에서 찾을 수 있고, 지금은 ${source.dirt.name} ${nextLevel}층부터 차례로 살펴보면 돼.`,
    needs: allNeeds,
    destination: {
      scene: "workplace",
      label: `${source.zone.name}에서 냄새 따라가기`,
      zoneId: source.zone.id,
      focusId: source.target.id,
    },
  };
}

function guideForMaterialNeed(state: GameState, goal: string, needs: QuokkaNeed[], depth = 0): GuidanceDraft {
  const need = needs[0];
  if (!need) return freePlayDraft(state);
  if (["leaf", "grass", "soil"].includes(need.itemId) && state.dailyLeafPileRemaining > 0) {
    return {
      id: `gather-${need.itemId}-daily-pile`,
      mood: "hopeful",
      thought: replaceTokens(stablePick(dialogue.gather, `${state.day}:${need.itemId}:pile`), {
        item: need.name,
        goal,
      }),
      detail: `${need.name} ${need.missing}개가 더 필요해. 집 앞 잔해는 매일 다시 모이고, 정리하면 낙엽·풀·흙을 함께 챙길 수 있어.`,
      needs,
      destination: { scene: "home", label: "집 앞에서 냄새 찾아보기", focusId: "daily-pile" },
    };
  }
  const source = findMaterialSource(state, need.itemId);
  if (source) return guideForSource(state, goal, need, needs, source, depth);

  const refundableSlot = maps.homeSlots.find((slot) => {
    const building = buildings.find((candidate) => candidate.id === state.houseSlots[slot.id]);
    return building?.cost.some((cost) => cost.itemId === need.itemId);
  });
  if (refundableSlot) {
    const building = buildings.find((candidate) => candidate.id === state.houseSlots[refundableSlot.id]);
    return {
      id: `refund-${refundableSlot.id}-${need.itemId}`,
      mood: "restful",
      thought: `${building?.name ?? "집 한 조각"}을 잠깐 풀면 ${need.name}을 다시 쓸 수 있어.`,
      detail: `더 찾을 곳이 남지 않았지만 재료는 사라지지 않았어. 설치한 것을 회수하면 전부 주머니로 돌아와.`,
      needs,
      destination: { scene: "home", label: `${building?.name ?? "집 부품"} 회수하기`, focusId: refundableSlot.id },
    };
  }
  return {
    id: `missing-${need.itemId}`,
    mood: "restful",
    thought: `${need.name} 냄새가 아주 희미해. 먼저 아직 안쪽을 보지 않은 오염을 살펴보자.`,
    detail: `${goal}에 ${need.name} ${need.missing}개가 더 필요해. 열린 구역의 남은 깊은 층을 따라가면 새로운 획득처가 드러날 수 있어.`,
    needs,
    destination: { scene: "workplace", label: "남은 오염 살펴보기", zoneId: state.unlockedZones.at(-1) },
  };
}

function firstUncleanTarget(state: GameState, zone: ZoneDefinition): DirtTargetDefinition | undefined {
  return zone.targets.find((target) => !targetState(state, zone.id, target.id)?.surfaceCleaned);
}

function surfaceGoalDraft(state: GameState, zone: ZoneDefinition, targetRate: number): GuidanceDraft {
  const cleaned = zone.targets.filter((target) => targetState(state, zone.id, target.id)?.surfaceCleaned).length;
  const required = Math.ceil(zone.targets.length * targetRate);
  const target = firstUncleanTarget(state, zone);
  const openingPath = targetRate < 1;
  return {
    id: `${openingPath ? "open-path" : "finish-surface"}-${zone.id}`,
    mood: "hopeful",
    thought: stablePick(dialogue.openPath, `${state.day}:${zone.id}`),
    detail: openingPath
      ? `${zone.name}의 통행 흔적 ${required}곳 중 ${cleaned}곳을 정리했어. ${required - cleaned}곳만 더 치우면 다음 배관이 열려.`
      : `${zone.name}의 통행 흔적 ${required}곳 중 ${cleaned}곳을 정리했어. ${required - cleaned}곳만 더 닦으면 이 관 전체가 환해져.`,
    destination: {
      scene: "workplace",
      label: `${zone.name}으로 가기`,
      zoneId: zone.id,
      focusId: target?.id,
    },
  };
}

function firstAffordableBuilding(state: GameState): { slot: HouseSlotDefinition; building: BuildingDefinition } | undefined {
  const candidates = maps.homeSlots
    .filter((slot) => state.houseSlots[slot.id] === null)
    .flatMap((slot) => slot.buildingOptions.map((buildingId) => ({
      slot,
      building: buildings.find((building) => building.id === buildingId),
    })))
    .filter((entry): entry is { slot: HouseSlotDefinition; building: BuildingDefinition } => Boolean(entry.building));
  return candidates
    .filter(({ building }) => needsForCosts(state, building.cost).length === 0)
    .sort((left, right) => right.building.happiness - left.building.happiness)[0];
}

function buildingGoalDraft(state: GameState): GuidanceDraft {
  const candidates = maps.homeSlots
    .filter((slot) => state.houseSlots[slot.id] === null)
    .flatMap((slot) => slot.buildingOptions.map((buildingId) => {
      const building = buildings.find((candidate) => candidate.id === buildingId);
      const needs = building ? needsForCosts(state, building.cost) : [];
      return { slot, building, needs, missing: needs.reduce((sum, need) => sum + need.missing, 0) };
    }))
    .filter((entry): entry is { slot: HouseSlotDefinition; building: BuildingDefinition; needs: QuokkaNeed[]; missing: number } => Boolean(entry.building))
    .sort((left, right) => left.missing - right.missing || right.building.happiness - left.building.happiness);
  const candidate = candidates[0];
  if (!candidate) return freePlayDraft(state);
  if (candidate.needs.length > 0) return guideForMaterialNeed(state, candidate.building.name, candidate.needs);
  return {
    id: `build-${candidate.slot.id}`,
    mood: "proud",
    thought: stablePick(dialogue.build, `${state.day}:${candidate.slot.id}`),
    detail: `${candidate.building.name}을 놓으면 포근함이 ${candidate.building.happiness}만큼 자라. 재료는 나중에 전부 회수할 수도 있어.`,
    destination: { scene: "home", label: `${candidate.building.name} 놓기`, focusId: candidate.slot.id },
  };
}

function recipeDiscoveryDraft(state: GameState): GuidanceDraft | undefined {
  const mixture = recipes.find((recipe) => recipe.kind === "mixture" && !state.discoveredRecipes.includes(recipe.id));
  if (!mixture) return undefined;
  const relevant = dirtDefinitions.flatMap((dirt) => dirt.layers
    .filter((layer) => layer.requiredSolutionId === mixture.outputId)
    .map((layer) => ({ dirt, layer })));
  for (const { dirt, layer } of relevant) {
    for (const zone of maps.zones) {
      if (!state.unlockedZones.includes(zone.id)) continue;
      const target = zone.targets.find((candidate) => candidate.dirtTypeId === dirt.id
        && (targetState(state, zone.id, candidate.id)?.deepestLayer ?? 0) < layer.level);
      if (!target) continue;
      const progress = targetState(state, zone.id, target.id);
      if (!progress) continue;
      if (progress.deepestLayer === layer.level - 1) return guideForSolution(state, mixture.outputId, 0);
      const nextLevel = progress.surfaceCleaned ? progress.deepestLayer + 1 : 1;
      const nextLayer = dirt.layers.find((candidate) => candidate.level === nextLevel);
      if (nextLayer && state.cleanerLevel < nextLayer.requiredCleanerLevel) {
        return guideForUpgrade(state, nextLayer.requiredCleanerLevel, 0);
      }
      if (nextLayer?.requiredSolutionId && (state.preparedSolutions[nextLayer.requiredSolutionId] ?? 0) <= 0) {
        return guideForSolution(state, nextLayer.requiredSolutionId, 0);
      }
      return {
        id: `expose-${mixture.id}-${target.id}`,
        mood: "curious",
        thought: stablePick(dialogue.cleanDeep, `${state.day}:${mixture.id}`),
        detail: `${dirt.name} 안쪽을 ${layer.level - progress.deepestLayer}번 더 살펴보면 새로운 세정액 단서를 맡을 수 있어. 정답은 그 층을 본 뒤 수첩에 적어 둘게.`,
        destination: { scene: "workplace", label: `${zone.name}에서 단서 찾기`, zoneId: zone.id, focusId: target.id },
      };
    }
  }
  return guideForSolution(state, mixture.outputId, 0);
}

function freePlayDraft(state: GameState): GuidanceDraft {
  return {
    id: "free-play",
    mood: "proud",
    thought: stablePick(dialogue.complete, `${state.day}:complete`),
    detail: "남은 깊은 층을 청소하거나 집 모양을 바꿔도 좋아. 이제 정해진 순서보다 마음 가는 냄새를 따라가자.",
    destination: { scene: "home", label: "우리 집 둘러보기" },
  };
}

function guidanceForIntent(state: GameState, intent: GameCommand): GuidanceDraft | undefined {
  switch (intent.type) {
    case "BUILD_HOUSE": {
      const building = buildings.find((candidate) => candidate.id === intent.buildingId);
      if (!building) return undefined;
      const needs = needsForCosts(state, building.cost);
      if (needs.length > 0) return guideForMaterialNeed(state, building.name, needs);
      return {
        id: `build-${intent.slotId}`,
        mood: "hopeful",
        thought: stablePick(dialogue.build, `${state.day}:${intent.slotId}`),
        detail: `${building.name} 재료를 모두 챙겼어. 방금 고른 자리에 놓아 보자.`,
        destination: { scene: "home", label: `${building.name} 놓기`, focusId: intent.slotId },
      };
    }
    case "CRAFT_RECIPE": {
      const recipe = recipes.find((candidate) => candidate.id === intent.recipeId);
      if (!recipe) return undefined;
      const needs = needsForCosts(state, recipe.costs ?? []);
      if (needs.length > 0) return guideForMaterialNeed(state, recipe.name, needs);
      return {
        id: `make-${recipe.id}`,
        mood: "hopeful",
        thought: replaceTokens(stablePick(dialogue.make, `${state.day}:${recipe.id}`), { goal: recipe.name }),
        detail: `${recipe.name}에 필요한 것은 다 모였어. 작업대에서 다시 손을 움직여 보자.`,
        destination: { scene: "workshop", label: `${recipe.name} 만들기`, focusId: recipe.id },
      };
    }
    case "CRAFT_ACCESSORY": {
      const accessory = accessories.find((candidate) => candidate.id === intent.accessoryId);
      return accessory ? guideForAccessory(state, accessory, 0) : undefined;
    }
    case "EQUIP_ACCESSORY": {
      const accessory = accessories.find((candidate) => candidate.id === intent.accessoryId);
      if (!accessory) return undefined;
      return {
        id: `equip-${accessory.id}`,
        mood: "curious",
        thought: `${accessory.name}을 챙기려고 했지. 작업대에 잘 보이게 표시해 둘게.`,
        detail: accessory.description,
        destination: { scene: "workshop", label: `${accessory.name} 장착하기`, focusId: accessory.id },
      };
    }
    case "CLEAN_DIRT": {
      const zone = maps.zones.find((candidate) => candidate.id === intent.zoneId);
      const target = zone?.targets.find((candidate) => candidate.id === intent.targetId);
      const dirt = dirtDefinitions.find((candidate) => candidate.id === target?.dirtTypeId);
      const progress = target && zone ? targetState(state, zone.id, target.id) : undefined;
      if (!zone || !target || !dirt || !progress || !progress.surfaceCleaned) return undefined;
      const layer = dirt.layers.find((candidate) => candidate.level === progress.deepestLayer + 1);
      if (!layer) return undefined;
      if (state.cleanerLevel < layer.requiredCleanerLevel) return guideForUpgrade(state, layer.requiredCleanerLevel, 0);
      if (layer.requiredAccessoryId && !state.equippedAccessories.includes(layer.requiredAccessoryId)) {
        const accessory = accessories.find((candidate) => candidate.id === layer.requiredAccessoryId);
        return accessory ? guideForAccessory(state, accessory, 0) : undefined;
      }
      if (layer.requiredSolutionId) {
        if ((state.preparedSolutions[layer.requiredSolutionId] ?? 0) <= 0) {
          return guideForSolution(state, layer.requiredSolutionId, 0);
        }
        return {
          id: `select-${layer.requiredSolutionId}`,
          mood: "curious",
          thought: `${recipeName(layer.requiredSolutionId)}은 이미 챙겨 뒀어. 배관에서 병을 골라 다시 가 보자.`,
          detail: `${layer.name}에는 ${recipeName(layer.requiredSolutionId)}이 필요해. 위쪽 세정액 버튼을 눌러 준비한 병을 선택하면 돼.`,
          destination: {
            scene: "workplace",
            label: `${zone.name}에서 세정액 고르기`,
            zoneId: zone.id,
            focusId: target.id,
          },
        };
      }
      return {
        id: `return-${target.id}-${layer.level}`,
        mood: "curious",
        thought: `${layer.name} 냄새를 기억했어. 표시한 곳으로 다시 가자.`,
        detail: layer.hint,
        destination: { scene: "workplace", label: `${zone.name}으로 돌아가기`, zoneId: zone.id, focusId: target.id },
      };
    }
    default:
      return undefined;
  }
}

function selectGuidance(state: GameState, context: GuidanceContext): GuidanceDraft {
  if (state.gameCompleted) return freePlayDraft(state);
  if (context.scene === "home" && state.dayPhase === "evening") {
    const affordable = firstAffordableBuilding(state);
    if (affordable) {
      return {
        id: `evening-build-${affordable.slot.id}`,
        mood: "proud",
        thought: `${affordable.building.name} 재료가 가방 안에서 바스락거려. 잠들기 전에 같이 놓아 볼까?`,
        detail: `오늘 모은 것으로 바로 지을 수 있어. 완성하면 포근함이 ${affordable.building.happiness}만큼 자라고, 그 기분은 내일 활동력으로 이어져.`,
        destination: { scene: "home", label: `${affordable.building.name} 함께 짓기`, focusId: affordable.slot.id },
      };
    }
    return {
      id: "evening-rest",
      mood: "restful",
      thought: "오늘 몫은 다 해냈어. 가방을 내려놓고 이제 푹 쉬자.",
      detail: "지금 바로 지을 수 있는 집 부품은 없어. 한숨 자고 나면 활동력이 채워지고 집 앞 잔해도 다시 모일 거야.",
      destination: { scene: "home", label: "포근하게 잠들기", focusId: "rest" },
    };
  }
  if (context.intent) {
    const intentGuide = guidanceForIntent(state, context.intent);
    if (intentGuide) return intentGuide;
  }

  const cleanedSurface = maps.zones.reduce((sum, zone) => sum + zone.targets.filter(
    (target) => targetState(state, zone.id, target.id)?.surfaceCleaned,
  ).length, 0);
  if (cleanedSurface === 0) {
    const zone = maps.zones[0];
    const target = zone?.targets[0];
    return {
      id: "first-clean",
      mood: "curious",
      thought: stablePick(dialogue.firstClean, `${state.day}:first`),
      detail: "오염물을 누르면 내가 가까이 걸어가서 표면을 정리해. 첫 냄새는 배관 입구에서 시작하자.",
      destination: { scene: "workplace", label: "첫 냄새 따라가기", zoneId: zone?.id, focusId: target?.id },
    };
  }

  if (state.happiness < 5 && context.scene === "home") {
    const affordable = firstAffordableBuilding(state);
    if (affordable) {
      return {
        id: `build-${affordable.slot.id}`,
        mood: "proud",
        thought: stablePick(dialogue.build, `${state.day}:${affordable.slot.id}`),
        detail: `${affordable.building.name} 재료가 모였어. 처음 놓는 집 한 조각이 내일의 활동력도 키워 줄 거야.`,
        destination: { scene: "home", label: `${affordable.building.name} 놓기`, focusId: affordable.slot.id },
      };
    }
  }

  if (state.cleanerLevel < 2) return guideForUpgrade(state, 2, 0);

  for (const zone of maps.zones) {
    if (!state.unlockedZones.includes(zone.id)) continue;
    const required = Math.ceil(zone.targets.length * zone.unlockSurfaceRate);
    const cleaned = zone.targets.filter((target) => targetState(state, zone.id, target.id)?.surfaceCleaned).length;
    const needsPath = Boolean(zone.nextZoneIds?.some((nextZoneId) => !state.unlockedZones.includes(nextZoneId)));
    if (needsPath && cleaned < required) return surfaceGoalDraft(state, zone, zone.unlockSurfaceRate);
  }

  if (state.cleanerLevel < 3) return guideForUpgrade(state, 3, 0);

  if (state.discoveredRecipes.length < 5) {
    const recipeGuide = recipeDiscoveryDraft(state);
    if (recipeGuide) return recipeGuide;
  }

  for (const zone of maps.zones) {
    if (!state.unlockedZones.includes(zone.id) || isCoreTargetComplete(state, zone)) continue;
    const target = zone.targets.find((candidate) => candidate.id === zone.completionTargetId);
    if (!target) continue;
    const intentGuide = guidanceForIntent(state, {
      type: "CLEAN_DIRT",
      zoneId: zone.id,
      targetId: target.id,
    });
    if (intentGuide) return intentGuide;
  }

  for (const zone of maps.zones) {
    if (surfaceCleaningRate(state, zone.id) < 1) return surfaceGoalDraft(state, zone, 1);
  }

  if (state.happiness < 48) return buildingGoalDraft(state);

  return {
    id: "finish-together",
    mood: "proud",
    thought: "우리 집도 배관도 준비됐어. 오늘을 마치고 천천히 둘러보자.",
    detail: "끝 배관, 청소기, 조합 수첩, 집의 포근함이 모두 채워졌어. 한 번 쉬면 우리가 만든 터전을 볼 수 있어.",
    destination: { scene: "home", label: "집에서 오늘 마치기", focusId: "rest" },
  };
}

export function getQuokkaGuidance(state: GameState, context: GuidanceContext): QuokkaGuidance {
  const draft = selectGuidance(state, context);
  const suggestions = [draft.destination];
  const exactOnly = context.recentEventType === "RULE_REJECTED" || draft.id === "first-clean" || state.dayPhase === "evening";
  if (!exactOnly) {
    const alternative: GuidanceDestination = draft.destination.scene === "home"
      ? {
        scene: "workplace",
        label: "마음 가는 배관 둘러보기",
        zoneId: state.unlockedZones.at(-1) ?? "pipe-entrance",
      }
      : {
        scene: "home",
        label: "집을 천천히 돌보기",
      };
    suggestions.push(alternative);
  }
  return {
    ...draft,
    memory: memoryLine(state, context),
    needs: draft.needs ?? [],
    suggestions,
    dreams: allDreams(state),
  };
}
