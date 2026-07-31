import * as Phaser from "phaser";
import { getGameEngine } from "../core/gameContext";
import { completionProgress } from "../systems/progression";
import { addButton, addQuokka, addTitle } from "../ui/components";
import { palette } from "../ui/palette";

export class ResultScene extends Phaser.Scene {
  public constructor() {
    super("ResultScene");
  }

  public create(): void {
    const state = getGameEngine().getState();
    const progress = completionProgress(getGameEngine().snapshot());
    this.cameras.main.setBackgroundColor("#293b36");
    this.add.circle(512, 260, 260, 0x6f8d65, 0.18);
    addQuokka(this, 512, 145).setScale(1.5);
    addTitle(this, 512, 235, "따뜻한 집, 깨끗한 배관", 32).setOrigin(0.5);
    this.add.text(512, 290, "쿼카가 자연 재료로 삶의 터전을 완성했습니다.\n남은 오염과 레시피는 엔딩 후에도 계속 정리할 수 있습니다.", {
      color: "#e9efdf", fontSize: "17px", align: "center", lineSpacing: 8,
      fontFamily: '"Malgun Gothic", sans-serif',
    }).setOrigin(0.5);
    const checks = [
      [progress.finalZoneSurfaceReady, "마지막 구역 통행 청소율 60%"],
      [progress.cleanerReady, "청소기 3단계"],
      [progress.recipesReady, `레시피 ${state.discoveredRecipes.length}/5 발견`],
      [progress.happinessReady, `행복도 ${state.happiness}/48`],
    ] as const;
    checks.forEach(([ready, label], index) => {
      this.add.text(350 + (index % 2) * 330, 365 + Math.floor(index / 2) * 46, `${ready ? "✓" : "○"} ${label}`, {
        color: ready ? "#d7eba7" : "#a8b5ad", fontSize: "15px", fontStyle: "bold",
        fontFamily: '"Malgun Gothic", sans-serif',
      });
    });
    addButton(this, 512, 500, 280, 54, "계속 플레이하기", () => this.scene.start("HomeScene"), {
      fill: palette.warmDark, hoverFill: palette.warm, fontSize: 17,
    });
  }
}
