import type { AnalyticsSink } from "../analytics/analytics";
import { NullAnalytics } from "../analytics/analytics";
import type { GameCommand } from "./commands";
import { GameRuleError } from "./errors";
import { gameEvent, type GameEvent } from "./events";
import {
  cloneGameState,
  createInitialGameState,
  type GameState,
} from "./gameState";
import { buildHousePart, removeHousePart } from "../systems/building";
import { cleanDirt, harvestDailyPile } from "../systems/cleaning";
import { craftRecipe, mixLiquids } from "../systems/crafting";
import { craftAccessory, equipAccessory } from "../systems/equipment";
import {
  activityForHappiness,
  isGameComplete,
  reconcileUnlockedZones,
} from "../systems/progression";
import type { SaveRepository } from "../systems/saving";

export interface GameEngineOptions {
  initialState?: GameState;
  saveRepository?: SaveRepository;
  analytics?: AnalyticsSink;
}

export class GameEngine {
  private state: GameState;
  private readonly saveRepository?: SaveRepository;
  private readonly analytics: AnalyticsSink;

  public constructor(options: GameEngineOptions = {}) {
    this.state = cloneGameState(options.initialState ?? createInitialGameState());
    this.saveRepository = options.saveRepository;
    this.analytics = options.analytics ?? new NullAnalytics();
    if (reconcileUnlockedZones(this.state).length > 0) {
      this.saveRepository?.save(this.state);
    }
  }

  public getState(): Readonly<GameState> {
    return this.state;
  }

  public snapshot(): GameState {
    return cloneGameState(this.state);
  }

  public dispatch(command: GameCommand): GameEvent[] {
    const before = cloneGameState(this.state);
    try {
      const events = this.execute(command);
      for (const unlock of reconcileUnlockedZones(this.state)) {
        events.push(gameEvent("ZONE_UNLOCKED", `${unlock.name}이 열렸습니다!`, {
          zoneId: unlock.zoneId,
          sourceZoneId: unlock.sourceZoneId,
          surfaceRate: unlock.surfaceRate,
        }));
      }
      const consumesActivity = events.some((event) => event.type === "ACTIVITY_CHANGED");
      if (consumesActivity && this.state.currentActivity === 0) {
        events.push(...this.endDay());
      }
      if (!this.state.gameCompleted && isGameComplete(this.state)) {
        this.state.gameCompleted = true;
        events.push(gameEvent("GAME_COMPLETED", "배관과 덤불집이 새로운 삶의 터전이 되었습니다!", {
          day: this.state.day,
          happiness: this.state.happiness,
        }));
      }
      if (this.saveRepository) {
        this.saveRepository.save(this.state);
        events.push(gameEvent("SAVE_COMPLETED", "진행 상황을 저장했습니다.", {
          saveVersion: this.state.saveVersion,
        }));
      }
      for (const event of events) this.analytics.track(event, this.state);
      return events;
    } catch (error) {
      this.state = before;
      if (error instanceof GameRuleError) {
        return [gameEvent("RULE_REJECTED", error.message, { code: error.code })];
      }
      throw error;
    }
  }

  private execute(command: GameCommand): GameEvent[] {
    switch (command.type) {
      case "CLEAN_DIRT":
        return cleanDirt(this.state, command.zoneId, command.targetId, command.solutionId);
      case "HARVEST_DAILY_PILE":
        return harvestDailyPile(this.state);
      case "BUILD_HOUSE":
        return buildHousePart(this.state, command.slotId, command.buildingId);
      case "REMOVE_HOUSE":
        return removeHousePart(this.state, command.slotId);
      case "CRAFT_RECIPE":
        return craftRecipe(this.state, command.recipeId);
      case "MIX_LIQUIDS":
        return mixLiquids(this.state, command.ingredients);
      case "CRAFT_ACCESSORY":
        return craftAccessory(this.state, command.accessoryId);
      case "EQUIP_ACCESSORY":
        return equipAccessory(this.state, command.accessoryId);
      case "END_DAY":
        return this.endDay();
    }
  }

  private endDay(): GameEvent[] {
    const previousMax = this.state.maxActivity;
    this.state.day += 1;
    this.state.maxActivity = activityForHappiness(this.state.happiness);
    this.state.currentActivity = this.state.maxActivity;
    this.state.dailyLeafPileRemaining = 2;

    return [
      gameEvent("DAY_ENDED", `${this.state.day}일 차 아침입니다.`, {
        day: this.state.day,
        previousMaxActivity: previousMax,
        maxActivity: this.state.maxActivity,
        happiness: this.state.happiness,
      }),
    ];
  }
}
