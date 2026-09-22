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
  cleared: boolean[]; // parallel to nodes: true once that node is resolved
  over: boolean; // run ended (won or lost)
  won: boolean;
}

export const STARTING_LIVES = 3;
export const MAX_JOKERS = 3;
