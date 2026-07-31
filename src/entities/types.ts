export type ItemId = string;
export type BuildingId = string;
export type DirtTypeId = string;
export type ZoneId = string;
export type HouseSlotId = string;
export type LiquidId = "water" | "leaf_enzyme" | "grass_ferment" | "clay_binder";

export interface ItemDefinition {
  id: ItemId;
  name: string;
  category: "common" | "processed" | "rare";
  color: string;
}

export interface Cost {
  itemId: ItemId;
  amount: number;
}

export interface RewardRange {
  itemId: ItemId;
  min: number;
  max: number;
}

export interface DirtDefinition {
  id: DirtTypeId;
  name: string;
  color: string;
  rewards: RewardRange[];
  layers: DirtLayerDefinition[];
}

export interface DirtLayerDefinition {
  level: number;
  name: string;
  requiredCleanerLevel: number;
  requiredSolutionId?: string;
  requiredAccessoryId?: string;
  rewards: RewardRange[];
  hint: string;
}

export type BuildingCategory = "bed" | "wall" | "roof" | "path" | "flowerbed" | "decor";

export interface BuildingDefinition {
  id: BuildingId;
  name: string;
  category: BuildingCategory;
  theme: string;
  happiness: number;
  cost: Cost[];
  color: string;
}

export interface HouseSlotDefinition {
  id: HouseSlotId;
  category: BuildingCategory;
  defaultBuildingId: BuildingId;
  x: number;
  y: number;
}

export interface DirtTargetDefinition {
  id: string;
  dirtTypeId: DirtTypeId;
  x: number;
  y: number;
}

export interface ZoneDefinition {
  id: ZoneId;
  name: string;
  unlockSurfaceRate: number;
  nextZoneId?: ZoneId;
  accent: string;
  targets: DirtTargetDefinition[];
}

export interface RecipeDefinition {
  id: string;
  name: string;
  kind: "cleaner_upgrade" | "liquid" | "mixture";
  outputId: string;
  outputAmount: number;
  costs?: Cost[];
  ingredients?: LiquidId[];
  cleanerLevel?: number;
  effect?: string;
  hint?: string;
}

export interface AccessoryDefinition {
  id: string;
  name: string;
  description: string;
  requiredCleanerLevel: number;
  cost: Cost[];
  color: string;
}
