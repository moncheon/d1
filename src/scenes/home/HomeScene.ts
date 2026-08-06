import * as Phaser from "phaser";
import buildingsJson from "../../data/buildings.json";
import accessoriesJson from "../../data/accessories.json";
import itemsJson from "../../data/items.json";
import mapsJson from "../../data/maps.json";
import recipesJson from "../../data/recipes.json";
import { commands, type GameCommand } from "../../core/commands";
import type { GameEvent } from "../../core/events";
import { getGameEngine } from "../../core/gameContext";
import type {
  BuildingDefinition,
  AccessoryDefinition,
  HouseSlotDefinition,
  ItemDefinition,
  RecipeDefinition,
} from "../../entities/types";
import { shouldAutoSleepAtHome } from "../../systems/building";
import { activityForHappiness } from "../../systems/progression";
import { getQuokkaGuidance, type GuidanceDestination } from "../../systems/guidance";
import { addButton, addPanel, addQuokka, addTitle, showToast } from "../../ui/components";
import { setQuokkaPose } from "../../ui/components";
import { addQuokkaGuide } from "../../ui/quokkaGuide";
import { palette } from "../../ui/palette";
import { memoryDefinitions } from "../../systems/memories";
import { bindAmbient, playSoundCue } from "../../ui/sound";

const buildings = buildingsJson as unknown as BuildingDefinition[];
const accessories = accessoriesJson as unknown as AccessoryDefinition[];
const items = itemsJson as unknown as ItemDefinition[];
const recipes = recipesJson as unknown as RecipeDefinition[];
const homeSlots = (mapsJson as unknown as { homeSlots: HouseSlotDefinition[] }).homeSlots;

export class HomeScene extends Phaser.Scene {
  private focusId?: string;
  private recentEventType?: GameEvent["type"];
  private intent?: GameCommand;
  private quokka?: Phaser.GameObjects.Container;
  private returning = false;
  private wokeUp = false;
  private builtSlotId?: string;
  private happinessDelta = 0;
  private isSleeping = false;
  private demoPicker = false;
  private readonly slotObjects = new Map<string, Phaser.GameObjects.Container>();

  public constructor() {
    super("HomeScene");
  }

  public init(data: {
    focusId?: string;
    recentEventType?: GameEvent["type"];
    intent?: GameCommand;
    returning?: boolean;
    wokeUp?: boolean;
    builtSlotId?: string;
    happinessDelta?: number;
    demoPicker?: boolean;
  } = {}): void {
    this.focusId = data.focusId;
    this.recentEventType = data.recentEventType;
    this.intent = data.intent;
    this.returning = data.returning ?? false;
    this.wokeUp = data.wokeUp ?? false;
    this.builtSlotId = data.builtSlotId;
    this.happinessDelta = data.happinessDelta ?? 0;
    this.isSleeping = false;
    this.demoPicker = data.demoPicker ?? false;
    this.slotObjects.clear();
  }

  public create(): void {
    this.cameras.main.setBackgroundColor("#4a3e32");
    this.drawBackground();
    this.drawHeader();
    this.drawInventory();
    this.drawShelter();
    this.drawWorkshop();
    this.playArrivalMoment();
    bindAmbient(this, "home", getGameEngine().getState().preferences.masterVolume);
    const guidance = getQuokkaGuidance(getGameEngine().snapshot(), {
      scene: "home",
      recentEventType: this.recentEventType,
      intent: this.intent,
    });
    addQuokkaGuide(this, guidance, {
      sceneName: "home",
      actor: this.quokka,
      onFollow: (destination) => this.followGuidance(destination),
    });
    this.applyHomeRoutinePose();
    if (this.demoPicker) {
      const slot = homeSlots[0];
      if (slot) this.openBuildingPicker(slot);
    }
  }

  private drawBackground(): void {
    const happiness = getGameEngine().getState().happiness;
    this.add.image(512, 288, "home-diorama").setDisplaySize(1024, 576);
    this.add.rectangle(512, 45, 1024, 90, palette.ink, 0.94);
    this.add.rectangle(512, 333, 1024, 486, 0x241b12, happiness >= 21 ? 0.08 : 0.16).setOrigin(0.5);
    const glowCount = happiness >= 48 ? 14 : happiness >= 21 ? 8 : happiness >= 5 ? 4 : 0;
    for (let index = 0; index < glowCount; index += 1) {
      const glow = this.add.circle(260 + (index * 71) % 650, 125 + (index * 97) % 380, 3, 0xf4dfa0, 0.5);
      this.tweens.add({ targets: glow, alpha: { from: 0.2, to: 0.85 }, duration: 900 + index * 80, yoyo: true, repeat: -1 });
    }
  }

  private drawHeader(): void {
    const state = getGameEngine().getState();
    addTitle(this, 80, 16, "쿼카의 덤불집", 24);
    this.add.text(82, 49, `${state.day}일 차 · 활동력 ${state.currentActivity}/${state.maxActivity}`, {
      color: "#c8d9d3",
      fontSize: "14px",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
    this.add.text(465, 31, `포근함 ${state.happiness} · 내일 ${activityForHappiness(state.happiness)}회`, {
      color: "#f0d69d",
      fontSize: "14px",
      fontStyle: "bold",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
    const evening = state.dayPhase === "evening";
    addButton(this, 665, 45, 120, 42, `추억 ${state.memories.length}`, () => this.openMemoryAlbum(), {
      fill: 0x6f5b3c, fontSize: 12,
    });
    addButton(this, 754, 45, 46, 42, "⚙", () => this.openPreferences(), { fill: 0x40565a, fontSize: 16 });
    addButton(this, 902, 45, 188, 52, evening ? "오늘 일은 다 했어" : "배관 지도로 출근  →", () => {
      this.scene.start("PipeMapScene");
    }, { fill: palette.warmDark, hoverFill: palette.warm, fontSize: 15, disabled: evening });
  }

  private drawInventory(): void {
    const state = getGameEngine().getState();
    addPanel(this, 16, 106, 190, 350, palette.panelWarm, 0.9);
    addTitle(this, 31, 120, "재료 가방", 18);
    this.add.text(31, 148, "필요한 냄새를 골라 찾아가요.", {
      color: "#d1c2ab",
      fontSize: "11px",
      fontFamily: '"Malgun Gothic", sans-serif',
    });

    const visibleItems = [...items]
      .sort((left, right) => (state.inventory[right.id] ?? 0) - (state.inventory[left.id] ?? 0))
      .slice(0, 8);
    visibleItems.forEach((item, index) => {
      const y = 181 + index * 28;
      this.add.circle(43, y + 5, 7, Phaser.Display.Color.HexStringToColor(item.color).color);
      this.add.text(58, y - 5, item.name, {
        color: item.category === "rare" ? "#f2d38b" : "#f1eadb",
        fontSize: "13px",
        fontFamily: '"Malgun Gothic", sans-serif',
      });
      this.add.text(188, y - 5, `${state.inventory[item.id] ?? 0}`, {
        color: "#ffffff",
        fontSize: "14px",
        fontStyle: "bold",
        fontFamily: '"Malgun Gothic", sans-serif',
      }).setOrigin(1, 0);
    });

    const pileDisabled = state.dailyLeafPileRemaining <= 0 || state.dayPhase === "evening";
    addButton(this, 111, 425, 164, 44, `잔해 정리 ${state.dailyLeafPileRemaining}/2`, () => {
      this.runCommand(commands.harvestDailyPile());
    }, { fill: palette.warmDark, disabled: pileDisabled, fontSize: 13, highlighted: this.focusId === "daily-pile" });
  }

  private drawShelter(): void {
    const state = getGameEngine().getState();
    this.add.text(230, 108, "우리 손으로 자라는 덤불집", {
      color: "#fff0ca", fontSize: "17px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
    }).setShadow(0, 2, "#3b2819", 4);
    this.quokka = addQuokka(this, this.returning ? 735 : 650, 430).setDepth(80);

    homeSlots.forEach((slot) => {
      const buildingId = state.houseSlots[slot.id];
      const building = buildings.find((candidate) => candidate.id === (buildingId ?? slot.buildingOptions[0]));
      if (!building) return;
      const installed = buildingId !== null;
      const x = 285 + slot.x * 79;
      const y = 220 + slot.y * 67;
      const foundation = this.add.ellipse(x, y + 15, 62, 30, installed ? 0x2e2015 : 0xe8d49d, installed ? 0.35 : 0.17)
        .setStrokeStyle(this.focusId === slot.id ? 3 : 1, 0xf6e5ad, installed ? 0.22 : 0.68)
        .setDepth(22)
        .setInteractive({ useHandCursor: true });
      foundation.on("pointerdown", () => this.openBuildingPicker(slot));
      if (!installed) {
        this.add.text(x, y + 10, "+", { color: "#ffe7ac", fontSize: "22px", fontStyle: "bold" })
          .setOrigin(0.5).setDepth(23);
      }
      const object = this.addBuildingShape(x, y, building, installed).setDepth(24);
      this.slotObjects.set(slot.id, object);
    });

    this.add.text(244, 500, `집의 포근함 ${state.happiness} · 같은 재료라도 모양과 쿼카의 생활이 달라져요`, {
      color: "#ffe6ad",
      fontSize: "11px",
      fontFamily: '"Malgun Gothic", sans-serif',
    }).setShadow(0, 2, "#3b2819", 3);
    if (this.builtSlotId) {
      const built = this.slotObjects.get(this.builtSlotId);
      if (built) this.tweens.add({ targets: built, scale: { from: 0.35, to: 1 }, angle: { from: -5, to: 0 }, duration: 520, ease: "Back.Out" });
    }
  }

  private drawWorkshop(): void {
    const state = getGameEngine().getState();
    addPanel(this, 768, 112, 240, 365, palette.panel, 0.88);
    addTitle(this, 786, 128, "작은 작업대", 18);
    this.add.text(786, 162, `청소기 ${state.cleanerLevel}단계`, {
      color: "#b9ddd2",
      fontSize: "15px",
      fontStyle: "bold",
      fontFamily: '"Malgun Gothic", sans-serif',
    });

    const nextUpgrade = recipes.find(
      (recipe) => recipe.kind === "cleaner_upgrade" && recipe.cleanerLevel === state.cleanerLevel + 1,
    );
    this.add.text(786, 198, nextUpgrade ? `다음 성장: ${nextUpgrade.name}` : "청소기 최고 단계 달성", {
      color: "#b9ddd2",
      fontSize: "13px",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
    const equippedId = state.equippedAccessories[0];
    const equipped = accessories.find((accessory) => accessory.id === equippedId)?.name ?? "없음";
    this.add.text(786, 238, `발견 레시피 ${state.discoveredRecipes.length}/5`, {
      color: "#e9d59f",
      fontSize: "14px",
      fontStyle: "bold",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
    this.add.text(786, 270, `장착 액세서리 · ${equipped}`, {
      color: "#b9c9c5",
      fontSize: "12px",
      lineSpacing: 6,
      fontFamily: '"Malgun Gothic", sans-serif',
    });

    const evening = state.dayPhase === "evening";
    addButton(this, 888, 340, 200, 58, evening ? "작업대도 쉬는 중" : "작업실 열기\n장비 · 배합 · 수첩", () => {
      this.scene.start("WorkshopScene");
    }, { fill: palette.clean, fontSize: 15, highlighted: this.focusId === "workshop", disabled: evening });

    addButton(this, 888, 415, 200, 44, evening ? "침대에서 잠들기" : "오늘 일찍 쉬기", () => {
      this.playSleepSequence();
    }, { fill: palette.warmDark, fontSize: 13, highlighted: this.focusId === "rest" });
    this.add.text(786, 446, "잠들면 집의 포근함이\n내일 활동력으로 이어져요.", {
      color: "#93a9a5",
      fontSize: "11px",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
  }

  private applyHomeRoutinePose(): void {
    const state = getGameEngine().getState();
    const installed = Object.values(state.houseSlots).filter((id): id is string => Boolean(id));
    if (state.dayPhase === "evening") setQuokkaPose(this.quokka, 11);
    else if (installed.includes("flower_bed") || installed.includes("sprout_bed")) setQuokkaPose(this.quokka, 2);
    else if (installed.includes("resin_chime") || installed.includes("moss_decor")) setQuokkaPose(this.quokka, 10);
    else if (installed.length >= 10) setQuokkaPose(this.quokka, 9);
    else setQuokkaPose(this.quokka, 0);
  }

  private runCommand(command: GameCommand): void {
    const events = getGameEngine().dispatch(command);
    const rejected = events.find((event) => event.type === "RULE_REJECTED");
    const notable = this.notableEvent(events);
    if (rejected) {
      showToast(this, "음… 주머니를 다시 살펴볼게. 필요한 냄새는 수첩에 적어 두자.", "normal", 900);
      this.time.delayedCall(520, () => this.scene.restart({
        recentEventType: "RULE_REJECTED",
        intent: command,
      }));
      return;
    }
    showToast(this, notable?.message ?? "완료했습니다.", "success");
    this.time.delayedCall(420, () => {
      this.scene.restart({
        recentEventType: notable?.type,
        returning: events.some((event) => event.type === "WORK_ENDED"),
      });
    });
  }

  private openBuildingPicker(slot: HouseSlotDefinition): void {
    const state = getGameEngine().getState();
    const currentId = state.houseSlots[slot.id];
    const options = slot.buildingOptions
      .map((id) => buildings.find((building) => building.id === id))
      .filter((building): building is BuildingDefinition => Boolean(building));
    const overlay = this.add.container(0, 0).setDepth(1800);
    const veil = this.add.rectangle(512, 288, 1024, 576, 0x14100c, 0.8).setInteractive();
    const paper = this.add.rectangle(512, 292, 690, 402, 0xefe0bd, 1).setStrokeStyle(4, 0x8c633e, 1);
    const title = this.add.text(512, 116, currentId ? "이 자리를 다시 꾸며 볼까?" : "어떤 집 조각을 놓을까?", {
      color: "#4b3525", fontSize: "22px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
    }).setOrigin(0.5);
    overlay.add([veil, paper, title]);
    const close = (): void => overlay.destroy(true);
    veil.on("pointerdown", close);

    options.forEach((building, index) => {
      const x = 365 + index * 294;
      const selected = currentId === building.id;
      const card = this.add.rectangle(x, 292, 258, 280, selected ? 0xbdd09d : 0xf8edcf, 1)
        .setStrokeStyle(selected ? 4 : 2, selected ? 0x6e8c59 : 0xb39163, 1);
      const preview = this.addBuildingShape(x, 205, building, true).setScale(1.35);
      const name = this.add.text(x, 272, `${building.name}  ♥${building.happiness}`, {
        color: "#3e3025", fontSize: "18px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
      }).setOrigin(0.5);
      const description = this.add.text(x, 300, building.description, {
        color: "#6d5846", fontSize: "12px", align: "center", wordWrap: { width: 222 },
        fontFamily: '"Malgun Gothic", sans-serif',
      }).setOrigin(0.5, 0);
      const cost = this.add.text(x, 354, building.cost.map((entry) => `${this.itemName(entry.itemId)} ${entry.amount}`).join(" · "), {
        color: "#815f37", fontSize: "12px", fontStyle: "bold", align: "center", wordWrap: { width: 220 },
        fontFamily: '"Malgun Gothic", sans-serif',
      }).setOrigin(0.5);
      const choose = addButton(this, x, 390, 210, 42, selected ? "지금 놓인 모습" : currentId ? "재료 돌려받고 바꾸기" : "이 모습으로 짓기", () => {
        if (selected) return;
        close();
        if (currentId) this.runCommand(commands.replaceHouse(slot.id, building.id));
        else this.startConstruction(slot, building);
      }, { fill: selected ? 0x71856a : palette.warmDark, disabled: selected, fontSize: 12 });
      overlay.add([card, preview, name, description, cost, choose]);
    });

    const closeButton = addButton(this, 780, 112, 86, 34, "닫기", close, { fill: palette.inkSoft, fontSize: 11 });
    overlay.add(closeButton);
    if (currentId) {
      const remove = addButton(this, 512, 462, 210, 36, "부품 회수하기", () => {
        close();
        this.runCommand(commands.removeHouse(slot.id));
      }, { fill: 0x7d5544, fontSize: 11 });
      overlay.add(remove);
    }
  }

  private openMemoryAlbum(): void {
    const state = getGameEngine().getState();
    playSoundCue("memory", state.preferences.masterVolume);
    const overlay = this.add.container(0, 0).setDepth(1900);
    const veil = this.add.rectangle(512, 288, 1024, 576, 0x12100e, 0.8).setInteractive();
    const paper = this.add.rectangle(512, 286, 760, 444, 0xf1e5c8, 1).setStrokeStyle(4, 0x8c633e, 1);
    const portrait = addQuokka(this, 238, 177).setScale(1.2);
    const latest = [...state.memories].reverse().slice(0, 4);
    const latestDefinition = memoryDefinitions.find((definition) => definition.id === latest[0]?.id);
    setQuokkaPose(portrait, latestDefinition?.pose ?? 10);
    const title = this.add.text(330, 90, "쿼카와 함께 쌓은 추억", {
      color: "#503a28", fontSize: "24px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
    });
    const empty = this.add.text(330, 135, latest.length === 0 ? "아직 첫 장이 비어 있어. 배관에서 작은 일을 함께 시작해 보자." : `지금까지 ${state.memories.length}개의 장면을 기억하고 있어.`, {
      color: "#80684e", fontSize: "13px", wordWrap: { width: 480 }, fontFamily: '"Malgun Gothic", sans-serif',
    });
    overlay.add([veil, paper, portrait, title, empty]);
    latest.forEach((entry, index) => {
      const definition = memoryDefinitions.find((candidate) => candidate.id === entry.id);
      if (!definition) return;
      const y = 190 + index * 66;
      const day = this.add.text(325, y, `${entry.day}일 차`, { color: "#9a734d", fontSize: "11px", fontStyle: "bold" });
      const label = this.add.text(390, y - 6, definition.title, { color: "#49382b", fontSize: "15px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif' });
      const body = this.add.text(390, y + 18, definition.text, { color: "#75604e", fontSize: "11px", wordWrap: { width: 380 }, fontFamily: '"Malgun Gothic", sans-serif' });
      overlay.add([day, label, body]);
    });
    const close = (): void => overlay.destroy(true);
    veil.on("pointerdown", close);
    overlay.add(addButton(this, 818, 88, 78, 34, "덮기", close, { fill: palette.warmDark, fontSize: 11 }));
  }

  private openPreferences(): void {
    const state = getGameEngine().getState();
    const overlay = this.add.container(0, 0).setDepth(1950);
    const veil = this.add.rectangle(512, 288, 1024, 576, 0x12100e, 0.78).setInteractive();
    const panel = this.add.rectangle(512, 286, 480, 330, 0xefe3c6, 1).setStrokeStyle(4, 0x8c633e, 1);
    const title = this.add.text(512, 150, "편안하게 플레이하기", { color: "#4b3525", fontSize: "22px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif' }).setOrigin(0.5);
    overlay.add([veil, panel, title]);
    const close = (): void => overlay.destroy(true);
    veil.on("pointerdown", close);
    const apply = (command: GameCommand): void => {
      getGameEngine().dispatch(command);
      close();
      this.scene.restart();
    };
    overlay.add(addButton(this, 512, 215, 340, 46, state.preferences.masterVolume > 0 ? "소리 켜짐 · 누르면 끄기" : "소리 꺼짐 · 누르면 켜기", () => apply(commands.updatePreferences({ masterVolume: state.preferences.masterVolume > 0 ? 0 : 0.7 })), { fill: 0x6d8063, fontSize: 13 }));
    overlay.add(addButton(this, 512, 273, 340, 46, `간편 청소 ${state.preferences.simpleCleaning ? "켜짐" : "꺼짐"}`, () => apply(commands.updatePreferences({ simpleCleaning: !state.preferences.simpleCleaning })), { fill: 0x6d8063, fontSize: 13 }));
    overlay.add(addButton(this, 512, 331, 340, 46, `모션 줄이기 ${state.preferences.reducedMotion ? "켜짐" : "꺼짐"}`, () => apply(commands.updatePreferences({ reducedMotion: !state.preferences.reducedMotion })), { fill: 0x6d8063, fontSize: 13 }));
    overlay.add(addButton(this, 512, 390, 150, 36, "닫기", close, { fill: palette.warmDark, fontSize: 11 }));
  }

  private startConstruction(slot: HouseSlotDefinition, building: BuildingDefinition): void {
    const state = getGameEngine().getState();
    const missing = building.cost.some((cost) => (state.inventory[cost.itemId] ?? 0) < cost.amount);
    if (missing) {
      this.runCommand(commands.buildHouse(slot.id, building.id));
      return;
    }

    const firstOfCategory = !state.experiencedBuildCategories.includes(building.category);
    const steps = firstOfCategory ? ["재료 옮기기", "모양 다듬기", "단단히 고정하기"] : ["익숙한 손길로 마무리하기"];
    let stepIndex = 0;
    const shade = this.add.rectangle(512, 288, 1024, 576, 0x101819, 0.76).setDepth(1500).setInteractive();
    const panel = this.add.rectangle(512, 300, 480, 280, 0x46513d, 1).setStrokeStyle(3, 0xe8d49d, 0.9).setDepth(1501);
    const preview = this.addBuildingShape(512, 248, building, true).setScale(1.8).setDepth(1502);
    const title = this.add.text(512, 174, `${building.name}을 우리 손으로 지어 보자`, {
      color: "#f7ecd6", fontSize: "20px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
    }).setOrigin(0.5).setDepth(1502);
    const progress = this.add.text(512, 326, `1/${steps.length} · ${steps[0]}`, {
      color: "#d9e6c0", fontSize: "15px", fontFamily: '"Malgun Gothic", sans-serif',
    }).setOrigin(0.5).setDepth(1502);
    const close = (): void => {
      shade.destroy(); panel.destroy(); preview.destroy(); title.destroy(); progress.destroy(); action.destroy(); cancel.destroy();
    };
    const finish = (): void => {
      const events = getGameEngine().dispatch(commands.buildHouse(slot.id, building.id));
      const rejected = events.find((event) => event.type === "RULE_REJECTED");
      if (rejected) {
        close();
        showToast(this, rejected.message, "error", 1000);
        return;
      }
      const happiness = events.find((event) => event.type === "HAPPINESS_CHANGED");
      playSoundCue("build", getGameEngine().getState().preferences.masterVolume);
      const delta = Number(happiness?.data.delta ?? 0);
      close();
      this.scene.restart({
        recentEventType: events.some((event) => event.type === "HOME_COMPLETED") ? "HOME_COMPLETED" : "HOUSE_BUILT",
        builtSlotId: slot.id,
        happinessDelta: delta,
      });
    };
    const action = addButton(this, 512, 390, 290, 50, steps[0] ?? "마무리하기", () => {
      this.tweens.add({ targets: preview, angle: { from: -4, to: 4 }, duration: 110, yoyo: true, repeat: 1 });
      stepIndex += 1;
      if (stepIndex >= steps.length) {
        finish();
        return;
      }
      const nextStep = steps[stepIndex] ?? "마무리하기";
      progress.setText(`${stepIndex + 1}/${steps.length} · ${nextStep}`);
      const actionText = action.getAt(2) as Phaser.GameObjects.Text;
      actionText.setText(nextStep);
    }, { fill: palette.warmDark, fontSize: 15 });
    action.setDepth(1503);
    const cancel = addButton(this, 512, 445, 180, 34, "나중에 짓기", close, { fill: palette.inkSoft, fontSize: 12 });
    cancel.setDepth(1503);
  }

  private addBuildingShape(
    x: number,
    y: number,
    building: BuildingDefinition,
    installed: boolean,
  ): Phaser.GameObjects.Container {
    if (this.textures.exists("house-objects") && this.textures.get("house-objects").has(building.id)) {
      const sprite = this.add.image(0, -12, "house-objects", building.id)
        .setDisplaySize(building.category === "wall" ? 82 : 88, building.category === "wall" ? 110 : 117)
        .setAlpha(installed ? 1 : 0.22);
      return this.add.container(x, y, [sprite]);
    }
    const color = Phaser.Display.Color.HexStringToColor(building.color).color;
    const alpha = installed ? 1 : 0.22;
    const parts: Phaser.GameObjects.GameObject[] = [];
    if (building.category === "roof") {
      parts.push(this.add.triangle(0, 0, -18, 12, 18, 12, 0, -10, color, alpha));
    } else if (building.category === "bed") {
      parts.push(this.add.ellipse(0, 2, 38, 18, color, alpha), this.add.circle(-12, -3, 7, 0xe8c98b, alpha));
    } else if (building.category === "wall") {
      parts.push(this.add.rectangle(0, 0, 34, 25, color, alpha), this.add.line(0, 0, -13, -8, 13, 8, 0x35422f, alpha).setLineWidth(2));
    } else if (building.category === "path") {
      parts.push(this.add.ellipse(0, 5, 38, 14, color, alpha));
    } else if (building.category === "flowerbed") {
      parts.push(this.add.ellipse(0, 6, 38, 14, color, alpha), this.add.circle(-8, -3, 5, 0xe6c082, alpha), this.add.circle(8, -5, 5, 0xc98175, alpha));
    } else {
      parts.push(this.add.circle(0, 2, 16, color, alpha), this.add.circle(-8, -7, 8, 0x93b07b, alpha));
    }
    return this.add.container(x, y, parts);
  }

  private playArrivalMoment(): void {
    if (!this.quokka) return;
    const autoSleep = shouldAutoSleepAtHome(getGameEngine().getState());
    if (autoSleep) {
      this.tweens.add({ targets: this.quokka, x: 480, duration: 620, ease: "Sine.Out" });
      showToast(this, "오늘은 더 지을 재료가 없네. 가방을 내려놓고 푹 쉬자.", "normal", 1150);
      this.time.delayedCall(900, () => this.playSleepSequence(false));
    } else if (this.returning) {
      this.tweens.add({ targets: this.quokka, x: 480, duration: 720, ease: "Sine.Out" });
      showToast(this, this.recentEventType === "STEP_ONE_COMPLETED"
        ? "배관망이 환해졌어. 오늘은 우리 집에서 천천히 쉬어 보자."
        : "오늘 주운 재료를 집에 가져왔어. 잠들기 전에 집을 손볼 수 있어.", "success", 1500);
    } else if (this.wokeUp) {
      const scaleY = this.quokka.scaleY;
      this.quokka.setScale(this.quokka.scaleX, scaleY * 0.72);
      this.tweens.add({ targets: this.quokka, scaleY, duration: 520, ease: "Back.Out" });
      showToast(this, `행복도 ${getGameEngine().getState().happiness} 덕분에 오늘 활동력이 ${getGameEngine().getState().maxActivity}이야.`, "success", 1400);
    }
    if (this.happinessDelta > 0) {
      const heart = this.add.text(480, 420, `♥ +${this.happinessDelta}`, {
        color: "#f4d28f", fontSize: "24px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
      }).setOrigin(0.5).setDepth(100);
      this.tweens.add({ targets: heart, y: 382, alpha: 0, duration: 1200, onComplete: () => heart.destroy() });
      this.tweens.add({ targets: this.quokka, y: this.quokka.y - 8, duration: 220, yoyo: true, repeat: 2 });
    }
  }

  private playSleepSequence(showRestToast = true): void {
    if (!this.quokka || this.isSleeping) return;
    this.isSleeping = true;
    playSoundCue("sleep", getGameEngine().getState().preferences.masterVolume);
    const state = getGameEngine().getState();
    const bedSlot = homeSlots.find((slot) => slot.category === "bed" && state.houseSlots[slot.id]);
    const targetX = bedSlot ? 285 + bedSlot.x * 79 : 610;
    const targetY = bedSlot ? 220 + bedSlot.y * 67 : 455;
    if (!bedSlot) this.add.ellipse(targetX, targetY + 18, 90, 28, 0x9b7747, 0.8).setDepth(20);
    if (showRestToast) {
      showToast(this, bedSlot ? "내가 만든 침대가 오늘은 더 포근해." : "오늘은 낙엽을 둥글게 모아 쉬어야겠다.", "normal", 1100);
    }
    this.tweens.add({
      targets: this.quokka,
      x: targetX,
      y: targetY,
      duration: 650,
      ease: "Sine.InOut",
      onComplete: () => {
        this.tweens.add({ targets: this.quokka, angle: 82, scaleY: 0.82, duration: 480 });
        const dark = this.add.rectangle(512, 288, 1024, 576, 0x0f1719, 0).setDepth(2000);
        this.tweens.add({
          targets: dark,
          alpha: 1,
          delay: 350,
          duration: 700,
          onComplete: () => {
            getGameEngine().dispatch(commands.endDay());
            if (getGameEngine().getState().gameCompleted) this.scene.start("ResultScene");
            else this.scene.restart({ wokeUp: true, recentEventType: "DAY_ENDED" });
          },
        });
      },
    });
  }

  private followGuidance(destination: GuidanceDestination): void {
    if (destination.scene === "home") {
      this.scene.restart({ focusId: destination.focusId });
    } else if (destination.scene === "workshop") {
      this.scene.start("WorkshopScene", {
        focusId: destination.focusId,
        ingredients: destination.ingredients,
      });
    } else {
      this.scene.start("PipeMapScene", {
        focusZoneId: destination.zoneId,
        focusId: destination.focusId,
      });
    }
  }

  private notableEvent(events: GameEvent[]): GameEvent | undefined {
    return events.find((event) => ["GAME_COMPLETED", "STEP_ONE_COMPLETED", "WORK_ENDED", "DAY_ENDED", "ZONE_UNLOCKED", "HOUSE_BUILT", "HOUSE_REMOVED", "ITEM_CRAFTED"].includes(event.type))
      ?? events[0];
  }

  private itemName(itemId: string): string {
    return items.find((item) => item.id === itemId)?.name ?? itemId;
  }
}
