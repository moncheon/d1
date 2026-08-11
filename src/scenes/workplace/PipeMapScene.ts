import * as Phaser from "phaser";
import mapsJson from "../../data/maps.json";
import { getGameEngine } from "../../core/gameContext";
import type { PipeCellDefinition, ZoneDefinition } from "../../entities/types";
import { surfaceCleaningRate } from "../../systems/progression";
import { getQuokkaGuidance, type GuidanceDestination } from "../../systems/guidance";
import { addButton, addQuokka, addTitle } from "../../ui/components";
import { addQuokkaGuide } from "../../ui/quokkaGuide";
import { palette } from "../../ui/palette";
import { queueAssetGroups } from "../../ui/assetLoader";

const maps = mapsJson as unknown as { pipeNetwork: PipeCellDefinition[]; zones: ZoneDefinition[] };

interface PipeMapSceneData {
  focusZoneId?: string;
  focusId?: string;
  message?: string;
}

export class PipeMapScene extends Phaser.Scene {
  private focusZoneId?: string;
  private message?: string;
  private focusId?: string;
  private marker?: Phaser.GameObjects.Container;

  public constructor() {
    super("PipeMapScene");
  }

  public init(data: PipeMapSceneData = {}): void {
    const state = getGameEngine().getState();
    this.focusZoneId = data.focusZoneId && state.unlockedZones.includes(data.focusZoneId)
      ? data.focusZoneId
      : state.unlockedZones.at(-1);
    this.message = data.message;
    this.focusId = data.focusId;
  }

  public preload(): void {
    queueAssetGroups(this, ["pipes"], "주변 길을 살펴보는 중…");
  }

  public create(): void {
    this.cameras.main.setBackgroundColor("#17272b");
    this.drawHeader();
    this.drawNetwork();
    const guidance = getQuokkaGuidance(getGameEngine().snapshot(), {
      scene: "workplace",
      zoneId: this.focusZoneId,
    });
    addQuokkaGuide(this, guidance, {
      sceneName: "pipe-map",
      actor: this.marker,
      onFollow: (destination) => this.followGuidance(destination),
    });
  }

  private drawHeader(): void {
    this.add.rectangle(512, 50, 1024, 100, palette.ink, 0.98);
    addTitle(this, 26, 16, "땅속 배관 지도", 25);
    this.add.text(27, 54, this.message ?? "열린 관을 골라 안쪽으로 들어가요. 깨끗한 표면 60%가 다음 관을 엽니다.", {
      color: "#b9cbc7",
      fontSize: "13px",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
    addButton(this, 920, 48, 160, 50, "← 집으로", () => this.scene.start("HomeScene"), {
      fill: palette.warmDark,
      fontSize: 13,
    });
  }

  private drawNetwork(): void {
    const state = getGameEngine().getState();
    const originX = 250;
    const originY = 105;
    const cellWidth = 255;
    const cellHeight = 96;
    const center = (cell: PipeCellDefinition) => ({
      x: originX + cell.column * cellWidth,
      y: originY + cell.row * cellHeight,
    });

    const connections = this.add.graphics().setDepth(1);
    connections.lineStyle(34, 0x344b50, 1);
    for (const cell of maps.pipeNetwork) {
      const from = center(cell);
      for (const other of maps.pipeNetwork) {
        if (other.id <= cell.id) continue;
        const distance = Math.abs(cell.column - other.column) + Math.abs(cell.row - other.row);
        if (distance !== 1) continue;
        const to = center(other);
        connections.lineBetween(from.x, from.y, to.x, to.y);
      }
    }
    connections.lineStyle(3, 0x829592, 0.35);
    for (const cell of maps.pipeNetwork) {
      const from = center(cell);
      for (const other of maps.pipeNetwork) {
        if (other.id <= cell.id) continue;
        if (Math.abs(cell.column - other.column) + Math.abs(cell.row - other.row) !== 1) continue;
        const to = center(other);
        connections.lineBetween(from.x, from.y - 12, to.x, to.y - 12);
      }
    }

    for (const cell of maps.pipeNetwork) {
      const position = center(cell);
      const zone = maps.zones.find((candidate) => candidate.id === cell.zoneId);
      const unlocked = Boolean(zone && state.unlockedZones.includes(zone.id));
      const focused = unlocked && zone?.id === this.focusZoneId;
      this.drawPipeCell(cell, position.x, position.y, zone, unlocked, focused);
    }
  }

  private drawPipeCell(
    cell: PipeCellDefinition,
    x: number,
    y: number,
    zone: ZoneDefinition | undefined,
    unlocked: boolean,
    focused: boolean,
  ): void {
    const rotation = cell.rotation * (Math.PI / 180);
    const color = zone
      ? Phaser.Display.Color.HexStringToColor(zone.accent).color
      : 0x43575b;
    const routeCard = zone?.theme === "organic" || zone?.theme === "mineral";
    if (routeCard && zone) {
      this.add.image(x + 132, y, zone.theme === "organic" ? "pipe-organic" : "pipe-mineral")
        .setDisplaySize(220, 100).setAlpha(unlocked ? 0.86 : 0.26).setDepth(3);
      this.add.rectangle(x + 132, y, 224, 104, 0xffffff, 0)
        .setStrokeStyle(focused ? 4 : 2, focused ? 0xf4df9b : 0x829592, focused ? 1 : 0.55).setDepth(4);
      this.add.circle(x, y, 28, unlocked ? color : 0x34464a, 1)
        .setStrokeStyle(focused ? 4 : 2, focused ? 0xf4df9b : 0x8fa19d, focused ? 1 : 0.65).setDepth(6);
      this.add.text(x, y, zone.theme === "organic" ? "↗" : "↘", {
        color: unlocked ? "#f4ecd8" : "#71817f", fontSize: "22px", fontStyle: "bold",
      }).setOrigin(0.5).setDepth(7);
    } else if (cell.id === "junction") {
      this.add.circle(x, y, 31, 0x536a69, 1).setStrokeStyle(3, 0xa7bab4, 0.7).setDepth(5);
      this.add.text(x, y, "◇", { color: "#e4d19a", fontSize: "22px", fontStyle: "bold" }).setOrigin(0.5).setDepth(6);
    } else {
      const body = this.add.rectangle(0, 0, 154, 62, unlocked ? color : 0x34464a, zone ? 0.72 : 1)
        .setStrokeStyle(focused ? 4 : 2, focused ? 0xf4df9b : 0x8fa19d, focused ? 1 : 0.5);
      const rim = this.add.ellipse(-75, 0, 31, 62, unlocked ? 0x263b3e : 0x2b3b3e, 1)
        .setStrokeStyle(3, unlocked ? 0xc2d5cd : 0x647572, unlocked ? 0.7 : 0.4);
      const inner = this.add.ellipse(-75, 9, 23, 26, 0x18282b, unlocked ? 1 : 0.35);
      const lowerCut = this.add.rectangle(0, 18, 145, 23, 0x20373a, unlocked ? 0.92 : 0);
      this.add.container(x, y, [body, rim, inner, lowerCut]).setRotation(rotation).setDepth(5);
    }

    const percent = zone ? Math.round(surfaceCleaningRate(getGameEngine().snapshot(), zone.id) * 100) : 0;
    const label = zone
      ? `${zone.name}\n${unlocked ? `통행 ${percent}%` : "아직 닫힌 원통"}`
      : cell.id === "junction" ? "두 갈래 연결관\n마음 가는 길을 선택" : "밀봉된 배관\n다음 단계";
    const labelX = routeCard ? x + 132 : x;
    const labelY = cell.id === "junction" ? y + 36 : y + 51;
    this.add.text(labelX, labelY, label, {
      color: cell.id === "junction" ? "#d9c993" : unlocked ? "#edf2df" : "#839491",
      fontSize: "12px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 3,
      fontFamily: '"Malgun Gothic", sans-serif',
    }).setOrigin(0.5, 0).setDepth(8);

    if (unlocked && zone) {
      const hit = this.add.rectangle(routeCard ? x + 66 : x, y, routeCard ? 310 : 174, routeCard ? 108 : 76, 0xffffff, 0.001).setDepth(10).setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => this.scene.start("WorkplaceScene", {
        zoneId: zone.id,
        focusId: zone.id === this.focusZoneId ? this.focusId : undefined,
      }));
      if (focused) {
        const markerX = routeCard ? x + 132 : x;
        this.marker = addQuokka(this, markerX, y - 31).setScale(0.48).setDepth(12);
        this.tweens.add({ targets: this.marker, y: y - 37, duration: 520, yoyo: true, repeat: -1, ease: "Sine.InOut" });
      }
    }
  }

  private followGuidance(destination: GuidanceDestination): void {
    if (destination.scene === "workplace") {
      this.scene.start("WorkplaceScene", {
        zoneId: destination.zoneId ?? this.focusZoneId,
        focusId: destination.focusId,
      });
    } else if (destination.scene === "workshop") {
      this.scene.start("WorkshopScene", { focusId: destination.focusId, ingredients: destination.ingredients });
    } else {
      this.scene.start("HomeScene", { focusId: destination.focusId });
    }
  }
}
