import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../src/core/gameState";
import { BrowserGameSession, type SaveBundleV1 } from "../src/systems/gameSession";
import {
  BrowserPlayRecordRepository,
  MAX_HISTORY_ENTRIES,
} from "../src/systems/playRecords";
import { BrowserSaveRepository, type KeyValueStorage } from "../src/systems/saving";

class FakeStorage implements KeyValueStorage {
  public readonly values = new Map<string, string>();

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

class FailingOnceStorage extends FakeStorage {
  public failNextKey: string | null = null;

  public override setItem(key: string, value: string): void {
    if (key === this.failNextKey) {
      this.failNextKey = null;
      throw new Error("quota");
    }
    super.setItem(key, value);
  }
}

function clock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 7, 10, 0, 0, tick++)).toISOString();
}

describe("play record repository", () => {
  it("stores only major, privacy-safe context and keeps the newest 300 entries", () => {
    const storage = new FakeStorage();
    const records = new BrowserPlayRecordRepository(storage, clock());
    const state = createInitialGameState();

    for (let index = 0; index < 340; index += 1) {
      records.appendSystem("SESSION_STARTED", `세션 ${index}`, state);
    }
    records.appendGame({
      type: "DIRT_CLEANED",
      message: "표면을 청소했습니다.",
      data: { zoneId: "pipe-entrance", targetId: "entrance-01", password: "never-store-this" },
    }, state);
    records.appendGame({ type: "MATERIAL_GAINED", message: "반복 재료", data: { itemId: "leaf" } }, state);

    const loaded = records.load();
    expect(loaded.history).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(loaded.history[0]?.message).toBe("세션 41");
    expect(loaded.history.at(-1)).toMatchObject({
      type: "DIRT_CLEANED",
      context: { zoneId: "pipe-entrance", targetId: "entrance-01" },
    });
    expect(JSON.stringify(loaded)).not.toContain("never-store-this");
    expect(loaded.history.some((entry) => entry.type === "MATERIAL_GAINED")).toBe(false);
  });

  it("falls back safely when stored record JSON is malformed", () => {
    const storage = new FakeStorage();
    storage.setItem(BrowserPlayRecordRepository.RECORD_KEY, "{broken");

    expect(new BrowserPlayRecordRepository(storage, clock()).load()).toMatchObject({
      metadata: { totalSessions: 0 },
      history: [],
    });
  });
});

describe("browser game session bundles", () => {
  it("round-trips a bundle and migrates a raw legacy state", () => {
    const session = new BrowserGameSession(new FakeStorage(), clock());
    session.initialize(false);
    session.startNewGame("몽이");
    session.enterCurrent(" 복순 ");

    const exported = session.exportJson();
    const prepared = session.prepareImportText(exported.json);
    expect(prepared).toMatchObject({
      source: "bundle",
      state: { protagonistName: "복순" },
      preview: { day: 1 },
    });

    const legacy = createInitialGameState();
    legacy.saveVersion = 3;
    legacy.day = 7;
    const legacyPrepared = session.prepareImportText(JSON.stringify(legacy));
    expect(legacyPrepared).toMatchObject({
      source: "legacy-state",
      state: { saveVersion: 6, protagonistName: "", day: 7 },
      preview: { historyCount: 0 },
    });
  });

  it("backs up imports and swaps current and backup records on restore", () => {
    const storage = new FakeStorage();
    const session = new BrowserGameSession(storage, clock());
    session.initialize(false);
    session.startNewGame();

    const importedState = createInitialGameState();
    importedState.day = 9;
    importedState.happiness = 24;
    const bundle: SaveBundleV1 = {
      format: "quokka-pipe-cleaner",
      bundleVersion: 1,
      exportedAt: new Date(Date.UTC(2026, 7, 1)).toISOString(),
      gameVersion: "0.1.0",
      state: importedState,
      record: { metadata: { createdAt: new Date(0).toISOString(), lastSavedAt: new Date(0).toISOString(), totalSessions: 2 }, history: [] },
    };

    session.applyImport(session.prepareImportText(JSON.stringify(bundle)));
    expect(session.getSummary()).toMatchObject({ day: 9, happiness: 24 });
    expect(session.getBackupPreview()).toMatchObject({ day: 1 });

    session.restoreBackup();
    expect(session.getSummary()).toMatchObject({ day: 1 });
    expect(session.getBackupPreview()).toMatchObject({ day: 9, happiness: 24 });
  });

  it("rejects malformed and future bundles without changing current storage", () => {
    const storage = new FakeStorage();
    const session = new BrowserGameSession(storage, clock());
    session.initialize(false);
    session.startNewGame();
    const beforeSave = storage.getItem(BrowserSaveRepository.SAVE_KEY);
    const beforeRecord = storage.getItem(BrowserPlayRecordRepository.RECORD_KEY);

    expect(() => session.prepareImportText("{not json")).toThrow("JSON 파일");
    expect(() => session.prepareImportText(JSON.stringify({
      format: "quokka-pipe-cleaner",
      bundleVersion: 99,
    }))).toThrow("새로운 기록");
    expect(storage.getItem(BrowserSaveRepository.SAVE_KEY)).toBe(beforeSave);
    expect(storage.getItem(BrowserPlayRecordRepository.RECORD_KEY)).toBe(beforeRecord);
  });

  it("rolls back state, record, and backup when a transactional write fails", () => {
    const storage = new FailingOnceStorage();
    const session = new BrowserGameSession(storage, clock());
    session.initialize(false);
    session.startNewGame();
    const before = new Map(storage.values);
    const state = createInitialGameState();
    state.day = 12;
    const prepared = session.prepareImportText(JSON.stringify(state));

    storage.failNextKey = BrowserPlayRecordRepository.RECORD_KEY;
    expect(() => session.applyImport(prepared)).toThrow("현재 기록은 그대로");
    expect(storage.values).toEqual(before);
    expect(session.getSummary().day).toBe(1);
  });

  it("counts entry sessions and records system milestones", () => {
    const storage = new FakeStorage();
    const session = new BrowserGameSession(storage, clock());
    session.initialize(false);
    session.startNewGame();
    session.enterCurrent();

    expect(session.getSummary()).toMatchObject({ totalSessions: 2, historyCount: 3 });
    const record = JSON.parse(storage.getItem(BrowserPlayRecordRepository.RECORD_KEY) ?? "{}") as { history: Array<{ type: string }> };
    expect(record.history.map((entry) => entry.type)).toEqual(["NEW_GAME", "SESSION_STARTED", "SESSION_STARTED"]);
  });
});
