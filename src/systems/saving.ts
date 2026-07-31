import {
  cloneGameState,
  mergeWithInitialState,
  type GameState,
} from "../core/gameState";

export interface SaveRepository {
  load(): GameState | null;
  save(state: GameState): void;
  clear(): void;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class BrowserSaveRepository implements SaveRepository {
  public static readonly SAVE_KEY = "quokka-pipe-cleaner.save.v1";

  public constructor(private readonly storage: KeyValueStorage) {}

  public load(): GameState | null {
    try {
      const raw = this.storage.getItem(BrowserSaveRepository.SAVE_KEY);
      return raw ? mergeWithInitialState(JSON.parse(raw) as unknown) : null;
    } catch {
      return null;
    }
  }

  public save(state: GameState): void {
    this.storage.setItem(BrowserSaveRepository.SAVE_KEY, JSON.stringify(state));
  }

  public clear(): void {
    this.storage.removeItem(BrowserSaveRepository.SAVE_KEY);
  }
}

export class MemorySaveRepository implements SaveRepository {
  private state: GameState | null = null;

  public load(): GameState | null {
    return this.state ? cloneGameState(this.state) : null;
  }

  public save(state: GameState): void {
    this.state = cloneGameState(state);
  }

  public clear(): void {
    this.state = null;
  }
}

