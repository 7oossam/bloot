import { cardPoints, isTrumpCard, rankStrength } from "../engine/cards";
import { currentWinner, legalMoves, wouldWinAgainstCurrent } from "../engine/trick";
import { teamOf, type Card, type Mode, type Seat, type Suit, type Trick } from "../engine/types";
import { buildBeliefs, outstanding, suitsOf } from "./beliefs";
import type { PlayContext } from "./play-ai";
import trained from "./policy-weights.json";

/**
 * A small learned card-play policy, trained by self-play (scripts/selfplay.ts → scripts/train-policy.ts):
 * the search AI plays thousands of hands, and this network learns to score each legal card the
 * way the search judged it. It's fast enough to play the search's guessed deals out.
 *
 * Every legal card is described by the same features (the table from this seat's point of view,
 * plus what that card would do), a one-hidden-layer network scores it, and the best score plays.
 */

export interface PolicyWeights {
  /** Hidden layer: `hidden` rows of `inputs` weights, then `hidden` biases. */
  w1: number[][];
  b1: number[];
  /** Output: one weight per hidden unit, and a bias. */
  w2: number[];
  b2: number;
  /** Feature scaling learnt with the weights. */
  mean: number[];
  std: number[];
}

export const FEATURE_NAMES = [
  // the table
  "lead", "second", "third", "last", "sun", "ourContract", "trickNo", "partnerWinning",
  "trickPoints", "voidInLed", "trumpsOut", "myTrumps", "closed",
  // the card
  "r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7",
  "isTrump", "follows", "winsNow", "winsSurely", "points", "isBoss", "mySuitCount", "suitOut",
  "nextVoid", "prevVoid", "partnerVoid", "oppCanRuff", "partnerWants", "partnerRejects",
  "trumpLead", "discard", "feedsPartner", "winsPoints", "aceOnPartner", "bareTen",
  "lowestOfSuit", "highestOfSuit",
] as const;
export const FEATURE_COUNT = FEATURE_NAMES.length;

/** The feature vector for each legal card, in the order of `legal`. */
export function cardFeatures(legal: Card[], hand: Card[], trick: Trick, mode: Mode, trumpSuit: Suit | undefined, seat: Seat, ctx: PlayContext): number[][] {
  const beliefs = buildBeliefs(ctx.tricks, trick, mode, trumpSuit);
  const partner = ((seat + 2) % 4) as Seat;
  const next = ((seat + 1) % 4) as Seat;
  const prev = ((seat + 3) % 4) as Seat;
  const pos = trick.order.length;
  const led = pos > 0 ? trick.cards[trick.order[0]]!.suit : undefined;
  const partnerWinning = pos > 0 && teamOf(currentWinner(trick, mode, trumpSuit)) === teamOf(seat) ? 1 : 0;
  const trickPoints = trick.order.reduce<number>((n, s) => n + cardPoints(trick.cards[s]!, mode, trumpSuit), 0);
  const by = suitsOf(hand);
  const trumpsOut = mode === "hokum" && trumpSuit ? outstanding(beliefs, hand, trumpSuit).length : 0;
  const ours = ctx.declarer !== undefined && teamOf(ctx.declarer) === teamOf(seat) ? 1 : 0;
  const wants = new Set<Suit>([...beliefs.wants[partner], ...beliefs.barqiya[partner], ...(ctx.ashkalSuits ?? []), ...(ctx.partnerAsks ?? [])]);
  const rejects = new Set<Suit>(beliefs.rejects[partner]);
  const table = [
    pos === 0 ? 1 : 0, pos === 1 ? 1 : 0, pos === 2 ? 1 : 0, pos === 3 ? 1 : 0,
    mode === "sun" ? 1 : 0, ours, ctx.tricks.length / 7, partnerWinning,
    trickPoints / 30, led && by[led].length === 0 ? 1 : 0, trumpsOut / 8,
    mode === "hokum" && trumpSuit ? by[trumpSuit].length / 8 : 0, ctx.closed ? 1 : 0,
  ];
  return legal.map((card) => {
    const suit = card.suit;
    const strength = rankStrength(card, mode, trumpSuit);
    const rankOneHot = [0, 0, 0, 0, 0, 0, 0, 0];
    rankOneHot[Math.max(0, Math.min(7, strength))] = 1;
    const trump = isTrumpCard(card, mode, trumpSuit) ? 1 : 0;
    const follows = led !== undefined && suit === led ? 1 : 0;
    const winsNow = pos === 0 ? 0 : wouldWinAgainstCurrent(card, trick, mode, trumpSuit) ? 1 : 0;
    const out = outstanding(beliefs, hand, suit);
    const isBoss = out.every((o) => rankStrength(o, mode, trumpSuit) < strength) ? 1 : 0;
    const oppCanRuff =
      mode === "hokum" && trumpSuit && suit !== trumpSuit && [next, prev].some((o) => beliefs.voids[o][suit] && !beliefs.voids[o][trumpSuit]) ? 1 : 0;
    const pts = cardPoints(card, mode, trumpSuit);
    const mine = by[suit];
    const ten = card.rank === "10" && !trump && out.some((o) => o.rank === "A") && mine.length === 1 ? 1 : 0;
    return [
      ...table,
      ...rankOneHot,
      trump, follows, winsNow, winsNow && pos === 3 ? 1 : 0, pts / 20, isBoss, mine.length / 8, out.length / 8,
      beliefs.voids[next][suit] ? 1 : 0, beliefs.voids[prev][suit] ? 1 : 0, beliefs.voids[partner][suit] ? 1 : 0, oppCanRuff,
      wants.has(suit) ? 1 : 0, rejects.has(suit) ? 1 : 0,
      pos === 0 && trump ? 1 : 0, led !== undefined && !follows && !trump ? 1 : 0,
      partnerWinning * pts / 20, winsNow * (trickPoints + pts) / 40,
      partnerWinning && card.rank === "A" && !trump ? 1 : 0, ten,
      mine.every((c) => rankStrength(c, mode, trumpSuit) >= strength) ? 1 : 0,
      mine.every((c) => rankStrength(c, mode, trumpSuit) <= strength) ? 1 : 0,
    ];
  });
}

/** One card's score from its (unscaled) features. */
export function scoreFeatures(w: PolicyWeights, f: number[]): number {
  let out = w.b2;
  for (let h = 0; h < w.b1.length; h++) {
    const row = w.w1[h];
    let z = w.b1[h];
    for (let i = 0; i < f.length; i++) z += row[i] * ((f[i] - w.mean[i]) / w.std[i]);
    out += w.w2[h] * Math.tanh(z);
  }
  return out;
}

/** A play-out policy (same shape as `decideCard`) that plays the legal card the network scores highest. */
export function makePolicy(w: PolicyWeights) {
  return (hand: Card[], trick: Trick, mode: Mode, trumpSuit: Suit | undefined, seat: Seat, ctx: PlayContext): Card => {
    const legal = legalMoves(hand, trick, mode, trumpSuit, seat, ctx.closed);
    if (legal.length === 1) return legal[0];
    const feats = cardFeatures(legal, hand, trick, mode, trumpSuit, seat, ctx);
    let best = 0;
    let bestScore = -Infinity;
    feats.forEach((f, i) => {
      const s = scoreFeatures(w, f);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    return legal[best];
  };
}

/**
 * The trained weights (generation 1: 4,000 self-play hands, 85,688 decisions, 24 hidden units).
 * On its own this policy beats the rule-based AI by +1.79 ± 0.45 game points per hand (2,000
 * mirrored hands) at well under 0.1 ms per card. Inside the search it didn't measurably help —
 * as the play-out policy −0.02 ± 0.7, as a prior (weight 4) +0.52 ± 0.49 — so the game's search
 * still plays its guesses out with the rule-based AI.
 */
export const TRAINED_WEIGHTS = trained as PolicyWeights;
export const trainedPolicy = makePolicy(TRAINED_WEIGHTS);
