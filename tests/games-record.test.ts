import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PART_CHARS, clearGames, exportGames, gamesCount, loadGames, recordHand, unpackHand } from "../src/game/notes";
import type { HandSnapshot } from "../src/game/GameController";

const snap = (n: number): HandSnapshot => ({
  dealer: 0,
  initialHands: { 0: [], 1: [], 2: [], 3: [] },
  groundCard: "HA",
  bids: [],
  contract: { mode: "sun", declarer: 1, ashkal: false },
  hands: { 0: ["S7"], 1: [], 2: [], 3: [] },
  startHands: { 0: ["S7"], 1: ["S8"], 2: ["S9"], 3: ["SA"] },
  tricks: [{ leader: 0, cards: ["0:S7", "1:S8", "2:S9", "3:SA"], winner: 3 }],
  currentTrick: [],
  matchScore: { 0: n, 1: 0 },
  plays: [{ seat: 1, trick: 1, card: "S8", kind: "search", scores: ["a", "b", "c", "d", "e"], ruledOut: [] }],
});

describe("the saved record of everything played", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });
  afterEach(() => {
    store.clear();
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("keeps every hand across صكات, lean, and copies them all", () => {
    recordHand(snap(1), "a");
    recordHand(snap(2), "a");
    recordHand(snap(3), "b");
    expect(gamesCount()).toEqual({ hands: 3, matches: 2 });
    const [first] = loadGames();
    expect(first.match).toBe("a");
    expect("hands" in first).toBe(false);
    expect(first.plays[0].scores).toHaveLength(3);
    const parts = exportGames();
    expect(parts).toHaveLength(1);
    const json = JSON.parse(parts[0].slice(parts[0].indexOf("```json") + 7, parts[0].lastIndexOf("```")));
    expect(json).toHaveLength(3);
    expect(unpackHand(json[2]).match).toBe("b");
    // A long record goes in parts that each fit a chat message.
    for (let i = 0; i < 200; i++) recordHand(snap(i), "c");
    const many = exportGames();
    expect(many.length).toBeGreaterThan(1);
    expect(many.every((p) => p.length < PART_CHARS + 500)).toBe(true);
    clearGames();
    expect(gamesCount().hands).toBe(0);
  });
});
