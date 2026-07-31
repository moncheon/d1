import * as Phaser from "phaser";
import dirtJson from "../../data/dirt.json";
import mapsJson from "../../data/maps.json";
import recipesJson from "../../data/recipes.json";
import { commands } from "../../core/commands";
import { getGameEngine } from "../../core/gameContext";
import type { DirtDefinition, DirtTargetDefinition, RecipeDefinition, ZoneDefinition } from "../../entities/types";
import { nextDirtLayer } from "../../systems/cleaning";
import { precisionCleaningRate, surfaceCleaningRate } from "../../systems/progression";
import { addButton, addQuokka, addTitle, showToast } from "../../ui/components";
import { palette } from "../../ui/palette";

const dirtDefinitions = dirtJson as unknown as DirtDefinition[];
const zones = (mapsJson as unknown as { zones: ZoneDefinition[] }).zones;
const recipes = recipesJson as unknown as RecipeDefinition[];

interface MovementKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

export class WorkplaceScene extends Phaser.Scene {
  private zoneId = "pipe-entrance";
  private player?: Phaser.GameObjects.Container;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: MovementKeys;
  private destination?: Phaser.Math.Vector2;
  private pendingTarget?: DirtTargetDefinition;
  private activityText?: Phaser.GameObjects.Text;
  private progressText?: Phaser.GameObjects.Text;
  private selectedSolutionId?: string;
  private startupMessage?: string;
  private isTransitioning = false;

  public constructor() {
    super("WorkplaceScene");
  }

  public init(data: { zoneId?: string; solutionId?: string; message?: string }): void {
    const requested = data.zoneId;
    const state = getGameEngine().getState();
    this.zoneId = requested && state.unlockedZones.includes(requested)
      ? requested
      : state.unlockedZones.at(-1) ?? "pipe-entrance";
    this.destination = undefined;
    this.pendingTarget = undefined;
    this.isTransitioning = false;
    this.selectedSolutionId = data.solutionId && (state.preparedSolutions[data.solutionId] ?? 0) > 0
      ? data.solutionId
      : undefined;
    this.startupMessage = data.message;
  }

  public create(): void {
    this.drawPipe();
    this.drawHeader();
    this.drawZoneTabs();
    this.drawTargets();
    this.player = addQuokka(this, 80, 500).setDepth(50);
    this.setupInput();
    showToast(
      this,
      this.startupMessage ?? "오염물을 다시 누르면 더 깊은 층을 청소합니다.",
      this.startupMessage ? "success" : "normal",
      1400,
    );
  }

  public override update(_time: number, delta: number): void {
    if (!this.player || this.isTransitioning) return;
    const keyboardVector = this.keyboardVector();
    const speed = 190 * (delta / 1000);

    if (keyboardVector.lengthSq() > 0) {
      this.destination = undefined;
      this.pendingTarget = undefined;
      keyboardVector.normalize().scale(speed);
      this.player.x += keyboardVector.x;
      this.player.y += keyboardVector.y;
    } else if (this.destination) {
      const direction = this.destination.clone().subtract(new Phaser.Math.Vector2(this.player.x, this.player.y));
      if (direction.length() <= Math.max(4, speed)) {
        this.player.setPosition(this.destination.x, this.destination.y);
        this.destination = undefined;
      } else {
        direction.normalize().scale(speed);
        this.player.x += direction.x;
        this.player.y += direction.y;
      }
    }

    this.player.x = Phaser.Math.Clamp(this.player.x, 45, 975);
    this.player.y = Phaser.Math.Clamp(this.player.y, 195, 525);

    if (this.pendingTarget) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        this.pendingTarget.x,
        this.pendingTarget.y,
      );
      if (distance < 72) this.cleanPendingTarget();
    }
  }

  private drawPipe(): void {
    this.cameras.main.setBackgroundColor("#26363a");
    this.add.rectangle(512, 360, 1024, 432, palette.pipe);
    this.add.rectangle(512, 171, 1024, 28, palette.pipeLight);
    this.add.rectangle(512, 550, 1024, 52, 0x243033);
    for (let x = 40; x < 1024; x += 96) {
      this.add.circle(x, 181, 5, 0x9aaca7, 0.65);
      this.add.circle(x + 48, 541, 5, 0x172326, 0.8);
    }
    for (let x = 0; x < 1024; x += 128) {
      this.add.rectangle(x + 64, 365, 2, 310, 0x718481, 0.16);
    }
  }

  private drawHeader(): void {
    const state = getGameEngine().getState();
    this.add.rectangle(512, 44, 1024, 88, palette.ink, 0.98);
    addTitle(this, 24, 15, "차갑고 축축한 배관", 23);
    this.activityText = this.add.text(25, 51, `${state.day}일 차 · 활동력 ${state.currentActivity}/${state.maxActivity}`, {
      color: "#c6ded7",
      fontSize: "14px",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
    const zone = zones.find((candidate) => candidate.id === this.zoneId);
    this.add.text(326, 20, zone?.name ?? this.zoneId, {
      color: zone?.accent ?? "#ffffff",
      fontSize: "20px",
      fontStyle: "bold",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
    this.progressText = this.add.text(326, 52, this.progressLabel(), {
      color: "#d4ddd9",
      fontSize: "13px",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
    const selectedRecipe = recipes.find((recipe) => recipe.outputId === this.selectedSolutionId);
    const selectedAmount = this.selectedSolutionId
      ? state.preparedSolutions[this.selectedSolutionId] ?? 0
      : 0;
    addButton(this, 700, 43, 190, 50,
      this.selectedSolutionId ? `${selectedRecipe?.name ?? "세정액"} · ${selectedAmount}` : "세정액: 선택 안 함",
      () => this.cycleSolution(),
      { fill: 0x40565a, fontSize: 11 },
    );
    addButton(this, 920, 43, 160, 50, "← 집으로", () => {
      this.scene.start("HomeScene");
    }, { fill: palette.warmDark, fontSize: 13 });
  }

  private drawZoneTabs(): void {
    const state = getGameEngine().getState();
    zones.forEach((zone, index) => {
      const unlocked = state.unlockedZones.includes(zone.id);
      addButton(this, 150 + index * 210, 122, 190, 44,
        unlocked ? zone.name : `🔒 ${zone.name}`,
        () => this.scene.restart({ zoneId: zone.id }),
        {
          disabled: !unlocked,
          fill: zone.id === this.zoneId ? palette.clean : palette.inkSoft,
          fontSize: 13,
        },
      );
    });
  }

  private drawTargets(): void {
    const zone = zones.find((candidate) => candidate.id === this.zoneId);
    const state = getGameEngine().getState();
    if (!zone) return;

    for (const target of zone.targets) {
      const dirt = dirtDefinitions.find((candidate) => candidate.id === target.dirtTypeId);
      if (!dirt) continue;
      const targetState = state.zoneCleaningState[this.zoneId]?.targets[target.id];
      const cleaned = targetState?.surfaceCleaned ?? false;
      const maxLayer = Math.max(1, ...dirt.layers.map((layer) => layer.level));
      const fullyCleaned = (targetState?.deepestLayer ?? 0) >= maxLayer;
      const nextLayer = nextDirtLayer(getGameEngine().snapshot(), this.zoneId, target.id);
      const color = Phaser.Display.Color.HexStringToColor(dirt.color).color;
      const shadow = this.add.ellipse(0, 15, 72, 27, 0x101718, 0.32);
      const blobAlpha = fullyCleaned ? 0.18 : cleaned ? 0.58 : 1;
      const blob1 = this.add.circle(-15, 1, 23, cleaned ? palette.clean : color, blobAlpha);
      const blob2 = this.add.circle(13, 3, 27, cleaned ? palette.clean : color, blobAlpha);
      const sparkle = this.add.text(0, -3, cleaned ? (fullyCleaned ? "✓" : `${targetState?.deepestLayer ?? 1}`) : "", {
        color: "#c9f1df",
        fontSize: "20px",
        fontStyle: "bold",
      }).setOrigin(0.5);
      const labelText = fullyCleaned ? "완전 청소" : cleaned ? `${nextLayer?.name ?? "깊은 층"}` : dirt.name;
      const label = this.add.text(0, 35, labelText, {
        color: cleaned ? "#b8d9ce" : "#f3e8d1",
        fontSize: "10px",
        fontStyle: "bold",
        fontFamily: '"Malgun Gothic", sans-serif',
        align: "center",
        wordWrap: { width: 100 },
      }).setOrigin(0.5);
      const container = this.add.container(target.x, target.y, [shadow, blob1, blob2, sparkle, label]);
      container.setSize(100, 72).setDepth(10);
      if (!fullyCleaned) {
        container.setInteractive({ useHandCursor: true });
        container.on("pointerdown", (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          this.pendingTarget = target;
          this.destination = new Phaser.Math.Vector2(target.x, Math.min(520, target.y + 58));
          showToast(this, cleaned && nextLayer ? nextLayer.hint : `${dirt.name}(으)로 이동합니다.`, "normal", 720);
        });
      }
    }
  }

  private setupInput(): void {
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as MovementKeys | undefined;
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.y < 165) return;
      this.pendingTarget = undefined;
      this.destination = new Phaser.Math.Vector2(pointer.worldX, Phaser.Math.Clamp(pointer.worldY, 195, 525));
    });
  }

  private keyboardVector(): Phaser.Math.Vector2 {
    const left = this.cursors?.left.isDown || this.wasd?.left.isDown;
    const right = this.cursors?.right.isDown || this.wasd?.right.isDown;
    const up = this.cursors?.up.isDown || this.wasd?.up.isDown;
    const down = this.cursors?.down.isDown || this.wasd?.down.isDown;
    return new Phaser.Math.Vector2(Number(Boolean(right)) - Number(Boolean(left)), Number(Boolean(down)) - Number(Boolean(up)));
  }

  private cleanPendingTarget(): void {
    if (!this.pendingTarget || this.isTransitioning) return;
    const target = this.pendingTarget;
    this.pendingTarget = undefined;
    this.destination = undefined;
    const events = getGameEngine().dispatch(commands.cleanDirt(this.zoneId, target.id, this.selectedSolutionId));
    const rejected = events.find((event) => event.type === "RULE_REJECTED");
    if (rejected) {
      showToast(this, rejected.message, "error");
      return;
    }

    const state = getGameEngine().getState();
    this.activityText?.setText(`${state.day}일 차 · 활동력 ${state.currentActivity}/${state.maxActivity}`);
    this.progressText?.setText(this.progressLabel());
    const unlock = events.find((event) => event.type === "ZONE_UNLOCKED");
    const deep = events.find((event) => event.type === "DEEP_LAYER_CLEANED");
    const reward = events.find((event) => event.type === "MATERIAL_GAINED");
    const message = unlock?.message ?? deep?.message ?? reward?.message ?? "깨끗해졌습니다!";

    if (events.some((event) => event.type === "GAME_COMPLETED")) {
      this.scene.start("ResultScene");
      return;
    }

    if (events.some((event) => event.type === "DAY_ENDED")) {
      this.isTransitioning = true;
      showToast(this, "활동력을 모두 썼습니다. 쿼카가 집으로 돌아가 잠듭니다…", "success", 900);
      this.time.delayedCall(1150, () => this.scene.start("HomeScene"));
    } else {
      this.time.delayedCall(260, () => this.scene.restart({
        zoneId: this.zoneId,
        solutionId: this.selectedSolutionId,
        message,
      }));
    }
  }

  private progressLabel(): string {
    const snapshot = getGameEngine().snapshot();
    const surface = Math.round(surfaceCleaningRate(snapshot, this.zoneId) * 100);
    const precision = Math.round(precisionCleaningRate(snapshot, this.zoneId) * 100);
    return `통행 ${surface}% · 정밀 ${precision}% · 해금 기준 60%`;
  }

  private cycleSolution(): void {
    const state = getGameEngine().getState();
    const available = recipes
      .filter((recipe) => recipe.kind === "mixture" && (state.preparedSolutions[recipe.outputId] ?? 0) > 0)
      .map((recipe) => recipe.outputId);
    const options = [undefined, ...available];
    const current = options.indexOf(this.selectedSolutionId);
    const next = options[(current + 1) % options.length];
    this.scene.restart({ zoneId: this.zoneId, solutionId: next });
  }
}
