import { legalDoubles, type DoubleBid, type DoublingState } from "../engine/doubling";
import type { Card, Seat, Suit } from "../engine/types";
import { hokumStrength, sunStrength } from "./evaluate";

/**
 * When to raise in the دبل round, from the seat's own 8 cards. Calibrated on simulated hands
 * (AI vs AI): a defender with hokum strength 55+ (about the top 1.5%) out-counts the buyer
 * roughly 60% of the time, and even the best sun defences only win about half — so the AI
 * doubles rarely, and raising further needs a much stronger hand.
 */
export const DOUBLE_HOKUM = 55;
export const DOUBLE_SUN = 58;
export const TRIPLE = 95;
export const FOUR = 65;
export const QAHWA = 110;

/** `eager` lowers the bar to raise by that much (المتحمس, a partner). */
export function decideDouble(seat: Seat, hand: Card[], state: DoublingState, trumpSuit?: Suit, eager = 0): DoubleBid {
  const options = legalDoubles(state);
  const strength = (state.mode === "hokum" ? hokumStrength(hand, trumpSuit!) : sunStrength(hand)) + eager;
  const trumps = trumpSuit ? hand.filter((c) => c.suit === trumpSuit).length : 0;
  // مقفل keeps the buyer from pulling trumps — worth it when we hold trumps of our own.
  const closed = trumps >= 2;
  const want = (call: DoubleBid["call"], ok: boolean): DoubleBid | undefined => {
    if (!ok) return undefined;
    const match = options.find((o) => o.call === call && (o.closed === undefined || o.closed === closed)) ??
      options.find((o) => o.call === call);
    return match ? { seat, call, closed: match.closed } : undefined;
  };
  switch (state.level) {
    case 1:
      return want("double", strength >= (state.mode === "hokum" ? DOUBLE_HOKUM : DOUBLE_SUN)) ?? { seat, call: "pass" };
    case 2:
      return want("triple", strength >= TRIPLE) ?? { seat, call: "pass" };
    case 3:
      return want("four", strength >= FOUR) ?? { seat, call: "pass" };
    case 4:
      return want("qahwa", strength >= QAHWA) ?? { seat, call: "pass" };
    default:
      return { seat, call: "pass" };
  }
}
