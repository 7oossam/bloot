import { describe, expect, it } from "vitest";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { startBidding, submitBid } from "../src/engine/bidding";
import { dealInitial } from "../src/engine/deck";
import { mulberry32 } from "../src/engine/rng";
import type { Card, Seat, Trick } from "../src/engine/types";

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

describe("bidding AI calibration", () => {
  it("passes often enough that the auction reaches later seats", () => {
    // Regression guard: thresholds were once so low the AI bought on ~99% of hands, so the
    // first seat swept every auction and the human player never got a bid turn at all.
    const rand = mulberry32(2024);
    const ground: Card = { suit: "S", rank: "7" };
    let buys = 0;
    let deals = 0;

    for (let i = 0; i < 400; i++) {
      const { hands } = dealInitial(rand);
      for (const seat of [0, 1, 2, 3] as Seat[]) {
        // Round 2 offers every suit, so this measures the AI at its most permissive.
        let state = startBidding(1, ground);
        state = submitBid(state, { seat: 2, call: "pass" });
        state = submitBid(state, { seat: 3, call: "pass" });
        state = submitBid(state, { seat: 0, call: "pass" });
        state = submitBid(state, { seat: 1, call: "pass" });
        expect(state.round).toBe(2);

        const bid = decideBid(state.turnSeat, hands[seat], state);
        if (bid.call !== "pass") buys++;
        deals++;
      }
    }

    const buyRate = buys / deals;
    expect(buyRate).toBeGreaterThan(0.1); // still bids on genuinely strong hands
    expect(buyRate).toBeLessThan(0.55); // but passes often enough for the auction to travel
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

// ---- docs/baloot-guide.md tactics ------------------------------------------------------
const c = (s: string): Card => ({ suit: s.slice(-1) as Card["suit"], rank: s.slice(0, -1) as Card["rank"] });
const cards = (...s: string[]) => s.map(c);
const trickOf = (leader: Seat, ...plays: string[]): Trick => {
  const order: Seat[] = [];
  const t: Trick = { leader, order, cards: {} };
  plays.forEach((p, i) => {
    const seat = ((leader + i) % 4) as Seat;
    order.push(seat);
    t.cards[seat] = c(p);
  });
  return t;
};

describe("buying — معايير الشراء والحلة (§3)", () => {
  it("won't buy sun without two Aces (or an Ace with a سرد suit)", () => {
    const state = startBidding(3, c("7D"));
    const oneAce = cards("AH", "10H", "KH", "10S", "KC"); // strong points, one Ace, no سرد
    expect(decideBid(0, oneAce, state).call).not.toBe("sun");
  });

  it("won't buy hokum on fewer than 3 trumps or without the Jack/9", () => {
    const state = startBidding(3, c("7S"));
    // 3 spades with the ground card, but no J or 9.
    expect(decideBid(0, cards("AS", "10S", "AH", "AD", "KC"), state).call).not.toBe("hokum");
  });

  it("the seat with الحلة buys a borderline hand the others would pass", () => {
    // Count how often seat 0 buys the same hands with and without the lead.
    const rand = mulberry32(99);
    let withHilla = 0, without = 0;
    for (let i = 0; i < 600; i++) {
      const { hands, stock } = dealInitial(rand);
      if (decideBid(0, hands[0], startBidding(3, stock[0])).call !== "pass") withHilla++; // dealer 3 → seat 0 leads
      if (decideBid(0, hands[0], { ...startBidding(1, stock[0]), turnSeat: 0 }).call !== "pass") without++;
    }
    expect(withHilla).toBeGreaterThan(without);
  });

  it("the dealer's partner calls أشكل with a good sun hand on a strong ground card", () => {
    let state = startBidding(0, c("AH"));
    state = submitBid(state, { seat: 1, call: "pass" });
    // Not enough to buy sun alone (it would with a second strong suit), but a fair sun hand.
    const bid = decideBid(2, cards("AS", "KS", "8D", "9C", "7C"), state);
    expect(bid.call).toBe("ashkal");
  });
});

describe("card play — التهريب, الأبناط, السرد (§4, §5)", () => {
  it("in sun, signals with a 7/8 from the suit it holds the Ace in when it can't follow", () => {
    // Seat 0 is void in hearts; the opponents are winning.
    const t = trickOf(1, "AH");
    const chosen = decideCard(cards("AS", "KS", "7S", "9D", "QC"), t, "sun", undefined, 0, { tricks: [] });
    expect(chosen).toEqual(c("7S"));
  });

  it("the partner then leads the suit that was asked for", () => {
    // Earlier trick: seat 3 led A♥ and seat 0, void, threw 7♠ — asking for spades. Now seat 2 leads.
    const earlier = trickOf(3, "AH", "7S", "8H", "9H");
    earlier.winner = 3;
    const chosen = decideCard(cards("8S", "KD", "QD", "9C", "10C"), trickOf(2), "sun", undefined, 2, { tricks: [earlier] });
    expect(chosen.suit).toBe("S");
  });

  it("keeps 10s and Aces out of a trick its side might still lose (حماية الأبناط)", () => {
    // Partner (seat 2) is winning with a K♥, but the A♥ and 10♥ are still out and seat 3 plays after us.
    const t = trickOf(1, "7H", "KH");
    const chosen = decideCard(cards("10D", "AD", "8D", "7C"), t, "sun", undefined, 0, { tricks: [] });
    expect(chosen).not.toEqual(c("10D"));
    expect(chosen).not.toEqual(c("AD"));
  });

  it("feeds the abnat when the partner's trick is certain (دعم الخوي)", () => {
    // Seat 0 plays last; partner (seat 2) has the trick with the A♥.
    const t = trickOf(1, "7H", "AH", "8H");
    const chosen = decideCard(cards("10D", "8D", "7C"), t, "sun", undefined, 0, { tricks: [] });
    expect(chosen).toEqual(c("10D"));
  });

  it("cashes a sure winner from its longest suit when leading (تسييل السرد)", () => {
    const chosen = decideCard(cards("AS", "KS", "QS", "JS", "7H", "8D"), trickOf(0), "sun", undefined, 0, { tricks: [] });
    expect(chosen).toEqual(c("AS"));
  });

  it("the buying side pulls trumps with the top trump (سحب الحكم)", () => {
    const chosen = decideCard(cards("JS", "9S", "7S", "AH", "8D"), trickOf(0), "hokum", "S", 0, { tricks: [], declarer: 0 });
    expect(chosen).toEqual(c("JS"));
  });

  it("the dealer plays the suit أشكل asked for", () => {
    const chosen = decideCard(cards("9D", "KD", "8C", "QS", "7H"), trickOf(0), "sun", undefined, 0, {
      tricks: [],
      declarer: 0,
      ashkalSuits: ["D"],
    });
    expect(chosen.suit).toBe("D");
  });
});
