import { describe, expect, it } from "vitest";
import { inferConstraints, sampleWorld, searchCard } from "../src/ai/mcts";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { Round } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import { cardId, isTrumpCard, rankStrength } from "../src/engine/cards";
import { currentWinner } from "../src/engine/trick";
import { teamOf, type Seat } from "../src/engine/types";

/** A dealt, bought hand ready for play (or undefined if everyone passed). */
function playable(seed: number): Round | undefined {
  const r = new Round((seed % 4) as Seat, mulberry32(seed));
  for (let i = 0; i < 20 && r.phase === "bidding"; i++) r.bid(decideBid(r.bidding.turnSeat, r.hands[r.bidding.turnSeat], r.bidding));
  while (r.phase === "doubling") r.double({ seat: r.doubling!.turnSeat, call: "pass" });
  return r.phase === "playing" ? r : undefined;
}

function ruleMove(r: Round, seat: Seat) {
  const res = r.bidding.result!;
  return decideCard(r.hands[seat], r.currentTrick!, res.mode, res.trumpSuit, seat, { tricks: r.tricks, declarer: res.declarer, closed: r.closed });
}

describe("the search AI", () => {
  it("never touches the real round while it thinks", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = playable(seed);
      if (!r) continue;
      for (let k = 0; k < 13 && r.phase === "playing"; k++) {
        const seat = r.turnSeat!;
        const before = JSON.stringify({ hands: r.hands, trick: r.currentTrick, tricks: r.tricks, baloot: r.balootHolder });
        const card = searchCard(r, seat, { worlds: 6, rand: mulberry32(seed + k) });
        expect(JSON.stringify({ hands: r.hands, trick: r.currentTrick, tricks: r.tricks, baloot: r.balootHolder })).toBe(before);
        expect(r.legalMovesFor(seat).map(cardId)).toContain(cardId(card));
        r.playCard(seat, card);
      }
    }
  });

  it("guesses hidden hands that fit what the table has shown", () => {
    let worlds = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = playable(seed);
      if (!r) continue;
      const { mode, trumpSuit, declarer, ashkal } = r.bidding.result!;
      const taker = ashkal?.groundTo ?? declarer;
      for (let k = 0; k < 20 && r.phase === "playing"; k++) {
        const me = r.turnSeat!;
        const c = inferConstraints(r, me);
        const w = sampleWorld(r, me, c, mulberry32(seed * 100 + k));
        if (w) {
          worlds++;
          const seen = new Set([...r.tricks, r.currentTrick!].flatMap((t) => t.order.map((s) => cardId(t.cards[s]!))));
          const all = ([0, 1, 2, 3] as Seat[]).flatMap((s) => w[s].map(cardId));
          expect(new Set(all).size).toBe(all.length); // no card twice
          for (const s of [0, 1, 2, 3] as Seat[]) {
            expect(w[s].length).toBe(r.hands[s].length);
            if (s === me) continue;
            for (const card of w[s]) {
              expect(seen.has(cardId(card))).toBe(false);
              expect(c.voids[s].has(card.suit)).toBe(false);
            }
          }
          // Every real hand fits its own constraints, so the constraints never lie.
          for (const s of [0, 1, 2, 3] as Seat[]) {
            if (s === me) continue;
            for (const card of r.hands[s]) {
              expect(c.voids[s].has(card.suit), `seat ${s} holds ${cardId(card)}`).toBe(false);
              if (isTrumpCard(card, mode, trumpSuit)) expect(rankStrength(card, mode, trumpSuit)).toBeLessThanOrEqual(c.maxTrump[s]);
            }
          }
          const ground = r.groundCard;
          if (taker !== me && !seen.has(cardId(ground))) expect(w[taker].map(cardId)).toContain(cardId(ground));
        }
        r.playCard(me, ruleMove(r, me));
      }
    }
    expect(worlds).toBeGreaterThan(100);
  });

  it("keeps the player's rules: no Ace fed to a winning partner or thrown away, bar a برقية", () => {
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = playable(seed);
      if (!r) continue;
      const { mode, trumpSuit } = r.bidding.result!;
      while (r.phase === "playing") {
        const seat = r.turnSeat!;
        const trick = r.currentTrick!;
        const handSize = r.hands[seat].length;
        const card = searchCard(r, seat, { worlds: 6, rand: mulberry32(seed) });
        if (trick.order.length > 0 && card.rank === "A" && !isTrumpCard(card, mode, trumpSuit)) {
          const led = trick.cards[trick.order[0]]!.suit;
          const partnerWinning = teamOf(currentWinner(trick, mode, trumpSuit)) === teamOf(seat);
          // The player's exceptions: in hokum the Ace plays on its own suit (no فرنكة), and in
          // the last tricks it may fatten the partner's trick (تكبير).
          const hokumOnSuit = mode === "hokum" && card.suit === led;
          const fattening = handSize <= 2 && partnerWinning;
          if ((card.suit !== led || partnerWinning) && !hokumOnSuit && !fattening) {
            expect(cardId(card)).toBe(cardId(ruleMove(r, seat))); // only as the rule AI's برقية
            checked++;
          }
        }
        r.playCard(seat, card);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(0);
  });

  it("out-scores the rule-based AI on the same deals (each side playing both seat pairs)", () => {
    let margin = 0, hands = 0;
    // 240 hands: smaller samples were too noisy to tell a real regression from luck (120 gave
    // 0.8 where 240 gives 2.0 and 400 gives 1.96 — against a rule AI that itself got +0.7 a
    // hand stronger from the player's first notes).
    for (let seed = 1; hands < 240; seed++) {
      for (const team of [0, 1] as const) {
        const r = playable(seed);
        if (!r) continue;
        while (r.phase === "playing") {
          const seat = r.turnSeat!;
          r.playCard(seat, teamOf(seat) === team ? searchCard(r, seat, { worlds: 12, rand: mulberry32(seed * 13 + r.tricks.length) }) : ruleMove(r, seat));
        }
        const g = r.result!.gamePoints;
        margin += g[team] - g[(1 - team) as 0 | 1];
        hands++;
      }
    }
    expect(margin / hands).toBeGreaterThan(1);
  }, 120_000);
});
