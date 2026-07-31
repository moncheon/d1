import recipesJson from "../data/recipes.json";
import type { GameState } from "../core/gameState";
import { GameRuleError } from "../core/errors";
import { gameEvent, type GameEvent } from "../core/events";
import type { LiquidId, RecipeDefinition } from "../entities/types";
import { spendItems } from "./inventory";

const recipes = recipesJson as unknown as RecipeDefinition[];

export function craftRecipe(state: GameState, recipeId: string): GameEvent[] {
  if (state.currentActivity <= 0) {
    throw new GameRuleError("NO_ACTIVITY", "제작할 활동력이 없습니다.");
  }
  const recipe = recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe || recipe.kind === "mixture") {
    throw new GameRuleError("RECIPE_UNAVAILABLE", "이 항목은 세 방울 조합대에서 만듭니다.");
  }

  if (recipe.kind === "cleaner_upgrade") {
    if (recipe.cleanerLevel !== state.cleanerLevel + 1) {
      throw new GameRuleError("UPGRADE_ORDER", "청소기를 순서대로 강화해야 합니다.");
    }
    spendItems(state, recipe.costs ?? []);
    state.cleanerLevel = recipe.cleanerLevel;
  } else {
    spendItems(state, recipe.costs ?? []);
    const liquidId = recipe.outputId as LiquidId;
    state.preparedLiquids[liquidId] = (state.preparedLiquids[liquidId] ?? 0) + recipe.outputAmount;
  }

  state.currentActivity -= 1;
  return [
    gameEvent("ITEM_CRAFTED", `${recipe.name} 제작 완료!`, {
      recipeId,
      outputId: recipe.outputId,
      outputAmount: recipe.outputAmount,
    }),
    gameEvent("ACTIVITY_CHANGED", `활동력 ${state.currentActivity} 남음`, {
      currentActivity: state.currentActivity,
      maxActivity: state.maxActivity,
    }),
  ];
}

const liquidIds = new Set<LiquidId>(["water", "leaf_enzyme", "grass_ferment", "clay_binder"]);

function canonicalIngredients(ingredients: LiquidId[]): string {
  return [...ingredients].sort().join("|");
}

function failureFeedback(ingredients: LiquidId[]): string {
  const active = ingredients.filter((ingredient) => ingredient !== "water");
  if (active.length === 0) return "반응 없음: 물만으로는 깊은 층을 바꿀 수 없습니다.";
  if (active.length === 3) return "액체가 너무 진함: 물 한 방울로 농도를 낮춰 보세요.";
  if (new Set(active).size === 1) return "유기물 반응이 부족함: 같은 성분 두 방울과 물을 시험해 보세요.";
  return "일부 반응만 보임: 오염물의 색과 재질에 맞는 두 성분을 골라 보세요.";
}

export function mixLiquids(state: GameState, rawIngredients: string[]): GameEvent[] {
  if (state.currentActivity <= 0) {
    throw new GameRuleError("NO_ACTIVITY", "배합을 시험할 활동력이 없습니다.");
  }
  if (rawIngredients.length !== 3 || rawIngredients.some((id) => !liquidIds.has(id as LiquidId))) {
    throw new GameRuleError("INVALID_MIXTURE", "물과 세정액 중 정확히 세 방울을 선택하세요.");
  }
  const ingredients = rawIngredients as LiquidId[];
  const required = new Map<LiquidId, number>();
  for (const ingredient of ingredients) {
    if (ingredient !== "water") required.set(ingredient, (required.get(ingredient) ?? 0) + 1);
  }
  for (const [liquidId, amount] of required) {
    if ((state.preparedLiquids[liquidId] ?? 0) < amount) {
      throw new GameRuleError("NOT_ENOUGH_LIQUID", "선택한 기초 세정액이 부족합니다.");
    }
  }
  for (const [liquidId, amount] of required) {
    state.preparedLiquids[liquidId] -= amount;
  }

  const recipe = recipes.find(
    (candidate) => candidate.kind === "mixture"
      && candidate.ingredients
      && canonicalIngredients(candidate.ingredients) === canonicalIngredients(ingredients),
  );
  state.currentActivity -= 1;
  state.mixtureAttempts.push({
    ingredients: [...ingredients],
    recipeId: recipe?.id ?? null,
    success: Boolean(recipe),
    day: state.day,
  });
  state.mixtureAttempts = state.mixtureAttempts.slice(-50);

  const events: GameEvent[] = [
    gameEvent("MIXTURE_ATTEMPTED", recipe ? `${recipe.name} 배합에 성공했습니다!` : failureFeedback(ingredients), {
      ingredients,
      success: Boolean(recipe),
      recipeId: recipe?.id ?? null,
    }),
  ];
  if (recipe) {
    state.preparedSolutions[recipe.outputId] = (state.preparedSolutions[recipe.outputId] ?? 0) + recipe.outputAmount;
    if (!state.discoveredRecipes.includes(recipe.id)) {
      state.discoveredRecipes.push(recipe.id);
      events.push(gameEvent("RECIPE_DISCOVERED", `새 레시피 발견: ${recipe.name}`, {
        recipeId: recipe.id,
        outputId: recipe.outputId,
      }));
    }
  }
  events.push(gameEvent("ACTIVITY_CHANGED", `활동력 ${state.currentActivity} 남음`, {
    currentActivity: state.currentActivity,
    maxActivity: state.maxActivity,
  }));
  return events;
}
