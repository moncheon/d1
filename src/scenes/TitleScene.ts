import * as Phaser from "phaser";
import { getGameSession } from "../core/sessionContext";
import { getGameEngine } from "../core/gameContext";
import { addButton, addQuokka, showToast } from "../ui/components";
import { palette } from "../ui/palette";
import { beginImportFlow, confirmRecordAction } from "../ui/recordManager";
import { UI_FONT_FAMILY } from "../ui/typography";

function dateLabel(value: string): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "방금";
  }
}

export class TitleScene extends Phaser.Scene {
  public constructor() {
    super("TitleScene");
  }

  public create(): void {
    const session = getGameSession();
    const health = session.getHealth();
    const summary = session.getSummary();
    const reducedMotion = getGameEngine().getState().preferences.reducedMotion;

    this.add.image(512, 288, "home-diorama").setDisplaySize(1024, 576).setAlpha(0.62);
    this.add.rectangle(512, 288, 1024, 576, 0x17201d, 0.54);
    this.add.rectangle(766, 288, 480, 576, 0x192724, 0.82);
    this.add.rectangle(766, 288, 472, 560, 0x273a32, 0.7).setStrokeStyle(2, 0xb99561, 0.65);

    for (let index = 0; index < 14; index += 1) {
      const light = this.add.circle(55 + (index * 73) % 880, 48 + (index * 83) % 460, 2 + index % 2, 0xf0c86f, 0.5);
      if (!reducedMotion) {
        this.tweens.add({ targets: light, alpha: { from: 0.2, to: 0.75 }, duration: 1000 + index * 80, yoyo: true, repeat: -1 });
      }
    }

    this.add.text(62, 62, "쿼카의\n배관일지", {
      color: "#f7e9c8",
      fontFamily: UI_FONT_FAMILY,
      fontSize: "48px",
      fontStyle: "bold",
      lineSpacing: -4,
      stroke: "#473425",
      strokeThickness: 5,
    }).setResolution(2);
    this.add.text(66, 184, "작은 손으로 배관을 돌보고,\n모아 온 재료로 덤불집을 채워 가요.", {
      color: "#d8d7b7",
      fontFamily: UI_FONT_FAMILY,
      fontSize: "17px",
      lineSpacing: 8,
    }).setResolution(2);
    addQuokka(this, 300, 408).setScale(1.7);
    this.add.ellipse(300, 500, 250, 40, 0x141916, 0.3);

    this.add.text(766, 70, health === "valid" ? "다시 온 걸 환영해요" : "새 덤불집을 만나 볼까요?", {
      color: "#f7e9c8",
      fontFamily: UI_FONT_FAMILY,
      fontSize: "24px",
      fontStyle: "bold",
    }).setOrigin(0.5).setResolution(2);

    if (health === "valid") {
      this.add.rectangle(766, 126, 390, 72, 0x17241f, 0.72).setStrokeStyle(1, 0x829b5b, 0.8);
      this.add.text(766, 126, `${summary.day}일 차 · 행복도 ${summary.happiness} · 덤불집 ${summary.homePercent}%\n마지막 저장 ${dateLabel(summary.lastSavedAt)} · 이력 ${summary.historyCount}개`, {
        color: "#d8d7b7",
        fontFamily: UI_FONT_FAMILY,
        fontSize: "13px",
        align: "center",
        lineSpacing: 7,
      }).setOrigin(0.5).setResolution(2);
    } else if (health === "corrupt") {
      this.add.text(766, 124, "저장 기록을 읽지 못했어요.\n새로 시작하거나 JSON 기록을 불러와 주세요.", {
        color: "#f0b9a9", fontFamily: UI_FONT_FAMILY, fontSize: "14px", align: "center", lineSpacing: 6,
      }).setOrigin(0.5).setResolution(2);
    } else {
      this.add.text(766, 124, "로그인 없이 바로 시작할 수 있어요.\n진행은 이 브라우저에 자동으로 남습니다.", {
        color: "#c8d7c5", fontFamily: UI_FONT_FAMILY, fontSize: "14px", align: "center", lineSpacing: 6,
      }).setOrigin(0.5).setResolution(2);
    }

    addButton(this, 766, 205, 380, 52, health === "valid" ? "이어 걷기" : "처음 시작", () => this.startOrContinue(), {
      fill: palette.grass,
      highlighted: true,
      fontSize: 16,
    });
    addButton(this, 766, 270, 380, 46, "JSON 기록 불러오기", () => {
      void beginImportFlow(this, () => this.scene.start("HomeScene"));
    }, { fill: 0x536b61, fontSize: 13 });

    if (health === "valid") {
      addButton(this, 666, 328, 184, 42, "기록 내보내기", () => {
        try {
          session.downloadJson();
          showToast(this, "배관일지 파일을 내려받았어요.", "success", 1200);
        } catch {
          showToast(this, "다운로드를 시작하지 못했어요.", "error", 1400);
        }
      }, { fill: palette.inkSoft, fontSize: 12 });
      addButton(this, 866, 328, 184, 42, "새 게임", () => this.confirmNewGame(), { fill: palette.warmDark, fontSize: 12 });
    }

    if (session.hasBackup()) {
      const backup = session.getBackupPreview();
      addButton(this, 766, 382, 380, 42, `이전 기록 · ${backup?.day ?? "?"}일 차`, () => this.confirmRestore(), { fill: 0x6c5b43, fontSize: 12 });
    }

    this.add.text(766, 500, "서버로 보내지 않아요 · 브라우저 데이터 삭제 시 기록도 사라져요\n다른 기기에서는 JSON 내보내기/불러오기를 이용해 주세요.", {
      color: "#aebdaf",
      fontFamily: UI_FONT_FAMILY,
      fontSize: "12px",
      align: "center",
      lineSpacing: 6,
    }).setOrigin(0.5).setResolution(2);
  }

  private startOrContinue(): void {
    const session = getGameSession();
    if (session.getHealth() === "corrupt") {
      this.confirmNewGame();
      return;
    }
    if (session.getHealth() === "valid") session.enterCurrent();
    else session.startNewGame();
    this.scene.start("HomeScene");
  }

  private confirmNewGame(): void {
    const session = getGameSession();
    const hasCurrent = session.getHealth() === "valid";
    confirmRecordAction(this, "새 배관일지를 펼칠까요?", hasCurrent
      ? "현재 기록은 이전 기록으로 한 번 보관됩니다.\n새 쿼카는 첫날의 허름한 덤불집에서 시작해요."
      : "첫날의 허름한 덤불집에서 시작합니다.", "새로 시작", () => {
      try {
        session.startNewGame();
        this.scene.start("HomeScene");
      } catch (error) {
        showToast(this, error instanceof Error ? error.message : "새 게임을 만들지 못했어요.", "error", 1800);
      }
    });
  }

  private confirmRestore(): void {
    const session = getGameSession();
    const backup = session.getBackupPreview();
    confirmRecordAction(this, "이전 기록으로 돌아갈까요?", backup
      ? `${backup.day}일 차 · 행복도 ${backup.happiness} · 덤불집 ${backup.homePercent}%\n현재 기록과 서로 바뀌어 다시 되돌릴 수 있습니다.`
      : "복원할 이전 기록을 찾지 못했어요.", "복원하기", () => {
      try {
        session.restoreBackup();
        this.scene.start("HomeScene");
      } catch (error) {
        showToast(this, error instanceof Error ? error.message : "복원하지 못했어요.", "error", 1600);
      }
    });
  }
}
