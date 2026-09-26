import { describe, expect, it } from "vitest";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard, defenderMayLeadTrump } from "../src/ai/play-ai";
import { buildBeliefs, readDiscards } from "../src/ai/beliefs";
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

  it("feeds points to a partner who is winning — but keeps a card that just became the top one", () => {
    const trick: Trick = {
      leader: 1,
      order: [1, 2],
      cards: {
        1: { suit: "H", rank: "7" },
        2: { suit: "H", rank: "A" }, // seat 2 = partner of seat 0, currently winning
      },
    };
    // With the Ace gone, 10♥ is the boss of hearts — a way back in later, so it stays.
    expect(decideCard([c("10H"), c("9H")], trick, "sun", undefined, 0)).toEqual(c("9H"));
    // K♥ isn't a winner (10♥ is still out), so it's fed to the partner.
    expect(decideCard([c("KH"), c("9H")], trick, "sun", undefined, 0)).toEqual(c("KH"));
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

  it("the dealer calls أشكل over the other team's hokum with a fair sun hand and a 10 on the ground", () => {
    let state = startBidding(0, c("10H"));
    state = submitBid(state, { seat: 1, call: "hokum", suit: "H" });
    state = submitBid(state, { seat: 2, call: "pass" });
    state = submitBid(state, { seat: 3, call: "pass" });
    // Not enough to buy sun alone, but a fair sun hand for the partner to take the 10 into.
    const bid = decideBid(0, cards("AS", "KS", "QS", "10D", "7C"), state);
    expect(bid.call).toBe("ashkal");
  });
});

describe("card play — التهريب, الأبناط, السرد (§4, §5)", () => {
  it("discards so the partner reads a request for its strong suit, never a refusal of it", () => {
    // Seat 0 is void in hearts and the opponents are winning; its strength is spades. 9♦ (the
    // led suit's brother → "black") and Q♣ (spades' brother) both ask for spades; 7♠ would refuse it.
    const t = trickOf(1, "AH");
    const chosen = decideCard(cards("AS", "KS", "7S", "9D", "QC"), t, "sun", undefined, 0, { tricks: [] });
    const read = readDiscards([{ card: chosen, led: "H" }]);
    expect(read.wants[0]).toBe("S");
    expect(read.rejects).not.toContain("S");
  });

  it("the partner then leads the brother of the discarded suit — with its biggest card", () => {
    // Earlier trick: seat 3 led A♥ and seat 0, void, threw 7♠ — not spades: it wants clubs.
    const earlier = trickOf(3, "AH", "7S", "8H", "9H");
    earlier.winner = 3;
    const chosen = decideCard(cards("8S", "KD", "QD", "9C", "10C"), trickOf(2), "sun", undefined, 2, { tricks: [earlier] });
    expect(chosen).toEqual(c("10C"));
  });

  it("reads the table's discards the way the video teaches", () => {
    const read = (mode: "sun" | "hokum", ...played: Trick[]) => buildBeliefs(played, undefined, mode, mode === "hokum" ? "S" : undefined);
    // Rule 1: a lone discard asks for its brother (led ♠, threw ♦ → wants ♥), and ♦ isn't wanted.
    const one = read("sun", trickOf(1, "AS", "8S", "9S", "7D"));
    expect(one.wants[0]).toEqual(["H"]);
    expect(one.rejects[0]).toEqual(["D"]);
    // Rule 3: led ♥, threw ♦ (its brother) → wants the black suits.
    expect(read("sun", trickOf(1, "AH", "8H", "9H", "7D")).wants[0]).toEqual(["S", "C"]);
    // Rule 2: on ♣ leads, threw ♥ then ♦ (both red) → wants black: ♠ (it has no ♣).
    expect(read("sun", trickOf(1, "AC", "8C", "9C", "7H"), trickOf(1, "KC", "QC", "JC", "8D")).wants[0]).toEqual(["S"]);
    // Rule 4: climbing in ♦ (7 then 8 then بنت) asks for ♦ itself.
    const up = read("sun", trickOf(1, "AS", "8S", "9S", "7D"), trickOf(1, "AC", "8C", "9C", "8D"), trickOf(1, "KS", "7S", "QS", "QD"));
    expect(up.wants[0][0]).toBe("D");
    expect(up.rejects[0]).not.toContain("D");
    // …and coming down (10 then 9) doesn't: ♦ is refused, its brother ♥ is asked for.
    const down = read("sun", trickOf(1, "AS", "8S", "9S", "10D"), trickOf(1, "AC", "8C", "9C", "9D"));
    expect(down.rejects[0]).toContain("D");
    expect(down.wants[0]).toEqual(["H"]);
    // A ruff in hokum is not a message.
    expect(read("hokum", trickOf(1, "AH", "8H", "9H", "7S")).wants[0]).toEqual([]);
  });

  it("builds a climb when its strong suit's brother is the led suit's colour", () => {
    // Earlier seat 0 threw 7♦ (led ♠). Now ♥ is led and ♦ is its strength: the next ♦ up says "♦".
    const earlier = trickOf(1, "AS", "8S", "9S", "7D");
    earlier.winner = 1;
    const chosen = decideCard(cards("AD", "8D", "KD", "8C", "9C"), trickOf(1, "AH"), "sun", undefined, 0, { tricks: [earlier] });
    expect(chosen).toEqual(c("8D"));
  });

  it("never leaves a 10 bare (لا تعلّق عشرتك)", () => {
    // Void in ♥. Throwing 7♦ would leave 10♦ alone for the opponents' Ace to catch.
    const chosen = decideCard(cards("7D", "10D", "8C", "KC"), trickOf(1, "AH"), "sun", undefined, 0, { tricks: [] });
    expect(chosen.suit).toBe("C");
  });

  it("stops everything for a برقية — even holding its own winners", () => {
    const earlier = trickOf(0, "AS", "7S", "AH", "8S");
    earlier.winner = 0;
    const lead = decideCard(cards("7H", "QH", "AD", "10D", "AC"), trickOf(0), "sun", undefined, 0, { tricks: [earlier] });
    expect(lead).toEqual(c("QH"));
  });

  it("leads its project's suit on the first lead (حل مشروعك)", () => {
    // سرا 8-9-10♣: lead low to draw the big clubs out.
    const lead = decideCard(cards("8C", "9C", "10C", "AH", "7D", "KS", "QS", "8H"), trickOf(0), "sun", undefined, 0, { tricks: [] });
    expect(lead).toEqual(c("8C"));
  });

  it("goes back to the suit the partner opened with", () => {
    // Partner (seat 2) led ♠ first; seat 3 won it. Now seat 0 leads.
    const earlier = trickOf(2, "QS", "AS", "7S", "8S");
    earlier.winner = 3;
    const lead = decideCard(cards("9S", "JS", "8H", "7D", "9C"), trickOf(0), "sun", undefined, 0, { tricks: [earlier] });
    expect(lead).toEqual(c("JS"));
  });

  it("goes in with its biggest card behind the partner's lead to force the last player", () => {
    // Partner led ولد ♠, seat 3 followed low; A♠ and 10♠ are still out and seat 1 plays last.
    const t = trickOf(2, "JS", "7S");
    const chosen = decideCard(cards("KS", "8S", "9H", "7D"), t, "sun", undefined, 0, { tricks: [] });
    expect(chosen).toEqual(c("KS"));
  });

  it("gives its 10 to the partner's opening Ace so they keep cashing", () => {
    const t = trickOf(2, "AD", "7D");
    const chosen = decideCard(cards("10D", "8D", "9H", "7C"), t, "sun", undefined, 0, { tricks: [] });
    expect(chosen).toEqual(c("10D"));
  });

  it("reads a 10 on its Ace in the middle of the hand as a request", () => {
    const tricks = [trickOf(1, "7C", "8C", "9C", "JC"), trickOf(0, "KH", "AH", "7H", "8H"), trickOf(0, "AD", "7D", "10D", "8D")];
    expect(buildBeliefs(tricks, undefined, "sun").wants[2]).toContain("D");
  });

  it("leads trumps for the partner who bought hokum: the 10, or the 9 from شايب-9 (ربّع له)", () => {
    const ten = decideCard(cards("10D", "8D", "AS", "7C", "9H"), trickOf(0), "hokum", "D", 0, { tricks: [], declarer: 2 });
    expect(ten).toEqual(c("10D"));
    const nine = decideCard(cards("KH", "9H", "AS", "7C", "8D"), trickOf(0), "hokum", "H", 0, { tricks: [], declarer: 2 });
    expect(nine).toEqual(c("9H"));
  });

  it("as the hokum buyer, doesn't throw a side suit's last card (مقطوعك)", () => {
    // Seat 0 bought ♦ and has no trump left to... it holds trumps but partner is winning, so it may discard.
    const t = trickOf(2, "AS", "7S");
    const chosen = decideCard(cards("7C", "8H", "9H", "JD", "9D"), t, "hokum", "D", 0, { tricks: [], declarer: 0 });
    expect(chosen).not.toEqual(c("7C"));
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

  it("never ruffs or overtakes a trick its partner is already winning", () => {
    // Hokum ♠. Seat 0 led A♥ and is winning; seat 1 followed; seat 2 (partner) is void in ♥.
    const t = trickOf(0, "AH", "7H");
    const chosen = decideCard(cards("7S", "JS", "8D", "9C"), t, "hokum", "S", 2, { tricks: [] });
    expect(chosen.suit).not.toBe("S");
    // Following suit with a card that would beat the partner's is avoided too.
    const t2 = trickOf(0, "KH", "7H");
    const follow = decideCard(cards("AH", "8H", "9C"), t2, "hokum", "S", 2, { tricks: [] });
    expect(follow).toEqual(c("8H"));
  });

  it("never throws an Ace on the partner's trick — unless it's a برقية", () => {
    // Sun. Seat 2 led A♠ and wins; seat 3 followed; seat 0 is void in spades.
    const t = trickOf(2, "AS", "7S");
    const plain = decideCard(cards("AH", "8H", "9D", "7C", "KD"), t, "sun", undefined, 0, { tricks: [] });
    expect(plain.rank).not.toBe("A");
    // Everything else is a sure winner: A♥ then 10♥ K♥ run, and ♦ is gone except our A-10.
    const played = [trickOf(1, "KD", "QD", "JD", "9D"), trickOf(1, "8D", "7D", "QH", "JH")];
    played.forEach((tr) => (tr.winner = 1));
    const barqiya = decideCard(cards("AH", "10H", "KH"), t, "sun", undefined, 0, { tricks: played });
    expect(barqiya).toEqual(c("AH"));
  });

  it("answers a برقية: leads back the suit of the partner's Ace", () => {
    // Earlier: seat 0 led A♠ and won; partner (seat 2), void in spades, threw A♥ — a برقية.
    const earlier = trickOf(0, "AS", "7S", "AH", "8S");
    earlier.winner = 0;
    const lead = decideCard(cards("7H", "KD", "QD", "10C", "9C", "8C", "JS"), trickOf(0), "sun", undefined, 0, { tricks: [earlier] });
    expect(lead).toEqual(c("7H"));
  });

  it("the partner who took the ground card plays the suit أشكل asked for", () => {
    const chosen = decideCard(cards("9D", "KD", "8C", "QS", "7H"), trickOf(0), "sun", undefined, 0, {
      tricks: [],
      declarer: 0,
      ashkalSuits: ["D"],
    });
    expect(chosen.suit).toBe("D");
  });

  it("the side that didn't buy the hokum doesn't lead trumps (حل الحكم)", () => {
    // Seat 0 defends seat 1's hokum in ♠, with two trumps and an ordinary hand.
    const lead = decideCard(cards("JS", "9S", "8H", "KD", "7C"), trickOf(0), "hokum", "S", 0, { tricks: [], declarer: 1 });
    expect(lead.suit).not.toBe("S");
    // The player's exceptions: a strong hokum of your own (4+ trumps, or 3 with the ولد or the
    // تسعة), or a very strong sun-like hand (4+ sure side winners).
    const none = buildBeliefs([], undefined, "hokum", "S");
    expect(defenderMayLeadTrump(cards("JS", "9S", "8H", "KD", "7C"), "hokum", "S", none)).toBe(false);
    expect(defenderMayLeadTrump(cards("JS", "9S", "AS", "8S", "7C"), "hokum", "S", none)).toBe(true);
    expect(defenderMayLeadTrump(cards("9S", "8S", "7S", "KD", "7C"), "hokum", "S", none)).toBe(true);
    expect(defenderMayLeadTrump(cards("8S", "AH", "AD", "AC", "10C", "7D"), "hokum", "S", none)).toBe(true);
    // The player's note: a lone trump Ace with three side winners isn't one — don't lead it
    // into the buyer's ولد.
    expect(defenderMayLeadTrump(cards("AS", "AH", "AD", "10D", "7C"), "hokum", "S", none)).toBe(false);
    // The buyer's side still pulls trumps.
    expect(decideCard(cards("JS", "9S", "7S", "AH", "8D"), trickOf(0), "hokum", "S", 0, { tricks: [], declarer: 0 })).toEqual(c("JS"));
  });
});
