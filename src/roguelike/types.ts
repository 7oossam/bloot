export type NodeType = "match" | "elite" | "shop" | "boss" | "diwaniya";

export interface MapNode {
  id: string;
  type: NodeType;
  floor: number; // 0-indexed depth along the run
  matchTarget?: number; // present for match/elite/boss nodes
  reward: number; // gold earned on winning this node (match/elite/boss)
  /** Who you play here (src/roguelike/opponents.ts) — fight nodes only. */
  opponent?: string;
  /** What happens here (src/roguelike/events.ts) — ديوانية nodes only. */
  event?: string;
}

/** One of الحوت's gifts at the start of a run. */
export interface Blessing {
  kind: "rare" | "pair" | "gold" | "cursed";
  /** The jokers it gives (none for gold). */
  items: string[];
  gold: number;
  /** Lives it costs (the cursed gift). */
  lifeCost: number;
}

export interface RunState {
  seed: number;
  nodes: MapNode[]; // linear order, floor 0 first
  currentIndex: number; // index into nodes of the node the player is standing at (-1 = not started)
  lives: number;
  gold: number;
  jokerIds: string[];
  /** Level of each owned joker (1 when first bought). */
  jokerLevels: Record<string, number>;
  /** Joker slots this run (base plus the جيب زيادة upgrade). */
  maxJokers: number;
  /** How many jokers a shop puts on the shelf this run. */
  shopSlots: number;
  /** What a reroll costs at the start of each shop visit. */
  rerollBase: number;
  /** Parallel to nodes: true once that match node was won. */
  nodeWon: boolean[];
  /** Run upgrades bought in shops, by id → level. */
  upgrades: Record<string, number>;
  /** How much each reroll adds to the next one's price this visit. */
  rerollStep: number;
  /** Extra gold paid with every match win (الراتب). */
  salary: number;
  /** A start-ahead bonus for the next match only (the دفعة consumable). */
  nextMatchBoost: number;
  /** The opponents start the next match this far ahead (a ديوانية choice's price). */
  nextMatchPenalty: number;
  /** The joker the last تذكرة ترقية levelled up, for the shop to announce. */
  lastTicket?: string;
  /** Run-long counters some jokers grow (الحصالة). */
  jokerCounters: Record<string, number>;
  /** The spoils waiting after a won match: pick one of `items`, or skip for `skipGold`. */
  pendingRewards?: { items: string[]; skipGold: number; elite: boolean };
  /** Gold the treasury joker paid on entering the current shop, for the shop to show. */
  lastInterest?: number;
  /** Each one absorbs the life a lost match would cost. */
  shields: number;
  /** What the current shop visit is selling (item ids), fixed until the player rerolls. */
  shopStock: string[];
  /** Price of the next reroll in the current shop visit; goes up each time. */
  rerollCost: number;
  /** الحوت's offer before the first node; cleared once one is taken. */
  blessing?: Blessing[];
  cleared: boolean[]; // parallel to nodes: true once that node is resolved
  over: boolean; // run ended (won or lost)
  won: boolean;
}

export const STARTING_LIVES = 3;
export const STARTING_GOLD = 5;
export const MAX_JOKERS = 4;
export const MAX_LIVES = 5;
export const REROLL_BASE_COST = 3;
export const REROLL_STEP = 2;
/** How many jokers a shop shows at once (plus a consumable and a run upgrade). */
export const SHOP_JOKER_SLOTS = 3;
