import { describe, expect, it } from "vitest";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { GameController, HUMAN_SEAT, MATCH_TARGET, type MatchOptions } from "../src/game/GameController";
import { mulberry32 } from "../src/engine/rng";

/** Drives the human seat with the same AI policy, purely to exercise the full loop deterministically. */
function playMatchToCompletion(controller: GameController, maxSteps = 5000): void {
  for (let i = 0; i < maxSteps; i++) {
    const status = controller.step();
    if (status === "match-complete") return;
    if (status === "waiting-human") {
      const round = controller.getRound();
      if (round.phase === "bidding") {
        const bid = decideBid(HUMAN_SEAT, round.hands[HUMAN_SEAT], round.bidding);
        controller.submitPlayerBid(bid);
      } else if (round.phase === "playing") {
        const card = decideCard(
          round.hands[HUMAN_SEAT],
          round.currentTrick!,
          round.bidding.result!.mode,
          round.bidding.result!.trumpSuit,
          HUMAN_SEAT,
        );
        controller.submitPlayerCard(card);
      } else {
        throw new Error(`Unexpected phase while waiting-human: ${round.phase}`);
      }
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
      expect(Math.max(s[0], s[1])).toBeLessThan(41 + 26);
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
        const round = c.getRound();
        if (round.phase === "bidding") c.submitPlayerBid(decideBid(HUMAN_SEAT, round.hands[HUMAN_SEAT], round.bidding));
        else c.submitPlayerCard(decideCard(round.hands[HUMAN_SEAT], round.currentTrick!, round.bidding.result!.mode, round.bidding.result!.trumpSuit, HUMAN_SEAT));
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

  it("الولد المضمون always deals you a Jack in your first five", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const c = new GameController(mulberry32(seed), { guaranteeJack: true });
      c.startMatch();
      expect(c.getRound().hands[HUMAN_SEAT].some((card) => card.rank === "J"), `seed ${seed}`).toBe(true);
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
          const round = c.getRound();
          if (round.phase === "bidding") c.submitPlayerBid(decideBid(HUMAN_SEAT, round.hands[HUMAN_SEAT], round.bidding));
          else c.submitPlayerCard(decideCard(round.hands[HUMAN_SEAT], round.currentTrick!, round.bidding.result!.mode, round.bidding.result!.trumpSuit, HUMAN_SEAT));
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
