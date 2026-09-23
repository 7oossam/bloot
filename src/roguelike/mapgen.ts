import type { MapNode, NodeType, RunState } from "./types";
import { MAX_JOKERS, REROLL_BASE_COST, SHOP_JOKER_SLOTS, STARTING_LIVES } from "./types";

/** A fixed linear run for the first pass — branching paths are a natural follow-up. */
const FLOOR_PLAN: NodeType[] = ["match", "match", "shop", "match", "elite", "shop", "boss"];

export function generateMap(seed: number): RunState {
  const nodes: MapNode[] = FLOOR_PLAN.map((type, floor) => {
    if (type === "shop") {
      return { id: `node-${floor}`, type, floor, reward: 0 };
    }
    const target =
      type === "boss" ? 131 : type === "elite" ? 101 : 41 + floor * 20;
    const reward = type === "boss" ? 60 : type === "elite" ? 35 : 15 + floor * 5;
    return { id: `node-${floor}`, type, floor, matchTarget: target, reward };
  });

  return {
    seed,
    nodes,
    currentIndex: -1,
    lives: STARTING_LIVES,
    gold: 0,
    jokerIds: [],
    jokerLevels: {},
    maxJokers: MAX_JOKERS,
    shopSlots: SHOP_JOKER_SLOTS,
    rerollBase: REROLL_BASE_COST,
    nodeWon: nodes.map(() => false),
    shields: 0,
    shopStock: [],
    rerollCost: REROLL_BASE_COST,
    cleared: nodes.map(() => false),
    over: false,
    won: false,
  };
}
