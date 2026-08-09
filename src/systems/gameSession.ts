import { CompositeAnalytics, ConsoleAnalytics, type AnalyticsSink } from "../analytics/analytics";
import { setGameEngine } from "../core/gameContext";
import { GameEngine } from "../core/gameEngine";
import { createInitialGameState, mergeWithInitialState, type GameState } from "../core/gameState";
import {
  BrowserPlayRecordRepository,
  LocalHistoryAnalytics,
  createEmptyPlayRecord,
  normalizePlayRecord,
  type PlayRecordData,
} from "./playRecords";
import { BrowserSaveRepository, type KeyValueStorage, type SaveRepository } from "./saving";

const GAME_VERSION = "0.1.0";
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export type SaveHealth = "none" | "valid" | "corrupt";

export interface SaveBundleV1 {
  format: "quokka-pipe-cleaner";
  bundleVersion: 1;
  exportedAt: string;
  gameVersion: string;
  state: GameState;
  record: PlayRecordData;
}

export interface RecordPreview {
  day: number;
  happiness: number;
  homePercent: number;
  historyCount: number;
  exportedAt: string | null;
}

export interface PreparedImport {
  state: GameState;
  record: PlayRecordData;
  preview: RecordPreview;
  source: "bundle" | "legacy-state";
}

interface RawStorageSnapshot {
  save: string | null;
  record: string | null;
  backup: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function homePercent(state: Readonly<GameState>): number {
  const entries = Object.values(state.homeAnchors);
  if (entries.length === 0) return 0;
  return Math.round(entries.filter(Boolean).length / entries.length * 100);
}

function previewFor(state: Readonly<GameState>, record: PlayRecordData, exportedAt: string | null): RecordPreview {
  return {
    day: state.day,
    happiness: state.happiness,
    homePercent: homePercent(state),
    historyCount: record.history.length,
    exportedAt,
  };
}

export class BrowserGameSession {
  public static readonly BACKUP_KEY = "quokka-pipe-cleaner.backup.v1";

  private readonly saves: BrowserSaveRepository;
  private readonly records: BrowserPlayRecordRepository;
  private engine: GameEngine | null = null;
  private health: SaveHealth = "none";
  private debugAnalytics = false;
  private storageNotice: string | null = null;

  public constructor(
    private readonly storage: KeyValueStorage,
    private readonly clock: () => string = nowIso,
  ) {
    this.saves = new BrowserSaveRepository(storage);
    this.records = new BrowserPlayRecordRepository(storage, clock);
  }

  public initialize(debugAnalytics: boolean): GameEngine {
    this.debugAnalytics = debugAnalytics;
    const hasRaw = this.saves.hasRawSave();
    const loaded = this.saves.load();
    this.health = loaded ? "valid" : hasRaw ? "corrupt" : "none";
    return this.activate(loaded ?? createInitialGameState());
  }

  public activateQaState(state: GameState): void {
    this.activate(state);
  }

  public getHealth(): SaveHealth {
    return this.health;
  }

  public getSummary(): RecordPreview & { lastSavedAt: string; totalSessions: number } {
    const state = this.requireEngine().getState();
    const record = this.records.load();
    return {
      ...previewFor(state, record, null),
      lastSavedAt: record.metadata.lastSavedAt,
      totalSessions: record.metadata.totalSessions,
    };
  }

  public consumeStorageNotice(): string | null {
    const notice = this.storageNotice;
    this.storageNotice = null;
    return notice;
  }

  public enterCurrent(): void {
    if (this.health !== "valid") {
      this.startNewGame();
      return;
    }
    this.tryRecord(() => this.records.startSession(this.requireEngine().getState()));
  }

  public startNewGame(): void {
    const state = createInitialGameState();
    this.replaceCurrent(state, createEmptyPlayRecord(this.clock()), this.currentBundle());
    this.tryRecord(() => this.records.appendSystem("NEW_GAME", "새 배관일지를 펼쳤습니다.", state));
    this.tryRecord(() => this.records.startSession(state));
  }

  public hasBackup(): boolean {
    return this.readBackup() !== null;
  }

  public getBackupPreview(): RecordPreview | null {
    const backup = this.readBackup();
    return backup ? previewFor(backup.state, backup.record, backup.exportedAt) : null;
  }

  public restoreBackup(): void {
    const backup = this.readBackup();
    if (!backup) throw new Error("복원할 이전 기록이 없습니다.");
    const current = this.currentBundle();
    this.replaceCurrent(backup.state, backup.record, current);
    this.tryRecord(() => this.records.appendSystem("RESTORE", "이전 기록으로 돌아왔습니다.", backup.state));
    this.tryRecord(() => this.records.startSession(backup.state));
  }

  public prepareImportText(raw: string): PreparedImport {
    if (new TextEncoder().encode(raw).byteLength > MAX_IMPORT_BYTES) {
      throw new Error("기록 파일은 2MB 이하만 불러올 수 있어요.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("JSON 파일을 읽을 수 없어요. 내보낸 기록 파일인지 확인해 주세요.");
    }
    if (!parsed || typeof parsed !== "object") throw new Error("게임 기록 형식이 아닙니다.");

    const candidate = parsed as Partial<SaveBundleV1> & { saveVersion?: number; format?: string };
    if (candidate.format !== undefined) {
      if (candidate.format !== "quokka-pipe-cleaner") throw new Error("다른 게임의 기록 파일입니다.");
      if (candidate.bundleVersion !== 1) throw new Error("현재 버전보다 새로운 기록 파일이라 불러올 수 없어요.");
      const state = mergeWithInitialState(candidate.state);
      if (!state) throw new Error("기록 속 진행 상태가 손상되었습니다.");
      const record = normalizePlayRecord(candidate.record, this.clock());
      const exportedAt = typeof candidate.exportedAt === "string" && Number.isFinite(Date.parse(candidate.exportedAt))
        ? new Date(candidate.exportedAt).toISOString()
        : null;
      return { state, record, preview: previewFor(state, record, exportedAt), source: "bundle" };
    }

    const state = mergeWithInitialState(candidate);
    if (!state) throw new Error("지원하지 않는 저장 버전이거나 진행 상태가 손상되었습니다.");
    const record = createEmptyPlayRecord(this.clock());
    return { state, record, preview: previewFor(state, record, null), source: "legacy-state" };
  }

  public applyImport(prepared: PreparedImport): void {
    this.replaceCurrent(prepared.state, prepared.record, this.currentBundle());
    this.tryRecord(() => this.records.appendSystem("IMPORT", "가져온 배관일지로 이어 걷기 시작했습니다.", prepared.state));
    this.tryRecord(() => this.records.startSession(prepared.state));
  }

  public exportJson(): { json: string; filename: string } {
    const bundle = this.makeBundle(this.requireEngine().snapshot(), this.records.load());
    const stamp = new Date(bundle.exportedAt).toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
    return {
      json: JSON.stringify(bundle, null, 2),
      filename: `quokka-pipe-cleaner-${stamp}.json`,
    };
  }

  public downloadJson(): void {
    const exported = this.exportJson();
    const url = URL.createObjectURL(new Blob([exported.json], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exported.filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  public async pickImportFile(): Promise<PreparedImport | null> {
    const file = await new Promise<File | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
      input.click();
    });
    if (!file) return null;
    if (file.size > MAX_IMPORT_BYTES) throw new Error("기록 파일은 2MB 이하만 불러올 수 있어요.");
    return this.prepareImportText(await file.text());
  }

  private activate(state: GameState): GameEngine {
    const trackedSaveRepository: SaveRepository = {
      load: () => this.saves.load(),
      clear: () => this.saves.clear(),
      save: (nextState) => {
        this.saves.save(nextState);
        this.health = "valid";
        this.tryRecord(() => this.records.noteSaved());
      },
    };
    const analytics: AnalyticsSink[] = [new LocalHistoryAnalytics(this.records)];
    if (this.debugAnalytics) analytics.push(new ConsoleAnalytics());
    this.engine = new GameEngine({
      initialState: state,
      saveRepository: trackedSaveRepository,
      analytics: new CompositeAnalytics(analytics),
    });
    setGameEngine(this.engine);
    return this.engine;
  }

  private requireEngine(): GameEngine {
    if (!this.engine) throw new Error("게임 세션이 아직 준비되지 않았습니다.");
    return this.engine;
  }

  private currentBundle(): SaveBundleV1 | null {
    if (this.health !== "valid") return null;
    return this.makeBundle(this.requireEngine().snapshot(), this.records.load());
  }

  private makeBundle(state: GameState, record: PlayRecordData): SaveBundleV1 {
    return {
      format: "quokka-pipe-cleaner",
      bundleVersion: 1,
      exportedAt: this.clock(),
      gameVersion: GAME_VERSION,
      state,
      record: normalizePlayRecord(record, this.clock()),
    };
  }

  private readBackup(): SaveBundleV1 | null {
    const raw = this.storage.getItem(BrowserGameSession.BACKUP_KEY);
    if (!raw) return null;
    try {
      const prepared = this.prepareImportText(raw);
      const parsed = JSON.parse(raw) as SaveBundleV1;
      return {
        ...parsed,
        state: prepared.state,
        record: prepared.record,
      };
    } catch {
      return null;
    }
  }

  private replaceCurrent(state: GameState, record: PlayRecordData, backup: SaveBundleV1 | null): void {
    const previous = this.snapshotRaw();
    try {
      if (backup) this.storage.setItem(BrowserGameSession.BACKUP_KEY, JSON.stringify(backup));
      this.saves.save(state);
      record.metadata.lastSavedAt = this.clock();
      this.records.replace(record);
      this.health = "valid";
    } catch (error) {
      this.restoreRaw(previous);
      throw new Error("브라우저 저장 공간에 기록하지 못했어요. 현재 기록은 그대로 유지했습니다.", { cause: error });
    }
    this.activate(state);
  }

  private snapshotRaw(): RawStorageSnapshot {
    return {
      save: this.saves.readRaw(),
      record: this.records.readRaw(),
      backup: this.storage.getItem(BrowserGameSession.BACKUP_KEY),
    };
  }

  private restoreRaw(snapshot: RawStorageSnapshot): void {
    this.saves.replaceRaw(snapshot.save);
    this.records.replaceRaw(snapshot.record);
    if (snapshot.backup === null) this.storage.removeItem(BrowserGameSession.BACKUP_KEY);
    else this.storage.setItem(BrowserGameSession.BACKUP_KEY, snapshot.backup);
  }

  private tryRecord(action: () => void): void {
    try {
      action();
    } catch {
      this.storageNotice = "플레이는 계속할 수 있지만 이력을 저장하지 못했어요. JSON으로 내보낸 뒤 브라우저 공간을 확인해 주세요.";
    }
  }
}
