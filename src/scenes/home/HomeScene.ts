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
import { activityForHappiness } from "../../systems/progression";
import { addButton, addPanel, addQuokka, addTitle, showToast } from "../../ui/components";
import { palette } from "../../ui/palette";

const buildings = buildingsJson as unknown as BuildingDefinition[];
const accessories = accessoriesJson as unknown as AccessoryDefinition[];
const items = itemsJson as unknown as ItemDefinition[];
const recipes = recipesJson as unknown as RecipeDefinition[];
const homeSlots = (mapsJson as unknown as { homeSlots: HouseSlotDefinition[] }).homeSlots;

export class HomeScene extends Phaser.Scene {
  public constructor() {
    super("HomeScene");
  }

  public create(): void {
    this.cameras.main.setBackgroundColor("#4a3e32");
    this.drawBackground();
    this.drawHeader();
    this.drawInventory();
    this.drawShelter();
    this.drawWorkshop();
  }

  private drawBackground(): void {
    this.add.rectangle(512, 330, 1024, 500, 0x6e563e);
    for (let x = 0; x < 1024; x += 64) {
      for (let y = 90; y < 576; y += 64) {
        this.add.circle(x + ((y / 64) % 2) * 25, y, 3, 0x8f7659, 0.5);
      }
    }
    this.add.rectangle(512, 45, 1024, 90, palette.ink, 0.98);
  }

  private drawHeader(): void {
    const state = getGameEngine().getState();
    addQuokka(this, 48, 47).setScale(0.68);
    addTitle(this, 80, 16, "쿼카의 덤불집", 24);
    this.add.text(82, 49, `${state.day}일 차 · 활동력 ${state.currentActivity}/${state.maxActivity}`, {
      color: "#c8d9d3",
      fontSize: "14px",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
    this.add.text(390, 30, `행복도 ${state.happiness}  →  다음 날 활동력 ${activityForHappiness(state.happiness)}`, {
      color: "#f0d69d",
      fontSize: "16px",
      fontStyle: "bold",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
    addButton(this, 885, 45, 220, 52, "배관으로 출근하기  →", () => {
      this.scene.start("WorkplaceScene");
    }, { fill: palette.warmDark, hoverFill: palette.warm, fontSize: 16 });
  }

  private drawInventory(): void {
    const state = getGameEngine().getState();
    addPanel(this, 18, 102, 206, 456, palette.panelWarm);
    addTitle(this, 34, 118, "재료 가방", 19);
    this.add.text(34, 147, "집과 장비가 같은 재료를 사용해요.", {
      color: "#d1c2ab",
      fontSize: "11px",
      fontFamily: '"Malgun Gothic", sans-serif',
    });

    const visibleItems = items.slice(0, 10);
    visibleItems.forEach((item, index) => {
      const y = 184 + index * 28;
      this.add.circle(43, y + 5, 7, Phaser.Display.Color.HexStringToColor(item.color).color);
      this.add.text(58, y - 5, item.name, {
        color: item.category === "rare" ? "#f2d38b" : "#f1eadb",
        fontSize: "13px",
        fontFamily: '"Malgun Gothic", sans-serif',
      });
      this.add.text(199, y - 5, `${state.inventory[item.id] ?? 0}`, {
        color: "#ffffff",
        fontSize: "14px",
        fontStyle: "bold",
        fontFamily: '"Malgun Gothic", sans-serif',
      }).setOrigin(1, 0);
    });

    const pileDisabled = state.dailyLeafPileRemaining <= 0;
    addButton(this, 121, 518, 174, 48, `집 앞 잔해 정리 (${state.dailyLeafPileRemaining}/2)`, () => {
      this.runCommand(commands.harvestDailyPile());
    }, { fill: palette.warmDark, disabled: pileDisabled, fontSize: 13 });
  }

  private drawShelter(): void {
    const state = getGameEngine().getState();
    addPanel(this, 236, 102, 490, 456, 0x3f4935);
    addTitle(this, 252, 118, "고정 슬롯 덤불집", 19);
    this.add.text(252, 148, "빈 슬롯: 설치 · 설치된 슬롯: 전액 회수", {
      color: "#cbd4b6",
      fontSize: "12px",
      fontFamily: '"Malgun Gothic", sans-serif',
    });

    homeSlots.forEach((slot) => {
      const buildingId = state.houseSlots[slot.id];
      const building = buildings.find((candidate) => candidate.id === (buildingId ?? slot.defaultBuildingId));
      if (!building) return;
      const installed = buildingId !== null;
      const x = 290 + slot.x * 91;
      const y = 210 + slot.y * 79;
      const cost = building.cost.map((entry) => `${this.itemName(entry.itemId)}${entry.amount}`).join(" ");
      const label = installed
        ? `${building.name}\n♥ ${building.happiness} · 회수`
        : `${building.name}\n${cost}`;
      addButton(this, x, y, 82, 62, label, () => {
        this.runCommand(
          installed
            ? commands.removeHouse(slot.id)
            : commands.buildHouse(slot.id, slot.defaultBuildingId),
        );
      }, {
        fill: installed ? Phaser.Display.Color.HexStringToColor(building.color).color : 0x39453a,
        hoverFill: installed ? palette.warmDark : palette.grass,
        fontSize: 10,
      });
    });

    this.add.text(252, 524, "보너스: 침대+지붕 · 벽 4개 · 통로 5개 · 같은 테마 3개", {
      color: "#bfc9aa",
      fontSize: "11px",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
  }

  private drawWorkshop(): void {
    const state = getGameEngine().getState();
    addPanel(this, 738, 102, 268, 456, palette.panel);
    addTitle(this, 754, 118, "작업대", 19);
    this.add.text(754, 148, `청소기 ${state.cleanerLevel}단계`, {
      color: "#b9ddd2",
      fontSize: "15px",
      fontStyle: "bold",
      fontFamily: '"Malgun Gothic", sans-serif',
    });

    const nextUpgrade = recipes.find(
      (recipe) => recipe.kind === "cleaner_upgrade" && recipe.cleanerLevel === state.cleanerLevel + 1,
    );
    this.add.text(754, 188, nextUpgrade ? `다음 성장: ${nextUpgrade.name}` : "청소기 최고 단계 달성", {
      color: "#b9ddd2",
      fontSize: "13px",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
    const equippedId = state.equippedAccessories[0];
    const equipped = accessories.find((accessory) => accessory.id === equippedId)?.name ?? "없음";
    this.add.text(754, 224, `발견 레시피 ${state.discoveredRecipes.length}/5`, {
      color: "#e9d59f",
      fontSize: "14px",
      fontStyle: "bold",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
    this.add.text(754, 256, `장착 액세서리\n${equipped}`, {
      color: "#b9c9c5",
      fontSize: "12px",
      lineSpacing: 6,
      fontFamily: '"Malgun Gothic", sans-serif',
    });

    addButton(this, 872, 345, 224, 64, "작업실 열기\n장비 · 배합 · 수첩", () => {
      this.scene.start("WorkshopScene");
    }, { fill: palette.clean, fontSize: 15 });

    addButton(this, 872, 456, 224, 44, "오늘 일찍 쉬기", () => {
      this.runCommand(commands.endDay());
    }, { fill: palette.warmDark, fontSize: 13 });
    this.add.text(754, 498, "작업실의 제작·배합도 활동력 1을 사용합니다.\n활동력 0이면 자동으로 다음 날이 됩니다.", {
      color: "#93a9a5",
      fontSize: "11px",
      fontFamily: '"Malgun Gothic", sans-serif',
    });
  }

  private runCommand(command: GameCommand): void {
    const events = getGameEngine().dispatch(command);
    const rejected = events.find((event) => event.type === "RULE_REJECTED");
    const notable = this.notableEvent(events);
    showToast(this, (rejected ?? notable)?.message ?? "완료했습니다.", rejected ? "error" : "success");
    if (!rejected) {
      this.time.delayedCall(events.some((event) => event.type === "DAY_ENDED") ? 900 : 420, () => {
        if (events.some((event) => event.type === "GAME_COMPLETED")) this.scene.start("ResultScene");
        else this.scene.restart();
      });
    }
  }

  private notableEvent(events: GameEvent[]): GameEvent | undefined {
    return events.find((event) => ["GAME_COMPLETED", "DAY_ENDED", "ZONE_UNLOCKED", "HOUSE_BUILT", "HOUSE_REMOVED", "ITEM_CRAFTED"].includes(event.type))
      ?? events[0];
  }

  private itemName(itemId: string): string {
    const name = items.find((item) => item.id === itemId)?.name ?? itemId;
    return name.slice(0, 1);
  }
}
