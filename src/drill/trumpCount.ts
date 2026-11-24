/**
 * عدّ الحكم — the first skill of the drill. The method it teaches (a count, not a memory of
 * every card): when the trump is set, count yours; out there = 8 − yours. Each trump someone
 * ELSE plays takes one off; yours don't change it (they were already off the count).
 *
 * It asks at the moments the count decides your play: when you lead (pull trumps, or lead a
 * suit someone will cut?) and when you're void in the led suit and could cut (will they
 * over-cut you?).
 */
import { rankStrength } from "../engine/cards";
import type { Card, Seat, Suit, Trick } from "../engine/types";
import { outThere, type DrillTable } from "./questions";

export interface TrumpCount {
  /** Trumps you were dealt (in hand now + the ones you've played). */
  mine: number;
  /** Trumps the other three have played. */
  theirsPlayed: number;
  /** Still out there: 8 − mine − theirsPlayed. */
  out: number;
}

export function trumpCount(t: DrillTable): TrumpCount {
  const trump = t.trumpSuit!;
  let minePlayed = 0;
  let theirsPlayed = 0;
  for (const tr of t.tricks) {
    for (const seat of tr.order) {
      if (tr.cards[seat]!.suit !== trump) continue;
      if (seat === 0) minePlayed++;
      else theirsPlayed++;
    }
  }
  const mine = t.hand.filter((c) => c.suit === trump).length + minePlayed;
  const out = outThere(t, trump).length;
  return { mine, theirsPlayed, out };
}

/** lead / cut: the count decides your card; follow: one of theirs just fell — update it. */
export type DecisionPoint = "lead" | "cut" | "follow";

/** Whether your turn now is one where the trump count matters, and how. */
export function decisionPoint(trick: Trick, hand: Card[], trump: Suit): DecisionPoint | undefined {
  if (trick.order.length === 0) return "lead";
  const led = trick.cards[trick.order[0]]!.suit;
  if (led !== trump && !hand.some((c) => c.suit === led) && hand.some((c) => c.suit === trump)) return "cut";
  return undefined;
}

/** Why the number you just gave matters for the card you're about to play. */
export function whyItMatters(kind: DecisionPoint, t: DrillTable): string {
  const { out } = trumpCount(t);
  const trump = t.trumpSuit!;
  const mine = t.hand.filter((c) => c.suit === trump);
  const top = [...outThere(t, trump), ...mine].sort((a, b) => rankStrength(b, "hokum", trump) - rankStrength(a, "hokum", trump))[0];
  const holdsTop = !!top && mine.some((c) => c.rank === top.rank);
  if (kind === "follow") {
    if (out === 0) return "خلص الحكم برّا يدك — من الحين ورقك الكبير ما ينقطع.";
    return "نزل حكم من غيرك، فنقّصت واحد. هذي العادة: كل حكم ينزل من غيرك = واحد أقل.";
  }
  if (kind === "lead") {
    if (out === 0) return "ما بقى حكم عند أحد: إكّتك وعشرتك ما تنقطع — العبها وأنت مرتاح.";
    if (holdsTop) return `باقي ${out} عندهم، وأكبر حكم باقي معك: لو سحبت الحكم يطيح حكمهم وورقك يمشي.`;
    return `باقي ${out} عندهم: لو بديت بشكل فضى منه أحدهم، يقطعه. فكّر قبل ما تبدأ بإكة.`;
  }
  if (out === 0) return "ما بقى حكم عند غيرك: اقطع بأصغر حكم عندك — محد يرقّع عليك.";
  return `باقي ${out} عند غيرك: لو قطعت بحكم صغير، اللي بعدك ممكن يرقّع عليك بأكبر.`;
}

/** The method, said as a sum: «3 = 8 − 4 في يدك − 1 نزلت منهم». */
export function countLine(c: TrumpCount): string {
  return `${c.out} = 8 − ${c.mine} حكمك − ${c.theirsPlayed} نزلت منهم`;
}

/** Seats other than yours. */
export const OTHERS: Seat[] = [1, 2, 3];
