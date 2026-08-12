export type ItemId = string;
export type BuildingId = string;
export type DirtTypeId = string;
export type ZoneId = string;
export type HouseAnchorId = string;
export type LiquidId = "water" | "leaf_enzyme" | "grass_ferment" | "clay_binder";
export type CleanTechnique = "sweep" | "loosen" | "soak";
export type CleanQuality = "standard" | "careful";

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
  spriteKey: string;
  interaction: CleanTechnique;
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
  description: string;
  spriteKey: string;
  routineKey: string;
}

export type HouseAnchorRole = "rest" | "shell" | "canopy" | "threshold" | "garden" | "charm";
export type HouseAnchorLayer = "frame" | "interior" | "ornament" | "foreground";

export interface HouseAnchorDefinition {
  id: HouseAnchorId;
  role: HouseAnchorRole;
  layer: HouseAnchorLayer;
  category: BuildingCategory;
  buildingOptions: BuildingId[];
  x: number;
  y: number;
  angle: number;
  scale: number;
  depth: number;
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
  nextZoneIds?: ZoneId[];
  completionTargetId: string;
  accent: string;
  theme: "entrance" | "organic" | "mineral";
  landmark: string;
  targets: DirtTargetDefinition[];
}

export type PipeShape = "straight" | "corner" | "tee" | "cap";

export interface PipeCellDefinition {
  id: string;
  column: number;
  row: number;
  shape: PipeShape;
  rotation: 0 | 90 | 180 | 270;
  zoneId?: ZoneId;
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
