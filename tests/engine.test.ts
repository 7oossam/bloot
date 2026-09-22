import { describe, expect, it } from "vitest";
import { buildDeck } from "../src/engine/deck";
import { dealInitial, finalizeDeal } from "../src/engine/deck";
import { legalCalls, startBidding, submitBid } from "../src/engine/bidding";
import { legalMoves, resolveTrick } from "../src/engine/trick";
import { rankStrength, cardId } from "../src/engine/cards";
import { scoreHand } from "../src/engine/scoring";
import { Round } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import type { Bid, Card, Seat, Trick } from "../src/engine/types";

describe("deck", () => {
  it("has 32 unique cards", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(32);
    expect(new Set(deck.map(cardId)).size).toBe(32);
  });

  it("deals 5 to each seat and leaves 12 in the stock, covering the whole deck", () => {
    const rand = mulberry32(1);
    const { hands, stock } = dealInitial(rand);
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(hands[seat]).toHaveLength(5);
    }
    expect(stock).toHaveLength(12);
    const all = [...hands[0], ...hands[1], ...hands[2], ...hands[3], ...stock];
    expect(new Set(all.map(cardId)).size).toBe(32);
  });

  it("finalizeDeal gives everyone 8 cards, whether the ground card is claimed or not", () => {
    const rand = mulberry32(2);
    const initial = dealInitial(rand);
    const groundSuit = initial.stock[0].suit;

    const claimed = finalizeDeal(initial, {
      mode: "hokum",
      trumpSuit: groundSuit,
      declarer: 1,
      declarerTeam: 1,
      history: [],
    });
    for (const seat of [0, 1, 2, 3] as Seat[]) expect(claimed[seat]).toHaveLength(8);
    expect(claimed[1].some((c) => cardId(c) === cardId(initial.stock[0]))).toBe(true);

    const notClaimed = finalizeDeal(initial, {
      mode: "sun",
      declarer: 1,
      declarerTeam: 1,
      history: [],
    });
    for (const seat of [0, 1, 2, 3] as Seat[]) expect(notClaimed[seat]).toHaveLength(8);
  });
});

describe("bidding: two-round ground-card auction", () => {
  it("round 1 only allows hokum in the ground suit; round 2 forbids it", () => {
    const ground: Card = { suit: "H", rank: "9" };
    let state = startBidding(0, ground);

    const r1 = legalCalls(state);
    expect(r1.some((c) => c.call === "hokum" && c.suit === "H")).toBe(true);
    expect(r1.some((c) => c.call === "hokum" && c.suit === "S")).toBe(false);

    // seats 1, 2, 3, 0(dealer) all pass -> round 2
    state = submitBid(state, { seat: 1, call: "pass" });
    state = submitBid(state, { seat: 2, call: "pass" });
    state = submitBid(state, { seat: 3, call: "pass" });
    state = submitBid(state, { seat: 0, call: "pass" });
    expect(state.round).toBe(2);
    expect(state.turnSeat).toBe(1);

    const r2 = legalCalls(state);
    expect(r2.some((c) => c.call === "hokum" && c.suit === "H")).toBe(false);
    expect(r2.some((c) => c.call === "hokum" && c.suit === "S")).toBe(true);
  });

  it("redeals when both rounds pass all the way around", () => {
    const ground: Card = { suit: "H", rank: "9" };
    let state = startBidding(0, ground);
    const passers: Seat[] = [1, 2, 3, 0, 1, 2, 3, 0];
    for (const seat of passers) {
      state = submitBid(state, { seat, call: "pass" });
    }
    expect(state.redeal).toBe(true);
  });

  it("resolves immediately when a seat buys", () => {
    const ground: Card = { suit: "H", rank: "9" };
    let state = startBidding(0, ground);
    state = submitBid(state, { seat: 1, call: "sun" });
    expect(state.result?.mode).toBe("sun");
    expect(state.result?.declarer).toBe(1);
    expect(state.result?.declarerTeam).toBe(1);
  });

  it("rejects an out-of-turn or illegal bid", () => {
    const ground: Card = { suit: "H", rank: "9" };
    const state = startBidding(0, ground);
    expect(() => submitBid(state, { seat: 2, call: "pass" })).toThrow();
    expect(() => submitBid(state, { seat: 1, call: "hokum", suit: "S" })).toThrow();
  });
});

describe("trick resolution", () => {
  it("hokum trump ranks J > 9 > A > 10 > K > Q > 8 > 7", () => {
    const order: Array<Card["rank"]> = ["7", "8", "Q", "K", "10", "A", "9", "J"];
    const strengths = order.map((rank) => rankStrength({ suit: "S", rank }, "hokum", "S"));
    expect(strengths).toEqual([...strengths].sort((a, b) => a - b));
  });

  it("non-trump / sun ranks 7 < 8 < 9 < J < Q < K < 10 < A", () => {
    const order: Array<Card["rank"]> = ["7", "8", "9", "J", "Q", "K", "10", "A"];
    const strengths = order.map((rank) => rankStrength({ suit: "S", rank }, "sun"));
    expect(strengths).toEqual([...strengths].sort((a, b) => a - b));
  });

  it("trump beats a higher non-trump card led in another suit", () => {
    const trick: Trick = {
      leader: 0,
      order: [0, 1],
      cards: {
        0: { suit: "H", rank: "A" }, // led hearts ace, normally unbeatable in-suit
        1: { suit: "S", rank: "7" }, // trumps with the weakest spade
      },
    };
    expect(resolveTrick({ ...trick, order: [0, 1] }, "hokum", "S")).toBe(1);
  });

  it("must follow suit when able", () => {
    const trick: Trick = { leader: 0, order: [0], cards: { 0: { suit: "H", rank: "A" } } };
    const hand: Card[] = [
      { suit: "H", rank: "7" },
      { suit: "S", rank: "J" },
    ];
    const legal = legalMoves(hand, trick, "hokum", "S", 1);
    expect(legal).toEqual([{ suit: "H", rank: "7" }]);
  });

  it("must trump when void, unless partner is already winning", () => {
    // seat 1 (team 1) led a suit seat 3 (team 1, same team as leader... use team 0/2 as partners)
    const trickOpponentWinning: Trick = {
      leader: 1,
      order: [1],
      cards: { 1: { suit: "H", rank: "A" } },
    };
    const handWithTrump: Card[] = [
      { suit: "D", rank: "7" },
      { suit: "S", rank: "8" }, // trump
    ];
    // seat 0's team (0/2) is NOT winning (seat 1, team 1, is winning) -> must trump
    const legalMustTrump = legalMoves(handWithTrump, trickOpponentWinning, "hokum", "S", 0);
    expect(legalMustTrump).toEqual([{ suit: "S", rank: "8" }]);

    // now seat 2 (partner of seat 0) is winning instead -> seat 0 free to discard
    const trickPartnerWinning: Trick = {
      leader: 1,
      order: [1, 2],
      cards: {
        1: { suit: "H", rank: "7" },
        2: { suit: "S", rank: "J" }, // seat 2 trumped and is winning
      },
    };
    const legalFree = legalMoves(handWithTrump, trickPartnerWinning, "hokum", "S", 0);
    expect(legalFree).toEqual(handWithTrump);
  });

  it("must overtrump when able, but any trump will do if it can't beat what's out", () => {
    // Trump = S. Seat 1 (team 1) leads H-7. Seat 3 (team 1, void in H) cuts with S-8,
    // taking the lead for team 1. Seat 0 (team 0) is void in H and must respond.
    const trick: Trick = {
      leader: 1,
      order: [1, 3],
      cards: {
        1: { suit: "H", rank: "7" },
        3: { suit: "S", rank: "8" },
      },
    };
    const handCanBeat: Card[] = [
      { suit: "S", rank: "7" }, // weaker trump than the S-8 out
      { suit: "S", rank: "A" }, // beats S-8 (trump order: 7,8,Q,K,10,A,9,J)
    ];
    expect(legalMoves(handCanBeat, trick, "hokum", "S", 0)).toEqual([{ suit: "S", rank: "A" }]);

    const trickWithJackOut: Trick = {
      leader: 1,
      order: [1, 3],
      cards: {
        1: { suit: "H", rank: "7" },
        3: { suit: "S", rank: "J" }, // the strongest trump is already out
      },
    };
    const handCannotBeat: Card[] = [
      { suit: "S", rank: "7" },
      { suit: "S", rank: "Q" },
    ];
    // Nothing beats S-J (the top trump) -> any trump is legal.
    expect(legalMoves(handCannotBeat, trickWithJackOut, "hokum", "S", 0)).toEqual(handCannotBeat);
  });
});

describe("scoring", () => {
  it("hokum hand raw points sum to 152 card points + 10 last-trick bonus", () => {
    const seats: Seat[] = [0, 1, 2, 3];
    const tricks: Trick[] = [];
    // Build 8 tricks that partition a full 32-card deck deterministically.
    const deck = buildDeck();
    for (let t = 0; t < 8; t++) {
      const order = seats;
      const cards: Trick["cards"] = {};
      for (let s = 0; s < 4; s++) cards[order[s]] = deck[t * 4 + s];
      const trick: Trick = { leader: order[0], order, cards, winner: order[t % 4] };
      tricks.push(trick);
    }
    const result = scoreHand(tricks, "hokum", "S", 0);
    const total = result.rawPoints[0] + result.rawPoints[1];
    expect(total).toBe(152 + 10);
  });

  it("sun points double when scored", () => {
    const seats: Seat[] = [0, 1, 2, 3];
    const deck = buildDeck();
    const tricks: Trick[] = [];
    for (let t = 0; t < 8; t++) {
      const order = seats;
      const cards: Trick["cards"] = {};
      for (let s = 0; s < 4; s++) cards[order[s]] = deck[t * 4 + s];
      tricks.push({ leader: order[0], order, cards, winner: order[t % 4] });
    }
    const result = scoreHand(tricks, "sun", undefined, 0);
    const rawTotal = result.rawPoints[0] + result.rawPoints[1];
    const scoredTotal = result.scoredPoints[0] + result.scoredPoints[1];
    expect(rawTotal).toBe(120 + 10);
    expect(scoredTotal).toBe(rawTotal * 2);
  });
});

describe("Round: full hand end-to-end with simple always-first-legal bots", () => {
  it("plays a complete hand and produces a consistent score", () => {
    const round = new Round(0, mulberry32(42));

    // Bidding: everyone takes the first legal call until someone buys.
    while (round.phase === "bidding") {
      const seat = round.bidding.turnSeat;
      const calls = round.legalBids();
      // Prefer buying on the 2nd available seat to avoid instant-redeal in this smoke test.
      const choice = calls.find((c) => c.call !== "pass") ?? calls[0];
      const bid: Bid = { seat, call: choice.call, suit: choice.suit };
      round.bid(bid);
    }

    expect(round.phase === "playing" || round.phase === "redeal").toBe(true);
    if (round.phase === "redeal") return; // rare with this seed's forced-buy strategy, but guard anyway

    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(round.hands[seat]).toHaveLength(8);
    }

    let guard = 0;
    while (round.phase === "playing" && guard++ < 64) {
      const seat = round.turnSeat!;
      const legal = round.legalMovesFor(seat);
      expect(legal.length).toBeGreaterThan(0);
      round.playCard(seat, legal[0]);
    }

    expect(round.phase).toBe("complete");
    expect(round.tricks).toHaveLength(8);
    expect(round.result).toBeDefined();
    const total = round.result!.rawPoints[0] + round.result!.rawPoints[1];
    const expectedTotal = round.result!.mode === "hokum" ? 162 : 130;
    expect(total).toBe(expectedTotal);
  });
});
