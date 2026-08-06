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
  "WORK_ENDED",
  "HOME_COMPLETED",
  "STEP_ONE_COMPLETED",
  "MEMORY_UNLOCKED",
  "PREFERENCES_UPDATED",
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

export function trackGuidanceInteraction(
  action: "opened" | "followed",
  guidanceId: string,
  scene: string,
  state: Readonly<GameState>,
): void {
  console.info("[telemetry]", {
    event: `guidance_${action}`,
    guidanceId,
    scene,
    day: state.day,
    activity: state.currentActivity,
  });
}
