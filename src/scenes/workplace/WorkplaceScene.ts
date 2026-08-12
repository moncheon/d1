import * as Phaser from "phaser";
import dirtJson from "../../data/dirt.json";
import mapsJson from "../../data/maps.json";
import recipesJson from "../../data/recipes.json";
import itemsJson from "../../data/items.json";
import { commands, type CleaningFeedback } from "../../core/commands";
import type { GameEvent } from "../../core/events";
import { getGameEngine } from "../../core/gameContext";
import type { DirtDefinition, DirtTargetDefinition, ItemDefinition, RecipeDefinition, ZoneDefinition } from "../../entities/types";
import { nextDirtLayer } from "../../systems/cleaning";
import { cleaningAvailability, type CleaningAvailability } from "../../systems/availability";
import { getQuokkaGuidance, type GuidanceDestination } from "../../systems/guidance";
import { precisionCleaningRate, surfaceCleaningRate } from "../../systems/progression";
import { addButton, addQuokka, addTitle, setQuokkaPose, showToast } from "../../ui/components";
import { addQuokkaGuide } from "../../ui/quokkaGuide";
import { palette } from "../../ui/palette";
import { bindAmbient, playSoundCue } from "../../ui/sound";
import { nameWithParticle } from "../../core/protagonistName";
import { queueAssetGroups } from "../../ui/assetLoader";
import { dirtVisualFrame, liquidIconFrames } from "../../data/visualFrames";

const dirtDefinitions = dirtJson as unknown as DirtDefinition[];
const zones = (mapsJson as unknown as { zones: ZoneDefinition[] }).zones;
const recipes = recipesJson as unknown as RecipeDefinition[];
const items = itemsJson as unknown as ItemDefinition[];

interface MovementKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

interface WorkplaceSceneData {
  zoneId?: string;
  solutionId?: string;
  message?: string;
  playerX?: number;
  playerY?: number;
  focusId?: string;
  recentEventType?: GameEvent["type"];
  intent?: ReturnType<typeof commands.cleanDirt>;
  demoCleaning?: boolean;
}

interface DirtTargetView {
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  sprite: Phaser.GameObjects.Sprite;
  sparkle: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
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
  private startPlayerX = 80;
  private startPlayerY = 500;
  private focusId?: string;
  private recentEventType?: GameEvent["type"];
  private intent?: ReturnType<typeof commands.cleanDirt>;
  private isTransitioning = false;
  private demoCleaning = false;
  private blockerAction?: Phaser.GameObjects.Container;
  private readonly targetViews = new Map<string, DirtTargetView>();

  public constructor() {
    super("WorkplaceScene");
  }

  public init(data: WorkplaceSceneData = {}): void {
    const requested = data.zoneId;
    const state = getGameEngine().getState();
    this.zoneId = requested && state.unlockedZones.includes(requested)
      ? requested
      : state.unlockedZones.at(-1) ?? "pipe-entrance";
    this.destination = undefined;
    this.pendingTarget = undefined;
    this.isTransitioning = false;
    this.targetViews.clear();
    this.blockerAction = undefined;
    this.selectedSolutionId = data.solutionId && (state.preparedSolutions[data.solutionId] ?? 0) > 0
      ? data.solutionId
      : undefined;
    this.startupMessage = data.message;
    this.focusId = data.focusId;
    this.recentEventType = data.recentEventType;
    this.intent = data.intent;
    this.demoCleaning = data.demoCleaning ?? false;
    this.startPlayerX = typeof data.playerX === "number" && Number.isFinite(data.playerX)
      ? Phaser.Math.Clamp(data.playerX, 45, 975)
      : 80;
    this.startPlayerY = typeof data.playerY === "number" && Number.isFinite(data.playerY)
      ? Phaser.Math.Clamp(data.playerY, 220, 510)
      : 490;
  }

  public preload(): void {
    queueAssetGroups(this, ["pipes"], "주변을 정리할 준비 중…");
  }

  public create(): void {
    this.drawPipe();
    this.drawHeader();
    this.drawZoneTabs();
    this.drawTargets();
    this.player = addQuokka(this, this.startPlayerX, this.startPlayerY).setDepth(50);
    this.setupInput();
    bindAmbient(this, "pipe", getGameEngine().getState().preferences.masterVolume);
    const guidance = getQuokkaGuidance(getGameEngine().snapshot(), {
      scene: "workplace",
      zoneId: this.zoneId,
      recentEventType: this.recentEventType,
      intent: this.intent,
    });
    addQuokkaGuide(this, guidance, {
      sceneName: "workplace",
      actor: this.player,
      onFollow: (destination) => this.followGuidance(destination),
    });
    showToast(
      this,
      this.startupMessage ?? "오염물을 다시 누르면 더 깊은 층을 청소합니다.",
      this.startupMessage ? "success" : "normal",
      1400,
    );
    if (this.demoCleaning) {
      const zone = zones.find((candidate) => candidate.id === this.zoneId);
      const target = zone?.targets[0];
      if (target) this.openCleaningInteraction(target);
    }
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
    this.player.y = Phaser.Math.Clamp(this.player.y, 220, 510);

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
    this.cameras.main.setBackgroundColor("#18272b");
    const zone = zones.find((candidate) => candidate.id === this.zoneId);
    const key = zone?.theme === "mineral" ? "pipe-mineral" : "pipe-organic";
    const backdrop = this.add.image(512, 288, key).setDisplaySize(1024, 576);
    if (zone?.theme === "entrance") backdrop.setTint(0xb7c9bc);
    this.add.rectangle(512, 350, 1024, 452, 0x102126, 0.13);
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
    const availableCount = recipes.filter(
      (recipe) => recipe.kind === "mixture" && (state.preparedSolutions[recipe.outputId] ?? 0) > 0,
    ).length;
    addButton(this, 700, 43, 190, 50,
      this.selectedSolutionId
        ? `${selectedRecipe?.name ?? "세정액"} · ${selectedAmount}`
        : availableCount > 0 ? `세정액 고르기 · ${availableCount}종` : "세정액 만들기 →",
      () => this.openSolutionMenu(),
      {
        fill: availableCount > 0 || this.selectedSolutionId ? 0x40565a : palette.warmDark,
        fontSize: 12,
        icon: this.selectedSolutionId
          ? { texture: "liquid-icons", frame: liquidIconFrames[this.selectedSolutionId] ?? 0, size: 34 }
          : undefined,
      },
    );
    addButton(this, 920, 43, 160, 50, "← 집으로", () => {
      this.scene.start("HomeScene");
    }, { fill: palette.warmDark, fontSize: 13 });
  }

  private drawZoneTabs(): void {
    this.add.rectangle(512, 137, 1024, 54, 0x203337, 0.96);
    this.add.text(28, 126, "원통 안쪽의 아래 절반 · WASD/방향키/누르기로 이동", {
      color: "#a9bbb6",
      fontSize: "12px",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
    addButton(this, 916, 136, 170, 38, "배관 지도 보기", () => {
      this.scene.start("PipeMapScene", { focusZoneId: this.zoneId });
    }, { fill: palette.inkSoft, fontSize: 12 });
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
      if (this.focusId === target.id) {
        const scent = this.add.ellipse(target.x, target.y + 5, 118, 86, 0xf4df9b, 0.08)
          .setStrokeStyle(3, 0xf4df9b, 0.9)
          .setDepth(8);
        const paw = this.add.text(target.x, target.y - 58, "·  냄새를 기억한 곳  ·", {
          color: "#f4df9b",
          fontSize: "12px",
          fontStyle: "bold",
          fontFamily: '"Malgun Gothic", sans-serif',
        }).setOrigin(0.5).setDepth(12);
        this.tweens.add({
          targets: [scent, paw],
          alpha: { from: 0.3, to: 1 },
          scaleX: { from: 0.96, to: 1.05 },
          scaleY: { from: 0.96, to: 1.05 },
          duration: 850,
          yoyo: true,
          repeat: -1,
          ease: "Sine.InOut",
        });
      }
      const shadow = this.add.ellipse(0, 22, 76, 24, 0x101718, fullyCleaned ? 0.12 : 0.32);
      const sprite = this.add.sprite(0, -2, dirt.spriteKey, dirtVisualFrame(targetState?.deepestLayer))
        .setDisplaySize(108, 108)
        .setAlpha(fullyCleaned ? 0 : 1);
      const sparkle = this.add.text(0, -3, cleaned ? (fullyCleaned ? "✓" : `${targetState?.deepestLayer ?? 1}`) : "", {
        color: "#c9f1df",
        fontSize: "20px",
        fontStyle: "bold",
      }).setOrigin(0.5);
      const rewardName = items.find((item) => item.id === dirt.rewards[0]?.itemId)?.name;
      const labelText = fullyCleaned ? "완전 청소" : cleaned ? `${nextLayer?.name ?? "깊은 층"}` : `${dirt.name}${rewardName ? ` · ${rewardName}` : ""}`;
      const label = this.add.text(0, 53, labelText, {
        color: cleaned ? "#b8d9ce" : "#f3e8d1",
        fontSize: "12px",
        fontStyle: "bold",
        fontFamily: '"Malgun Gothic", sans-serif',
        align: "center",
        wordWrap: { width: 100 },
      }).setOrigin(0.5);
      const container = this.add.container(target.x, target.y, [shadow, sprite, sparkle, label]);
      container.setSize(112, 104).setDepth(10);
      this.targetViews.set(target.id, { container, shadow, sprite, sparkle, label });
      if (!fullyCleaned) {
        container.setInteractive({ useHandCursor: true });
        container.on("pointerdown", (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          const currentAvailability = cleaningAvailability(
            getGameEngine().snapshot(),
            this.zoneId,
            target.id,
            this.selectedSolutionId,
          );
          if (!currentAvailability.enabled) {
            this.showCleaningBlocker(currentAvailability);
            return;
          }
          this.pendingTarget = target;
          this.destination = new Phaser.Math.Vector2(target.x, Math.min(505, target.y + 58));
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
      if (pointer.y < 190) return;
      this.pendingTarget = undefined;
      this.destination = new Phaser.Math.Vector2(pointer.worldX, Phaser.Math.Clamp(pointer.worldY, 220, 510));
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
    const availability = cleaningAvailability(
      getGameEngine().snapshot(),
      this.zoneId,
      target.id,
      this.selectedSolutionId,
    );
    if (!availability.enabled) {
      this.showCleaningBlocker(availability);
      return;
    }
    if (availability.challenge) {
      this.openCleaningInteraction(target);
      return;
    }
    this.quickClean(target);
  }

  private quickClean(target: DirtTargetDefinition): void {
    const dirt = dirtDefinitions.find((candidate) => candidate.id === target.dirtTypeId);
    if (!dirt) return;
    this.isTransitioning = true;
    setQuokkaPose(this.player, dirt.interaction === "sweep" ? 3 : dirt.interaction === "loosen" ? 4 : 5);
    this.time.delayedCall(240, () => {
      setQuokkaPose(this.player, 0);
      this.commitCleaning(target);
    });
  }

  private showCleaningBlocker(availability: CleaningAvailability): void {
    this.pendingTarget = undefined;
    this.destination = undefined;
    showToast(this, availability.message, "normal", 2200);
    this.blockerAction?.destroy(true);

    let label = "";
    let action: (() => void) | undefined;
    if (availability.remedy === "rest") {
      label = "덤불집에서 쉬기  →";
      action = () => this.scene.start("HomeScene", { focusId: "rest" });
    } else if (availability.remedy === "solution") {
      label = "세정액 고르기  →";
      action = () => this.openSolutionMenu();
    } else if (availability.remedy === "workshop") {
      label = "작업실 수첩 열기  →";
      action = () => this.scene.start("WorkshopScene", {
        focusId: availability.requiredAccessoryId ?? availability.requiredSolutionId ?? "cleaner-upgrade",
        returnZoneId: this.zoneId,
        returnPlayerX: this.player?.x ?? this.startPlayerX,
        returnPlayerY: this.player?.y ?? this.startPlayerY,
        returnSolutionId: this.selectedSolutionId,
      });
    }
    if (!action) return;
    const button = addButton(this, 512, 184, 250, 42, label, action, {
      fill: palette.warmDark,
      hoverFill: palette.warm,
      fontSize: 14,
    }).setDepth(1700);
    this.blockerAction = button;
    this.time.delayedCall(4300, () => {
      if (this.blockerAction === button) this.blockerAction = undefined;
      button.destroy(true);
    });
  }

  private openCleaningInteraction(target: DirtTargetDefinition): void {
    const dirt = dirtDefinitions.find((candidate) => candidate.id === target.dirtTypeId);
    if (!dirt) return;
    this.isTransitioning = true;
    const state = getGameEngine().getState();
    const simple = state.preferences.simpleCleaning;
    const instructions = {
      sweep: simple ? "원을 누르고 천천히 채워요" : "낙엽을 좌우로 쓸어 한곳에 모아요",
      loosen: simple ? "원을 누르고 천천히 채워요" : "뿌리를 좌우로 부드럽게 흔들어요",
      soak: "흙이 갈라질 때까지 가만히 눌러요",
    } as const;
    const pose = dirt.interaction === "sweep" ? 3 : dirt.interaction === "loosen" ? 4 : 5;
    setQuokkaPose(this.player, pose);

    const overlay = this.add.container(0, 0).setDepth(1750);
    const veil = this.add.rectangle(512, 288, 1024, 576, 0x0d1517, 0.76).setInteractive();
    const panel = this.add.rectangle(512, 306, 620, 330, 0x294046, 0.98).setStrokeStyle(4, 0xe1c77f, 0.9);
    const title = this.add.text(512, 166, dirt.name, {
      color: "#fff0ca", fontSize: "22px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
    }).setOrigin(0.5);
    const instruction = this.add.text(512, 204, instructions[dirt.interaction], {
      color: "#cfe1d7", fontSize: "14px", fontFamily: '"Malgun Gothic", sans-serif',
    }).setOrigin(0.5);
    const pad = this.add.circle(512, 305, 68, 0x6d876f, 1).setStrokeStyle(5, 0xe7d394, 0.85).setInteractive({ useHandCursor: true });
    const icon = this.add.text(512, 305, dirt.interaction === "sweep" ? "↔" : dirt.interaction === "loosen" ? "⇆" : "●", {
      color: "#fff4d6", fontSize: "34px", fontStyle: "bold",
    }).setOrigin(0.5);
    const track = this.add.rectangle(512, 397, 430, 18, 0x17282c, 1).setStrokeStyle(2, 0x8ca19b, 0.8);
    const fill = this.add.rectangle(299, 397, 0, 12, 0xf0d27e, 1).setOrigin(0, 0.5);
    const note = this.add.text(512, 430, "첫 발견 보너스: 모든 재료 ×2 · 직접 마치면 대표 재료 +1", {
      color: "#9fb7b0", fontSize: "12px", fontFamily: '"Malgun Gothic", sans-serif',
    }).setOrigin(0.5);
    overlay.add([veil, panel, title, instruction, pad, icon, track, fill, note]);

    let active = false;
    let progress = 0;
    let assisted = false;
    let lastPoint: Phaser.Math.Vector2 | undefined;
    const startedAt = performance.now();
    const close = (): void => {
      timer.destroy();
      this.input.keyboard?.off("keydown-SPACE", press);
      this.input.keyboard?.off("keyup-SPACE", release);
      overlay.destroy(true);
    };
    const complete = (): void => {
      const durationMs = Math.round(performance.now() - startedAt);
      const feedback: CleaningFeedback = {
        technique: dirt.interaction,
        quality: assisted ? "standard" : "careful",
        durationMs,
        assisted,
      };
      close();
      setQuokkaPose(this.player, 0);
      this.commitCleaning(target, feedback);
    };
    const updateBar = (): void => {
      progress = Phaser.Math.Clamp(progress, 0, 1);
      fill.width = 426 * progress;
      pad.setScale(1 + Math.sin(progress * Math.PI) * 0.08);
      if (progress >= 1) complete();
    };
    const press = (): void => { active = true; };
    const release = (): void => { active = false; lastPoint = undefined; };
    pad.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      active = true;
      lastPoint = new Phaser.Math.Vector2(pointer.x, pointer.y);
    });
    pad.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!active || simple || dirt.interaction === "soak") return;
      const current = new Phaser.Math.Vector2(pointer.x, pointer.y);
      if (lastPoint) progress += Phaser.Math.Distance.BetweenPoints(lastPoint, current) / 520;
      lastPoint = current;
      updateBar();
    });
    pad.on("pointerup", release);
    pad.on("pointerout", release);
    this.input.keyboard?.on("keydown-SPACE", press);
    this.input.keyboard?.on("keyup-SPACE", release);
    const timer = this.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => {
        const elapsed = performance.now() - startedAt;
        if (active && (simple || dirt.interaction === "soak")) progress += 0.042;
        else if (active) progress += 0.004;
        if (elapsed > 4500) {
          assisted = true;
          progress += 0.018;
          const subject = nameWithParticle(getGameEngine().getState().protagonistName, "subject");
          note.setText(subject ? `${subject} 옆에서 살짝 도와주고 있어요` : "옆에서 살짝 도와주고 있어요");
        }
        updateBar();
      },
    });
    const cancel = addButton(this, 512, 470, 150, 34, "나중에 하기", () => {
      close();
      setQuokkaPose(this.player, 0);
      this.isTransitioning = false;
    }, { fill: palette.inkSoft, fontSize: 12 });
    overlay.add(cancel);
  }

  private commitCleaning(target: DirtTargetDefinition, feedback?: CleaningFeedback): void {
    const events = getGameEngine().dispatch(commands.cleanDirt(this.zoneId, target.id, this.selectedSolutionId, feedback));
    const rejected = events.find((event) => event.type === "RULE_REJECTED");
    if (rejected) {
      showToast(this, "앗, 안쪽 냄새가 달라. 필요한 준비를 수첩에 이어 적어 둘게.", "normal", 900);
      this.time.delayedCall(520, () => this.scene.restart({
        ...this.restartData(),
        focusId: target.id,
        recentEventType: "RULE_REJECTED",
        intent: commands.cleanDirt(this.zoneId, target.id, this.selectedSolutionId, feedback),
      }));
      return;
    }
    playSoundCue("clean", getGameEngine().getState().preferences.masterVolume);

    const state = getGameEngine().getState();
    this.activityText?.setText(`${state.day}일 차 · 활동력 ${state.currentActivity}/${state.maxActivity}`);
    this.progressText?.setText(this.progressLabel());
    const unlock = events.find((event) => event.type === "ZONE_UNLOCKED");
    const deep = events.find((event) => event.type === "DEEP_LAYER_CLEANED");
    const reward = events.find((event) => event.type === "MATERIAL_GAINED");
    const cleaned = events.find((event) => event.type === "DIRT_CLEANED" || event.type === "DEEP_LAYER_CLEANED");
    const bonus = cleaned?.data.rewardMultiplier === 2 ? " · 보너스 재료 ×2!" : "";
    const message = `${unlock?.message ?? deep?.message ?? reward?.message ?? "깨끗해졌습니다!"}${bonus}`;
    this.isTransitioning = true;
    this.playCleaningAnimation(target, () => {
      this.refreshTargetView(target);
      this.progressText?.setText(this.progressLabel());
      showToast(this, message, "success", 850);
      const saveFailed = events.find((event) => event.type === "SAVE_FAILED");
      if (saveFailed) this.time.delayedCall(900, () => showToast(this, saveFailed.message, "error", 1800));
      if (events.some((event) => event.type === "STEP_ONE_COMPLETED")) {
        this.time.delayedCall(900, () => this.scene.start("HomeScene", {
          recentEventType: "STEP_ONE_COMPLETED",
          returning: true,
        }));
        return;
      }
      if (events.some((event) => event.type === "WORK_ENDED")) {
        this.time.delayedCall(900, () => this.scene.start("HomeScene", {
          recentEventType: "WORK_ENDED",
          returning: true,
        }));
        return;
      }
      this.isTransitioning = false;
    });
  }

  private playCleaningAnimation(target: DirtTargetDefinition, onComplete: () => void): void {
    const view = this.targetViews.get(target.id);
    const wipe = this.add.text(target.x, target.y - 52, "쓱싹  쓱싹", {
      color: "#f4df9b",
      fontSize: "15px",
      fontStyle: "bold",
      fontFamily: '"Malgun Gothic", sans-serif',
    }).setOrigin(0.5).setDepth(80).setAlpha(0);
    if (this.player) {
      this.tweens.add({
        targets: this.player,
        angle: { from: -5, to: 5 },
        scaleX: { from: this.player.scaleX, to: this.player.scaleX * 1.05 },
        duration: 120,
        yoyo: true,
        repeat: 2,
      });
    }
    if (view) {
      this.tweens.add({
        targets: view.sprite,
        scaleX: { from: 1, to: 0.72 },
        scaleY: { from: 1, to: 0.82 },
        alpha: { from: view.sprite.alpha, to: 0.28 },
        duration: 560,
        ease: "Sine.InOut",
      });
    }
    this.tweens.add({ targets: wipe, alpha: 1, y: target.y - 66, duration: 220, yoyo: true, repeat: 1 });
    this.time.delayedCall(610, () => {
      wipe.destroy();
      for (let index = 0; index < 3; index += 1) {
        const mote = this.add.circle(target.x + index * 8 - 8, target.y, 5, 0xe6ca83, 0.95).setDepth(90);
        this.tweens.add({
          targets: mote,
          x: this.player?.x ?? target.x,
          y: (this.player?.y ?? target.y) - 15,
          alpha: 0,
          duration: 260 + index * 50,
          onComplete: () => mote.destroy(),
        });
      }
      onComplete();
    });
  }

  private refreshTargetView(target: DirtTargetDefinition): void {
    const view = this.targetViews.get(target.id);
    const dirt = dirtDefinitions.find((candidate) => candidate.id === target.dirtTypeId);
    const targetState = getGameEngine().getState().zoneCleaningState[this.zoneId]?.targets[target.id];
    if (!view || !dirt || !targetState) return;
    const maxLayer = Math.max(1, ...dirt.layers.map((layer) => layer.level));
    const fullyCleaned = targetState.deepestLayer >= maxLayer;
    const nextLayer = nextDirtLayer(getGameEngine().snapshot(), this.zoneId, target.id);
    view.sprite.setFrame(dirtVisualFrame(targetState.deepestLayer)).setScale(1).setAlpha(fullyCleaned ? 0 : 1);
    view.shadow.setAlpha(fullyCleaned ? 0.12 : 0.32);
    view.sparkle.setText(fullyCleaned ? "✓" : `${targetState.deepestLayer}`);
    view.label.setText(fullyCleaned ? "완전 청소" : nextLayer?.name ?? "깊은 층");
    if (fullyCleaned) view.container.disableInteractive();
  }

  private progressLabel(): string {
    const snapshot = getGameEngine().snapshot();
    const zone = zones.find((candidate) => candidate.id === this.zoneId);
    const surface = Math.round(surfaceCleaningRate(snapshot, this.zoneId) * 100);
    const precision = Math.round(precisionCleaningRate(snapshot, this.zoneId) * 100);
    const threshold = Math.round((zone?.unlockSurfaceRate ?? 0.6) * 100);
    if (!zone?.nextZoneIds?.length) {
      const finalProgress = surface >= 100 ? "구역 표면 완료" : "1단계 완전 정리 100%";
      return `통행 ${surface}% · 정밀 ${precision}% · ${finalProgress}`;
    }
    const unlockProgress = zone.nextZoneIds.every((nextZoneId) => snapshot.unlockedZones.includes(nextZoneId))
      ? (surface >= 100 ? "구역 표면 완료" : "다음 관 열림 · 완전 정리 100%")
      : `해금 기준 ${threshold}%`;
    return `통행 ${surface}% · 정밀 ${precision}% · ${unlockProgress}`;
  }

  private openSolutionMenu(): void {
    const state = getGameEngine().getState();
    const available = recipes
      .filter((recipe) => recipe.kind === "mixture" && (state.preparedSolutions[recipe.outputId] ?? 0) > 0)
      .map((recipe) => ({ id: recipe.outputId, name: recipe.name, amount: state.preparedSolutions[recipe.outputId] ?? 0 }));
    const modalObjects: Phaser.GameObjects.GameObject[] = [];
    const close = (): void => modalObjects.forEach((object) => object.destroy());
    const veil = this.add.rectangle(512, 288, 1024, 576, 0x10191b, 0.78)
      .setDepth(900)
      .setInteractive();
    veil.on("pointerdown", close);
    modalObjects.push(veil);
    const height = 196 + available.length * 48;
    const top = 288 - height / 2;
    const panel = this.add.rectangle(512, 288, 500, height, palette.panel, 0.99)
      .setStrokeStyle(2, palette.pipeLight, 0.9)
      .setDepth(901)
      .setInteractive();
    modalObjects.push(panel);
    const title = this.add.text(512, top + 28, "어떤 세정액 냄새를 챙겨 갈까?", {
      color: palette.cream,
      fontSize: "18px",
      fontStyle: "bold",
      fontFamily: '"Malgun Gothic", sans-serif',
    }).setOrigin(0.5).setDepth(902);
    modalObjects.push(title);
    const noneButton = addButton(this, 512, top + 72, 438, 38, "맨손으로 살펴보기 · 세정액 사용 안 함", () => {
      this.scene.restart(this.restartData({ solutionId: undefined }));
    }, { fill: 0x40565a, fontSize: 12, highlighted: !this.selectedSolutionId }).setDepth(902);
    modalObjects.push(noneButton);
    available.forEach((solution, index) => {
      const button = addButton(this, 512, top + 119 + index * 48, 438, 38,
        `${solution.name} · 남은 양 ${solution.amount}`,
        () => this.scene.restart(this.restartData({ solutionId: solution.id })),
        {
          fill: palette.clean,
          fontSize: 12,
          highlighted: this.selectedSolutionId === solution.id,
          icon: { texture: "liquid-icons", frame: liquidIconFrames[solution.id] ?? 0, size: 28 },
        },
      ).setDepth(902);
      modalObjects.push(button);
    });
    const workshopButton = addButton(this, 512, top + 126 + available.length * 48, 438, 46,
      available.length > 0 ? "작업실에서 다른 세정액 만들기 →" : "아직 담아 둔 게 없네 · 작업실에서 만들기 →",
      () => this.scene.start("WorkshopScene", {
        focusId: "mixer",
        returnZoneId: this.zoneId,
        returnPlayerX: this.player?.x ?? this.startPlayerX,
        returnPlayerY: this.player?.y ?? this.startPlayerY,
        returnSolutionId: this.selectedSolutionId,
      }),
      { fill: palette.warmDark, fontSize: 12 },
    ).setDepth(902);
    modalObjects.push(workshopButton);
  }

  private followGuidance(destination: GuidanceDestination): void {
    if (destination.scene === "workplace") {
      const destinationZone = destination.zoneId ?? this.zoneId;
      this.scene.restart(destinationZone === this.zoneId
        ? this.restartData({ zoneId: destinationZone, focusId: destination.focusId })
        : { zoneId: destinationZone, focusId: destination.focusId });
    } else if (destination.scene === "workshop") {
      this.scene.start("WorkshopScene", {
        focusId: destination.focusId,
        ingredients: destination.ingredients,
        returnZoneId: this.zoneId,
        returnPlayerX: this.player?.x ?? this.startPlayerX,
        returnPlayerY: this.player?.y ?? this.startPlayerY,
        returnSolutionId: this.selectedSolutionId,
      });
    } else {
      this.scene.start("HomeScene", { focusId: destination.focusId });
    }
  }

  private restartData(overrides: WorkplaceSceneData = {}): WorkplaceSceneData {
    return {
      zoneId: this.zoneId,
      solutionId: this.selectedSolutionId,
      playerX: this.player?.x ?? this.startPlayerX,
      playerY: this.player?.y ?? this.startPlayerY,
      ...overrides,
    };
  }
}
