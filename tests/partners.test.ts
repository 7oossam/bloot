import { beforeEach, describe, expect, it } from "vitest";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { startBidding } from "../src/engine/bidding";
import { mulberry32 } from "../src/engine/rng";
import { Round } from "../src/engine/round";
import type { Card, Seat, Trick } from "../src/engine/types";
import { GameController, type MatchOptions } from "../src/game/GameController";
import { getPartner, PARTNERS } from "../src/roguelike/partners";
import { runController } from "../src/roguelike/RunController";

const c = (s: string): Card => ({ suit: s.slice(-1) as Card["suit"], rank: s.slice(0, -1) as Card["rank"] });
const trickOf = (leader: Seat, ...plays: string[]): Trick => {
  const t: Trick = { leader, order: [], cards: {} };
  plays.forEach((p, i) => {
    const seat = ((leader + i) % 4) as Seat;
    t.order.push(seat);
    t.cards[seat] = c(p);
  });
  return t;
};

describe("شخصيات الخوي", () => {
  it("every partner has a perk and a quirk", () => {
    expect(PARTNERS.length).toBe(4);
    for (const p of PARTNERS) {
      expect(p.perk.length).toBeGreaterThan(0);
      expect(p.quirk.length).toBeGreaterThan(0);
    }
  });

  it("الجفرة is always dealt an Ace (from the shared deck)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = new Round(0, mulberry32(seed), { luckyAces: { seat: 2, count: 1 } });
      expect(r.initial.hands[2].some((x) => x.rank === "A")).toBe(true);
      const all = [...([0, 1, 2, 3] as Seat[]).flatMap((s) => r.initial.hands[s]), ...r.initial.stock];
      expect(new Set(all.map((x) => x.suit + x.rank)).size).toBe(32);
    }
  });

  it("المتحمس buys hands a careful partner passes", () => {
    let careful = 0, eager = 0;
    const rand = mulberry32(9);
    for (let i = 0; i < 300; i++) {
      const r = new Round(0, rand);
      const state = startBidding(0, r.groundCard);
      if (decideBid(1, r.initial.hands[1], state).call !== "pass") careful++;
      if (decideBid(1, r.initial.hands[1], state, 10).call !== "pass") eager++;
    }
    expect(eager).toBeGreaterThan(careful);
  });

  it("الشايب comes to the suit you asked for before cashing his own winners; الغشيم can't read you", () => {
    // Seat 0 threw 7♠ on a ♥ lead: it asks for ♣. Seat 2 holds a sure winner (A♦) and clubs.
    const earlier = trickOf(1, "AH", "8H", "9H", "7S");
    earlier.winner = 1;
    const hand = [c("AD"), c("9C"), c("KC"), c("8S")];
    const lead = (ctx: object) => decideCard(hand, trickOf(2), "sun", undefined, 2, { tricks: [earlier], ...ctx });
    expect(lead({})).toEqual(c("AD")); // normal: cash first
    expect(lead({ answerFirst: true })).toEqual(c("KC")); // الشايب: your suit first
    expect(lead({ deaf: true, answerFirst: true }).suit).not.toBe("C"); // can't read you at all
  });

  it("المتحمس: a hand he buys and makes pays +50%", () => {
    const g = new GameController(mulberry32(3), { matchTarget: 9999, partner: getPartner("eager")!.options });
    const paid: number[] = [];
    g.on("hand:complete", (e) => {
      const b = e.bonuses.find((x) => x.label === "المتحمس");
      if (b) paid.push(b.points);
    });
    g.startMatch();
    for (let i = 0; i < 40000 && paid.length < 2; i++) {
      const st = g.step();
      if (st !== "waiting-human") continue;
      const r = g.getRound();
      if (g.getPendingAction() && r.phase === "playing") g.skipPlayerAction();
      else if (r.phase === "bidding") g.submitPlayerBid({ seat: 0, call: "pass" });
      else if (r.phase === "doubling") g.submitPlayerDouble({ seat: 0, call: "pass" });
      else g.submitPlayerCard(r.legalMovesFor(0)[0]);
    }
    expect(paid.length).toBeGreaterThan(0);
    for (const p of paid) expect(p).toBeGreaterThan(0);
  });

  beforeEach(() => runController.startNewRun(11));

  it("the partner you pick reaches the match, and الغشيم pays more", () => {
    runController.choosePartner("rookie");
    const o: MatchOptions = {};
    runController.applyBlessings(o);
    expect(o.partner).toEqual(getPartner("rookie")!.options);
    expect(o.partnerLabel).toContain("الغشيم");
    const node = runController.getAvailableNode()!;
    runController.enterNode(node.id);
    const { goldEarned } = runController.resolveMatchNode(true);
    expect(goldEarned).toBe(Math.round(node.reward * 1.5));
    expect(runController.getState().pendingRewards!.items).toHaveLength(4);
  });
});
