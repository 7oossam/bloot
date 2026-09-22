import { legalCalls, type BiddingState } from "../engine/bidding";
import type { Bid, Card, Seat } from "../engine/types";
import { bestHokumOption, sunStrength } from "./evaluate";

/**
 * Buy thresholds, calibrated against the actual score distribution over sampled
 * 5-card bidding hands (hokum median ~36, sun median ~27). Together these buy on
 * roughly a quarter of hands, so the auction genuinely travels around the table
 * instead of the first seat sweeping it every time.
 *
 * Hokum scores run systematically higher than sun scores, so the two are never
 * compared raw — `decideBid` compares each one's margin over its own threshold.
 */
export const HOKUM_BUY_THRESHOLD = 50;
export const SUN_BUY_THRESHOLD = 42;

/**
 * Decides one seat's bid from its own 5-card hand only — bidding is
 * imperfect information, so this never looks at other hands.
 */
export function decideBid(seat: Seat, hand: Card[], state: BiddingState): Bid {
  const options = legalCalls(state);
  const hokumSuits = options.filter((o) => o.call === "hokum").map((o) => o.suit!);

  const hokum = hokumSuits.length > 0 ? bestHokumOption(hand, hokumSuits) : undefined;
  const sun = sunStrength(hand);

  const hokumMargin = hokum ? hokum.score - HOKUM_BUY_THRESHOLD : -Infinity;
  const sunMargin = sun - SUN_BUY_THRESHOLD;

  if (hokumMargin >= 0 && hokumMargin >= sunMargin) {
    return { seat, call: "hokum", suit: hokum!.suit };
  }
  if (sunMargin >= 0) {
    return { seat, call: "sun" };
  }
  return { seat, call: "pass" };
}
