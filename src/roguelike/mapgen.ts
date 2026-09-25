import { mulberry32 } from "../engine/rng";
import { EVENTS } from "./events";
import { pickOpponents, type OpponentTier } from "./opponents";
import type { MapNode, NodeType, RunState } from "./types";
import { MAX_JOKERS, REROLL_BASE_COST, REROLL_STEP, SHOP_JOKER_SLOTS, STARTING_GOLD, STARTING_LIVES } from "./types";

/** Rows of the map, bottom (0) to top: the last is the boss, the one before it a shop. */
export const MAP_ROWS = 9;
/** Columns a row's nodes can sit in. */
export const MAP_LANES = 3;
/** Elites only from this row up. */
const ELITE_FROM = 3;
/** Shops (besides the one before the boss) only from this row up. */
const SHOP_FROM = 3;

/** A match's target and gold grow with how high up the map it is. */
const matchTarget = (row: number) => 41 + row * 10;
const matchReward = (row: number) => 20 + row * 3;

/** What a middle-row node is, weighted (STS-like): mostly fights, a ديوانية or a shop now and then. */
function pickType(row: number, rand: () => number): NodeType {
  const weights: Array<[NodeType, number]> = [
    ["match", 50],
    ["diwaniya", 22],
    // No shop before there's gold to spend, nor right under the shop row before the boss.
    ["shop", row >= SHOP_FROM && row !== MAP_ROWS - 3 ? 10 : 0],
    ["elite", row >= ELITE_FROM ? 16 : 0],
  ];
  let roll = rand() * weights.reduce((n, [, w]) => n + w, 0);
  for (const [type, w] of weights) if ((roll -= w) < 0) return type;
  return "match";
}

/**
 * A branching run (like Slay the Spire's map): 2–3 nodes a row, each linked to the node in its
 * lane above and, per row, diagonally one way (all the same way, so paths never cross). Every
 * node can be reached and every node leads on; all paths meet at the shop row and the boss.
 */
export function generateMap(seed: number): RunState {
  const rand = mulberry32(seed ^ 0x5eed);
  const rows: MapNode[][] = [];
  for (let row = 0; row < MAP_ROWS; row++) {
    const boss = row === MAP_ROWS - 1;
    const lanes = boss ? [1] : rand() < 0.4 ? [0, 1, 2] : [[0, 1], [1, 2], [0, 2]][Math.floor(rand() * 3)];
    rows.push(
      lanes.map((col) => {
        const type: NodeType = boss ? "boss" : row === 0 ? "match" : row === MAP_ROWS - 2 ? "shop" : pickType(row, rand);
        const node: MapNode = { id: `n-${row}-${col}`, type, floor: row, col, next: [], reward: 0 };
        if (type === "match") Object.assign(node, { matchTarget: matchTarget(row), reward: matchReward(row) });
        if (type === "elite") Object.assign(node, { matchTarget: 101, reward: 50 });
        if (type === "boss") Object.assign(node, { matchTarget: 131, reward: 80 });
        return node;
      }),
    );
  }
  // The links between each row and the next.
  for (let row = 0; row < MAP_ROWS - 1; row++) {
    const here = rows[row];
    const above = rows[row + 1];
    const diagonal = rand() < 0.5 ? -1 : 1;
    for (const node of here) {
      for (const up of above) if (up.col === node.col || up.col === node.col! + diagonal || above.length === 1) node.next.push(up.id);
      // Nothing above in reach: go to the nearest.
      if (node.next.length === 0) node.next.push(nearest(above, node.col!).id);
    }
    for (const up of above) {
      if (!here.some((n) => n.next.includes(up.id))) nearest(here, up.col!).next.push(up.id);
    }
  }
  const nodes = rows.flat();
  // Every fight has its opponents, revealed as you walk in.
  const fights = nodes.filter((n) => n.type === "match" || n.type === "elite" || n.type === "boss");
  const rivals = pickOpponents(fights.map((n) => n.type as OpponentTier), rand);
  fights.forEach((n, i) => (n.opponent = rivals[i]));
  // The events are dealt out in a shuffled order, so neighbours differ.
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

function nearest(nodes: MapNode[], col: number): MapNode {
  return nodes.reduce((best, n) => (Math.abs(n.col! - col) < Math.abs(best.col! - col) ? n : best));
}

/** A path from the bottom row up to `targetId` (inclusive), or undefined if none reaches it. */
export function pathTo(nodes: MapNode[], targetId: string): MapNode[] | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const from = new Map<string, string | undefined>();
  const queue = nodes.filter((n) => n.floor === 0).map((n) => n.id);
  for (const id of queue) from.set(id, undefined);
  while (queue.length) {
    const id = queue.shift()!;
    if (id === targetId) {
      const path: MapNode[] = [];
      for (let at: string | undefined = id; at; at = from.get(at)) path.unshift(byId.get(at)!);
      return path;
    }
    for (const next of byId.get(id)!.next) {
      if (!from.has(next)) {
        from.set(next, id);
        queue.push(next);
      }
    }
  }
  return undefined;
}
