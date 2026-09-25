import { beforeEach, describe, expect, it } from "vitest";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { decideDouble } from "../src/ai/doubling-ai";
import { mulberry32 } from "../src/engine/rng";
import { Round } from "../src/engine/round";
import { scoreHand } from "../src/engine/scoring";
import { resolveTrick } from "../src/engine/trick";
import { teamOf, type Card, type HandResult, type Seat, type Trick } from "../src/engine/types";
import { GameController, HUMAN_SEAT, type MatchOptions } from "../src/game/GameController";
import { EVENTS, getEvent } from "../src/roguelike/events";
import { getJokerDef } from "../src/roguelike/jokers";
import { generateMap } from "../src/roguelike/mapgen";
import { getOpponent } from "../src/roguelike/opponents";
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

  it("آكلين الإكك: the first Ace your team takes counts for nothing", () => {
    const plain = scoreHand(hand(), "sun", undefined, 0);
    const voided = scoreHand(hand(), "sun", undefined, 0, undefined, { voidFirstAce: 0 });
    expect(plain.rawPoints[0] - voided.rawPoints[0]).toBe(11);
    expect(voided.rawPoints[1]).toBe(plain.rawPoints[1]);
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
  it("every fight has an opponent of its tier, and every ديوانية a different event", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const map = generateMap(seed);
      for (const n of map.nodes) {
        if (n.type === "match" || n.type === "elite" || n.type === "boss") expect(getOpponent(n.opponent)?.tier).toBe(n.type);
      }
      const events = map.nodes.filter((n) => n.type === "diwaniya").map((n) => n.event);
      expect(events.length).toBe(2);
      expect(new Set(events).size).toBe(2);
      for (const e of events) expect(getEvent(e)).toBeDefined();
    }
  });

  beforeEach(() => runController.startNewRun(77));

  it("المعطّل picks your rarest joker", () => {
    runController.takeBlessing(3); // a legendary
    const legendary = runController.getState().jokerIds[0];
    expect(runController.strongestJoker()).toBe(legendary);
  });

  it("الحوت offers four gifts, and each gives what it says", () => {
    const offers = runController.getState().blessing!;
    expect(offers.map((o) => o.kind)).toEqual(["rare", "pair", "gold", "cursed"]);
    expect(getJokerDef(offers[0].items[0])!.rarity).toBe("rare");
    runController.takeBlessing(3);
    const s = runController.getState();
    expect(s.jokerIds).toEqual(offers[3].items);
    expect(s.lives).toBe(STARTING_LIVES - 1);
    expect(s.blessing).toBeUndefined();
    runController.startNewRun(77);
    runController.takeBlessing(2);
    expect(runController.getState().gold).toBe(STARTING_GOLD + BLESSING_GOLD);
  });

  /** Walks to the first ديوانية and swaps in the event under test. */
  const atDiwaniya = (eventId: string) => {
    runController.takeBlessing(2); // 65 gold
    const s = runController.getState();
    const i = s.nodes.findIndex((n) => n.type === "diwaniya");
    for (let k = 0; k < i; k++) {
      const node = runController.getAvailableNode()!;
      runController.enterNode(node.id);
      runController.resolveMatchNode(true);
      runController.skipReward();
    }
    (s.nodes[i] as { event?: string }).event = eventId;
    runController.enterNode(s.nodes[i].id);
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
