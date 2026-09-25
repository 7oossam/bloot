import { cardId } from "../engine/cards";
import { startBidding, submitBid } from "../engine/bidding";
import type { Round } from "../engine/round";
import type { Bid, Card, Seat, Suit, Team } from "../engine/types";
import { teamOf } from "../engine/types";
import { cloneRound, inferConstraints, sampleWorld, searchCard, worldLikelihood } from "./mcts";
import { decideCard } from "./play-ai";

/**
 * Deep analysis of one decision: which card is really best here? For many full deals that fit
 * the table AND explain the auction, play each candidate card and then the rest of the hand to
 * the end, and average the game-point margin for your team. Unlike the search AI (which has to
 * decide in a blink), this can afford hundreds of deals and strong play in every seat — it's the
 * yardstick for judging the AI's rules (scripts/deep-analysis.ts → docs/ai-deep-analysis.md).
 */

export type Playout = "rules" | "search";

export interface CardVerdict {
  card: Card;
  /** Average game-point margin for your team over the deals. */
  mean: number;
  /** Standard error of that average. */
  se: number;
  /** Average margin minus the best card's, deal by deal (0 for the best), and its error. */
  gap: number;
  gapSe: number;
}

/** Deals that fit the table and are believable given the auction (kept with probability = likelihood). */
export function believableDeals(r: Round, me: Seat, rand: () => number, n: number, maxTries = n * 400): Array<Record<Seat, Card[]>> {
  const c = inferConstraints(r, me);
  const out: Array<Record<Seat, Card[]>> = [];
  for (let i = 0; i < maxTries && out.length < n; i++) {
    const w = sampleWorld(r, me, c, rand);
    if (!w) continue;
    const like = r.bidding.history.length ? worldLikelihood(r, me, w, rand) : 1;
    if (rand() < like) out.push(w);
  }
  return out;
}

/** Plays `card` for `me` in this deal, then the rest of the hand, and returns your team's margin. */
export function playOut(r: Round, deal: Record<Seat, Card[]>, me: Seat, card: Card, playout: Playout, rand: () => number): number {
  const sim = cloneRound(r, deal);
  const res = sim.bidding.result!;
  sim.playCard(me, card);
  while (sim.phase === "playing") {
    const s = sim.turnSeat!;
    const ctx = { tricks: sim.tricks, declarer: res.declarer, closed: sim.closed, ashkalSuits: s === res.ashkal?.groundTo ? res.ashkal.signalSuits : undefined };
    const pick = playout === "rules" ? decideCard(sim.hands[s], sim.currentTrick!, res.mode, res.trumpSuit, s, ctx) : searchCard(sim, s, { worlds: 8, rand, ctx });
    sim.playCard(s, pick);
  }
  const team: Team = teamOf(me);
  const g = sim.result!.gamePoints;
  return g[team] - g[(1 - team) as Team];
}

/** Every candidate against the same deals (paired), best first. */
export function deepEvaluate(r: Round, me: Seat, candidates: Card[], deals: Array<Record<Seat, Card[]>>, playout: Playout, rand: () => number): CardVerdict[] {
  const rows = deals.map((d) => candidates.map((c) => playOut(r, d, me, c, playout, rand)));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const se = (xs: number[]) => {
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(1, xs.length - 1) / xs.length);
  };
  const cols = candidates.map((_, j) => rows.map((row) => row[j]));
  const best = cols.reduce((bi, col, j) => (mean(col) > mean(cols[bi]) ? j : bi), 0);
  return candidates
    .map((card, j) => {
      const diffs = rows.map((row) => row[j] - row[best]);
      return { card, mean: mean(cols[j]), se: se(cols[j]), gap: mean(diffs), gapSe: se(diffs) };
    })
    .sort((a, b) => b.mean - a.mean);
}

/** A legal auction: the given calls in turn from the dealer's right, then passes until it settles. */
export function auction(dealer: Seat, ground: Card, calls: Array<{ call: Bid["call"]; suit?: Suit }>): Bid[] {
  let state = startBidding(dealer, ground);
  const bids: Bid[] = [];
  for (const c of calls) {
    const bid: Bid = { seat: state.turnSeat, call: c.call, suit: c.suit };
    bids.push(bid);
    state = submitBid(state, bid);
  }
  while (!state.result && !state.redeal) {
    const bid: Bid = { seat: state.turnSeat, call: "pass" };
    bids.push(bid);
    state = submitBid(state, bid);
  }
  return bids;
}

export const sameCard = (a: Card, b: Card) => cardId(a) === cardId(b);
