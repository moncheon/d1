import * as Phaser from "phaser";
import accessoriesJson from "../../data/accessories.json";
import itemsJson from "../../data/items.json";
import recipesJson from "../../data/recipes.json";
import { commands, type GameCommand } from "../../core/commands";
import type { GameEvent } from "../../core/events";
import { getGameEngine } from "../../core/gameContext";
import type { AccessoryDefinition, ItemDefinition, LiquidId, RecipeDefinition } from "../../entities/types";
import {
  accessoryAvailability,
  mixtureAvailability,
  recipeAvailability,
  type ActionAvailability,
} from "../../systems/availability";
import { getQuokkaGuidance, type GuidanceDestination } from "../../systems/guidance";
import { addButton, addPanel, addQuokka, addTitle, setQuokkaPose, showToast } from "../../ui/components";
import { addQuokkaGuide } from "../../ui/quokkaGuide";
import { palette } from "../../ui/palette";
import { bindAmbient } from "../../ui/sound";

const accessories = accessoriesJson as unknown as AccessoryDefinition[];
const items = itemsJson as unknown as ItemDefinition[];
const recipes = recipesJson as unknown as RecipeDefinition[];
const liquidIds: LiquidId[] = ["water", "leaf_enzyme", "grass_ferment", "clay_binder"];
const liquidNames: Record<LiquidId, string> = {
  water: "물",
  leaf_enzyme: "잎 효소",
  grass_ferment: "풀 발효",
  clay_binder: "점토 결합",
};

interface WorkshopSceneData {
  ingredients?: LiquidId[];
  message?: string;
  focusId?: string;
  recentEventType?: GameEvent["type"];
  intent?: GameCommand;
  returnZoneId?: string;
  returnPlayerX?: number;
  returnPlayerY?: number;
  returnSolutionId?: string;
}

export class WorkshopScene extends Phaser.Scene {
  private ingredients: [LiquidId, LiquidId, LiquidId] = ["water", "water", "water"];
  private startupMessage?: string;
  private focusId?: string;
  private recentEventType?: GameEvent["type"];
  private intent?: GameCommand;
  private returnZoneId?: string;
  private returnPlayerX?: number;
  private returnPlayerY?: number;
  private returnSolutionId?: string;

  public constructor() {
    super("WorkshopScene");
  }

  public init(data: WorkshopSceneData = {}): void {
    if (data.ingredients?.length === 3) {
      this.ingredients = [...data.ingredients] as [LiquidId, LiquidId, LiquidId];
    }
    this.startupMessage = data.message;
    this.focusId = data.focusId;
    this.recentEventType = data.recentEventType;
    this.intent = data.intent;
    this.returnZoneId = data.returnZoneId;
    this.returnPlayerX = data.returnPlayerX;
    this.returnPlayerY = data.returnPlayerY;
    this.returnSolutionId = data.returnSolutionId;
  }

  public create(): void {
    this.cameras.main.setBackgroundColor("#263638");
    this.add.image(512, 288, "home-diorama").setDisplaySize(1024, 576).setTint(0x8ca37b);
    this.add.rectangle(512, 330, 1024, 492, 0x142328, 0.52);
    this.add.rectangle(512, 42, 1024, 84, palette.ink, 0.94);
    addTitle(this, 24, 15, "쿼카의 장비 작업실", 24);
    const state = getGameEngine().getState();
    this.add.text(25, 51, `${state.day}일 차 · 활동력 ${state.currentActivity}/${state.maxActivity}`, {
      color: "#c6ded7", fontSize: "14px", fontFamily: '"Malgun Gothic", sans-serif',
    });
    addButton(this, 910, 42, 174, 48, this.returnZoneId ? "← 배관으로" : "← 집으로", () => {
      if (this.returnZoneId) {
        this.scene.start("WorkplaceScene", {
          zoneId: this.returnZoneId,
          playerX: this.returnPlayerX,
          playerY: this.returnPlayerY,
          solutionId: this.returnSolutionId,
        });
      } else {
        this.scene.start("HomeScene");
      }
    }, {
      fill: palette.warmDark, fontSize: 14,
    });
    this.drawInventory();
    this.drawMixer();
    this.drawEquipment();
    const quokka = addQuokka(this, 695, 510).setScale(0.62).setDepth(70);
    setQuokkaPose(quokka, 7);
    bindAmbient(this, "home", state.preferences.masterVolume);
    const guidance = getQuokkaGuidance(getGameEngine().snapshot(), {
      scene: "workshop",
      recentEventType: this.recentEventType,
      intent: this.intent,
    });
    addQuokkaGuide(this, guidance, {
      sceneName: "workshop",
      actor: quokka,
      onFollow: (destination) => this.followGuidance(destination),
    });
    if (this.startupMessage) showToast(this, this.startupMessage, "success", 1100);
  }

  private drawInventory(): void {
    const state = getGameEngine().getState();
    addPanel(this, 18, 96, 202, 462, palette.panelWarm, 0.9);
    addTitle(this, 32, 112, "재료 가방", 18);
    items.forEach((item, index) => {
      const y = 151 + index * 28;
      this.add.circle(39, y + 5, 6, Phaser.Display.Color.HexStringToColor(item.color).color);
      this.add.text(52, y - 4, item.name, {
        color: item.category === "rare" ? "#f2d38b" : "#eee7d7",
        fontSize: "12px", fontFamily: '"Malgun Gothic", sans-serif',
      });
      this.add.text(197, y - 4, `${state.inventory[item.id] ?? 0}`, {
        color: "#fff", fontSize: "13px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
      }).setOrigin(1, 0);
    });
    this.add.text(32, 435, "기초 세정액", {
      color: "#d9c99e", fontSize: "13px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
    });
    const liquidRecipes = recipes.filter((recipe) => recipe.kind === "liquid");
    liquidRecipes.forEach((recipe, index) => {
      const liquidId = recipe.outputId as LiquidId;
      const availability = recipeAvailability(state, recipe);
      addButton(this, 119, 470 + index * 31, 170, 27,
        availability.enabled
          ? `${liquidNames[liquidId]} +3 · 보유 ${state.preparedLiquids[liquidId]}`
          : `${liquidNames[liquidId]} · ${this.availabilityLabel(availability)}`,
        () => this.runCommand(commands.craftRecipe(recipe.id)),
        { disabled: !availability.enabled, fill: 0x40565a, fontSize: 10, highlighted: this.focusId === recipe.id },
      );
    });
  }

  private drawMixer(): void {
    const state = getGameEngine().getState();
    addPanel(this, 230, 96, 480, 462, 0x334447, 0.91);
    addTitle(this, 246, 112, "세 방울 조합대", 18);
    this.add.text(246, 142, "순서는 결과에 영향을 주지 않습니다. 물은 무료입니다.", {
      color: "#b8cbc6", fontSize: "11px", fontFamily: '"Malgun Gothic", sans-serif',
    });
    this.ingredients.forEach((ingredient, index) => {
      const amount = ingredient === "water" ? "∞" : `${state.preparedLiquids[ingredient]}`;
      addButton(this, 309 + index * 158, 193, 140, 54, `${index + 1}번 · ${liquidNames[ingredient]}\n보유 ${amount}`, () => {
        const current = liquidIds.indexOf(ingredient);
        this.ingredients[index] = liquidIds[(current + 1) % liquidIds.length] ?? "water";
        this.scene.restart(this.restartData({ ingredients: this.ingredients }));
      }, { fill: 0x496166, fontSize: 12 });
    });
    const mixAvailability = mixtureAvailability(state, this.ingredients);
    addButton(this, 470, 257, 260, 48, mixAvailability.enabled
      ? "이 조합 시험하기 · 활동력 1"
      : `조합할 수 없음 · ${this.availabilityLabel(mixAvailability)}`, () => {
      this.runCommand(commands.mixLiquids([...this.ingredients]));
    }, {
      disabled: !mixAvailability.enabled,
      fill: palette.clean,
      hoverFill: palette.grass,
      fontSize: 14,
      highlighted: this.focusId === "mixer",
    });

    this.add.text(246, 296, `레시피 수첩 · 발견 ${state.discoveredRecipes.length}/5`, {
      color: "#f1d99e", fontSize: "14px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
    });
    const failedAttempts = state.mixtureAttempts.filter((attempt) => !attempt.success).length;
    this.add.text(694, 297, `실험 ${state.mixtureAttempts.length}회 · 실패 ${failedAttempts}회`, {
      color: "#aebfba", fontSize: "10px", fontFamily: '"Malgun Gothic", sans-serif',
    }).setOrigin(1, 0);
    recipes.filter((recipe) => recipe.kind === "mixture").forEach((recipe, index) => {
      const discovered = state.discoveredRecipes.includes(recipe.id);
      const y = 330 + index * 43;
      this.add.rectangle(470, y + 14, 442, 36, discovered ? 0x4a654f : 0x293a3d, 1)
        .setStrokeStyle(1, palette.pipeLight, 0.65);
      const ingredients = recipe.ingredients?.map((id) => liquidNames[id]).join(" + ") ?? "";
      this.add.text(258, y, discovered
        ? `${recipe.name} · ${ingredients}\n${recipe.effect ?? "깊은 오염 제거"}`
        : `미발견 · ${recipe.hint ?? "오염 흔적을 관찰하세요."}`, {
        color: discovered ? "#e8f2dc" : "#aebfba",
        fontSize: discovered ? "9px" : "10px",
        lineSpacing: 1,
        fontFamily: '"Malgun Gothic", sans-serif',
        wordWrap: { width: 418 },
      });
    });
  }

  private drawEquipment(): void {
    const state = getGameEngine().getState();
    addPanel(this, 720, 96, 286, 462, palette.panel, 0.91);
    addTitle(this, 736, 112, `청소기 ${state.cleanerLevel}단계`, 18);
    const nextUpgrade = recipes.find(
      (recipe) => recipe.kind === "cleaner_upgrade" && recipe.cleanerLevel === state.cleanerLevel + 1,
    );
    const upgradeAvailability = nextUpgrade ? recipeAvailability(state, nextUpgrade) : undefined;
    addButton(this, 863, 171, 246, 50, nextUpgrade
      ? `${nextUpgrade.name}\n${upgradeAvailability?.enabled ? this.costLabel(nextUpgrade.costs ?? []) : this.availabilityLabel(upgradeAvailability!)}`
      : "최고 단계 달성", () => {
      if (nextUpgrade) this.runCommand(commands.craftRecipe(nextUpgrade.id));
    }, {
      disabled: !nextUpgrade || !upgradeAvailability?.enabled,
      fill: palette.clean,
      fontSize: 12,
      highlighted: Boolean(nextUpgrade && this.focusId === nextUpgrade.id),
    });
    this.add.text(736, 211, "액세서리 · 한 번에 하나 장착", {
      color: "#b8cbc6", fontSize: "12px", fontStyle: "bold", fontFamily: '"Malgun Gothic", sans-serif',
    });
    accessories.forEach((accessory, index) => {
      const owned = state.ownedAccessories.includes(accessory.id);
      const equipped = state.equippedAccessories.includes(accessory.id);
      const availability = accessoryAvailability(state, accessory);
      const label = owned
        ? `${accessory.name}${equipped ? " · 장착 중" : " · 장착"}\n${equipped ? this.availabilityLabel(availability) : accessory.description}`
        : `${accessory.name} 제작\n${availability.enabled ? this.costLabel(accessory.cost) : this.availabilityLabel(availability, accessory.requiredCleanerLevel)}`;
      addButton(this, 863, 262 + index * 88, 246, 72, label, () => {
        this.runCommand(owned ? commands.equipAccessory(accessory.id) : commands.craftAccessory(accessory.id));
      }, {
        fill: equipped ? palette.grass : Phaser.Display.Color.HexStringToColor(accessory.color).color,
        disabled: !availability.enabled,
        fontSize: 11,
        highlighted: this.focusId === accessory.id,
      });
    });
    this.add.text(736, 522, "깊은 4층은 알맞은 액세서리와 세정액이 모두 필요합니다.", {
      color: "#94aaa5", fontSize: "10px", wordWrap: { width: 250 }, fontFamily: '"Malgun Gothic", sans-serif',
    });
  }

  private runCommand(command: GameCommand): void {
    const events = getGameEngine().dispatch(command);
    const rejected = events.find((event) => event.type === "RULE_REJECTED");
    if (rejected) {
      showToast(this, rejected.message, "error", 1200);
      this.time.delayedCall(520, () => this.scene.restart({
        ...this.restartData(),
        recentEventType: "RULE_REJECTED",
        intent: command,
      }));
      return;
    }
    if (events.some((event) => event.type === "WORK_ENDED")) {
      this.scene.start("HomeScene", { recentEventType: "WORK_ENDED", returning: true });
      return;
    }
    const notable = events.find((event) => ["RECIPE_DISCOVERED", "MIXTURE_ATTEMPTED", "ACCESSORY_CRAFTED", "ACCESSORY_EQUIPPED", "ITEM_CRAFTED"].includes(event.type));
    if (notable?.type === "MIXTURE_ATTEMPTED" && notable.data.success === true && typeof notable.data.recipeId === "string") {
      this.returnSolutionId = recipes.find((recipe) => recipe.id === notable.data.recipeId)?.outputId;
    }
    this.scene.restart({
      ...this.restartData(),
      message: notable?.message ?? "완료했습니다.",
      recentEventType: notable?.type,
    });
  }

  private followGuidance(destination: GuidanceDestination): void {
    if (destination.scene === "workshop") {
      this.scene.restart({
        ...this.restartData({ ingredients: destination.ingredients ?? this.ingredients }),
        focusId: destination.focusId,
      });
    } else if (destination.scene === "home") {
      this.scene.start("HomeScene", { focusId: destination.focusId });
    } else {
      this.scene.start("PipeMapScene", {
        focusZoneId: destination.zoneId,
        focusId: destination.focusId,
      });
    }
  }

  private costLabel(costs: Array<{ itemId: string; amount: number }>): string {
    return costs.map((cost) => `${items.find((item) => item.id === cost.itemId)?.name ?? cost.itemId} ${cost.amount}`).join(" · ");
  }

  private availabilityLabel(availability: ActionAvailability, cleanerLevel?: number): string {
    if (availability.blocker === "no_activity") return "활동력 0 · 잠든 뒤 가능";
    if (availability.blocker === "cleaner_level") return `청소기 ${cleanerLevel ?? "다음"}단계 필요`;
    if (availability.blocker === "already_equipped") return "이미 장착 중";
    if (availability.blocker === "liquids") {
      return `부족 · ${availability.missing.map((cost) => `${liquidNames[cost.itemId as LiquidId] ?? cost.itemId} ${cost.amount}`).join(" · ")}`;
    }
    if (availability.blocker === "materials") return `부족 · ${this.costLabel(availability.missing)}`;
    return "가능";
  }

  private restartData(overrides: WorkshopSceneData = {}): WorkshopSceneData {
    return {
      ingredients: this.ingredients,
      returnZoneId: this.returnZoneId,
      returnPlayerX: this.returnPlayerX,
      returnPlayerY: this.returnPlayerY,
      returnSolutionId: this.returnSolutionId,
      ...overrides,
    };
  }
}
