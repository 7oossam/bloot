import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearGames, exportGames, gamesCount, loadGames, recordHand } from "../src/game/notes";
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
    const text = exportGames();
    const json = JSON.parse(text.slice(text.indexOf("```json") + 7, text.lastIndexOf("```")));
    expect(json.kind).toBe("games");
    expect(json.hands).toHaveLength(3);
    clearGames();
    expect(gamesCount().hands).toBe(0);
  });
});
