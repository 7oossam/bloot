import { mulberry32 } from "../engine/rng";
import { eventsForAct, OWN_EVENT } from "./events";
import { pickOpponents, type OpponentTier } from "./opponents";
import type { MapNode, NodeType, RunState } from "./types";
import { REROLL_BASE_COST, REROLL_STEP, SHOP_JOKER_SLOTS, STARTING_GOLD, STARTING_LIVES } from "./types";

/**
 * الليلة ثلاث خرائط (acts), like Slay the Spire's: الحارة، الأندلس، قصر المعزّب. Each is 8 rows,
 * a shop row and the boss on top. The player's two data points: one 9-row map took ~45 minutes
 * (too long), then 6-row maps made the whole night ~15 minutes (too short). Now, measured with
 * scripts/pace-sim.ts (hands a match takes: to 41 ≈ 3, 61 ≈ 4, 81 ≈ 5.5, 101 ≈ 7, 121 ≈ 8.4):
 * about 19 hands in the first map, 23 in the second, 27 in the third — a night of ~30 minutes.
 */
export interface ActDef {
  name: string;
  /** The line shown when you arrive. */
  intro: string;
  matchTarget: number;
  eliteTarget: number;
  bossTarget: number;
  matchReward: number;
  eliteReward: number;
  bossReward: number;
  /** Who waits at the top of this map. */
  boss: string;
}

export const ACTS: ActDef[] = [
  { name: "الحارة", intro: "الأبواب انفتحت في جدران الحي، والمغرب واقف في أول ديوانية", matchTarget: 41, eliteTarget: 61, bossTarget: 81, matchReward: 18, eliteReward: 40, bossReward: 60, boss: "front-runners" },
  { name: "الأندلس", intro: "معك المفتاح الأول. الباب الثاني يفتح على ظهر أندلسي ما يمشي فيه الوقت، وأهل غرناطة ماسكين مفاتيح بيوتهم", matchTarget: 51, eliteTarget: 71, bossTarget: 101, matchReward: 22, eliteReward: 50, bossReward: 70, boss: "disabler" },
  { name: "قصر المعزّب", intro: "مفتاحين في جيبك. قصر المعزّب عند الشروق، وورا آخر باب جدّك جالس على الطاولة", matchTarget: 61, eliteTarget: 81, bossTarget: 121, matchReward: 26, eliteReward: 60, bossReward: 0, boss: "abu-qahwa" },
];

/** Rows of a map, bottom (0) to top: the last is the boss, the one before it a shop. */
export const MAP_ROWS = 8;
/** Columns a row's nodes can sit in. */
export const MAP_LANES = 3;
/** Elites and shops (besides the shop row) only from this row up. */
const ELITE_FROM = 2;
const SHOP_FROM = 2;

/** A plain match's target: the map's, and 10 more in the upper half of the map. */
function matchTargetAt(def: ActDef, row: number): number {
  return def.matchTarget + (row >= MAP_ROWS / 2 ? 10 : 0);
}

/** What a middle-row node is, weighted (STS-like): mostly fights, a ديوانية or a shop now and then. */
function pickType(row: number, rand: () => number): NodeType {
  const weights: Array<[NodeType, number]> = [
    ["match", 45],
    ["diwaniya", 22],
    // No shop right under the shop row before the boss.
    ["shop", row >= SHOP_FROM && row !== MAP_ROWS - 3 ? 10 : 0],
    ["elite", row >= ELITE_FROM ? 18 : 0],
  ];
  let roll = rand() * weights.reduce((n, [, w]) => n + w, 0);
  for (const [type, w] of weights) if ((roll -= w) < 0) return type;
  return "match";
}

/** A fresh night: the first of its three maps, and everything you start with. */
export function generateMap(seed: number): RunState {
  const nodes = generateAct(seed, 0);
  return {
    seed,
    act: 0,
    nodes,
    currentIndex: -1,
    lives: STARTING_LIVES,
    gold: STARTING_GOLD,
    jokerIds: [],
    jokerLevels: {},
    shopSlots: SHOP_JOKER_SLOTS,
    rerollBase: REROLL_BASE_COST,
    rerollStep: REROLL_STEP,
    upgrades: {},
    salary: 0,
    nextMatchBoost: 0,
    nextMatchPenalty: 0,
    blessings: [],
    jokerCounters: {},
    stamps: {},
    stampStars: {},
    curses: [],
    nodeWon: nodes.map(() => false),
    shields: 0,
    shopStock: [],
    rerollCost: REROLL_BASE_COST,
    cleared: nodes.map(() => false),
    over: false,
    won: false,
  };
}

/**
 * One map of the night: 2–3 nodes a row, each linked to the node in its lane above and, per row,
 * diagonally one way (so paths never cross). Every node can be reached and leads on; all paths
 * meet at the shop row and the boss. The night's very first match is plain Baloot.
 */
export function generateAct(seed: number, act: number): MapNode[] {
  const def = ACTS[act];
  const rand = mulberry32((seed ^ 0x5eed) + act * 7919);
  const rows: MapNode[][] = [];
  for (let row = 0; row < MAP_ROWS; row++) {
    const boss = row === MAP_ROWS - 1;
    const lanes = boss ? [1] : rand() < 0.4 ? [0, 1, 2] : [[0, 1], [1, 2], [0, 2]][Math.floor(rand() * 3)];
    rows.push(
      lanes.map((col) => {
        const type: NodeType = boss ? "boss" : row === 0 ? "match" : row === MAP_ROWS - 2 ? "shop" : pickType(row, rand);
        const node: MapNode = { id: `a${act}-n-${row}-${col}`, type, floor: row, col, next: [], reward: 0 };
        if (type === "match") Object.assign(node, { matchTarget: matchTargetAt(def, row), reward: def.matchReward + row * 2 });
        if (type === "elite") Object.assign(node, { matchTarget: def.eliteTarget, reward: def.eliteReward });
        if (type === "boss") Object.assign(node, { matchTarget: def.bossTarget, reward: def.bossReward });
        return node;
      }),
    );
  }
  // Every map has its stops: at least one مجلس كبير and two ديوانيات in the middle rows (a
  // plain match turned into one), and never a row of nothing but ديوانيات.
  const middle = rows.slice(1, MAP_ROWS - 2).flat();
  const ensure = (type: NodeType, count: number, from: number) => {
    for (let have = middle.filter((n) => n.type === type).length; have < count; have++) {
      const spare = middle.filter((n) => n.type === "match" && n.floor >= from && rows[n.floor].filter((m) => m.type === "match").length > 1);
      const pick = spare.length ? spare[Math.floor(rand() * spare.length)] : middle.find((n) => n.type === "match" && n.floor >= from);
      if (!pick) return;
      pick.type = type;
      pick.matchTarget = type === "elite" ? def.eliteTarget : undefined;
      pick.reward = type === "elite" ? def.eliteReward : 0;
    }
  };
  ensure("elite", 2, ELITE_FROM);
  ensure("diwaniya", 3, 1);
  for (const row of rows.slice(1, MAP_ROWS - 2)) {
    if (row.every((n) => n.type === "diwaniya")) Object.assign(row[0], { type: "match", matchTarget: matchTargetAt(def, row[0].floor), reward: def.matchReward + row[0].floor * 2 });
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
  // Every fight has its opponents, revealed as you walk in — the map's own boss on top, and
  // nobody special in the night's very first row (plain Baloot to start).
  const fights = nodes.filter((n) => (n.type === "match" || n.type === "elite") && !(act === 0 && n.floor === 0));
  const rivals = pickOpponents(fights.map((n) => n.type as OpponentTier), rand);
  fights.forEach((n, i) => (n.opponent = rivals[i]));
  const top = nodes.find((n) => n.type === "boss");
  if (top) top.opponent = def.boss;
  // The events are dealt out in a shuffled order, so neighbours differ.
  // One of them (the first up the map) is your character's own.
  const events = eventsForAct(act).sort(() => rand() - 0.5);
  nodes.filter((n) => n.type === "diwaniya").forEach((n, i) => (n.event = i === 0 ? OWN_EVENT : events[(i - 1) % events.length].id));
  return nodes;
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
