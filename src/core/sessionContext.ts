import type { BrowserGameSession } from "../systems/gameSession";

let session: BrowserGameSession | null = null;

export function setGameSession(value: BrowserGameSession): void {
  session = value;
}

export function getGameSession(): BrowserGameSession {
  if (!session) throw new Error("BrowserGameSession has not been initialized.");
  return session;
}
