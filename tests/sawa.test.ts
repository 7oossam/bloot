import { describe, expect, it } from "vitest";
import { sawaHolds, sawaMove } from "../src/engine/sawa";
import type { Card, Rank, Seat, Suit, Trick } from "../src/engine/types";

const c = (rank: Rank, suit: Suit): Card => ({ rank, suit });

describe("السوا", () => {
  // The player's hand: 9 and 8 of trumps and an off-suit Ace; the Jack is gone and an
  // opponent still holds the trump King.
  const hands: Record<Seat, Card[]> = {
    0: [c("8", "S"), c("9", "S"), c("A", "H")],
    1: [c("K", "S"), c("7", "H"), c("8", "C")],
    2: [c("7", "D"), c("8", "D"), c("9", "D")],
    3: [c("7", "C"), c("9", "C"), c("10", "D")],
  };
  const table = { hands, claimer: 0 as Seat, mode: "hokum" as const, trumpSuit: "S" as Suit };
  const empty: Trick = { leader: 0, cards: {}, order: [] };

  it("holds when the right order wins every trick: the 9 first draws the King", () => {
    expect(sawaHolds(table)).toBe(true);
  });

  it("plays that order out", () => {
    expect(sawaMove(table, empty, 0)).toEqual(c("9", "S"));
  });

  it("fails when no order can beat what they hold", () => {
    const weak = { ...table, hands: { ...hands, 0: [c("8", "S"), c("7", "S"), c("A", "H")] } };
    expect(sawaHolds(weak)).toBe(false);
    expect(sawaMove(weak, empty, 0)).toBeUndefined();
  });

  it("fails when an opponent can ruff your side Ace", () => {
    const ruff = { ...table, hands: { ...hands, 0: [c("9", "S"), c("A", "H"), c("A", "D")], 1: [c("K", "S"), c("Q", "S"), c("8", "C")] } };
    expect(sawaHolds(ruff)).toBe(false);
  });

  it("in sun, every card must be the best of its suit left", () => {
    const sun = { hands: { 0: [c("A", "H"), c("10", "H")], 1: [c("K", "H"), c("7", "C")], 2: [c("7", "D"), c("8", "D")], 3: [c("Q", "H"), c("9", "C")] } as Record<Seat, Card[]>, claimer: 0 as Seat, mode: "sun" as const };
    expect(sawaHolds(sun)).toBe(true);
    const beaten = { ...sun, hands: { ...sun.hands, 0: [c("A", "H"), c("K", "D")], 2: [c("7", "D"), c("8", "S")], 3: [c("A", "D"), c("9", "C")] } };
    expect(sawaHolds(beaten)).toBe(false);
  });
});
