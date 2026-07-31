import type { GameEvent } from "../core/events";
import type { GameState } from "../core/gameState";

export interface AnalyticsSink {
  track(event: GameEvent, state: Readonly<GameState>): void;
}

const trackedEvents = new Set<GameEvent["type"]>([
  "DIRT_CLEANED",
  "DEEP_LAYER_CLEANED",
  "HOUSE_BUILT",
  "ITEM_CRAFTED",
  "RECIPE_DISCOVERED",
  "ACCESSORY_CRAFTED",
  "ZONE_UNLOCKED",
  "DAY_ENDED",
  "GAME_COMPLETED",
]);

export class ConsoleAnalytics implements AnalyticsSink {
  public track(event: GameEvent, state: Readonly<GameState>): void {
    if (!trackedEvents.has(event.type)) return;
    console.info("[telemetry]", {
      event: event.type.toLowerCase(),
      day: state.day,
      activity: state.currentActivity,
      ...event.data,
    });
  }
}

export class NullAnalytics implements AnalyticsSink {
  public track(): void {}
}
