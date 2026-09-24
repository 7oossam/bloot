import { describe, expect, it } from "vitest";
import { FEATURE_COUNT, TRAINED_WEIGHTS, cardFeatures, trainedPolicy } from "../src/ai/policy";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { Round } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import { cardId } from "../src/engine/cards";
import { teamOf, type Seat } from "../src/engine/types";

function playable(seed: number): Round | undefined {
  const r = new Round((seed % 4) as Seat, mulberry32(seed));
  for (let i = 0; i < 20 && r.phase === "bidding"; i++) r.bid(decideBid(r.bidding.turnSeat, r.hands[r.bidding.turnSeat], r.bidding));
  while (r.phase === "doubling") r.double({ seat: r.doubling!.turnSeat, call: "pass" });
  return r.phase === "playing" ? r : undefined;
}

describe("the self-play trained policy", () => {
  it("matches its feature list and always plays a legal card", () => {
    expect(TRAINED_WEIGHTS.w1[0].length).toBe(FEATURE_COUNT);
    for (let seed = 1; seed <= 30; seed++) {
      const r = playable(seed);
      if (!r) continue;
      const res = r.bidding.result!;
      while (r.phase === "playing") {
        const seat = r.turnSeat!;
        const ctx = { tricks: r.tricks, declarer: res.declarer, closed: r.closed };
        const legal = r.legalMovesFor(seat);
        const f = cardFeatures(legal, r.hands[seat], r.currentTrick!, res.mode, res.trumpSuit, seat, ctx);
        expect(f.every((row) => row.length === FEATURE_COUNT && row.every(Number.isFinite))).toBe(true);
        const card = trainedPolicy(r.hands[seat], r.currentTrick!, res.mode, res.trumpSuit, seat, ctx);
        expect(legal.map(cardId)).toContain(cardId(card));
        r.playCard(seat, card);
      }
    }
  });

  it("out-scores the rule-based AI on the same deals (each side playing both seat pairs)", () => {
    let margin = 0, hands = 0;
    for (let seed = 1; hands < 600; seed++) {
      for (const team of [0, 1] as const) {
        const r = playable(seed);
        if (!r) continue;
        const res = r.bidding.result!;
        while (r.phase === "playing") {
          const seat = r.turnSeat!;
          const ctx = { tricks: r.tricks, declarer: res.declarer, closed: r.closed };
          const pick = teamOf(seat) === team ? trainedPolicy : decideCard;
          r.playCard(seat, pick(r.hands[seat], r.currentTrick!, res.mode, res.trumpSuit, seat, ctx));
        }
        const g = r.result!.gamePoints;
        margin += g[team] - g[(1 - team) as 0 | 1];
        hands++;
      }
    }
    expect(margin / hands).toBeGreaterThan(0.5);
  });
});
