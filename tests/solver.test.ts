import { describe, expect, it } from "vitest";
import { Solver, reviewHand } from "../src/ai/solver";
import type { Card, Rank, Seat, Suit, Trick } from "../src/engine/types";

const c = (rank: Rank, suit: Suit): Card => ({ rank, suit });
const empty = (leader: Seat): Trick => ({ leader, cards: {}, order: [] });

describe("the double-dummy solver", () => {
  it("counts the last trick: one card each, the Ace takes 11 + 10 + the rest", () => {
    const hands = { 0: [c("A", "S")], 1: [c("7", "S")], 2: [c("8", "S")], 3: [c("K", "S")] } as Record<Seat, Card[]>;
    expect(new Solver("sun", undefined).value(hands, empty(0), 7)).toBe(11 + 4 + 10);
  });

  it("finds the right card and marks the wrong one as a loss", () => {
    // Two tricks left in sun, seat 0 leads. The Ace of hearts drops seat 1's bare 10 and the
    // 7 then takes the last trick; leading the 7 first lets the 10 win and the lead goes over.
    const hands = {
      0: [c("A", "H"), c("7", "H")],
      1: [c("10", "H"), c("7", "S")],
      2: [c("8", "S"), c("9", "S")],
      3: [c("K", "S"), c("Q", "S")],
    } as Record<Seat, Card[]>;
    const moves = new Solver("sun", undefined).moves(hands, empty(0), 6);
    const best = moves.reduce((a, b) => (b.value > a.value ? b : a));
    expect(best.card).toEqual(c("A", "H"));

    const wrong: Trick = { leader: 0, cards: { 0: c("7", "H"), 1: c("10", "H"), 2: c("8", "S"), 3: c("K", "S") }, order: [0, 1, 2, 3] };
    const [first] = reviewHand(hands, [wrong], "sun", undefined, [0]);
    expect(first.best).toEqual(c("A", "H"));
    expect(first.lost).toBeGreaterThan(0);
  });
});
