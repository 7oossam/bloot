import { mulberry32 } from "../engine/rng";
import { EVENTS } from "./events";
import { pickOpponents, type OpponentTier } from "./opponents";
import type { MapNode, NodeType, RunState } from "./types";
import { MAX_JOKERS, REROLL_BASE_COST, REROLL_STEP, SHOP_JOKER_SLOTS, STARTING_GOLD, STARTING_LIVES } from "./types";

/** A fixed linear run for now — branching paths are a natural follow-up. */
const FLOOR_PLAN: NodeType[] = ["match", "diwaniya", "match", "shop", "match", "diwaniya", "elite", "shop", "boss"];
/** The three matches, in order: their targets and gold (tuned against shop prices). */
const MATCH_TARGETS = [41, 61, 101];
const MATCH_REWARDS = [20, 25, 35];

export function generateMap(seed: number): RunState {
  let matchNo = 0;
  const nodes: MapNode[] = FLOOR_PLAN.map((type, floor) => {
    if (type === "shop" || type === "diwaniya") {
      return { id: `node-${floor}`, type, floor, reward: 0 };
    }
    const nth = type === "match" ? matchNo++ : 0;
    const target = type === "boss" ? 131 : type === "elite" ? 101 : MATCH_TARGETS[nth];
    const reward = type === "boss" ? 80 : type === "elite" ? 50 : MATCH_REWARDS[nth];
    return { id: `node-${floor}`, type, floor, matchTarget: target, reward };
  });
  // Every fight has its opponents, known from the start so the run can be planned around them.
  const rand = mulberry32(seed ^ 0x5eed);
  const fights = nodes.filter((n) => n.type === "match" || n.type === "elite" || n.type === "boss");
  const rivals = pickOpponents(fights.map((n) => n.type as OpponentTier), rand);
  fights.forEach((n, i) => (n.opponent = rivals[i]));
  // Each ديوانية gets a different event.
  const events = [...EVENTS].sort(() => rand() - 0.5);
  nodes.filter((n) => n.type === "diwaniya").forEach((n, i) => (n.event = events[i % events.length].id));

  return {
    seed,
    nodes,
    currentIndex: -1,
    lives: STARTING_LIVES,
    gold: STARTING_GOLD,
    jokerIds: [],
    jokerLevels: {},
    maxJokers: MAX_JOKERS,
    shopSlots: SHOP_JOKER_SLOTS,
    rerollBase: REROLL_BASE_COST,
    rerollStep: REROLL_STEP,
    upgrades: {},
    salary: 0,
    nextMatchBoost: 0,
    nextMatchPenalty: 0,
    jokerCounters: {},
    nodeWon: nodes.map(() => false),
    shields: 0,
    shopStock: [],
    rerollCost: REROLL_BASE_COST,
    cleared: nodes.map(() => false),
    over: false,
    won: false,
  };
}
