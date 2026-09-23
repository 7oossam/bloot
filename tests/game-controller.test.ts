import { describe, expect, it } from "vitest";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { decideDouble } from "../src/ai/doubling-ai";
import { GameController, HUMAN_SEAT, MATCH_TARGET, type MatchOptions } from "../src/game/GameController";
import { rankStrength } from "../src/engine/cards";
import { teamOf, type Bid } from "../src/engine/types";
import { mulberry32 } from "../src/engine/rng";

/** Answers whatever the human is being asked — a bid, a دبل, or a card — with the AI's choice. */
function answerHuman(c: GameController): void {
  const round = c.getRound();
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

/** Drives the human seat with the same AI policy, purely to exercise the full loop deterministically. */
function playMatchToCompletion(controller: GameController, maxSteps = 5000): void {
  for (let i = 0; i < maxSteps; i++) {
    const status = controller.step();
    if (status === "match-complete") return;
    if (status === "waiting-human") {
      answerHuman(controller);
    }
  }
  throw new Error("Match did not complete within the step budget");
}

describe("GameController", () => {
  it("plays a full match end to end and reaches the target score", () => {
    const events: string[] = [];
    const controller = new GameController(mulberry32(7));
    for (const evt of [
      "hand:dealt",
      "bidding:resolved",
      "trick:complete",
      "hand:complete",
      "match:complete",
    ] as const) {
      controller.on(evt, () => events.push(evt));
    }

    controller.startMatch();
    playMatchToCompletion(controller);

    expect(events).toContain("match:complete");
    const score = controller.getMatchScore();
    expect(score[0] >= MATCH_TARGET || score[1] >= MATCH_TARGET).toBe(true);
    expect(score[0]).not.toBe(score[1]);
  });

  it("emits trick:complete exactly 8 times per completed hand", () => {
    const trickCounts: number[] = [];
    let tricksThisHand = 0;
    const controller = new GameController(mulberry32(99));
    controller.on("trick:complete", () => {
      tricksThisHand++;
    });
    controller.on("hand:complete", () => {
      trickCounts.push(tricksThisHand);
      tricksThisHand = 0;
    });

    controller.startMatch();
    playMatchToCompletion(controller);

    expect(trickCounts.length).toBeGreaterThan(0);
    for (const count of trickCounts) expect(count).toBe(8);
  });
});

describe("GameController match length", () => {
  it("a match to 41 lasts several hands, not one", () => {
    // Regression: hands used to add raw card points (162 a hokum hand) to a target of 41,
    // so every match ended on its first hand.
    for (const seed of [3, 11, 29, 57]) {
      const controller = new GameController(mulberry32(seed), { matchTarget: 41 });
      let hands = 0;
      controller.on("hand:complete", () => hands++);
      controller.startMatch();
      playMatchToCompletion(controller);
      expect(hands).toBeGreaterThanOrEqual(2);
      const s = controller.getMatchScore();
      // The biggest single hand is a sun كبوت (44) plus projects — nowhere near raw points.
      expect(Math.max(s[0], s[1])).toBeLessThan(41 + 44 + 60);
    }
  });
});

describe("joker effects in a match", () => {
  const playHands = (opts: MatchOptions, seed: number) => {
    const c = new GameController(mulberry32(seed), { matchTarget: 999, ...opts });
    const hands: Array<{ gained: Record<0 | 1, number>; base: Record<0 | 1, number>; mode: string; declarerTeam: number; scored: Record<0 | 1, number>; bonuses: string[]; kaboot: boolean }> = [];
    c.on("hand:complete", (e) => hands.push({
      gained: { ...e.gained }, base: { ...e.result.gamePoints }, mode: e.result.mode,
      declarerTeam: e.result.declarerTeam, scored: { ...e.result.scoredPoints },
      bonuses: e.bonuses.map((b) => b.label), kaboot: e.kaboot,
    }));
    let gold = 0;
    c.on("gold:earned", (e) => { gold += e.amount; });
    c.startMatch();
    for (let i = 0; i < 3000 && hands.length < 12; i++) {
      const status = c.step();
      if (status === "waiting-human") {
        answerHuman(c);
      }
    }
    return { hands, gold, controller: c };
  };

  it("الصن الملكي raises our sun hands by half and nothing else", () => {
    let boosted = 0;
    for (const seed of [5, 6, 7, 8, 9]) {
      for (const h of playHands({ sunMultiplier: 1.5 }, seed).hands) {
        if (h.mode === "sun" && h.declarerTeam === 0 && h.base[0] > 0) {
          expect(h.gained[0]).toBe(h.base[0] + Math.round(h.base[0] * 0.5));
          expect(h.gained[1]).toBe(h.base[1]);
          boosted++;
        } else {
          expect(h.gained).toEqual(h.base);
        }
      }
    }
    expect(boosted).toBeGreaterThan(0);
  });

  it("سيد الحكم pays +5 only when we bought hokum and made it", () => {
    const { hands } = playHands({ hokumMadeBonus: 5 }, 8);
    for (const h of hands) {
      const made = h.mode === "hokum" && h.declarerTeam === 0 && h.scored[0] > h.scored[1];
      expect(h.gained[0] - h.base[0]).toBe(made ? 5 : 0);
      expect(h.gained[1]).toBe(h.base[1]);
    }
  });

  it("اللمسة الذهبية pays gold for our tricks with an Ace", () => {
    expect(playHands({ goldPerAceTrick: 3 }, 12).gold).toBeGreaterThan(0);
    expect(playHands({}, 12).gold).toBe(0);
  });

  it("الولد المضمون always deals you a Jack (two at level 2) in your first five", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const wanted = seed % 2 === 0 ? 2 : 1;
      const c = new GameController(mulberry32(seed), { guaranteedJacks: wanted });
      c.startMatch();
      expect(c.getRound().hands[HUMAN_SEAT].filter((card) => card.rank === "J").length, `seed ${seed}`).toBeGreaterThanOrEqual(wanted);
      // Still a proper deck: 32 distinct cards.
      const r = c.getRound();
      const all = [...r.initial.hands[0], ...r.initial.hands[1], ...r.initial.hands[2], ...r.initial.hands[3], ...r.initial.stock];
      expect(new Set(all.map((x) => x.suit + x.rank)).size).toBe(32);
    }
  });

  it("ملك الكبوت ends the match as a win when we take all eight tricks", () => {
    // Search seeds for a kaboot by our team, then check the match ended there.
    for (let seed = 1; seed <= 400; seed++) {
      const c = new GameController(mulberry32(seed), { matchTarget: 999, kabootWinsMatch: true });
      let kaboot = false; let winner: number | undefined;
      c.on("hand:complete", (e) => { if (e.kaboot) kaboot = true; });
      c.on("match:complete", (e) => { winner = e.winner; });
      c.startMatch();
      for (let i = 0; i < 400; i++) {
        const status = c.step();
        if (status === "match-complete") break;
        if (status === "waiting-human") {
          answerHuman(c);
        }
        if (kaboot) break;
      }
      if (kaboot) {
        expect(winner).toBe(0);
        return;
      }
    }
    throw new Error("no kaboot found in 400 seeds");
  });
});

/** Plays with the AI deciding for the human too, answering joker prompts with the first allowed card. */
function autoplay(c: GameController, until: (c: GameController) => boolean, maxSteps = 4000): void {
  for (let i = 0; i < maxSteps && !until(c); i++) {
    const status = c.step();
    if (status === "match-complete") return;
    if (status !== "waiting-human") continue;
    const round = c.getRound();
    const action = c.getPendingAction();
    if (action && round.phase === "playing") {
      const hand = round.hands[HUMAN_SEAT];
      const pick = action.kind === "transform" ? hand.find((x) => !(x.suit === action.to.suit && x.rank === action.to.rank))! : hand[0];
      c.submitPlayerAction(pick);
    } else {
      answerHuman(c);
    }
  }
}

describe("combo jokers", () => {
  it("الولد المزوّر: buying hokum lets you turn a card into the trump Jack — even a second one", () => {
    let checked = 0;
    for (let seed = 1; seed <= 300 && checked < 5; seed++) {
      const c = new GameController(mulberry32(seed), { matchTarget: 999, forgedJack: { nine: true, partnerToo: false } });
      const changes: string[] = [];
      c.on("hand:changed", (e) => e.kind === "transform" && changes.push(`${e.to.suit}${e.to.rank}`));
      c.startMatch();
      // Force the human to buy hokum whenever it's offered.
      for (let i = 0; i < 60 && ["bidding", "doubling"].includes(c.getRound().phase); i++) {
        const status = c.step();
        if (status === "waiting-human") {
          const r = c.getRound();
          if (r.phase === "doubling") {
            c.submitPlayerDouble({ seat: HUMAN_SEAT, call: "pass" });
            continue;
          }
          const hokum = r.legalBids().find((x) => x.call === "hokum");
          c.submitPlayerBid({ seat: HUMAN_SEAT, ...(hokum ?? { call: "pass" }) } as Bid);
        }
      }
      const r = c.getRound();
      // A challenger (or أشكل) can turn it into sun — then the joker rightly doesn't fire.
      if (r.phase !== "playing" || r.bidding.result!.declarer !== HUMAN_SEAT || r.bidding.result!.mode !== "hokum") continue;
      const trump = r.bidding.result!.trumpSuit!;
      const jacksBefore = r.hands[HUMAN_SEAT].filter((x) => x.suit === trump && x.rank === "J").length;
      expect(c.step()).toBe("waiting-human");
      expect(c.getPendingAction()).toEqual({ kind: "transform", to: { suit: trump, rank: "J" } });
      const victim = r.hands[HUMAN_SEAT].find((x) => !(x.suit === trump && x.rank === "J"))!;
      c.submitPlayerAction(victim);
      expect(r.hands[HUMAN_SEAT].filter((x) => x.suit === trump && x.rank === "J").length).toBe(jacksBefore + 1);
      // Level 2: then the trump 9.
      expect(c.getPendingAction()).toEqual({ kind: "transform", to: { suit: trump, rank: "9" } });
      c.submitPlayerAction(r.hands[HUMAN_SEAT].find((x) => !(x.suit === trump && (x.rank === "J" || x.rank === "9")))!);
      expect(changes).toEqual([`${trump}J`, `${trump}9`]);
      expect(c.getPendingAction()).toBeUndefined();
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("صيد الولد: winning with the trump Jack trades a card with an opponent (a trump at level 2)", () => {
    let swaps = 0, trumpDraws = 0, trumpAvailable = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const c = new GameController(mulberry32(seed), {
        matchTarget: 999,
        forgedJack: { nine: false, partnerToo: false },
        jackHunt: { preferTrump: true, nineToo: false, partnerToo: false },
      });
      c.on("hand:changed", (e) => {
        if (e.kind !== "swap") return;
        swaps++;
        const trump = c.getRound().bidding.result!.trumpSuit!;
        // Their hand now = before − got + gave, so before the swap they held `got` plus
        // everything they hold now except (one copy of) what we gave them.
        const now = [...c.getRound().hands[e.otherSeat]];
        now.splice(now.findIndex((x) => x.suit === e.gave.suit && x.rank === e.gave.rank), 1);
        const hadTrump = e.got.suit === trump || now.some((x) => x.suit === trump);
        if (hadTrump) {
          trumpAvailable++;
          if (e.got.suit === trump) trumpDraws++;
        }
      });
      c.startMatch();
      // Play each seed until it produces its own swap (a shared counter stopped every later seed at once).
      const before = swaps;
      autoplay(c, () => swaps > before, 1500);
      if (swaps >= 6) break;
    }
    expect(swaps).toBeGreaterThan(0);
    expect(trumpAvailable).toBeGreaterThan(0);
    expect(trumpDraws).toBe(trumpAvailable);
  });

  it("الحرقة: winning with the trump Jack burns an opponent's best trump into a 7", () => {
    let burns = 0;
    for (let seed = 1; seed <= 200 && burns === 0; seed++) {
      const c = new GameController(mulberry32(seed), {
        matchTarget: 999,
        forgedJack: { nine: false, partnerToo: false },
        burn: { bothOpponents: true, partnerToo: true },
      });
      c.on("hand:changed", (e) => {
        if (e.kind !== "burn") return;
        const trump = c.getRound().bidding.result!.trumpSuit!;
        expect(e.from.suit).toBe(trump);
        expect(e.to.rank).toBe("7");
        expect(e.to.suit).not.toBe(trump);
        // It was their strongest trump: nothing left in their hand outranks it.
        const left = c.getRound().hands[e.seat].filter((x) => x.suit === trump);
        for (const x of left) expect(rankStrength(x, "hokum", trump)).toBeLessThanOrEqual(rankStrength(e.from, "hokum", trump));
        burns++;
      });
      c.startMatch();
      autoplay(c, () => burns > 0, 800);
    }
    expect(burns).toBeGreaterThan(0);
  });

  it("جامع الأولاد pays per trick your team takes with a Jack", () => {
    const c = new GameController(mulberry32(21), { matchTarget: 999, jackTrickBonus: 2 });
    const seen: Array<{ jacks: number; bonus: number }> = [];
    let jacks = 0;
    c.on("trick:complete", (e) => { if (teamOf(e.winner) === 0 && e.trick.cards[e.winner]!.rank === "J") jacks++; });
    c.on("hand:complete", (e) => {
      seen.push({ jacks, bonus: e.bonuses.find((b) => b.label === "أكلات الأولاد")?.points ?? 0 });
      jacks = 0;
    });
    c.startMatch();
    autoplay(c, () => seen.length >= 6);
    for (const h of seen) expect(h.bonus).toBe(h.jacks * 2);
    expect(seen.some((h) => h.jacks > 0)).toBe(true);
  });

  it("a locked hokum (حكم synergy) is never taken over as sun", () => {
    for (let seed = 1; seed <= 80; seed++) {
      const c = new GameController(mulberry32(seed), { matchTarget: 999, lockedHokum: true });
      c.on("bidding:turn", (e) => {
        if (e.challenge) expect(teamOf(e.challenge.seat)).toBe(1);
      });
      c.on("bidding:resolved", (e) => {
        const hokumBids = c.getRound().bidding.history.filter((b) => b.call === "hokum");
        if (hokumBids.length && teamOf(hokumBids[0].seat) === 0) expect(e.mode).toBe("hokum");
      });
      c.startMatch();
      autoplay(c, (x) => x.getRound().phase === "playing");
    }
  });
});

describe("the shop-rework jokers in play", () => {
  it("حارس الأرض pays for الأرض, الصبر مفتاح for lost hands, مهندس المشاريع doubles our projects", () => {
    const reasons: Record<string, number> = {};
    let projectBonus = 0, ourProjects = 0;
    const c = new GameController(mulberry32(21), {
      matchTarget: 999,
      groundGold: 4,
      lossGold: 3,
      projectMultiplier: 2,
    });
    c.on("gold:earned", (e) => (reasons[e.reason] = (reasons[e.reason] ?? 0) + e.amount));
    c.on("hand:complete", (e) => {
      const p = e.result.projectPoints?.[0] ?? 0;
      ourProjects += p;
      projectBonus += e.bonuses.find((b) => b.label === "مهندس المشاريع")?.points ?? 0;
    });
    c.startMatch();
    autoplay(c, () => false, 6000);
    expect(reasons["حارس الأرض"] ?? 0).toBeGreaterThan(0);
    expect((reasons["حارس الأرض"] ?? 0) % 4).toBe(0);
    expect(reasons["الصبر مفتاح"] ?? 0).toBeGreaterThan(0);
    expect(projectBonus).toBe(ourProjects); // ×2 = the same again on top
  });
});

describe("build-maker effects in play", () => {
  it("win bonuses pay only on hands we win; المقامر costs gold on lost hands; الصراف and القطّاع score", () => {
    const labels: Record<string, number> = {};
    const gold: Record<string, number> = {};
    let wonHands = 0, lostHands = 0, bonusHands = 0;
    const c = new GameController(mulberry32(33), {
      matchTarget: 999,
      winBonuses: [{ label: "الحصالة", points: 3 }],
      gamblerMultiplier: 1.5,
      lossGoldCost: 4,
      goldToPoints: { per: 10, cap: 4, startingGold: 45 },
      ruffBonus: 1,
    });
    c.on("gold:earned", (e) => (gold[e.reason] = (gold[e.reason] ?? 0) + e.amount));
    c.on("hand:complete", (e) => {
      const won = e.result.gamePoints[0] > e.result.gamePoints[1];
      if (won) wonHands++;
      if (e.gained[0] < e.gained[1]) lostHands++;
      if (e.bonuses.some((b) => b.label === "الحصالة")) bonusHands++;
      for (const b of e.bonuses) labels[b.label] = (labels[b.label] ?? 0) + b.points;
    });
    c.startMatch();
    autoplay(c, () => false, 6000);
    expect(bonusHands).toBe(wonHands);
    expect(gold["المقامر"]).toBe(-4 * lostHands);
    expect(labels["الصراف"]).toBeGreaterThan(0); // 45 gold at the start = 4 per hand
    expect(labels["القطّاع"] ?? 0).toBeGreaterThan(0);
    expect(labels["المقامر"]).toBeGreaterThan(0);
  });
});

describe("play-changing jokers in a match", () => {
  it("سيد الأرض: whoever of us takes الأرض takes the hand — the other side keeps only its بلوت", () => {
    let checked = 0;
    const c = new GameController(mulberry32(5), { matchTarget: 999, groundWins: true });
    c.on("hand:complete", (e) => {
      const last = c.getRound().tricks[7];
      if (teamOf(last.winner!) !== 0) return;
      checked++;
      expect(e.gained[1]).toBeLessThanOrEqual(2);
      expect(e.gained[0]).toBeGreaterThanOrEqual(e.result.gamePoints[0]);
    });
    c.startMatch();
    autoplay(c, () => checked >= 3, 6000);
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it("المخلّي pays per trick you could have taken from them and didn't", () => {
    let paid = 0;
    const c = new GameController(mulberry32(8), { matchTarget: 999, duckBonus: 3 });
    c.on("hand:complete", (e) => {
      const b = e.bonuses.find((x) => x.label === "المخلّي");
      if (b) {
        expect(b.points % 3).toBe(0);
        paid++;
      }
    });
    c.startMatch();
    // Play your seat as a ducker: always the weakest legal card.
    for (let i = 0; i < 8000 && paid < 2; i++) {
      const status = c.step();
      if (status !== "waiting-human") continue;
      const r = c.getRound();
      if (r.phase === "playing" && !c.getPendingAction()) {
        const legal = r.legalMovesFor(HUMAN_SEAT);
        const res = r.bidding.result!;
        c.submitPlayerCard(legal.reduce((a, b) => (rankStrength(b, res.mode, res.trumpSuit) < rankStrength(a, res.mode, res.trumpSuit) ? b : a)));
      } else answerHuman(c);
    }
    expect(paid).toBeGreaterThanOrEqual(2);
  });

  it("سارق السبيت trades your chosen card for an opponent's spade (their best at level 2)", () => {
    let swaps = 0;
    const c = new GameController(mulberry32(12), { matchTarget: 999, spadeThief: { best: true, twice: false } });
    c.on("hand:changed", (e) => {
      if (e.kind !== "swap") return;
      swaps++;
      if (e.got.suit === "S") {
        // Nothing they held beats what we took (the card we handed them aside).
        const theirs = c.getRound().hands[e.otherSeat].filter((x) => !(x.suit === e.gave.suit && x.rank === e.gave.rank));
        for (const x of theirs.filter((x) => x.suit === "S")) {
          expect(rankStrength(x, c.getRound().bidding.result!.mode, c.getRound().bidding.result!.trumpSuit)).toBeLessThanOrEqual(
            rankStrength(e.got, c.getRound().bidding.result!.mode, c.getRound().bidding.result!.trumpSuit),
          );
        }
      }
    });
    c.startMatch();
    autoplay(c, () => swaps >= 3, 6000);
    expect(swaps).toBeGreaterThanOrEqual(3);
  });

  it("صاحب الحلة: you lead the first trick of every hand", () => {
    let hands = 0;
    const c = new GameController(mulberry32(3), { matchTarget: 999, alwaysLead: true });
    c.on("bidding:resolved", () => {
      hands++;
      expect(c.getRound().currentTrick!.leader).toBe(HUMAN_SEAT);
    });
    c.startMatch();
    autoplay(c, () => hands >= 4, 6000);
    expect(hands).toBeGreaterThanOrEqual(4);
  });

  it("الحكم الأعزل pays only on a hokum you bought without the trump J and 9", () => {
    let paid = 0;
    for (let seed = 1; seed <= 60 && paid === 0; seed++) {
      const c = new GameController(mulberry32(seed), { matchTarget: 999, bareHokumMultiplier: 2 });
      c.on("hand:complete", (e) => {
        if (!e.bonuses.some((b) => b.label === "الحكم الأعزل")) return;
        paid++;
        expect(e.result.mode).toBe("hokum");
        expect(c.getRound().bidding.result!.declarer).toBe(HUMAN_SEAT);
      });
      c.startMatch();
      // Buy hokum whenever it's offered, strong hand or not.
      for (let i = 0; i < 3000 && paid === 0; i++) {
        const status = c.step();
        if (status === "match-complete") break;
        if (status !== "waiting-human") continue;
        const r = c.getRound();
        const hokum = r.phase === "bidding" ? r.legalBids().find((x) => x.call === "hokum") : undefined;
        if (hokum) c.submitPlayerBid({ seat: HUMAN_SEAT, ...hokum } as Bid);
        else if (r.phase === "playing" && c.getPendingAction()) c.submitPlayerAction(r.hands[HUMAN_SEAT][0]);
        else answerHuman(c);
      }
    }
    expect(paid).toBeGreaterThan(0);
  });
});
