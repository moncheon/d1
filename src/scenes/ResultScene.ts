import * as Phaser from "phaser";
import { getGameEngine } from "../core/gameContext";
import { completionProgress } from "../systems/progression";
import { addButton, addQuokka, addTitle, setQuokkaPose } from "../ui/components";
import { palette } from "../ui/palette";
import { queueAssetGroups } from "../ui/assetLoader";

export class ResultScene extends Phaser.Scene {
  public constructor() {
    super("ResultScene");
  }

  public preload(): void {
    queueAssetGroups(this, ["title"], "기록을 펼치는 중…");
  }

  public create(): void {
    const state = getGameEngine().getState();
    const progress = completionProgress(getGameEngine().snapshot());
    this.cameras.main.setBackgroundColor("#293b36");
    this.add.image(512, 288, "home-diorama").setDisplaySize(1024, 576);
    this.add.rectangle(512, 288, 1024, 576, 0x17231f, 0.62);
    this.add.circle(512, 260, 260, 0xe0be72, 0.16);
    const quokka = addQuokka(this, 512, 145).setScale(1.35);
    setQuokkaPose(quokka, 9);
    addTitle(this, 512, 235, "배관망 1단계 정리 완료", 32).setOrigin(0.5);
    this.add.text(512, 290, "모든 구역의 표면과 깊은 막힘을 정리했습니다.\n닫힌 배관 너머의 이야기는 다음 단계에서 이어집니다.", {
      color: "#e9efdf", fontSize: "17px", align: "center", lineSpacing: 8,
      fontFamily: '"Malgun Gothic", sans-serif',
    }).setOrigin(0.5);
    const checks = [
      [progress.allZonesSurfaceReady, "세 구역 통행 청소율 100%"],
      [progress.coreTargetsReady, "핵심 심층 오염 3곳 완전 청소"],
      [true, `완성한 집 행복도 ${state.happiness}`],
      [true, `함께 보낸 시간 ${state.day}일`],
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
