import { describe, expect, it } from "vitest";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { startBidding } from "../src/engine/bidding";
import type { Card, Trick } from "../src/engine/types";

describe("bidding AI", () => {
  it("buys hokum with a hand loaded with trump control", () => {
    const ground: Card = { suit: "S", rank: "7" };
    const state = startBidding(3, ground); // seat 0 bids first
    const strongSpades: Card[] = [
      { suit: "S", rank: "J" },
      { suit: "S", rank: "9" },
      { suit: "S", rank: "A" },
      { suit: "H", rank: "A" },
      { suit: "D", rank: "7" },
    ];
    const bid = decideBid(0, strongSpades, state);
    expect(bid).toEqual({ seat: 0, call: "hokum", suit: "S" });
  });

  it("passes with a weak, scattered hand", () => {
    const ground: Card = { suit: "S", rank: "7" };
    const state = startBidding(3, ground);
    const weakHand: Card[] = [
      { suit: "S", rank: "8" },
      { suit: "H", rank: "9" },
      { suit: "D", rank: "8" },
      { suit: "C", rank: "7" },
      { suit: "C", rank: "9" },
    ];
    const bid = decideBid(0, weakHand, state);
    expect(bid.call).toBe("pass");
  });

  it("only offers hokum in the ground suit during round 1", () => {
    const ground: Card = { suit: "H", rank: "7" };
    const state = startBidding(3, ground);
    const spadeHeavyHand: Card[] = [
      { suit: "S", rank: "J" },
      { suit: "S", rank: "9" },
      { suit: "S", rank: "A" },
      { suit: "S", rank: "10" },
      { suit: "S", rank: "K" },
    ];
    // Can't call hokum on spades in round 1 (ground is hearts) — must be sun or pass.
    const bid = decideBid(0, spadeHeavyHand, state);
    expect(bid.call).not.toBe("hokum");
  });
});

describe("play AI", () => {
  it("wins as cheaply as possible when the opponent is currently ahead", () => {
    const trick: Trick = {
      leader: 1,
      order: [1],
      cards: { 1: { suit: "H", rank: "K" } },
    };
    const hand: Card[] = [
      { suit: "H", rank: "A" }, // wins, but overkill
      { suit: "H", rank: "10" }, // also wins (10 > K in non-trump order), cheaper
      { suit: "H", rank: "7" }, // does not win
    ];
    const chosen = decideCard(hand, trick, "sun", undefined, 0);
    expect(chosen).toEqual({ suit: "H", rank: "10" });
  });

  it("dumps its highest-point card when the partner is already winning", () => {
    const trick: Trick = {
      leader: 1,
      order: [1, 2],
      cards: {
        1: { suit: "H", rank: "7" },
        2: { suit: "H", rank: "A" }, // seat 2 = partner of seat 0, currently winning
      },
    };
    const hand: Card[] = [
      { suit: "H", rank: "10" }, // 10 points
      { suit: "H", rank: "9" }, // 0 points in non-trump
    ];
    const chosen = decideCard(hand, trick, "sun", undefined, 0);
    expect(chosen).toEqual({ suit: "H", rank: "10" });
  });

  it("sheds the cheapest card when it cannot win and must follow suit", () => {
    const trick: Trick = {
      leader: 1,
      order: [1],
      cards: { 1: { suit: "H", rank: "A" } },
    };
    const hand: Card[] = [
      { suit: "H", rank: "10" }, // still loses to A, costs 10 points if we must play it
      { suit: "H", rank: "7" }, // loses too, costs 0 points — should be preferred
    ];
    const chosen = decideCard(hand, trick, "sun", undefined, 0);
    expect(chosen).toEqual({ suit: "H", rank: "7" });
  });
});
