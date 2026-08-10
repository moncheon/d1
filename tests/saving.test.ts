import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../src/core/gameState";
import {
  BrowserSaveRepository,
  type KeyValueStorage,
} from "../src/systems/saving";

class FakeStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  public removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("browser save repository", () => {
  it("round-trips a versioned save", () => {
    const repository = new BrowserSaveRepository(new FakeStorage());
    const state = createInitialGameState();
    state.day = 4;
    state.inventory.leaf = 17;
    repository.save(state);

    expect(repository.load()).toMatchObject({
      saveVersion: 7,
      introCompleted: false,
      day: 4,
      inventory: { leaf: 17 },
    });
  });

  it("rejects malformed JSON instead of crashing", () => {
    const storage = new FakeStorage();
    storage.setItem(BrowserSaveRepository.SAVE_KEY, "{not json");

    expect(new BrowserSaveRepository(storage).load()).toBeNull();
  });

  it("rejects an unknown save version", () => {
    const storage = new FakeStorage();
    storage.setItem(BrowserSaveRepository.SAVE_KEY, JSON.stringify({ saveVersion: 999 }));

    expect(new BrowserSaveRepository(storage).load()).toBeNull();
  });

  it("migrates a version one save without losing progress", () => {
    const storage = new FakeStorage();
    const legacy = createInitialGameState();
    legacy.saveVersion = 1;
    legacy.day = 7;
    legacy.inventory.soil = 12;
    const legacyShape = { ...legacy } as Record<string, unknown>;
    delete legacyShape.ownedAccessories;
    delete legacyShape.preparedSolutions;
    delete legacyShape.mixtureAttempts;
    delete legacyShape.gameCompleted;
    storage.setItem(BrowserSaveRepository.SAVE_KEY, JSON.stringify(legacyShape));

    const loaded = new BrowserSaveRepository(storage).load();
    expect(loaded).toMatchObject({ saveVersion: 7, protagonistName: "", introCompleted: true, day: 7, dayPhase: "working", inventory: { soil: 12 } });
    expect(loaded?.ownedAccessories).toEqual([]);
    expect(loaded?.preparedSolutions).toEqual({});
  });

  it("migrates an exhausted version two save into the evening before sleep", () => {
    const storage = new FakeStorage();
    const legacy = { ...createInitialGameState(), saveVersion: 2, currentActivity: 0 };
    const legacyShape = { ...legacy } as Record<string, unknown>;
    delete legacyShape.dayPhase;
    storage.setItem(BrowserSaveRepository.SAVE_KEY, JSON.stringify(legacyShape));

    expect(new BrowserSaveRepository(storage).load()).toMatchObject({
      saveVersion: 7,
      introCompleted: true,
      currentActivity: 0,
      dayPhase: "evening",
    });
  });

  it("merges newly introduced data targets into an older valid save", () => {
    const storage = new FakeStorage();
    storage.setItem(BrowserSaveRepository.SAVE_KEY, JSON.stringify({
      ...createInitialGameState(),
      zoneCleaningState: {},
    }));

    const loaded = new BrowserSaveRepository(storage).load();
    expect(loaded?.zoneCleaningState["pipe-entrance"]?.targets["entrance-01"]).toBeDefined();
  });

  it("migrates version three saves with memories and comfort settings", () => {
    const storage = new FakeStorage();
    const legacy = createInitialGameState();
    legacy.saveVersion = 3;
    const legacyShape = { ...legacy } as Record<string, unknown>;
    delete legacyShape.memories;
    delete legacyShape.cleaningStats;
    delete legacyShape.preferences;
    storage.setItem(BrowserSaveRepository.SAVE_KEY, JSON.stringify(legacyShape));

    const loaded = new BrowserSaveRepository(storage).load();
    expect(loaded).toMatchObject({
      saveVersion: 7,
      introCompleted: true,
      memories: [],
      preferences: { masterVolume: 0.7, reducedMotion: false, simpleCleaning: false },
    });
  });

  it("migrates the twenty-slot v4 home into nine anchors and refunds overflow", () => {
    const storage = new FakeStorage();
    const legacy = {
      ...createInitialGameState(),
      saveVersion: 4,
      inventory: {},
      houseSlots: {
        "bed-1": "leaf_bed",
        "wall-1": "shrub_wall",
        "wall-2": "woven_wall",
        "wall-3": "shrub_wall",
        "wall-4": "shrub_wall",
        "roof-1": "leaf_roof",
        "roof-2": "leaf_roof",
        "roof-3": "leaf_roof",
        "path-1": "dirt_path",
        "path-2": "dirt_path",
        "path-3": "dirt_path",
        "path-4": "dirt_path",
        "path-5": "dirt_path",
        "flower-1": "sprout_bed",
        "flower-2": "sprout_bed",
        "flower-3": "sprout_bed",
        "decor-1": "moss_decor",
        "decor-2": "moss_decor",
        "decor-3": "moss_decor",
        "decor-4": "moss_decor",
      },
      homeCompletionCelebrated: true,
    } as Record<string, unknown>;
    delete legacy.homeAnchors;
    storage.setItem(BrowserSaveRepository.SAVE_KEY, JSON.stringify(legacy));

    const loaded = new BrowserSaveRepository(storage).load();

    expect(loaded).toMatchObject({
      saveVersion: 7,
      introCompleted: true,
      homeAnchors: {
        "rest-nook": "leaf_bed",
        "shell-left": "woven_wall",
        "shell-back": "shrub_wall",
        "shell-right": "shrub_wall",
        "canopy-top": "leaf_roof",
        threshold: "dirt_path",
        "garden-pocket": "sprout_bed",
        "charm-left": "moss_decor",
        "charm-right": "moss_decor",
      },
      inventory: { leaf: 12, grass: 22, soil: 22, seed: 2, moss: 2 },
      happiness: 45,
      homeCompletionCelebrated: true,
    });
    const persisted = JSON.parse(storage.getItem(BrowserSaveRepository.SAVE_KEY) ?? "{}") as Record<string, unknown>;
    expect(persisted.saveVersion).toBe(7);
    expect(persisted.houseSlots).toBeUndefined();
  });

  it("migrates a version five save without losing its nine-anchor home", () => {
    const storage = new FakeStorage();
    const legacy = createInitialGameState();
    legacy.saveVersion = 5;
    legacy.day = 11;
    legacy.homeAnchors["rest-nook"] = "leaf_bed";
    legacy.homeAnchors["shell-back"] = "shrub_wall";
    const legacyShape = { ...legacy } as Record<string, unknown>;
    delete legacyShape.protagonistName;
    storage.setItem(BrowserSaveRepository.SAVE_KEY, JSON.stringify(legacyShape));

    expect(new BrowserSaveRepository(storage).load()).toMatchObject({
      saveVersion: 7,
      introCompleted: true,
      protagonistName: "",
      day: 11,
      homeAnchors: {
        "rest-nook": "leaf_bed",
        "shell-back": "shrub_wall",
      },
    });
  });

  it("migrates a version six save without replaying the new opening story", () => {
    const storage = new FakeStorage();
    const legacy = createInitialGameState();
    legacy.saveVersion = 6;
    legacy.day = 14;
    legacy.homeAnchors["rest-nook"] = "moss_nest";
    const legacyShape = { ...legacy } as Record<string, unknown>;
    delete legacyShape.introCompleted;
    storage.setItem(BrowserSaveRepository.SAVE_KEY, JSON.stringify(legacyShape));

    expect(new BrowserSaveRepository(storage).load()).toMatchObject({
      saveVersion: 7,
      introCompleted: true,
      day: 14,
      homeAnchors: { "rest-nook": "moss_nest" },
    });
  });
});
