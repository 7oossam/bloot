import { legalCalls, type BiddingState } from "../engine/bidding";
import type { Bid, Card, Seat } from "../engine/types";
import { bestHokumOption, sunStrength } from "./evaluate";

/** Tunable thresholds: below this utility, the AI passes rather than buys. */
export const HOKUM_BUY_THRESHOLD = 20;
export const SUN_BUY_THRESHOLD = 16;

/**
 * Decides one seat's bid from its own 5-card hand only — bidding is
 * imperfect information, so this never looks at other hands.
 */
export function decideBid(seat: Seat, hand: Card[], state: BiddingState): Bid {
  const options = legalCalls(state);
  const hokumSuits = options.filter((o) => o.call === "hokum").map((o) => o.suit!);

  const hokum = hokumSuits.length > 0 ? bestHokumOption(hand, hokumSuits) : undefined;
  const sun = sunStrength(hand);

  const hokumGood = hokum && hokum.score >= HOKUM_BUY_THRESHOLD;
  const sunGood = sun >= SUN_BUY_THRESHOLD;

  if (hokumGood && (!sunGood || hokum!.score >= sun)) {
    return { seat, call: "hokum", suit: hokum!.suit };
  }
  if (sunGood) {
    return { seat, call: "sun" };
  }
  return { seat, call: "pass" };
}
