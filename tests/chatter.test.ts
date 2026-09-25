import { describe, expect, it } from "vitest";
import { contractLines, handLines, projectLines, trickLines } from "../src/game/chatter";
import type { Card, HandResult, Seat, Trick } from "../src/engine/types";

const c = (s: string): Card => ({ suit: s.slice(-1) as Card["suit"], rank: s.slice(0, -1) as Card["rank"] });

describe("سوالف الطاولة", () => {
  it("the buyer's partner cheers: فن for sun, حكيم for hokum — and never speaks for you", () => {
    expect(contractLines(0, "sun")).toEqual([{ seat: 2, text: expect.stringContaining("فن") }]);
    expect(contractLines(1, "hokum")).toEqual([{ seat: 3, text: expect.stringContaining("حكيم") }]);
    expect(contractLines(2, "sun")).toEqual([]); // your partner bought: you're the one who'd cheer
  });

  it("the projects get their cheer — تعيش سنين for a خمسين", () => {
    const lines = projectLines({ declared: [{ kind: "khamsin", seat: 0, cards: [] }], winner: 0, points: { 0: 5, 1: 0 } });
    expect(lines).toEqual([{ seat: 2, text: expect.stringContaining("تعيش سنين") }]);
  });

  it("بالزنوبة: an opponent's Ace ruffed with a small trump", () => {
    const t: Trick = { leader: 0, order: [0, 1, 2, 3] as Seat[], cards: { 0: c("AH"), 1: c("7S"), 2: c("8H"), 3: c("9H") }, winner: 1 };
    expect(trickLines(t, 1, "hokum", "S")).toEqual([{ seat: 1, text: expect.stringContaining("بالزنوبة") }]);
    // A big trump isn't a زنوبة.
    const big: Trick = { ...t, cards: { ...t.cards, 1: c("JS") } };
    expect(trickLines(big, 1, "hokum", "S")).toEqual([]);
  });

  it("كبوت and خسرانة at the end of a hand", () => {
    const base = { tricksWon: { 0: 5, 1: 3 } } as unknown as HandResult;
    const lost = { ...base, sheet: { judgedTeam: 1, outcome: "lost", winner: 0 } } as unknown as HandResult;
    expect(handLines(lost, false)).toEqual([{ seat: 2, text: expect.stringContaining("خسرانة") }]);
    const kaboot = { tricksWon: { 0: 0, 1: 8 }, sheet: { judgedTeam: 1, outcome: "won", winner: 1 } } as unknown as HandResult;
    expect(handLines(kaboot, false)).toEqual([{ seat: 1, text: expect.stringContaining("كبوت") }]);
  });
});
