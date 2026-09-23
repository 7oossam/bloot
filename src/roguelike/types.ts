export type NodeType = "match" | "elite" | "shop" | "boss";

export interface MapNode {
  id: string;
  type: NodeType;
  floor: number; // 0-indexed depth along the run
  matchTarget?: number; // present for match/elite/boss nodes
  reward: number; // gold earned on winning this node (match/elite/boss)
}

export interface RunState {
  seed: number;
  nodes: MapNode[]; // linear order, floor 0 first
  currentIndex: number; // index into nodes of the node the player is standing at (-1 = not started)
  lives: number;
  gold: number;
  jokerIds: string[];
  /** Each one absorbs the life a lost match would cost. */
  shields: number;
  /** What the current shop visit is selling (item ids), fixed until the player rerolls. */
  shopStock: string[];
  /** Price of the next reroll in the current shop visit; goes up each time. */
  rerollCost: number;
  cleared: boolean[]; // parallel to nodes: true once that node is resolved
  over: boolean; // run ended (won or lost)
  won: boolean;
}

export const STARTING_LIVES = 3;
export const MAX_JOKERS = 4;
export const MAX_LIVES = 5;
export const REROLL_BASE_COST = 5;
export const REROLL_STEP = 5;
/** How many jokers a shop shows at once (plus one consumable). */
export const SHOP_JOKER_SLOTS = 3;
