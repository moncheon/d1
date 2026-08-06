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
      saveVersion: 4,
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
    expect(loaded).toMatchObject({ saveVersion: 4, day: 7, dayPhase: "working", inventory: { soil: 12 } });
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
      saveVersion: 4,
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
      saveVersion: 4,
      memories: [],
      preferences: { masterVolume: 0.7, reducedMotion: false, simpleCleaning: false },
    });
  });
});
