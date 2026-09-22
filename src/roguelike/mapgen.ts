import type { MapNode, NodeType, RunState } from "./types";
import { STARTING_LIVES } from "./types";

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
    cleared: nodes.map(() => false),
    over: false,
    won: false,
  };
}
