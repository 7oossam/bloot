import { describe, expect, it } from "vitest";
import { Round } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import { cardId } from "../src/engine/cards";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import type { Card, Seat, Trick } from "../src/engine/types";
import { isCorrect, pickQuestions, questionsOfType, RANK_AR, SUIT_AR, type DrillTable } from "../src/drill/questions";
import { RANKS, SUITS } from "../src/engine/types";

const allIds = SUITS.flatMap((s) => RANKS.map((r) => `${s}${r}`));
import { finishHand, recordAnswer, stopsFor, weightOf, type DrillProgress } from "../src/drill/progress";

/** A hand played out by the rule AI, stopped after `stop` tricks. */
function tableAfter(seed: number, stop: number): DrillTable | undefined {
  const r = new Round(0, mulberry32(seed));
  for (let i = 0; i < 12 && r.phase === "bidding"; i++) {
    const seat = r.bidding.turnSeat;
    r.bid(decideBid(seat, r.hands[seat], r.bidding));
  }
  while (r.phase === "doubling") r.double({ seat: r.doubling!.turnSeat, call: "pass" });
  if (r.phase !== "playing") return undefined;
  const res = r.bidding.result!;
  while (r.phase === "playing" && r.tricks.length < stop) {
    const seat = r.turnSeat!;
    r.playCard(seat, decideCard(r.hands[seat], r.currentTrick!, res.mode, res.trumpSuit, seat, { tricks: r.tricks, declarer: res.declarer }));
  }
  return { tricks: r.tricks, hand: r.hands[0], mode: res.mode, trumpSuit: res.trumpSuit };
}

const tables = (stop: number) => Array.from({ length: 40 }, (_, i) => tableAfter(i + 1, stop)).filter((t): t is DrillTable => !!t);

describe("تمرين الذاكرة: every answer is what the table shows", () => {
  it("العدّ: what's left of a suit is 8 minus what fell minus what you hold", () => {
    for (const t of tables(4)) {
      for (const q of questionsOfType("count", t)) {
        const suit = (["S", "H", "D", "C"] as const).find((s) => q.text.includes({ S: "سبيت", H: "هاص", D: "ديمن", C: "شرية" }[s]))!;
        const fell = t.tricks.flatMap((tr) => tr.order.map((s) => tr.cards[s]!)).filter((c) => c.suit === suit).length;
        expect(q.answer).toEqual({ kind: "number", value: 8 - fell - t.hand.filter((c) => c.suit === suit).length });
      }
    }
  });

  it("نزلت؟: yes exactly when the card was played", () => {
    for (const t of tables(5)) {
      const fell = new Set(t.tricks.flatMap((tr) => tr.order.map((s) => cardId(tr.cards[s]!))));
      for (const q of questionsOfType("gone", t)) {
        const id = [...fell, ...allIds].find((x) => q.text === `${RANK_AR[x.slice(1) as Card["rank"]]} ${SUIT_AR[x[0] as Card["suit"]]} نزلت؟`)!;
        expect(q.answer).toEqual({ kind: "yesno", value: fell.has(id) });
      }
    }
  });

  it("مين فضى: the seats that didn't follow the led suit", () => {
    let seen = 0;
    for (const t of tables(6)) {
      for (const q of questionsOfType("void", t)) {
        if (q.answer.kind !== "seats") throw new Error("seats");
        for (const seat of q.answer.value) {
          // Somewhere that seat played off the led suit.
          const missed = t.tricks.some((tr) => {
            const led = tr.cards[tr.order[0]]!.suit;
            return tr.order[0] !== seat && tr.cards[seat]!.suit !== led;
          });
          expect(missed).toBe(true);
          seen++;
        }
        expect(q.answer.value).not.toContain(0);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("التهريب is read only off a trick the partner is winning; the other way it's a weak card", () => {
    // Seat 3's partner (1) wins with the Ace; seat 3 throws the 7 of diamonds: asks for hearts.
    const tr = (cards: string[], leader: Seat, winner: Seat): Trick => {
      const order = cards.map((_, i) => ((leader + i) % 4) as Seat);
      const c: Trick["cards"] = {};
      order.forEach((s, i) => (c[s] = { suit: cards[i][0] as Card["suit"], rank: cards[i].slice(1) as Card["rank"] }));
      return { leader, order, cards: c, winner };
    };
    const t: DrillTable = {
      mode: "sun",
      hand: [],
      tricks: [tr(["SA", "SQ", "D7", "S7"], 1, 1), tr(["C8", "CA", "H8", "C9"], 0, 1)],
    };
    const signal = questionsOfType("signal", t);
    expect(signal).toHaveLength(1);
    expect(signal[0].answer).toEqual({ kind: "suit", value: "H" });
    // Seat 2 threw the 8 of hearts on the opponents' trick: a weak card, not a request.
    const weak = questionsOfType("weak", t);
    expect(weak.map((q) => q.answer)).toEqual([{ kind: "suit", value: "H" }]);
    expect(weak[0].evidence).toContain("مو تهريب");
  });

  it("a stop mixes kinds: never the same kind twice", () => {
    for (const t of tables(6)) {
      const qs = pickQuestions(t, 3, () => 1, mulberry32(3));
      expect(new Set(qs.map((q) => q.type)).size).toBe(qs.length);
    }
  });

  it("answers are checked fairly: seats in any order", () => {
    expect(isCorrect({ kind: "seats", value: [1, 3] }, { kind: "seats", value: [3, 1] })).toBe(true);
    expect(isCorrect({ kind: "number", value: 3 }, { kind: "number", value: 4 })).toBe(false);
  });
});

describe("تمرين الذاكرة: the method", () => {
  const fresh = (): DrillProgress => ({ level: 1, boxes: {}, streak: 0, hands: 0, best: 0 });

  it("Leitner: a miss drops the kind to box 1 (asked more), a hit climbs it", () => {
    const p = fresh();
    recordAnswer(p, "count", true);
    recordAnswer(p, "count", true);
    expect(p.boxes.count).toBe(3);
    expect(weightOf(p, "count")).toBeLessThan(weightOf(p, "void"));
    recordAnswer(p, "count", false);
    expect(p.boxes.count).toBe(1);
  });

  it("the staircase: two good hands go up a level, a bad one comes down", () => {
    const p = fresh();
    expect(finishHand(p, 9, 10)).toBe(0);
    expect(finishHand(p, 8, 10)).toBe(1);
    expect(p.level).toBe(2);
    expect(finishHand(p, 2, 10)).toBe(-1);
    expect(p.level).toBe(1);
    // Higher levels ask less often: longer to hold the table in your head.
    expect(stopsFor(5).after.length).toBeLessThan(stopsFor(1).after.length);
  });
});

import { decisionPoint, trumpCount } from "../src/drill/trumpCount";
import { finishSkillHand, skillOf } from "../src/drill/progress";

describe("عدّ الحكم", () => {
  it("out there = 8 − yours − theirs played, and it's what's really unseen", () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const t = tableAfter(seed, 4);
      if (!t || t.mode !== "hokum") continue;
      const c = trumpCount(t);
      expect(c.out).toBe(8 - c.mine - c.theirsPlayed);
      const seen = t.tricks.flatMap((tr) => tr.order.map((s) => tr.cards[s]!)).filter((x) => x.suit === t.trumpSuit).length + t.hand.filter((x) => x.suit === t.trumpSuit).length;
      expect(c.out).toBe(8 - seen);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("asks when you lead, and when you could cut", () => {
    const card = (id: string): Card => ({ suit: id[0] as Card["suit"], rank: id.slice(1) as Card["rank"] });
    expect(decisionPoint({ leader: 0, order: [], cards: {} }, [card("H7")], "S")).toBe("lead");
    const led: Trick = { leader: 1, order: [1], cards: { 1: card("DA") } };
    expect(decisionPoint(led, [card("H7"), card("S9")], "S")).toBe("cut");
    expect(decisionPoint(led, [card("D7"), card("S9")], "S")).toBeUndefined();
    expect(decisionPoint(led, [card("H7")], "S")).toBeUndefined();
  });

  it("a stage moves on after two good hands, and the ladder ends mastered", () => {
    const p: DrillProgress = { level: 1, boxes: {}, streak: 0, hands: 0, best: 0 };
    for (let i = 0; i < 6; i++) finishSkillHand(p, "trump", 5, 5);
    expect(skillOf(p, "trump")).toEqual({ stage: 3, streak: 0, mastered: true });
    expect(finishSkillHand(p, "trump", 1, 5)).toBe(-1);
  });
});
