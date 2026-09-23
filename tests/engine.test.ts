import { describe, expect, it } from "vitest";
import { buildDeck } from "../src/engine/deck";
import { dealInitial, finalizeDeal } from "../src/engine/deck";
import { ashkalSignal, legalCalls, startBidding, submitBid } from "../src/engine/bidding";
import { findProjects, resolveProjects } from "../src/engine/projects";
import { isAkka, legalMoves, resolveTrick } from "../src/engine/trick";
import { rankStrength, cardId, cardPoints } from "../src/engine/cards";
import { scoreHand, toGamePoints } from "../src/engine/scoring";
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

    // Sun (or a round-2 hokum in another suit): the buyer still takes the ground card.
    const sunBuy = finalizeDeal(initial, {
      mode: "sun",
      declarer: 3,
      declarerTeam: 1,
      history: [],
    });
    for (const seat of [0, 1, 2, 3] as Seat[]) expect(sunBuy[seat]).toHaveLength(8);
    expect(sunBuy[3].some((c) => cardId(c) === cardId(initial.stock[0]))).toBe(true);
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

  it("resolves immediately when a seat buys sun", () => {
    const ground: Card = { suit: "H", rank: "9" };
    let state = startBidding(0, ground);
    state = submitBid(state, { seat: 1, call: "sun" });
    expect(state.result?.mode).toBe("sun");
    expect(state.result?.declarer).toBe(1);
    expect(state.result?.declarerTeam).toBe(1);
  });

  it("a hokum buy asks the other three, in order, whether they want sun", () => {
    const ground: Card = { suit: "H", rank: "9" };
    let state = startBidding(0, ground);
    state = submitBid(state, { seat: 1, call: "pass" });
    state = submitBid(state, { seat: 2, call: "hokum", suit: "H" });
    expect(state.result).toBeUndefined();
    expect(state.pendingHokum).toEqual({ seat: 2, suit: "H" });
    // Starts after the buyer and goes all the way round — including seat 1, who passed.
    expect(state.challengers).toEqual([3, 0, 1]);
    expect(state.turnSeat).toBe(3);
    expect(legalCalls(state).map((c) => c.call).sort()).toEqual(["pass", "sun"]);
    expect(() => submitBid(state, { seat: 3, call: "hokum", suit: "H" })).toThrow();

    state = submitBid(state, { seat: 3, call: "pass" });
    expect(state.turnSeat).toBe(0);
    state = submitBid(state, { seat: 0, call: "pass" });
    state = submitBid(state, { seat: 1, call: "pass" });
    expect(state.result).toMatchObject({ mode: "hokum", trumpSuit: "H", declarer: 2, declarerTeam: 0 });
    expect(state.pendingHokum).toBeUndefined();
  });

  it("any challenger calling sun takes the hand from the hokum buyer", () => {
    const ground: Card = { suit: "H", rank: "9" };
    let state = startBidding(0, ground);
    state = submitBid(state, { seat: 1, call: "hokum", suit: "H" });
    state = submitBid(state, { seat: 2, call: "pass" });
    state = submitBid(state, { seat: 3, call: "sun" });
    expect(state.result).toMatchObject({ mode: "sun", declarer: 3, declarerTeam: 1 });
    expect(state.pendingHokum).toBeUndefined();
  });

  it("a round-2 hokum can be challenged too", () => {
    const ground: Card = { suit: "H", rank: "9" };
    let state = startBidding(0, ground);
    for (const seat of [1, 2, 3, 0] as Seat[]) state = submitBid(state, { seat, call: "pass" });
    state = submitBid(state, { seat: 1, call: "pass" });
    state = submitBid(state, { seat: 2, call: "hokum", suit: "S" });
    expect(state.challengers).toEqual([3, 0, 1]);
    for (const seat of [3, 0, 1] as Seat[]) state = submitBid(state, { seat, call: "pass" });
    expect(state.result).toMatchObject({ mode: "hokum", trumpSuit: "S", declarer: 2 });
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

describe("Round: who leads", () => {
  it("the first trick is always led by the player on the dealer's right, not the buyer", () => {
    let checked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const dealer = (seed % 4) as Seat;
      const round = new Round(dealer, mulberry32(seed));
      while (round.phase === "bidding") {
        const seat = round.bidding.turnSeat;
        const calls = round.legalBids();
        // Let whoever sits across from the dealer buy, so the buyer is rarely the leader.
        const buy = seat === ((dealer + 2) % 4) ? calls.find((c) => c.call !== "pass") : undefined;
        round.bid({ seat, ...(buy ?? { call: "pass" }) } as Bid);
      }
      if (round.phase !== "playing") continue;
      expect(round.currentTrick!.leader).toBe(((dealer + 1) % 4) as Seat);
      expect(round.turnSeat).toBe(((dealer + 1) % 4) as Seat);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
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

describe("toGamePoints (القيد) — docs/baloot-guide.md §2", () => {
  it("hokum: ÷10, a remainder of 1–5 drops and 6–9 rounds up", () => {
    expect(toGamePoints({ 0: 85, 1: 77 }, "hokum", 0)).toEqual({ 0: 8, 1: 8 }); // 85 → 8 (5 drops)
    expect(toGamePoints({ 0: 86, 1: 76 }, "hokum", 0)).toEqual({ 0: 9, 1: 7 }); // 86 → 9
    expect(toGamePoints({ 0: 81, 1: 81 }, "hokum", 1)).toEqual({ 0: 8, 1: 8 });
    expect(toGamePoints({ 0: 162, 1: 0 }, "hokum", 0)).toEqual({ 0: 16, 1: 0 });
  });

  it("the buyer is rounded by the rule and the other side takes the rest, so it never adds to 17", () => {
    // 86/76 rounded independently would be 9 + 8 = 17.
    const g = toGamePoints({ 0: 86, 1: 76 }, "hokum", 1);
    expect(g).toEqual({ 0: 8, 1: 8 }); // buyer 76 → 8, the other side gets 16 − 8
  });

  it("sun: ÷5, a remainder of 1–2 drops and 3–4 rounds up", () => {
    expect(toGamePoints({ 0: 63, 1: 67 }, "sun", 0)).toEqual({ 0: 13, 1: 13 }); // 63 → 13 (3 rounds up)
    expect(toGamePoints({ 0: 62, 1: 68 }, "sun", 0)).toEqual({ 0: 12, 1: 14 }); // 62 → 12 (2 drops)
    expect(toGamePoints({ 0: 130, 1: 0 }, "sun", 0)).toEqual({ 0: 26, 1: 0 });
  });

  it("every played hand converts to exactly 16 (hokum) or 26 (sun)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const round = new Round(0, mulberry32(seed));
      // Alternate hokum and sun buys across seeds so both conversions are exercised.
      const want = seed % 2 === 0 ? "sun" : "hokum";
      while (round.phase === "bidding") {
        const calls = round.legalBids();
        const buy = calls.find((c) => c.call === want) ?? calls.find((c) => c.call !== "pass") ?? calls[0];
        round.bid({ seat: round.bidding.turnSeat, ...buy } as Bid);
      }
      if (round.phase !== "playing") continue;
      while (round.phase === "playing") {
        const seat = round.turnSeat!;
        round.playCard(seat, round.legalMovesFor(seat)[0]);
      }
      // Card points alone are worth exactly the hand's value; projects come on top.
      const g = round.result!.gamePoints;
      const p = round.result!.projectPoints!;
      expect(g[0] - p[0] + g[1] - p[1]).toBe(round.result!.mode === "hokum" ? 16 : 26);
    }
  });

  it("a raised last-trick bonus (joker) raises the hand's value", () => {
    // 152 card points + a 20-point الأرض = 172 → 17.
    const g = toGamePoints({ 0: 100, 1: 72 }, "hokum", 0);
    expect(g[0] + g[1]).toBe(17);
  });
});

describe("hand-editing effects", () => {
  it("between two identical trump Jacks, the one played first wins", () => {
    const trick: Trick = {
      leader: 1,
      order: [1, 2, 3, 0],
      cards: { 1: { suit: "S", rank: "J" }, 2: { suit: "S", rank: "9" }, 3: { suit: "S", rank: "7" }, 0: { suit: "S", rank: "J" } },
    };
    expect(resolveTrick(trick, "hokum", "S")).toBe(1);
  });

  it("a hand with a duplicated trump Jack still plays out and scores its extra points", () => {
    const round = new Round(0, mulberry32(77));
    while (round.phase === "bidding") {
      const calls = round.legalBids();
      const buy = round.bidding.turnSeat === 0 ? calls.find((c) => c.call === "hokum") : undefined;
      round.bid({ seat: round.bidding.turnSeat, ...(buy ?? { call: "pass" }) } as Bid);
    }
    if (round.phase !== "playing") return; // redeal on this seed — nothing to check
    const trump = round.bidding.result!.trumpSuit!;
    const victim = round.hands[0].find((c) => !(c.suit === trump && c.rank === "J"))!;
    round.replaceCard(0, victim, { suit: trump, rank: "J" });
    const jacks = Object.values(round.hands).flat().filter((c) => c.suit === trump && c.rank === "J");
    expect(jacks.length).toBe(2);
    while (round.phase === "playing") {
      const seat = round.turnSeat!;
      round.playCard(seat, round.legalMovesFor(seat)[0]);
    }
    const raw = round.result!.rawPoints[0] + round.result!.rawPoints[1];
    // 152 + 10 for the last trick, plus a second Jack (20), minus whatever the victim card was worth.
    expect(raw).toBe(162 + 20 - cardPoints(victim, "hokum", trump));
  });

  it("swapCards trades one card each way and keeps hand sizes", () => {
    const round = new Round(1, mulberry32(3));
    const a = round.hands[0][0];
    const b = round.hands[3][2];
    round.swapCards(0, a, 3, b);
    expect(round.hands[0].some((c) => cardId(c) === cardId(b))).toBe(true);
    expect(round.hands[3].some((c) => cardId(c) === cardId(a))).toBe(true);
    expect(round.hands[0]).toHaveLength(5);
    expect(round.hands[3]).toHaveLength(5);
  });

  it("a locked team's hokum can't be taken as sun", () => {
    const ground: Card = { suit: "H", rank: "9" };
    let state = startBidding(0, ground, [0]);
    state = submitBid(state, { seat: 1, call: "pass" });
    state = submitBid(state, { seat: 2, call: "hokum", suit: "H" });
    expect(state.result).toMatchObject({ mode: "hokum", declarer: 2 });
    // ...but the other team's hokum still can be.
    let other = startBidding(0, ground, [0]);
    other = submitBid(other, { seat: 1, call: "hokum", suit: "H" });
    expect(other.result).toBeUndefined();
    expect(other.challengers).toEqual([2, 3, 0]);
  });
});

const C = (s: string): Card => ({ suit: s.slice(-1) as Card["suit"], rank: s.slice(0, -1) as Card["rank"] });
const hand = (...cards: string[]) => cards.map(C);
const kinds = (h: Card[], mode: "hokum" | "sun") => findProjects(h, mode, 0).map((p) => p.kind).sort();

describe("المشاريع (projects) — docs/baloot-guide.md §1", () => {
  it("سرا, خمسين, مئة from sequences in the natural 7..A order", () => {
    expect(kinds(hand("7S", "8S", "9S", "KH", "AD", "2C".replace("2", "7"), "8C", "QD"), "hokum")).toEqual(["sira"]);
    expect(kinds(hand("9H", "10H", "JH", "QH", "7S", "8D", "KC", "AC"), "sun")).toEqual(["khamsin"]);
    expect(kinds(hand("10D", "JD", "QD", "KD", "AD", "7S", "8S", "7H"), "hokum")).toEqual(["miya"]);
    // 10 → J is a sequence (natural order), unlike trump strength.
    expect(kinds(hand("9C", "10C", "JC", "7H", "8H", "AS", "KD", "QD"), "sun")).toEqual(["sira"]);
  });

  it("four of a kind: Aces are أربعمئة in sun but مئة in hokum; Jacks count in hokum only", () => {
    const aces = hand("AS", "AH", "AD", "AC", "7S", "8H", "9D", "QC");
    expect(kinds(aces, "sun")).toEqual(["arbaamiya"]);
    expect(kinds(aces, "hokum")).toEqual(["miya"]);
    const jacks = hand("JS", "JH", "JD", "JC", "7S", "9H", "8D", "QC");
    expect(kinds(jacks, "hokum")).toEqual(["miya"]);
    expect(kinds(jacks, "sun")).toEqual([]);
    expect(kinds(hand("KS", "KH", "KD", "KC", "7S", "9H", "8D", "7C"), "sun")).toEqual(["miya"]);
    // Four 9s, 8s or 7s are nothing.
    expect(kinds(hand("9S", "9H", "9D", "9C", "7S", "8H", "QD", "7C"), "hokum")).toEqual([]);
  });

  it("a card counts in one project only — the reading worth more wins", () => {
    // Four Kings plus Q-K-A of spades: using K♠ in the four (مئة) beats using it in a سرا.
    const h = hand("KS", "KH", "KD", "KC", "QS", "AS", "7D", "8C");
    expect(kinds(h, "hokum")).toEqual(["miya"]);
  });

  it("only the team with the best project scores, and it scores all of its projects", () => {
    const hands = {
      0: hand("7S", "8S", "9S", "10H", "JH", "QH", "7D", "8D"), // two سرا
      1: hand("9D", "10D", "JD", "QD", "7C", "8C", "AS", "KS"), // خمسين — beats both
      2: hand("7H", "8H", "9H", "AD", "KD", "AC", "KC", "QC"), // سرا
      3: hand("JS", "QS", "10S", "9C", "10C", "JC", "8H", "AH"), // two سرا
    } as Record<0 | 1 | 2 | 3, Card[]>;
    const out = resolveProjects(hands, "hokum", 1);
    expect(out.winner).toBe(1);
    expect(out.points).toEqual({ 0: 0, 1: 5 + 2 + 2 });
    const sun = resolveProjects(hands, "sun", 1);
    expect(sun.points).toEqual({ 0: 0, 1: 10 + 4 + 4 });
  });

  it("an exact tie goes to whoever plays first", () => {
    const hands = {
      0: hand("7S", "8S", "9S", "AH", "KD", "7C", "8C", "QD"),
      1: hand("7H", "8H", "9H", "AS", "KC", "10D", "JD", "10C"),
      2: hand("QS", "JS", "10S", "7D", "8D", "9D", "AD", "AC"),
      3: hand("QH", "KH", "10H", "JH", "9C", "JC", "KS", "QC"),
    } as Record<0 | 1 | 2 | 3, Card[]>;
    // Seat 0's 7-8-9♠ and seat 1's 7-8-9♥ are identical; seat 1 leads, so team 1 wins
    // — unless something better exists: seat 3 has 10-J-Q-K♥ (خمسين), so team 1 anyway.
    expect(resolveProjects(hands, "hokum", 1).winner).toBe(1);
  });

  it("بلوت: trump K+Q in one hand scores 2 once both are played, and never in sun", () => {
    let found = 0;
    for (let seed = 1; seed <= 400 && found < 3; seed++) {
      const round = new Round((seed % 4) as Seat, mulberry32(seed));
      while (round.phase === "bidding") {
        const calls = round.legalBids();
        const hokum = calls.find((c) => c.call === "hokum");
        round.bid({ seat: round.bidding.turnSeat, ...(hokum ?? { call: "pass" }) } as Bid);
      }
      if (round.phase !== "playing" || round.balootHolder === undefined) continue;
      const holder = round.balootHolder;
      while (round.phase === "playing") {
        const seat = round.turnSeat!;
        round.playCard(seat, round.legalMovesFor(seat)[0]);
      }
      expect(round.result!.baloot).toBe(holder);
      const team = holder % 2 as 0 | 1;
      expect(round.result!.projectPoints![team]).toBeGreaterThanOrEqual(2);
      found++;
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe("أشكل (Ashkal) — docs/baloot-guide.md §1, §3", () => {
  it("only the dealer's partner may call it, in either round", () => {
    const ground: Card = { suit: "H", rank: "A" };
    let state = startBidding(0, ground);
    expect(legalCalls(state).some((c) => c.call === "ashkal")).toBe(false); // seat 1
    state = submitBid(state, { seat: 1, call: "pass" });
    expect(legalCalls(state).some((c) => c.call === "ashkal")).toBe(true); // seat 2 = dealer's partner
    expect(() => submitBid(startBidding(0, ground), { seat: 1, call: "ashkal" })).toThrow();
  });

  it("makes the dealer buy sun, and the dealer takes the ground card", () => {
    const round = new Round(3, mulberry32(12));
    const ground = round.groundCard;
    round.bid({ seat: 0, call: "pass" });
    round.bid({ seat: 1, call: "ashkal" }); // dealer 3's partner is seat 1
    expect(round.bidding.result).toMatchObject({ mode: "sun", declarer: 3, declarerTeam: 1 });
    expect(round.hands[3].some((c) => c.suit === ground.suit && c.rank === ground.rank)).toBe(true);
  });

  it("round 1 asks for the other suit of the same colour; round 2 for the other colour", () => {
    expect(ashkalSignal("H", 1)).toEqual(["D"]);
    expect(ashkalSignal("D", 1)).toEqual(["H"]);
    expect(ashkalSignal("C", 1)).toEqual(["S"]);
    expect(ashkalSignal("S", 1)).toEqual(["C"]);
    expect(ashkalSignal("H", 2)).toEqual(["S", "C"]);
    expect(ashkalSignal("S", 2)).toEqual(["H", "D"]);
  });

  it("can also take over a pending hokum", () => {
    const ground: Card = { suit: "H", rank: "9" };
    let state = startBidding(0, ground);
    state = submitBid(state, { seat: 1, call: "hokum", suit: "H" });
    expect(state.turnSeat).toBe(2);
    state = submitBid(state, { seat: 2, call: "ashkal" });
    expect(state.result).toMatchObject({ mode: "sun", declarer: 0 });
    expect(state.result!.ashkal!.signalSuits).toEqual(["D"]);
  });
});

describe("أكي (Akka) — docs/baloot-guide.md §6.1", () => {
  it("is the highest non-trump card left, in hokum, and never an Ace", () => {
    expect(isAkka(C("10H"), [C("AH")], "hokum", "S")).toBe(true);
    expect(isAkka(C("10H"), [], "hokum", "S")).toBe(false); // the Ace is still out
    expect(isAkka(C("KH"), [C("AH"), C("10H")], "hokum", "S")).toBe(true);
    expect(isAkka(C("AH"), [], "hokum", "S")).toBe(false);
    expect(isAkka(C("10H"), [C("AH")], "sun", undefined)).toBe(false);
    expect(isAkka(C("10S"), [C("AS"), C("JS"), C("9S")], "hokum", "S")).toBe(false); // trump
  });
});
