import type { AnalyticsSink } from "../analytics/analytics";
import type { GameEvent, GameEventType } from "../core/events";
import type { GameState } from "../core/gameState";
import type { KeyValueStorage } from "./saving";

export const MAX_HISTORY_ENTRIES = 300;
export const MAX_RECORD_BYTES = 512 * 1024;

export type PlaySystemEventType = "SESSION_STARTED" | "NEW_GAME" | "IMPORT" | "RESTORE";
export type PlayHistoryType = GameEventType | PlaySystemEventType;

export interface PlayRecordMetadata {
  createdAt: string;
  lastSavedAt: string;
  totalSessions: number;
}

export interface PlayHistoryEntry {
  id: string;
  sequence: number;
  at: string;
  day: number;
  type: PlayHistoryType;
  message: string;
  context: Record<string, string | number | boolean>;
}

export interface PlayRecordData {
  metadata: PlayRecordMetadata;
  history: PlayHistoryEntry[];
}

const recordedGameEvents = new Set<GameEventType>([
  "DIRT_CLEANED",
  "DEEP_LAYER_CLEANED",
  "HOUSE_BUILT",
  "HOUSE_REMOVED",
  "ITEM_CRAFTED",
  "RECIPE_DISCOVERED",
  "ACCESSORY_CRAFTED",
  "ZONE_UNLOCKED",
  "WORK_ENDED",
  "HOME_COMPLETED",
  "STEP_ONE_COMPLETED",
  "MEMORY_UNLOCKED",
  "DAY_ENDED",
  "GAME_COMPLETED",
]);

const allowedContextKeys = new Set([
  "zoneId",
  "sourceZoneId",
  "targetId",
  "dirtTypeId",
  "layer",
  "buildingId",
  "anchorId",
  "recipeId",
  "accessoryId",
  "technique",
  "day",
  "happiness",
  "surfaceRate",
  "maxActivity",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function cleanIso(value: unknown, fallback: string): string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback;
}

function cleanMessage(value: unknown): string {
  if (typeof value !== "string") return "기록을 남겼습니다.";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 180) || "기록을 남겼습니다.";
}

function cleanContext(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string | number | boolean> = {};
  for (const [key, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (!allowedContextKeys.has(key)) continue;
    if (typeof candidate === "string") result[key] = candidate.slice(0, 80);
    else if (typeof candidate === "number" && Number.isFinite(candidate)) result[key] = candidate;
    else if (typeof candidate === "boolean") result[key] = candidate;
  }
  return result;
}

export function createEmptyPlayRecord(at = nowIso()): PlayRecordData {
  const cleanAt = cleanIso(at, nowIso());
  return {
    metadata: {
      createdAt: cleanAt,
      lastSavedAt: cleanAt,
      totalSessions: 0,
    },
    history: [],
  };
}

export function normalizePlayRecord(candidate: unknown, at = nowIso()): PlayRecordData {
  const fallback = cleanIso(at, nowIso());
  if (!candidate || typeof candidate !== "object") return createEmptyPlayRecord(fallback);
  const source = candidate as Partial<PlayRecordData>;
  const metadata = source.metadata && typeof source.metadata === "object" ? source.metadata : {} as Partial<PlayRecordMetadata>;
  const history = Array.isArray(source.history) ? source.history : [];
  const normalizedHistory = history.flatMap((raw, index): PlayHistoryEntry[] => {
    if (!raw || typeof raw !== "object") return [];
    const entry = raw as Partial<PlayHistoryEntry>;
    if (typeof entry.type !== "string" || !Number.isInteger(entry.day) || (entry.day ?? 0) < 1) return [];
    const sequence = Number.isInteger(entry.sequence) && (entry.sequence ?? 0) > 0 ? entry.sequence as number : index + 1;
    return [{
      id: typeof entry.id === "string" ? entry.id.slice(0, 80) : `imported-${sequence}`,
      sequence,
      at: cleanIso(entry.at, fallback),
      day: entry.day as number,
      type: entry.type as PlayHistoryType,
      message: cleanMessage(entry.message),
      context: cleanContext(entry.context),
    }];
  }).sort((left, right) => left.sequence - right.sequence).slice(-MAX_HISTORY_ENTRIES);

  return trimRecord({
    metadata: {
      createdAt: cleanIso(metadata.createdAt, fallback),
      lastSavedAt: cleanIso(metadata.lastSavedAt, fallback),
      totalSessions: Number.isInteger(metadata.totalSessions) && (metadata.totalSessions ?? 0) >= 0
        ? metadata.totalSessions as number
        : 0,
    },
    history: normalizedHistory,
  });
}

function recordBytes(record: PlayRecordData): number {
  return new TextEncoder().encode(JSON.stringify(record)).byteLength;
}

function trimRecord(record: PlayRecordData): PlayRecordData {
  while (record.history.length > MAX_HISTORY_ENTRIES) record.history.shift();
  while (record.history.length > 0 && recordBytes(record) > MAX_RECORD_BYTES) record.history.shift();
  return record;
}

export class BrowserPlayRecordRepository {
  public static readonly RECORD_KEY = "quokka-pipe-cleaner.record.v1";

  public constructor(
    private readonly storage: KeyValueStorage,
    private readonly clock: () => string = nowIso,
  ) {}

  public load(): PlayRecordData {
    const raw = this.storage.getItem(BrowserPlayRecordRepository.RECORD_KEY);
    if (!raw) return createEmptyPlayRecord(this.clock());
    try {
      return normalizePlayRecord(JSON.parse(raw), this.clock());
    } catch {
      return createEmptyPlayRecord(this.clock());
    }
  }

  public readRaw(): string | null {
    return this.storage.getItem(BrowserPlayRecordRepository.RECORD_KEY);
  }

  public replaceRaw(raw: string | null): void {
    if (raw === null) this.storage.removeItem(BrowserPlayRecordRepository.RECORD_KEY);
    else this.storage.setItem(BrowserPlayRecordRepository.RECORD_KEY, raw);
  }

  public replace(record: PlayRecordData): PlayRecordData {
    const normalized = normalizePlayRecord(record, this.clock());
    this.storage.setItem(BrowserPlayRecordRepository.RECORD_KEY, JSON.stringify(normalized));
    return normalized;
  }

  public clear(): void {
    this.storage.removeItem(BrowserPlayRecordRepository.RECORD_KEY);
  }

  public noteSaved(): void {
    const record = this.load();
    record.metadata.lastSavedAt = this.clock();
    this.replace(record);
  }

  public startSession(state: Readonly<GameState>): void {
    const record = this.load();
    record.metadata.totalSessions += 1;
    this.appendTo(record, "SESSION_STARTED", "쿼카의 덤불집으로 돌아왔습니다.", state, {});
    this.replace(record);
  }

  public appendSystem(type: PlaySystemEventType, message: string, state: Readonly<GameState>): void {
    const record = this.load();
    this.appendTo(record, type, message, state, {});
    this.replace(record);
  }

  public appendGame(event: GameEvent, state: Readonly<GameState>): void {
    if (!recordedGameEvents.has(event.type)) return;
    const record = this.load();
    this.appendTo(record, event.type, event.message, state, event.data);
    this.replace(record);
  }

  private appendTo(
    record: PlayRecordData,
    type: PlayHistoryType,
    message: string,
    state: Readonly<GameState>,
    context: unknown,
  ): void {
    const sequence = (record.history.at(-1)?.sequence ?? 0) + 1;
    const at = this.clock();
    record.history.push({
      id: `${Date.parse(at).toString(36)}-${sequence}`,
      sequence,
      at,
      day: state.day,
      type,
      message: cleanMessage(message),
      context: cleanContext(context),
    });
    trimRecord(record);
  }
}

export class LocalHistoryAnalytics implements AnalyticsSink {
  public constructor(private readonly records: BrowserPlayRecordRepository) {}

  public track(event: GameEvent, state: Readonly<GameState>): void {
    this.records.appendGame(event, state);
  }
}
