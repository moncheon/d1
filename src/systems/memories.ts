import memoriesJson from "../data/quokka-memories.json";
import mapsJson from "../data/maps.json";
import buildingsJson from "../data/buildings.json";
import type { GameEvent } from "../core/events";
import { gameEvent } from "../core/events";
import type { GameState } from "../core/gameState";
import type { BuildingDefinition, HouseAnchorDefinition } from "../entities/types";

export interface QuokkaMemoryDefinition {
  id: string;
  title: string;
  text: string;
  pose: number;
}

export const memoryDefinitions = memoriesJson as QuokkaMemoryDefinition[];
const homeAnchors = (mapsJson as unknown as { homeAnchors: HouseAnchorDefinition[] }).homeAnchors;
const buildings = buildingsJson as unknown as BuildingDefinition[];

function hasMemory(state: GameState, id: string): boolean {
  return state.memories.some((entry) => entry.id === id);
}

function unlock(state: GameState, id: string): GameEvent | undefined {
  if (hasMemory(state, id)) return undefined;
  const definition = memoryDefinitions.find((candidate) => candidate.id === id);
  if (!definition) return undefined;
  state.memories.push({ id, day: state.day });
  return gameEvent("MEMORY_UNLOCKED", `새 추억: ${definition.title}`, {
    memoryId: id,
    day: state.day,
  });
}

export function reconcileMemories(state: GameState, events: GameEvent[]): GameEvent[] {
  const unlocked: GameEvent[] = [];
  const add = (id: string): void => {
    const event = unlock(state, id);
    if (event) unlocked.push(event);
  };

  for (const event of events) {
    if (event.type === "DIRT_CLEANED" && event.data.zoneId !== "home") add("first-clean");
    if (event.type === "HOUSE_BUILT") add("first-home");
    if (event.type === "RECIPE_DISCOVERED") add("first-recipe");
    if (event.type === "DIRT_CLEANED" || event.type === "DEEP_LAYER_CLEANED") {
      if (event.data.zoneId === "curved-drain") add("organic-route");
      if (event.data.zoneId === "blocked-connector") add("mineral-route");
    }
    if (event.type === "HOME_COMPLETED") add("home-complete");
    if (event.type === "STEP_ONE_COMPLETED") add("step-one");
    if (event.type === "DAY_ENDED") {
      const hasBed = homeAnchors.some((anchor) => {
        if (anchor.category !== "bed") return false;
        const building = buildings.find((candidate) => candidate.id === state.homeAnchors[anchor.id]);
        return building?.category === "bed";
      });
      if (hasBed) add("first-bed-sleep");
    }
  }
  return unlocked;
}
