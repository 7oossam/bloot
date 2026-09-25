import { legalCalls, type BiddingState } from "../engine/bidding";
import { nextSeat, type Bid, type Card, type Seat } from "../engine/types";
import { bestHokumOption, meetsHokumCriteria, meetsSunCriteria, sunStrength } from "./evaluate";

/**
 * Buy thresholds, calibrated against sampled 5-card hands (plus the ground card, which the
 * buyer takes). With the guide's criteria as gates, about 86% of deals get bought (the
 * rest are redealt) — split roughly evenly between hokum and sun —
 * and the auction still travels round the table.
 *
 * Hokum scores run systematically higher than sun scores, so the two are never compared
 * raw — `decideBid` compares each one's margin over its own threshold.
 */
export const HOKUM_BUY_THRESHOLD = 48;
export const SUN_BUY_THRESHOLD = 40;
/** معامل الحلة (§3): the seat that leads first values its hand 15–20% higher. */
export const HILLA_FACTOR = 1.18;
/** How much lower an eager sun buyer's bar is. */
export const SUN_EAGER_DISCOUNT = 12;

/**
 * Decides one seat's bid from its own 5-card hand and the face-up ground card only —
 * bidding is imperfect information, so this never looks at other hands.
 */
export function decideBid(seat: Seat, hand: Card[], state: BiddingState, opts: { sunEager?: boolean } = {}): Bid {
  const options = legalCalls(state);
  const hasHilla = seat === nextSeat(state.dealer);
  const factor = hasHilla ? HILLA_FACTOR : 1;
  // Whoever buys takes the ground card, so judge the hand we'd actually play.
  const withGround = [...hand, state.groundCard];

  const hokumSuits = options.filter((o) => o.call === "hokum").map((o) => o.suit!);
  const hokum = hokumSuits.length > 0 ? bestHokumOption(withGround, hokumSuits) : undefined;
  const hokumOk = !!hokum && meetsHokumCriteria(withGround, hokum.suit);
  // أهل الصن (an opponent rule): they buy sun on hands a careful player would pass.
  const sunEdge = opts.sunEager ? SUN_EAGER_DISCOUNT : 0;
  const sunOk =
    options.some((o) => o.call === "sun") &&
    (meetsSunCriteria(withGround, hasHilla) || (!!opts.sunEager && withGround.some((c) => c.rank === "A")));

  const hokumMargin = hokumOk ? hokum!.score * factor - HOKUM_BUY_THRESHOLD : -Infinity;
  const sunMargin = sunOk ? sunStrength(withGround) * factor - (SUN_BUY_THRESHOLD - sunEdge) : -Infinity;

  if (hokumMargin >= 0 && hokumMargin >= sunMargin) return { seat, call: "hokum", suit: hokum!.suit };
  if (sunMargin >= 0) return { seat, call: "sun" };

  // أشكل (البند 8): over the other team's hokum, when the ground card would help the partner
  // more than us — a 10 on the ground and a hand that's close to a sun buy without it.
  if (options.some((o) => o.call === "ashkal")) {
    const strongGround = state.groundCard.rank === "10" || state.groundCard.rank === "K";
    if (strongGround && hand.some((c) => c.rank === "A") && sunStrength(hand) * factor >= SUN_BUY_THRESHOLD * 0.9) {
      return { seat, call: "ashkal" };
    }
  }
  return { seat, call: "pass" };
}
