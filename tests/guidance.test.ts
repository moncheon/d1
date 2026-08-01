import { describe, expect, it } from "vitest";
import mapsJson from "../src/data/maps.json";
import { createInitialGameState, type GameState } from "../src/core/gameState";
import type { ZoneDefinition } from "../src/entities/types";
import { getQuokkaGuidance } from "../src/systems/guidance";

const zones = (mapsJson as unknown as { zones: ZoneDefinition[] }).zones;

function cleanSurface(state: GameState, zoneId: string, count: number): void {
  const zone = zones.find((candidate) => candidate.id === zoneId);
  if (!zone) throw new Error(`fixture zone missing: ${zoneId}`);
  zone.targets.slice(0, count).forEach((target) => {
    const progress = state.zoneCleaningState[zoneId]?.targets[target.id];
    if (!progress) throw new Error(`fixture target missing: ${target.id}`);
    progress.surfaceCleaned = true;
    progress.deepestLayer = Math.max(1, progress.deepestLayer);
  });
}

function openAllPaths(state: GameState): void {
  state.unlockedZones = ["pipe-entrance", "curved-drain", "blocked-connector"];
  cleanSurface(state, "pipe-entrance", 6);
  cleanSurface(state, "curved-drain", 8);
  cleanSurface(state, "blocked-connector", 9);
}

describe("Quokka guidance", () => {
  it("starts with one embodied first-clean action", () => {
    const guidance = getQuokkaGuidance(createInitialGameState(), { scene: "home" });

    expect(guidance.id).toBe("first-clean");
    expect(guidance.destination).toMatchObject({
      scene: "workplace",
      zoneId: "pipe-entrance",
      focusId: "entrance-01",
    });
    expect(guidance.thought).not.toContain("퀘스트");
  });

  it("shows exact shortage and an obtainable source", () => {
    const state = createInitialGameState();
    cleanSurface(state, "pipe-entrance", 1);
    state.dailyLeafPileRemaining = 0;
    state.inventory = { leaf: 5, grass: 6 };

    const guidance = getQuokkaGuidance(state, { scene: "workplace", zoneId: "pipe-entrance" });

    expect(guidance.needs[0]).toMatchObject({
      itemId: "leaf",
      current: 5,
      required: 6,
      missing: 1,
    });
    expect(guidance.needs[0]?.sources.some((source) => source.includes("젖은 낙엽 더미 표면"))).toBe(true);
    expect(guidance.destination.scene).toBe("workplace");
  });

  it("remembers the remaining surface count for opening a path", () => {
    const state = createInitialGameState();
    state.cleanerLevel = 2;
    cleanSurface(state, "pipe-entrance", 5);

    const guidance = getQuokkaGuidance(state, { scene: "workplace", zoneId: "pipe-entrance" });

    expect(guidance.id).toBe("open-path-pipe-entrance");
    expect(guidance.detail).toContain("1곳만 더");
    expect(guidance.destination.focusId).toBe("entrance-06");
  });

  it("routes a cleaner upgrade shortage to the correct deep-layer source", () => {
    const state = createInitialGameState();
    state.cleanerLevel = 2;
    openAllPaths(state);
    state.inventory = { soil: 10 };
    const target = state.zoneCleaningState["pipe-entrance"]?.targets["entrance-01"];
    if (!target) throw new Error("fixture target missing");
    target.surfaceCleaned = true;
    target.deepestLayer = 1;

    const guidance = getQuokkaGuidance(state, { scene: "workplace", zoneId: "blocked-connector" });

    expect(guidance.needs[0]).toMatchObject({ itemId: "fiber", required: 2, missing: 2 });
    expect(guidance.needs[0]?.sources.some((source) => source.includes("눌린 섬유층 2층"))).toBe(true);
    expect(guidance.destination).toMatchObject({ scene: "workplace", focusId: "entrance-01" });
  });

  it("reveals and remembers an exact mixture only after its layer is exposed", () => {
    const state = createInitialGameState();
    state.cleanerLevel = 3;
    openAllPaths(state);
    state.preparedLiquids.leaf_enzyme = 2;
    const target = state.zoneCleaningState["pipe-entrance"]?.targets["entrance-01"];
    if (!target) throw new Error("fixture target missing");
    target.surfaceCleaned = true;
    target.deepestLayer = 2;

    const guidance = getQuokkaGuidance(state, { scene: "workplace", zoneId: "pipe-entrance" });

    expect(guidance.id).toBe("mix-compressed_leaf_mix");
    expect(guidance.detail).toContain("잎 효소 + 잎 효소 + 물");
    expect(guidance.destination).toMatchObject({ scene: "workshop", focusId: "mixer" });
    expect(guidance.destination.ingredients).toEqual(["leaf_enzyme", "leaf_enzyme", "water"]);
  });

  it("turns shared home history into a remembered thought", () => {
    const state = createInitialGameState();
    cleanSurface(state, "pipe-entrance", 1);
    state.houseSlots["bed-1"] = "leaf_bed";

    const guidance = getQuokkaGuidance(state, { scene: "home" });

    expect(guidance.memory).toContain("낙엽 침대");
  });

  it("turns a failed building attempt into exact material guidance", () => {
    const state = createInitialGameState();
    cleanSurface(state, "pipe-entrance", 1);
    state.dailyLeafPileRemaining = 0;
    state.inventory = { leaf: 2, grass: 1 };

    const guidance = getQuokkaGuidance(state, {
      scene: "home",
      recentEventType: "RULE_REJECTED",
      intent: { type: "BUILD_HOUSE", slotId: "bed-1", buildingId: "leaf_bed" },
    });

    expect(guidance.needs).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: "leaf", current: 2, required: 4, missing: 2 }),
      expect.objectContaining({ itemId: "grass", current: 1, required: 2, missing: 1 }),
    ]));
    expect(guidance.thought).toContain("낙엽 침대");
  });

  it("remembers a prepared solution when the player forgot to select it", () => {
    const state = createInitialGameState();
    state.cleanerLevel = 3;
    state.preparedSolutions.compressed_leaf_solution = 1;
    const target = state.zoneCleaningState["pipe-entrance"]?.targets["entrance-01"];
    if (!target) throw new Error("fixture target missing");
    target.surfaceCleaned = true;
    target.deepestLayer = 2;

    const guidance = getQuokkaGuidance(state, {
      scene: "workplace",
      zoneId: "pipe-entrance",
      recentEventType: "RULE_REJECTED",
      intent: { type: "CLEAN_DIRT", zoneId: "pipe-entrance", targetId: "entrance-01" },
    });

    expect(guidance.id).toBe("select-compressed_leaf_solution");
    expect(guidance.detail).toContain("세정액 버튼");
    expect(guidance.destination).toMatchObject({ scene: "workplace", focusId: "entrance-01" });
  });

  it("stops directing the player after completion", () => {
    const state = createInitialGameState();
    state.gameCompleted = true;

    const guidance = getQuokkaGuidance(state, { scene: "home" });

    expect(guidance.id).toBe("free-play");
    expect(guidance.mood).toBe("proud");
    expect(guidance.destination.scene).toBe("home");
  });
});
