import { beforeEach, describe, expect, it } from "vitest";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { decideDouble } from "../src/ai/doubling-ai";
import { startBidding } from "../src/engine/bidding";
import { mulberry32 } from "../src/engine/rng";
import { resolveTrick as trickWinner } from "../src/engine/trick";
import { teamOf, type Card, type Seat, type Trick } from "../src/engine/types";
import { GameController, HUMAN_SEAT } from "../src/game/GameController";
import { getJokerDef, JOKER_CATALOG } from "../src/roguelike/jokers";
import { generateMap } from "../src/roguelike/mapgen";
import { getOpponent, isWeakened, OPPONENTS } from "../src/roguelike/opponents";
import { BLESSING_GOLD, runController } from "../src/roguelike/RunController";
import { STARTING_GOLD, STARTING_LIVES } from "../src/roguelike/types";

const c = (s: string): Card => ({ suit: s.slice(-1) as Card["suit"], rank: s.slice(0, -1) as Card["rank"] });
const trickOf = (leader: Seat, plays: string[], rules?: Trick["rules"]): Trick => {
  const t: Trick = { leader, order: [], cards: {}, rules };
  plays.forEach((p, i) => {
    const seat = ((leader + i) % 4) as Seat;
    t.order.push(seat);
    t.cards[seat] = c(p);
  });
  return t;
};

describe("the opponents' rules are the jokers' powers, on their seats", () => {
  it("ملوك السبيت: their spades cut like a trump — only the one on your right once weakened", () => {
    const both = { rival: { trump: { suit: "S" as const, seats: [1, 3] as Seat[] } } };
    const one = { rival: { trump: { suit: "S" as const, seats: [1] as Seat[] } } };
    // You lead A♥; seat 3 (on your left) throws 7♠.
    expect(trickWinner(trickOf(0, ["AH", "8H", "9H", "7S"], both), "sun")).toBe(3);
    expect(trickWinner(trickOf(0, ["AH", "8H", "9H", "7S"], one), "sun")).toBe(0);
    expect(trickWinner(trickOf(0, ["AH", "7S", "9H", "8H"], one), "sun")).toBe(1);
  });

  it("ثوار الصغار: their 7s and 8s beat the Ace, yours don't", () => {
    const rules = { rival: { low: [1, 3] as Seat[] } };
    expect(trickWinner(trickOf(0, ["AH", "7H", "9H", "8C"], rules), "sun")).toBe(1);
    expect(trickWinner(trickOf(1, ["AH", "8H", "9H", "KH"], rules), "sun")).toBe(1);
  });

  it("حرّاس الأرض: their card in the last trick is the top of its suit", () => {
    const rules = { rival: { top: [1] as Seat[] } };
    expect(trickWinner(trickOf(0, ["AH", "7H", "9H", "8H"], rules), "sun")).toBe(1);
  });

  it("أهل الصن: an eager opponent buys sun on a hand a careful one passes", () => {
    const hand = [c("AS"), c("KS"), c("QH"), c("9D"), c("8C")];
    const state = startBidding(3, c("JD"));
    expect(decideBid(0, hand, state).call).not.toBe("sun");
    expect(decideBid(0, hand, state, { sunEager: true }).call).toBe("sun");
  });
});

/** Plays hands with the rule-based AI in every seat, the human's included. */
function playHands(options: ConstructorParameters<typeof GameController>[1], seed: number, hands: number) {
  const g = new GameController(mulberry32(seed), { matchTarget: 9999, ...options });
  const done: Array<{ gained: Record<0 | 1, number>; rival?: { points: number }; theyBought: boolean; mode: string }> = [];
  g.on("hand:complete", (e) =>
    done.push({ gained: e.gained, rival: e.rivalBonus, theyBought: e.result.declarerTeam !== teamOf(HUMAN_SEAT), mode: e.result.mode }),
  );
  g.startMatch();
  for (let i = 0; i < 20000 && done.length < hands; i++) {
    const status = g.step();
    if (status === "match-complete") break;
    if (status !== "waiting-human") continue;
    const round = g.getRound();
    if (g.getPendingAction() && round.phase === "playing") g.skipPlayerAction();
    else if (round.phase === "bidding") g.submitPlayerBid(decideBid(HUMAN_SEAT, round.hands[HUMAN_SEAT], round.bidding));
    else if (round.phase === "doubling") g.submitPlayerDouble(decideDouble(HUMAN_SEAT, round.hands[HUMAN_SEAT], round.doubling!, round.bidding.result!.trumpSuit));
    else {
      const res = round.bidding.result!;
      g.submitPlayerCard(decideCard(round.hands[HUMAN_SEAT], round.currentTrick!, res.mode, res.trumpSuit, HUMAN_SEAT, { tricks: round.tricks, closed: round.closed }));
    }
  }
  return done;
}

describe("the opponents' rules at the end of a hand", () => {
  it("ملوك السبيت: every trick they take with a spade pays them", () => {
    const done = playHands({ rival: { suitTrick: { suit: "S", points: 3 } } }, 4, 20);
    const paid = done.filter((h) => h.rival);
    expect(paid.length).toBeGreaterThan(0);
    for (const h of paid) expect(h.rival!.points % 3).toBe(0);
  });

  it("weakened: the rule is on for the first hand, then every other hand", () => {
    const g = new GameController(mulberry32(1), { matchTarget: 9999, rival: { suitTrick: { suit: "S", points: 3 }, alternate: true } });
    g.startMatch();
    expect(g.activeRival()).toBeDefined();
    const on: boolean[] = [];
    g.on("hand:dealt", () => on.push(!!g.activeRival()));
    for (let i = 0; i < 20000 && on.length < 4; i++) {
      const status = g.step();
      if (status !== "waiting-human") continue;
      const round = g.getRound();
      if (g.getPendingAction() && round.phase === "playing") g.skipPlayerAction();
      else if (round.phase === "bidding") g.submitPlayerBid(decideBid(HUMAN_SEAT, round.hands[HUMAN_SEAT], round.bidding));
      else if (round.phase === "doubling") g.submitPlayerDouble(decideDouble(HUMAN_SEAT, round.hands[HUMAN_SEAT], round.doubling!, round.bidding.result!.trumpSuit));
      else {
        const res = round.bidding.result!;
        g.submitPlayerCard(decideCard(round.hands[HUMAN_SEAT], round.currentTrick!, res.mode, res.trumpSuit, HUMAN_SEAT, { tricks: round.tricks, closed: round.closed }));
      }
    }
    expect(on).toEqual([false, true, false, true]);
  });

  it("أبو قهوة: a hand they buy and make counts double for them", () => {
    const done = playHands({ rival: { buyMultiplier: 2 }, rivalLabel: "☕ أبو قهوة" }, 5, 30);
    const doubled = done.filter((h) => h.rival);
    expect(doubled.length).toBeGreaterThan(0);
    for (const h of doubled) {
      expect(h.theyBought).toBe(true);
      // Their banked points are twice what they'd have had: the bonus is half of it.
      expect(h.gained[1]).toBe(h.rival!.points * 2);
    }
  });

  it("شيخ الأرض: taking الأرض takes the hand for them", () => {
    const done = playHands({ rival: { groundWins: true, groundWinsOnlyBought: true } }, 9, 30);
    const taken = done.filter((h) => h.rival);
    expect(taken.length).toBeGreaterThan(0);
    // A hand they took by الأرض leaves your side nothing but your own بلوت.
    for (const h of taken) {
      expect(h.theyBought).toBe(true);
      expect(h.gained[0]).toBeLessThanOrEqual(2);
    }
  });

  it("العيون: the search AI can play with the hands it's been shown", () => {
    const done = playHands({ rival: { peek: [0, 2] }, searchAI: true }, 3, 1);
    expect(done.length).toBe(1);
  });
});

describe("the run: who you play, and what beating them pays", () => {
  it("every fight node has an opponent of its tier, and the matches never repeat one", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const map = generateMap(seed);
      const fights = map.nodes.filter((n) => n.type !== "shop");
      for (const n of fights) expect(getOpponent(n.opponent)?.tier).toBe(n.type);
      const matches = fights.filter((n) => n.type === "match").map((n) => n.opponent);
      expect(new Set(matches).size).toBe(matches.length);
    }
  });

  it("every opponent's family and signature joker exist, and the signature is of that family", () => {
    for (const o of OPPONENTS) {
      const sig = getJokerDef(o.signature);
      expect(sig?.kind).toBe("joker");
      expect(sig!.tags).toContain(o.family);
      expect(JOKER_CATALOG.some((j) => j.tags.includes(o.family))).toBe(true);
    }
  });

  it("owning a joker of their family weakens them", () => {
    const lords = getOpponent("spade-lords")!;
    expect(isWeakened(lords, ["ولد"])).toBe(false);
    expect(isWeakened(lords, ["سبيت"])).toBe(true);
    expect(lords.rules(false).alternate).toBe(false);
    expect(lords.rules(true).alternate).toBe(true);
  });

  beforeEach(() => runController.startNewRun(77));

  it("الحوت offers four gifts, and each gives what it says", () => {
    const offers = runController.getState().blessing!;
    expect(offers.map((o) => o.kind)).toEqual(["rare", "pair", "gold", "cursed"]);
    expect(getJokerDef(offers[0].items[0])!.rarity).toBe("rare");
    const [a, b] = offers[1].items.map((id) => getJokerDef(id)!);
    expect(a.rarity).toBe("common");
    expect(b.rarity).toBe("common");
    expect(a.id).not.toBe(b.id);
    expect(a.tags.some((t) => b.tags.includes(t))).toBe(true);
    expect(getJokerDef(offers[3].items[0])!.rarity).toBe("legendary");

    runController.takeBlessing(3);
    const s = runController.getState();
    expect(s.jokerIds).toEqual(offers[3].items);
    expect(s.lives).toBe(STARTING_LIVES - 1);
    expect(s.blessing).toBeUndefined();

    runController.startNewRun(77);
    runController.takeBlessing(2);
    expect(runController.getState().gold).toBe(STARTING_GOLD + BLESSING_GOLD);
    expect(runController.getState().jokerIds).toEqual([]);
  });

  it("beating an elite always offers its signature joker", () => {
    const s = runController.getState();
    const eliteIndex = s.nodes.findIndex((n) => n.type === "elite");
    for (let i = 0; i < eliteIndex; i++) {
      const node = runController.getAvailableNode()!;
      runController.enterNode(node.id);
      if (node.type === "shop") runController.leaveShopNode();
      else {
        runController.resolveMatchNode(true);
        runController.skipReward();
      }
    }
    const elite = runController.getAvailableNode()!;
    runController.enterNode(elite.id);
    runController.resolveMatchNode(true);
    const signature = getOpponent(elite.opponent)!.signature;
    expect(runController.getState().pendingRewards!.items).toContain(signature);
    expect(runController.rivalHint(signature)).toContain("سر");
  });
});
