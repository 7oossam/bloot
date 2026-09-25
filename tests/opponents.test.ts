import { beforeEach, describe, expect, it } from "vitest";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { decideDouble } from "../src/ai/doubling-ai";
import { mulberry32 } from "../src/engine/rng";
import { Round } from "../src/engine/round";
import { scoreHand } from "../src/engine/scoring";
import { legalMoves, resolveTrick } from "../src/engine/trick";
import { teamOf, type Card, type HandResult, type Seat, type Trick } from "../src/engine/types";
import { GameController, HUMAN_SEAT, type MatchOptions } from "../src/game/GameController";
import { EVENTS, getEvent } from "../src/roguelike/events";
import { getJokerDef } from "../src/roguelike/jokers";
import { generateMap, pathTo } from "../src/roguelike/mapgen";
import { getOpponent } from "../src/roguelike/opponents";
import { runController } from "../src/roguelike/RunController";
import { CROWN_TARGET, getBlessing, TREASURE_GOLD } from "../src/roguelike/blessings";
import { STARTING_GOLD } from "../src/roguelike/types";

const c = (s: string): Card => ({ suit: s.slice(-1) as Card["suit"], rank: s.slice(0, -1) as Card["rank"] });
const trickOf = (leader: Seat, plays: string[], rules?: Trick["rules"]): Trick => {
  const t: Trick = { leader, order: [], cards: {}, rules };
  plays.forEach((p, i) => {
    const seat = ((leader + i) % 4) as Seat;
    t.order.push(seat);
    t.cards[seat] = c(p);
  });
  t.winner = resolveTrick(t, "sun");
  return t;
};

describe("the opponents bend the game against you", () => {
  // Eight sun tricks: you take the first two (the second with an Ace), they take the rest.
  const hand = (): Trick[] => [
    trickOf(0, ["10H", "7H", "8H", "9H"]),
    trickOf(0, ["AS", "7S", "8S", "9S"]),
    ...[0, 1, 2, 3, 4, 5].map(() => trickOf(1, ["7C", "8C", "9C", "JC"])),
  ];

  it("حرّاس الإكك: your team can't lead an Ace or a 10 while holding anything else", () => {
    const rules = { rival: { noAceLead: 0 as const } };
    const empty: Trick = { leader: 0, order: [], cards: {}, rules };
    expect(legalMoves([c("AS"), c("10H"), c("7D")], empty, "sun", undefined, 0)).toEqual([c("7D")]);
    expect(legalMoves([c("AS"), c("10H")], empty, "sun", undefined, 0)).toEqual([c("AS"), c("10H")]);
    // Theirs are free.
    expect(legalMoves([c("AS"), c("7D")], { ...empty, leader: 1 }, "sun", undefined, 1)).toHaveLength(2);
  });

  it("أهل الأرض: الأرض is theirs whoever takes the last trick", () => {
    const tricks = hand();
    tricks[7] = trickOf(0, ["AD", "7D", "8D", "9D"]);
    const plain = scoreHand(tricks, "sun", undefined, 0);
    const theirs = scoreHand(tricks, "sun", undefined, 0, undefined, { groundTo: 1 });
    expect(plain.rawPoints[0] - theirs.rawPoints[0]).toBe(10);
    expect(theirs.rawPoints[1] - plain.rawPoints[1]).toBe(10);
  });

  it("خاطفين الولد: your trump Jack drops to the bottom of the trumps", () => {
    const rules = { rival: { weakJack: 0 as const, jackBottom: true } };
    const t: Trick = { leader: 0, order: [0, 1, 2, 3], cards: { 0: c("JS"), 1: c("7S"), 2: c("KH"), 3: c("8H") }, rules };
    expect(resolveTrick(t, "hokum", "S")).toBe(1);
    // Theirs stays the top trump.
    const t2: Trick = { leader: 1, order: [1, 2, 3, 0], cards: { 1: c("JS"), 2: c("9S"), 3: c("7S"), 0: c("8S") }, rules };
    expect(resolveTrick(t2, "hokum", "S")).toBe(1);
  });

  it("أهل الحكم: the one on your right is dealt the Jack and 9 of the ground card's suit", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = new Round(0, mulberry32(seed), { hokumSeat: 1 });
      const suit = r.groundCard.suit;
      const onGround = r.groundCard.rank === "J" || r.groundCard.rank === "9" ? 1 : 0;
      const held = r.initial.hands[1].filter((x) => x.suit === suit && (x.rank === "J" || x.rank === "9")).length;
      expect(held).toBe(2 - onGround);
    }
  });
});

/** Plays hands with the rule-based AI in every seat, the human's included. */
function playHands(options: MatchOptions, seed: number, hands: number): Array<{ result: HandResult; round: Round; gained: Record<0 | 1, number> }> {
  const g = new GameController(mulberry32(seed), { matchTarget: 9999, ...options });
  const done: Array<{ result: HandResult; round: Round; gained: Record<0 | 1, number> }> = [];
  g.on("hand:complete", (e) => done.push({ result: e.result, round: g.getRound(), gained: e.gained }));
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

describe("the opponents' rules in a real match", () => {
  it("المدبّلين: a hand your team buys and loses counts double for them", () => {
    const made = (r: HandResult) =>
      !r.sheet || (r.sheet.judgedTeam === r.declarerTeam ? r.sheet.outcome === "won" : r.sheet.outcome === "lost");
    const plain = playHands({}, 5, 120);
    const doubled = playHands({ rival: { lossDoubled: true } }, 5, 120);
    // The same deals up to the first hand you buy and lose (after it the scores differ).
    const first = doubled.findIndex((h) => h.result.declarerTeam === teamOf(HUMAN_SEAT) && !made(h.result));
    expect(first).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < first; i++) expect(doubled[i].gained).toEqual(plain[i].gained);
    expect(doubled[first].gained[1]).toBe(plain[first].gained[1] * 2);
    expect(doubled[first].gained[0]).toBe(plain[first].gained[0]);
  });

  it("ماسحين المشاريع: your projects never count", () => {
    const done = playHands({ rival: { cancelProjects: true } }, 7, 40);
    for (const h of done) expect(h.round.projects?.declared.some((p) => teamOf(p.seat) === teamOf(HUMAN_SEAT)) ?? false).toBe(false);
  });
});

describe("the run: opponents, الديوانية and الحوت", () => {
  it("every fight has an opponent of its tier, and every ديوانية an event", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const map = generateMap(seed);
      for (const n of map.nodes) {
        if (n.type === "match" || n.type === "elite" || n.type === "boss") expect(getOpponent(n.opponent)?.tier).toBe(n.type);
        if (n.type === "diwaniya") expect(getEvent(n.event)).toBeDefined();
      }
    }
  });

  it("the map branches: every node is reachable, every path meets the shop row and the boss", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { nodes } = generateMap(seed);
      const top = Math.max(...nodes.map((n) => n.floor));
      expect(nodes.filter((n) => n.floor === top).map((n) => n.type)).toEqual(["boss"]);
      expect(nodes.filter((n) => n.floor === top - 1).every((n) => n.type === "shop")).toBe(true);
      expect(nodes.filter((n) => n.floor === 0).every((n) => n.type === "match")).toBe(true);
      for (const n of nodes) {
        expect(pathTo(nodes, n.id)).toBeDefined();
        if (n.type !== "boss") expect(n.next.length).toBeGreaterThan(0);
        for (const id of n.next) expect(nodes.find((x) => x.id === id)!.floor).toBe(n.floor + 1);
        if (n.type === "elite") expect(n.floor).toBeGreaterThanOrEqual(3);
      }
      // A real choice: some row offers more than one node.
      expect(nodes.filter((n) => n.floor === 1).length).toBeGreaterThanOrEqual(2);
    }
  });

  beforeEach(() => runController.startNewRun(77));

  /** Offers exactly this blessing, and takes it. */
  const bless = (id: string) => {
    (runController.getState() as { blessing?: string[] }).blessing = [id];
    runController.takeBlessing(0);
  };

  it("المعطّل picks your rarest joker", () => {
    bless("crown"); // a legendary
    const legendary = runController.getState().jokerIds[0];
    expect(getJokerDef(legendary)!.rarity).toBe("legendary");
    expect(runController.strongestJoker()).toBe(legendary);
  });

  it("الحوت offers three blessings: one free, two with a price", () => {
    for (let seed = 1; seed <= 20; seed++) {
      runController.startNewRun(seed);
      const offers = runController.getState().blessing!.map((id) => getBlessing(id)!);
      expect(offers).toHaveLength(3);
      expect(offers[0].price).toBeUndefined();
      expect(offers[1].price).toBeDefined();
      expect(offers[2].price).toBeDefined();
      expect(new Set(offers.map((o) => o.id)).size).toBe(3);
    }
    runController.startNewRun(77);
    runController.takeBlessing(0);
    expect(runController.getState().blessing).toBeUndefined();
    expect(runController.getState().blessings).toHaveLength(1);
  });

  it("each blessing gives what it says, and costs what it says", () => {
    bless("treasure");
    expect(runController.getState().gold).toBe(STARTING_GOLD + TREASURE_GOLD);
    expect(runController.getState().shopSlots).toBe(2);

    runController.startNewRun(77);
    bless("crown");
    const first = runController.getState().nodes.find((n) => n.type === "match")!;
    expect(runController.matchTargetFor(first)).toBe(first.matchTarget! + CROWN_TARGET);

    runController.startNewRun(77);
    bless("projects");
    const o: MatchOptions = {};
    runController.applyBlessings(o);
    expect(o.projectMultiplier).toBe(2);
    expect(o.noSun).toBe(true);

    runController.startNewRun(77);
    bless("wave");
    const w: MatchOptions = {};
    runController.applyBlessings(w);
    expect(w.headStart?.[0]).toBe(10);

    runController.startNewRun(77);
    bless("school");
    const got = runController.getState().jokerIds.map((id) => getJokerDef(id)!);
    expect(got.length).toBeGreaterThanOrEqual(2);
    expect(got.every((d) => d.rarity === "common")).toBe(true);
    expect(got.every((d) => d.tags.some((t) => got[0].tags.includes(t)))).toBe(true);
    expect(runController.takeMatchPenalty()).toBe(20);

    runController.startNewRun(77);
    bless("catch");
    const node = runController.getAvailableNode()!;
    runController.enterNode(node.id);
    const { goldEarned } = runController.resolveMatchNode(true);
    expect(goldEarned).toBe(Math.round(node.reward * 1.5));
    expect(runController.getState().pendingRewards!.items).toHaveLength(2);
  });

  it("بحر المشاريع's price: your team can't buy sun or call أشكل", () => {
    const r = new Round(0, mulberry32(3), { noSunFor: 0 });
    for (let i = 0; i < 8 && r.phase === "bidding"; i++) {
      const calls = r.legalBids();
      const seat = r.bidding.turnSeat;
      if (teamOf(seat) === 0) expect(calls.some((c) => c.call === "sun" || c.call === "ashkal")).toBe(false);
      else expect(calls.some((c) => c.call === "sun")).toBe(true);
      r.bid({ seat, call: "pass" });
    }
  });

  /** Walks to the first ديوانية and swaps in the event under test. */
  const atDiwaniya = (eventId: string) => {
    runController.addGold(60);
    const s = runController.getState();
    const target = s.nodes.find((n) => n.type === "diwaniya")!;
    const path = pathTo(s.nodes, target.id)!;
    for (const node of path.slice(0, -1)) {
      runController.enterNode(node.id);
      if (node.type === "shop") runController.leaveShopNode();
      else if (node.type === "diwaniya") runController.chooseEventOption(node.event === "stall" ? 2 : 1);
      else {
        runController.resolveMatchNode(true);
        runController.skipReward();
      }
    }
    (target as { event?: string }).event = eventId;
    runController.enterNode(target.id);
  };

  it("الديوانية: the choices do what they say, and leave the node cleared", () => {
    atDiwaniya("guest");
    const gold = runController.getState().gold;
    runController.chooseEventOption(0);
    expect(runController.getState().gold).toBe(gold - 15);
    expect(runController.getState().shields).toBe(1);
    expect(runController.getState().cleared[runController.getState().currentIndex]).toBe(true);

    runController.startNewRun(77);
    atDiwaniya("cursed");
    runController.chooseEventOption(0);
    expect(getJokerDef(runController.getState().jokerIds.at(-1)!)!.rarity).toBe("legendary");
    expect(runController.takeMatchPenalty()).toBe(20);
    expect(runController.takeMatchPenalty()).toBe(0);
  });

  it("الديوانية: a choice you can't afford is blocked", () => {
    atDiwaniya("stall");
    expect(runController.whyNotEventOption(1)).toBe("ما عندك جوكر");
    expect(() => runController.chooseEventOption(1)).toThrow();
  });

  it("every event has at least one choice that's always open", () => {
    for (const e of EVENTS) expect(e.options.some((o) => !o.blocked)).toBe(true);
  });
});
