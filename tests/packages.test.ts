import { describe, expect, it } from "vitest";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { buildBeliefs } from "../src/ai/beliefs";
import { decideDouble } from "../src/ai/doubling-ai";
import { GameController, HUMAN_SEAT, actionTarget, type MatchOptions } from "../src/game/GameController";
import { cardId, rankStrength } from "../src/engine/cards";
import { findProjects } from "../src/engine/projects";
import { Round } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import { teamOf, type Card, type Seat, type Trick } from "../src/engine/types";
import { JOKER_CATALOG, matchOptionsFromJokers } from "../src/roguelike/jokers";

/** Answers the human's bid / دبل / card with the AI's choice (a pending joker action is skipped). */
function answerHuman(c: GameController): void {
  const round = c.getRound();
  if (c.getPendingAction() && round.phase === "playing") return c.skipPlayerAction();
  if (round.phase === "bidding") c.submitPlayerBid(decideBid(HUMAN_SEAT, round.hands[HUMAN_SEAT], round.bidding));
  else if (round.phase === "doubling")
    c.submitPlayerDouble(decideDouble(HUMAN_SEAT, round.hands[HUMAN_SEAT], round.doubling!, round.bidding.result!.trumpSuit));
  else
    c.submitPlayerCard(
      decideCard(round.hands[HUMAN_SEAT], round.currentTrick!, round.bidding.result!.mode, round.bidding.result!.trumpSuit, HUMAN_SEAT, {
        tricks: round.tricks,
        closed: round.closed,
      }),
    );
}

function autoplay(c: GameController, until: () => boolean, maxSteps = 4000, onHuman?: () => boolean): void {
  for (let i = 0; i < maxSteps && !until(); i++) {
    const status = c.step();
    if (status === "match-complete") return;
    if (status !== "waiting-human") continue;
    if (onHuman?.()) continue;
    answerHuman(c);
  }
}

/** Plays hands of a long match until `hands` hand:complete events, returning each. */
function playHands(options: MatchOptions, seed: number, hands: number, onHuman?: (c: GameController) => boolean) {
  const c = new GameController(mulberry32(seed), { matchTarget: 9999, ...options });
  const done: Array<{ bonuses: Array<{ label: string; points: number }>; gained: Record<0 | 1, number> }> = [];
  c.on("hand:complete", (e) => done.push({ bonuses: e.bonuses, gained: e.gained }));
  c.startMatch();
  autoplay(c, () => done.length >= hands, 20000, onHuman && (() => onHuman(c)));
  return { c, done };
}

const deckIntact = (r: Round) => {
  const all = [...([0, 1, 2, 3] as Seat[]).flatMap((s) => r.initial.hands[s]), ...r.initial.stock].map(cardId);
  return all.length === 32 && new Set(all).size === 32;
};

describe("Supply jokers work from the shared deck", () => {
  it("الحظ الواطي deals you 7s/8s in your first five, next to a guaranteed Jack, without inventing cards", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = new Round(0, mulberry32(seed), { guaranteeJackFor: 0, guaranteedJacks: 1, guaranteedLow: 2 });
      const five = r.initial.hands[0];
      expect(five.filter((c) => c.rank === "7" || c.rank === "8").length).toBeGreaterThanOrEqual(2);
      expect(five.some((c) => c.rank === "J")).toBe(true);
      expect(deckIntact(r)).toBe(true);
    }
  });

  it("المرتّب finishes a سرا in your first five far more often, and a خمسين at level 2", () => {
    const hasRun = (five: Card[], n: number) =>
      findProjects(five, "sun", 0).some((p) => p.cards.length >= n && p.cards.every((c) => c.suit === p.cards[0].suit));
    let plain = 0, sira = 0, khamsin = 0, khamsinPlain = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const base = new Round(0, mulberry32(seed));
      const l1 = new Round(0, mulberry32(seed), { guaranteeJackFor: 0, completeRunTo: 3 });
      const l2 = new Round(0, mulberry32(seed), { guaranteeJackFor: 0, completeRunTo: 4 });
      if (hasRun(base.initial.hands[0], 3)) plain++;
      if (hasRun(l1.initial.hands[0], 3)) sira++;
      if (hasRun(base.initial.hands[0], 4)) khamsinPlain++;
      if (hasRun(l2.initial.hands[0], 4)) khamsin++;
      expect(deckIntact(l1) && deckIntact(l2)).toBe(true);
    }
    expect(sira).toBeGreaterThan(plain * 2);
    expect(khamsin).toBeGreaterThan(khamsinPlain);
  });
});

describe("Forge jokers", () => {
  it("actionTarget: المنزّل makes an 8 of the suit, الصبّاغ a spade of the rank, never a wasted pick", () => {
    const hand: Card[] = [{ suit: "H", rank: "A" }, { suit: "S", rank: "K" }, { suit: "D", rank: "8" }, { suit: "C", rank: "K" }];
    expect(actionTarget({ kind: "lower" }, hand[0], hand)).toEqual({ suit: "H", rank: "8" });
    expect(actionTarget({ kind: "lower" }, hand[2], hand)).toBeUndefined(); // already an 8
    expect(actionTarget({ kind: "dye" }, hand[0], hand)).toEqual({ suit: "S", rank: "A" });
    expect(actionTarget({ kind: "dye" }, hand[1], hand)).toBeUndefined(); // already a spade
    expect(actionTarget({ kind: "dye" }, hand[3], hand)).toBeUndefined(); // the K♠ is already in hand
  });

  it("after the buy you pick cards to lower, dye and send to your partner — and may skip any", () => {
    let checked = 0;
    for (let seed = 1; seed <= 60 && checked < 4; seed++) {
      const c = new GameController(mulberry32(seed), { matchTarget: 999, lowForge: 1, dyeForge: 1, partnerSwap: true });
      const changes: string[] = [];
      c.on("hand:changed", (e) => changes.push(e.kind === "transform" ? `${cardId(e.from)}>${cardId(e.to)}` : `swap:${e.kind === "swap" ? e.otherSeat : ""}`));
      c.startMatch();
      autoplay(c, () => c.getRound().phase === "playing" && !!c.getPendingAction(), 200);
      const r = c.getRound();
      if (c.getPendingAction()?.kind !== "lower") continue;
      const hand = r.hands[HUMAN_SEAT];
      const victim = hand.find((x) => x.rank !== "8" && !hand.some((y) => y.suit === x.suit && y.rank === "8"))!;
      c.submitPlayerAction(victim);
      expect(hand.some((x) => x.suit === victim.suit && x.rank === "8")).toBe(true);
      expect(c.getPendingAction()).toEqual({ kind: "dye" });
      c.skipPlayerAction();
      expect(c.getPendingAction()).toEqual({ kind: "partner" });
      const give = hand[0];
      const partnerBest = r.hands[2].filter((x) => x.suit === give.suit);
      c.submitPlayerAction(give);
      if (partnerBest.length) {
        const mode = r.bidding.result!.mode, trump = r.bidding.result!.trumpSuit;
        const best = partnerBest.reduce((a, b) => (rankStrength(b, mode, trump) > rankStrength(a, mode, trump) ? b : a));
        expect(hand.some((x) => cardId(x) === cardId(best))).toBe(true);
      }
      expect(r.hands[2].some((x) => cardId(x) === cardId(give))).toBe(true);
      expect(c.getPendingAction()).toBeUndefined();
      expect(changes).toEqual([`${cardId(victim)}>${victim.suit}8`, "swap:2"]);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("Reward jokers", () => {
  it("ثأر الصغار pays per trick your team takes with a 7 or 8, and fires on the trick", () => {
    const c = new GameController(mulberry32(5), { matchTarget: 9999, lowTrickBonus: 3, trashBeatsAce: true });
    let lows = 0, fired = 0;
    const seen: Array<{ lows: number; bonus: number }> = [];
    c.on("trick:complete", (e) => {
      const card = e.trick.cards[e.winner]!;
      if (teamOf(e.winner) === 0 && (card.rank === "7" || card.rank === "8")) lows++;
    });
    c.on("joker:fired", (e) => e.label === "ثأر الصغار" && fired++);
    c.on("hand:complete", (e) => {
      seen.push({ lows, bonus: e.bonuses.find((b) => b.label === "ثأر الصغار")?.points ?? 0 });
      lows = 0;
    });
    c.startMatch();
    autoplay(c, () => seen.length >= 8, 20000);
    for (const h of seen) expect(h.bonus).toBe(h.lows * 3);
    expect(fired).toBe(seen.reduce((n, h) => n + h.lows, 0));
    expect(fired).toBeGreaterThan(0);
  });

  it("الزحف pays from the third trick in a row: 1, 1, 2, 2… at level 1", () => {
    const c = new GameController(mulberry32(8), { matchTarget: 9999, streakBonus: 1 });
    let streak = 0, expected = 0;
    const seen: Array<{ expected: number; bonus: number }> = [];
    c.on("trick:complete", (e) => {
      if (teamOf(e.winner) === 0) expected += Math.floor((++streak - 1) / 2);
      else streak = 0;
    });
    c.on("hand:complete", (e) => {
      seen.push({ expected, bonus: e.bonuses.find((b) => b.label === "الزحف")?.points ?? 0 });
      streak = 0;
      expected = 0;
    });
    c.startMatch();
    autoplay(c, () => seen.length >= 6, 20000);
    for (const h of seen) expect(h.bonus).toBe(h.expected);
  });

  it("الآكه الذهبية pays gold when your آكه takes its trick and costs points when it's cut", () => {
    let gold = 0, cuts = 0;
    for (let seed = 1; seed <= 30 && (gold === 0 || cuts === 0); seed++) {
      const c = new GameController(mulberry32(seed), { matchTarget: 9999, akkaGamble: { gold: 2, penalty: 3 } });
      c.on("gold:earned", (e) => e.reason === "الآكه الذهبية" && (expect(e.amount).toBe(2), gold++));
      c.on("joker:fired", (e) => e.label === "الآكه الذهبية" && (e.points ?? 0) < 0 && cuts++);
      c.startMatch();
      autoplay(c, () => false, 3000);
    }
    expect(gold).toBeGreaterThan(0);
  });
});

describe("السوا", () => {
  it("a right سوا pays its bonus; a wrong one gives the whole hand to the other side", () => {
    let right = 0, wrong = 0;
    for (let seed = 1; seed <= 40 && (right < 3 || wrong < 3); seed++) {
      const c = new GameController(mulberry32(seed), { matchTarget: 9999, sawa: { bonus: 6 } });
      let claim: boolean | undefined;
      const outcomes: Array<{ claim?: boolean; bonus?: number; ours: number; total: number; sheet?: { outcome: string; judgedTeam: number; result: Record<0 | 1, number> } }> = [];
      c.on("hand:complete", (e) => {
        outcomes.push({
          claim,
          bonus: e.bonuses.find((b) => b.label === "السوا" || b.label === "سوا غلط")?.points,
          ours: e.gained[0],
          total: e.result.gamePoints[0] + e.result.gamePoints[1],
          sheet: e.result.sheet,
        });
        claim = undefined;
      });
      c.startMatch();
      autoplay(c, () => outcomes.length >= 3, 6000, () => {
        // Claim once there are at most four cards left, so both outcomes come up.
        if (!c.canClaimSawa() || c.getRound().hands[HUMAN_SEAT].length > 4) return false;
        claim = c.claimSawa();
        return true;
      });
      for (const o of outcomes) {
        if (o.claim === undefined) {
          expect(o.bonus).toBeUndefined();
        } else if (o.claim) {
          right++;
          expect(o.bonus).toBe(6);
        } else {
          wrong++;
          // Nothing left for you, not even your بلوت: they take the whole hand, and the score
          // sheet reads it as a buy of yours that failed.
          expect(o.ours).toBe(0);
          expect(o.sheet?.outcome).toBe("lost");
          expect(o.sheet?.judgedTeam).toBe(0);
          expect(o.sheet?.result[0]).toBe(o.ours);
        }
      }
    }
    expect(right).toBeGreaterThan(0);
    expect(wrong).toBeGreaterThan(0);
  });

  it("after a right سوا every remaining trick goes to your team", () => {
    let checked = 0;
    for (let seed = 1; seed <= 200 && checked < 3; seed++) {
      const c = new GameController(mulberry32(seed), { matchTarget: 9999, sawa: { bonus: 6 } });
      let claimed = false, lost = false, handDone = false;
      c.on("trick:complete", (e) => claimed && teamOf(e.winner) !== 0 && (lost = true));
      c.on("hand:complete", () => claimed && (handDone = true));
      c.startMatch();
      autoplay(c, () => handDone, 3000, () => {
        if (claimed || !c.canClaimSawa()) return false;
        // Only claim when it's right, to check the guarantee.
        const probe = c.getRound().hands[HUMAN_SEAT].length;
        if (probe > 3) return false;
        const saved = c.claimSawa();
        if (!saved) {
          handDone = true; // a wrong claim ends this probe
          return true;
        }
        claimed = true;
        return true;
      });
      if (claimed) {
        expect(lost).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("Defence and doubling jokers", () => {
  it("الصبر pays gold on every hand the other side bought and you out-scored them", () => {
    const c = new GameController(mulberry32(3), { matchTarget: 9999, defenseGold: 3 });
    let paid = 0, expected = 0;
    c.on("gold:earned", (e) => e.reason === "الصبر" && (paid += e.amount));
    c.on("hand:complete", (e) => {
      if (e.result.declarerTeam === 1 && e.gained[0] > e.gained[1]) expected += 3;
    });
    c.startMatch();
    autoplay(c, () => false, 6000);
    expect(paid).toBe(expected);
  });

  it("الجريء opens the دبل round on the other side's sun at any score", () => {
    let opened = 0, closed = 0;
    for (let seed = 1; seed <= 150; seed++) {
      for (const free of [true, false]) {
        const c = new GameController(mulberry32(seed), { matchTarget: 9999, freeSunDouble: free });
        c.startMatch();
        autoplay(c, () => c.getRound().phase !== "bidding", 200);
        const res = c.getRound().bidding.result;
        if (!res || res.mode !== "sun" || res.declarerTeam !== 1) continue;
        if (free) {
          expect(c.getRound().phase).toBe("doubling");
          opened++;
        } else if (c.getRound().phase !== "doubling") closed++;
      }
    }
    expect(opened).toBeGreaterThan(0);
    expect(closed).toBeGreaterThan(0); // without it, 0–0 is below the 100 rule
  });

  it("الوجه البارد: once you raise, the other side never raises back; رأس المال pays level × gold", () => {
    let raises = 0;
    for (let seed = 1; seed <= 300 && raises < 5; seed++) {
      const c = new GameController(mulberry32(seed), { matchTarget: 9999, pokerFace: true, doubleGold: 4 });
      let weRaised = false;
      c.on("double:call", (e) => {
        if (teamOf(e.bid.seat) === 0 && e.bid.call !== "pass") weRaised = true;
        else if (weRaised && e.bid.call !== "pass") throw new Error("the opponents raised back");
      });
      c.on("gold:earned", (e) => {
        if (e.reason !== "رأس المال") return;
        expect(e.amount % 4).toBe(0);
      });
      c.startMatch();
      // Always raise when the human may.
      autoplay(c, () => weRaised && c.getRound().phase === "playing", 400, () => {
        const r = c.getRound();
        if (r.phase !== "doubling") return false;
        const call = r.legalDoubleCalls().find((x) => x.call !== "pass");
        if (!call) return false;
        c.submitPlayerDouble({ seat: HUMAN_SEAT, call: call.call, closed: call.closed });
        return true;
      });
      if (weRaised) raises++;
    }
    expect(raises).toBeGreaterThan(0);
  });
});

describe("التهريب", () => {
  it("your partner comes to your التهريب once it has no winners of its own", () => {
    // Seat 0 threw 7♠ on a ♥ lead: it wants ♣. Seat 2 has no sure winner, so it leads its biggest ♣.
    const earlier: Trick = { leader: 1, order: [1, 2, 3, 0], cards: { 1: { suit: "H", rank: "A" }, 2: { suit: "H", rank: "8" }, 3: { suit: "H", rank: "9" }, 0: { suit: "S", rank: "7" } }, winner: 1 };
    const hand: Card[] = [{ suit: "S", rank: "8" }, { suit: "D", rank: "Q" }, { suit: "C", rank: "9" }, { suit: "C", rank: "K" }];
    const lead = decideCard(hand, { leader: 2, order: [], cards: {} }, "sun", undefined, 2, { tricks: [earlier] });
    expect(lead).toEqual({ suit: "C", rank: "K" });
    // Holding a sure winner (A♦), it cashes that first.
    const strong = decideCard([...hand, { suit: "D", rank: "A" }], { leader: 2, order: [], cards: {} }, "sun", undefined, 2, { tricks: [earlier] });
    expect(strong).toEqual({ suit: "D", rank: "A" });
  });

  it("المترجم reads every seat's التهريب for you, the same way the AI does", () => {
    let seen = 0;
    for (let seed = 1; seed <= 10 && seen === 0; seed++) {
      const c = new GameController(mulberry32(seed), { matchTarget: 9999, translator: true });
      c.startMatch();
      autoplay(c, () => {
        const round = c.getRound();
        const signals = c.getSignals();
        if (!signals || round.phase !== "playing") return false;
        const res = round.bidding.result!;
        const b = buildBeliefs(round.tricks, round.currentTrick, res.mode, res.trumpSuit);
        for (const seat of [0, 1, 2, 3] as Seat[]) {
          expect(signals[seat].wants).toEqual(b.wants[seat]);
          expect(signals[seat].barqiya).toEqual(b.barqiya[seat]);
          if (signals[seat].wants.length) seen++;
        }
        return seen > 0;
      });
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("الإشارة الذهبية multiplies a hand where a signal paid off", () => {
    let hits = 0;
    for (let seed = 1; seed <= 20 && hits === 0; seed++) {
      const { done } = playHands({ translator: true, signalMultiplier: 1.5 }, seed, 6);
      for (const h of done) {
        const b = h.bonuses.find((x) => x.label === "الإشارة الذهبية");
        if (b) {
          expect(b.points).toBeGreaterThan(0);
          hits++;
        }
      }
    }
    expect(hits).toBeGreaterThan(0);
  });
});

describe("the new families", () => {
  it("each package's second tier boosts it and its third tier hands over the rule-breaker", () => {
    expect(matchOptionsFromJokers(["low-luck", "low-revenge"]).lowTrickBonus).toBe(2 + 1);
    expect(matchOptionsFromJokers(["low-luck", "low-revenge", "lowerer"]).trashBeatsAce).toBe(true);
    expect(matchOptionsFromJokers(["translator", "messenger"]).signalTrickBonus).toBe(2);
    expect(matchOptionsFromJokers(["golden-signal", "messenger", "partner-eyes"]).translator).toBe(true);
    expect(matchOptionsFromJokers(["sawa", "crawl"]).kabootBonus).toEqual({ points: 10, gold: 0 });
    expect(matchOptionsFromJokers(["sawa", "crawl", "kaboot-king"]).kabootWinsMatch).toBe(true);
    expect(matchOptionsFromJokers(["capital", "poker-face"]).doubleWinPoints).toBe(5);
    expect(matchOptionsFromJokers(["capital", "poker-face", "qahwaji"]).freeSunDouble).toBe(true);
  });

  it("النسخة copying المرتّب doesn't turn a سرا into a nonsense run length", () => {
    expect(matchOptionsFromJokers(["arranger", "copycat"], { arranger: 2 }).completeRunTo).toBe(4);
  });

  it("every family package has at least three jokers", () => {
    for (const tag of ["صغار", "تهريب", "كبوت", "دبل"] as const) {
      expect(JOKER_CATALOG.filter((j) => j.tags.includes(tag)).length, tag).toBeGreaterThanOrEqual(3);
    }
  });
});
