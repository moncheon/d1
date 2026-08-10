import * as Phaser from "phaser";
import { getGameSession } from "../core/sessionContext";
import type { PreparedImport, RecordPreview } from "../systems/gameSession";
import { addButton, showToast } from "./components";
import { palette } from "./palette";
import { UI_FONT_FAMILY } from "./typography";

function dateLabel(value: string | null): string {
  if (!value) return "이전 형식";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "날짜 미상";
  }
}

function previewText(preview: RecordPreview): string {
  return `${preview.day}일 차 · 행복도 ${preview.happiness}\n덤불집 ${preview.homePercent}% · 주요 이력 ${preview.historyCount}개\n내보낸 때 ${dateLabel(preview.exportedAt)}`;
}

export function confirmRecordAction(
  scene: Phaser.Scene,
  title: string,
  body: string,
  confirmLabel: string,
  onConfirm: () => void,
  onCancel?: () => void,
): void {
  const overlay = scene.add.container(0, 0).setDepth(2600);
  const veil = scene.add.rectangle(512, 288, 1024, 576, 0x12100e, 0.82).setInteractive();
  const panel = scene.add.rectangle(512, 288, 560, 280, 0xefe3c6, 1).setStrokeStyle(4, 0x8c633e, 1);
  const heading = scene.add.text(512, 195, title, {
    color: "#4b3525",
    fontFamily: UI_FONT_FAMILY,
    fontSize: "22px",
    fontStyle: "bold",
  }).setOrigin(0.5).setResolution(2);
  const copy = scene.add.text(512, 260, body, {
    color: "#6a533f",
    fontFamily: UI_FONT_FAMILY,
    fontSize: "14px",
    align: "center",
    lineSpacing: 7,
    wordWrap: { width: 470 },
  }).setOrigin(0.5).setResolution(2);
  overlay.add([veil, panel, heading, copy]);
  const cancel = (): void => {
    overlay.destroy(true);
    onCancel?.();
  };
  veil.on("pointerdown", cancel);
  overlay.add(addButton(scene, 410, 372, 170, 44, "돌아가기", cancel, { fill: palette.inkSoft, fontSize: 13 }));
  overlay.add(addButton(scene, 614, 372, 190, 44, confirmLabel, () => {
    overlay.destroy(true);
    onConfirm();
  }, { fill: palette.warmDark, fontSize: 13 }));
}

export async function beginImportFlow(
  scene: Phaser.Scene,
  onApplied: () => void,
  onPromptState?: (active: boolean) => void,
): Promise<void> {
  const session = getGameSession();
  let prepared: PreparedImport | null;
  try {
    prepared = await session.pickImportFile();
  } catch (error) {
    showToast(scene, error instanceof Error ? error.message : "기록 파일을 읽지 못했어요.", "error", 1800);
    return;
  }
  if (!prepared) return;
  onPromptState?.(true);
  confirmRecordAction(
    scene,
    "이 기록으로 이어 걸을까요?",
    `${previewText(prepared.preview)}\n\n현재 기록은 이전 기록으로 한 번 보관됩니다.`,
    "불러오기",
    () => {
      onPromptState?.(false);
      try {
        session.applyImport(prepared);
        onApplied();
      } catch (error) {
        showToast(scene, error instanceof Error ? error.message : "기록을 불러오지 못했어요.", "error", 1800);
      }
    },
    () => onPromptState?.(false),
  );
}

export function openRecordManager(scene: Phaser.Scene): void {
  const session = getGameSession();
  const summary = session.getSummary();
  const overlay = scene.add.container(0, 0).setDepth(2500);
  const veil = scene.add.rectangle(512, 288, 1024, 576, 0x12100e, 0.82).setInteractive();
  const panel = scene.add.rectangle(512, 286, 650, 450, 0xefe3c6, 1).setStrokeStyle(4, 0x8c633e, 1);
  const heading = scene.add.text(512, 92, "배관일지 보관함", {
    color: "#4b3525",
    fontFamily: UI_FONT_FAMILY,
    fontSize: "24px",
    fontStyle: "bold",
  }).setOrigin(0.5).setResolution(2);
  const copy = scene.add.text(512, 148, `${summary.day}일 차 · 행복도 ${summary.happiness} · 덤불집 ${summary.homePercent}%\n주요 이력 ${summary.historyCount}개 · 이 브라우저에만 자동 저장`, {
    color: "#6a533f",
    fontFamily: UI_FONT_FAMILY,
    fontSize: "14px",
    align: "center",
    lineSpacing: 6,
  }).setOrigin(0.5).setResolution(2);
  overlay.add([veil, panel, heading, copy]);
  const close = (): void => overlay.destroy(true);
  veil.on("pointerdown", close);

  overlay.add(addButton(scene, 512, 220, 390, 46, "JSON으로 기록 내보내기", () => {
    try {
      session.downloadJson();
      showToast(scene, "배관일지 파일을 내려받았어요.", "success", 1200);
    } catch {
      showToast(scene, "파일을 내려받지 못했어요. 브라우저 다운로드 설정을 확인해 주세요.", "error", 1600);
    }
  }, { fill: 0x6d8063, fontSize: 13 }));
  overlay.add(addButton(scene, 512, 278, 390, 46, "JSON 기록 불러오기", () => {
    void beginImportFlow(scene, () => scene.scene.start("HomeScene"));
  }, { fill: 0x6d8063, fontSize: 13 }));

  if (session.hasBackup()) {
    const backup = session.getBackupPreview();
    overlay.add(addButton(scene, 512, 336, 390, 46, `이전 기록 복원 · ${backup?.day ?? "?"}일 차`, () => {
      confirmRecordAction(scene, "이전 기록으로 돌아갈까요?", backup ? `${previewText(backup)}\n\n현재 기록과 서로 바뀌어 다시 되돌릴 수 있습니다.` : "이전 기록을 복원합니다.", "복원하기", () => {
        try {
          session.restoreBackup();
          scene.scene.start("HomeScene");
        } catch (error) {
          showToast(scene, error instanceof Error ? error.message : "복원하지 못했어요.", "error", 1600);
        }
      });
    }, { fill: palette.warmDark, fontSize: 13 }));
  }

  overlay.add(addButton(scene, 420, 425, 170, 38, "시작 화면", () => scene.scene.start("TitleScene"), { fill: palette.inkSoft, fontSize: 12 }));
  overlay.add(addButton(scene, 604, 425, 150, 38, "닫기", close, { fill: palette.warmDark, fontSize: 12 }));
}
