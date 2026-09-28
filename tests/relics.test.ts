import { describe, expect, it } from "vitest";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { decideDouble } from "../src/ai/doubling-ai";
import { resolveTrick, turnOf } from "../src/engine/trick";
import { scoreHand, KABOOT_VALUE } from "../src/engine/scoring";
import { Round } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import { teamOf, type Card, type Seat, type Trick } from "../src/engine/types";
import { GameController, HUMAN_SEAT, type MatchOptions } from "../src/game/GameController";
import { matchOptionsFromJokers } from "../src/roguelike/jokers";

const c = (id: string): Card => ({ suit: id[0] as Card["suit"], rank: id.slice(1) as Card["rank"] });
const trick = (leader: Seat, plays: string[], extra: Partial<Trick> = {}): Trick => {
  const order = plays.map((_, i) => ((leader + i) % 4) as Seat);
  const cards: Trick["cards"] = {};
  order.forEach((s, i) => (cards[s] = c(plays[i])));
  return { leader, order, cards, ...extra };
};

/** Answers the human's turn with the AI's own choice. */
function answer(g: GameController): void {
  const r = g.getRound();
  if (r.phase === "bidding") g.submitPlayerBid(decideBid(HUMAN_SEAT, r.hands[HUMAN_SEAT], r.bidding));
  else if (r.phase === "doubling") g.submitPlayerDouble(decideDouble(HUMAN_SEAT, r.hands[HUMAN_SEAT], r.doubling!, r.bidding.result!.trumpSuit));
  else g.submitPlayerCard(decideCard(r.hands[HUMAN_SEAT], r.currentTrick!, r.bidding.result!.mode, r.bidding.result!.trumpSuit, HUMAN_SEAT, { tricks: r.tricks, closed: r.closed }));
}

describe("الفزعة", () => {
  it("you and your partner each throw a 7 or 8: the trick is yours, over a trump", () => {
    // Hokum in spades; seat 1 cuts with the spade Jack.
    const t = trick(0, ["H7", "SJ", "D8", "HA"], { rules: { faz3a: 0 } });
    expect(resolveTrick(t, "hokum", "S")).toBe(0);
    // Without the rule, the Jack takes it.
    expect(resolveTrick(trick(0, ["H7", "SJ", "D8", "HA"]), "hokum", "S")).toBe(1);
    // Only your partner's small card with yours: an opponent's 7 doesn't count.
    expect(resolveTrick(trick(0, ["H7", "SJ", "DK", "D7"], { rules: { faz3a: 0 } }), "hokum", "S")).toBe(1);
  });

  it("your partner answers your small card with one of theirs", () => {
    let seen = 0;
    for (let seed = 1; seed <= 200 && seen < 3; seed++) {
      const g = new GameController(mulberry32(seed), { matchTarget: 999, faz3a: true });
      g.startMatch();
      for (let i = 0; i < 400; i++) {
        const r = g.getRound();
        const t = r.currentTrick;
        // Partner to play, your small card is down, and they hold a small card they may play.
        if (r.phase === "playing" && t && r.turnSeat === 2 && t.cards[0] && ["7", "8"].includes(t.cards[0].rank)) {
          const smalls = r.legalMovesFor(2).filter((x) => x.rank === "7" || x.rank === "8");
          if (smalls.length) {
            g.step();
            expect(["7", "8"]).toContain(t.cards[2]!.rank);
            seen++;
            break;
          }
        }
        const status = g.step();
        if (status === "waiting-human") answer(g);
        if (r.phase === "complete") break;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe("الصفر", () => {
  const tricksAllTo = (seat: Seat): Trick[] => {
    const suits = ["S", "H", "D", "C"];
    const ranks = ["7", "8", "9", "10", "J", "Q", "K", "A"];
    const out: Trick[] = [];
    let k = 0;
    for (let t = 0; t < 8; t++) {
      const plays = [0, 1, 2, 3].map(() => { const id = `${suits[k % 4]}${ranks[Math.floor(k / 4)]}`; k++; return id; });
      out.push({ ...trick(0, plays), winner: seat });
    }
    return out;
  };

  it("they buy and you take nothing: the كبوت is yours", () => {
    const r = scoreHand(tricksAllTo(1), "sun", undefined, 1, 10, { zeroFor: 0 });
    expect(r.gamePoints[0]).toBe(KABOOT_VALUE.sun);
    expect(r.gamePoints[1]).toBe(0);
    expect(r.sheet!.kaboot).toBe(0);
    // Without الصفر it's their كبوت.
    expect(scoreHand(tricksAllTo(1), "sun", undefined, 1).gamePoints[1]).toBe(KABOOT_VALUE.sun);
  });

  it("not when you bought yourself", () => {
    const r = scoreHand(tricksAllTo(1), "hokum", "S", 0, 10, { zeroFor: 0 });
    expect(r.gamePoints[1]).toBe(KABOOT_VALUE.hokum);
    expect(r.gamePoints[0]).toBe(0);
  });
});

describe("آخر الكلام", () => {
  it("a deferred seat plays the trick's last card", () => {
    const t: Trick = { leader: 3, order: [3], cards: { 3: c("HA") }, deferred: 0 };
    expect(turnOf(t)).toBe(1);
    t.order.push(1);
    t.cards[1] = c("H7");
    expect(turnOf(t)).toBe(2);
    t.order.push(2);
    t.cards[2] = c("H8");
    expect(turnOf(t)).toBe(0);
  });

  it("the round honours it: pass, the others play, then you, and the trick resolves as usual", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = new Round(0, mulberry32(seed));
      for (let i = 0; i < 12 && r.phase === "bidding"; i++) {
        const seat = r.bidding.turnSeat;
        const calls = r.legalBids();
        const call = calls.find((x) => x.call === "sun") ?? calls.find((x) => x.call === "pass")!;
        r.bid({ ...call, seat });
      }
      while (r.phase === "doubling") r.double({ seat: r.doubling!.turnSeat, call: "pass" });
      if (r.phase !== "playing") continue;
      // Play until it's seat 0's turn mid-trick.
      for (let guard = 0; guard < 40 && r.phase === "playing"; guard++) {
        const seat = r.turnSeat!;
        if (seat === 0 && r.canDefer(0)) {
          const before = r.currentTrick!.order.length;
          r.deferTurn(0);
          expect(r.canDefer(0)).toBe(false);
          expect(r.turnSeat).not.toBe(0);
          while (r.currentTrick!.order.length < 3) r.playCard(r.turnSeat!, r.legalMovesFor(r.turnSeat!)[0]);
          expect(r.turnSeat).toBe(0);
          r.playCard(0, r.legalMovesFor(0)[0]);
          const done = r.tricks.at(-1)!;
          expect(done.order.at(-1)).toBe(0);
          expect(done.order.length).toBe(4);
          expect(before).toBeGreaterThan(0);
          return;
        }
        r.playCard(seat, r.legalMovesFor(seat)[0]);
      }
    }
    throw new Error("never got a chance to defer");
  });

  it("the controller counts the passes per hand", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const g = new GameController(mulberry32(seed), { matchTarget: 999, lastWord: 1 });
      g.startMatch();
      for (let i = 0; i < 400; i++) {
        const status = g.step();
        if (status !== "waiting-human") continue;
        if (g.canDeferTurn()) {
          g.deferTurn();
          expect(g.canDeferTurn()).toBe(false);
          return;
        }
        answer(g);
      }
    }
    throw new Error("never offered");
  });
});

describe("البيعة", () => {
  it("after the deal, your side's contract goes to the other side", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = new GameController(mulberry32(seed), { matchTarget: 999, contractSale: true });
      let offered = false;
      g.on("sale:offer", () => (offered = true));
      g.startMatch();
      for (let i = 0; i < 60 && !offered; i++) {
        const status = g.step();
        if (status === "waiting-human" && !offered) answer(g);
      }
      if (!offered) continue;
      const r = g.getRound();
      expect(teamOf(r.bidding.result!.declarer)).toBe(0);
      expect(r.hands[0]).toHaveLength(8);
      g.sellContract();
      expect(r.bidding.result!.declarerTeam).toBe(1);
      expect(r.bidding.result!.declarer).toBe(1);
      expect(g.canSellContract()).toBe(false);
      // And the hand plays on.
      expect(g.step()).not.toBe("idle");
      return;
    }
    throw new Error("never offered");
  });

  it("the other side can't sell, and a doubled hand can't be sold", () => {
    const r = new Round(0, mulberry32(4));
    expect(r.canSellContract(0)).toBe(false);
  });
});

describe("the relics as jokers", () => {
  it("each joker switches its rule on", () => {
    const o: MatchOptions = matchOptionsFromJokers(["faz3a", "zero", "last-word", "bay3a"], { "last-word": 2 });
    expect(o.faz3a).toBe(true);
    expect(o.zeroKaboot).toBe(true);
    expect(o.lastWord).toBe(2);
    expect(o.contractSale).toBe(true);
  });
});
