import type { GameEngine } from "./gameEngine";

let engine: GameEngine | null = null;

export function setGameEngine(value: GameEngine): void {
  engine = value;
}

export function getGameEngine(): GameEngine {
  if (!engine) throw new Error("GameEngine has not been initialized.");
  return engine;
}

