import { cardPoints, rankStrength } from "../engine/cards";
import { currentWinner, legalMoves } from "../engine/trick";
import { SUITS, RANKS, teamOf, type Card, type Mode, type Seat, type Suit, type Trick } from "../engine/types";

/**
 * The perfect-information solver (double-dummy, as bridge players call it): with every hand
 * face up, the best any side can do from here, trick by trick, to the end. Values are raw
 * points (أبناط) — card points plus the last-trick bonus — as a margin for one team.
 *
 * It's an analysis tool, not a player: the computer at the table never sees the other hands.
 * After a hand it shows where a play cost points against the best line, so the player (and
 * Claude) can see which decisions to look at.
 */
export interface SolveTable {
  hands: Record<Seat, Card[]>;
  trick: Trick;
  /** Tricks already finished (0–7). */
  done: number;
  mode: Mode;
  trumpSuit?: Suit;
  closed?: boolean;
  lastTrickBonus?: number;
}

const index = (c: Card) => SUITS.indexOf(c.suit) * 8 + RANKS.indexOf(c.rank);

interface Entry {
  value: number;
  flag: 0 | 1 | 2; // exact, lower bound, upper bound
}

export class Solver {
  private readonly tt = new Map<string, Entry>();
  nodes = 0;

  constructor(
    private readonly mode: Mode,
    private readonly trumpSuit: Suit | undefined,
    private readonly closed = false,
    private readonly lastTrickBonus = 10,
  ) {}

  /** The value of the position for team 0 (team 0's points minus team 1's, from here on). */
  value(hands: Record<Seat, Card[]>, trick: Trick, done: number): number {
    return this.search(hands, trick, done, -Infinity, Infinity);
  }

  /** Each legal card for the seat to play, with the position's value for that seat's team after it. */
  moves(hands: Record<Seat, Card[]>, trick: Trick, done: number): Array<{ card: Card; value: number }> {
    const seat = ((trick.leader + trick.order.length) % 4) as Seat;
    const sign = teamOf(seat) === 0 ? 1 : -1;
    return legalMoves(hands[seat], trick, this.mode, this.trumpSuit, seat, this.closed).map((card) => {
      const next = this.play(hands, trick, done, seat, card);
      return { card, value: sign * (next.gained + this.search(next.hands, next.trick, next.done, -Infinity, Infinity)) };
    });
  }

  private play(hands: Record<Seat, Card[]>, trick: Trick, done: number, seat: Seat, card: Card) {
    const nextHands = { ...hands, [seat]: hands[seat].filter((c) => c !== card) } as Record<Seat, Card[]>;
    const t: Trick = { leader: trick.leader, cards: { ...trick.cards, [seat]: card }, order: [...trick.order, seat] };
    if (t.order.length < 4) return { hands: nextHands, trick: t, done, gained: 0 };
    const winner = currentWinner(t, this.mode, this.trumpSuit);
    let points = t.order.reduce<number>((n, s) => n + cardPoints(t.cards[s]!, this.mode, this.trumpSuit), 0);
    if (done === 7) points += this.lastTrickBonus;
    return { hands: nextHands, trick: { leader: winner, cards: {}, order: [] } as Trick, done: done + 1, gained: teamOf(winner) === 0 ? points : -points };
  }

  private key(hands: Record<Seat, Card[]>, leader: Seat): string {
    let k = String(leader);
    for (const s of [0, 1, 2, 3] as Seat[]) {
      let bits = 0;
      for (const c of hands[s]) bits |= 1 << index(c);
      k += ":" + (bits >>> 0).toString(36);
    }
    return k;
  }

  private search(hands: Record<Seat, Card[]>, trick: Trick, done: number, alpha: number, beta: number): number {
    if (done === 8 || (trick.order.length === 0 && hands[trick.leader].length === 0)) return 0;
    this.nodes++;
    const atStart = trick.order.length === 0;
    let key = "";
    if (atStart) {
      key = this.key(hands, trick.leader);
      const hit = this.tt.get(key);
      if (hit) {
        if (hit.flag === 0) return hit.value;
        if (hit.flag === 1) alpha = Math.max(alpha, hit.value);
        else beta = Math.min(beta, hit.value);
        if (alpha >= beta) return hit.value;
      }
    }
    const a0 = alpha;
    const b0 = beta;
    const seat = ((trick.leader + trick.order.length) % 4) as Seat;
    const maximizing = teamOf(seat) === 0;
    const moves = this.order(this.distinct(legalMoves(hands[seat], trick, this.mode, this.trumpSuit, seat, this.closed), hands, seat));
    let best = maximizing ? -Infinity : Infinity;
    for (const card of moves) {
      const next = this.play(hands, trick, done, seat, card);
      const v = next.gained + this.search(next.hands, next.trick, next.done, alpha - next.gained, beta - next.gained);
      if (maximizing) {
        if (v > best) best = v;
        if (best > alpha) alpha = best;
      } else {
        if (v < best) best = v;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;
    }
    if (atStart) this.tt.set(key, { value: best, flag: best <= a0 ? 2 : best >= b0 ? 1 : 0 });
    return best;
  }

  /**
   * Cards that play the same: same suit, same points, and no card still in anyone else's hand
   * between them (the 7 and 8 of a suit, say). Only one of each group needs searching.
   */
  private distinct(cards: Card[], hands: Record<Seat, Card[]>, seat: Seat): Card[] {
    if (cards.length < 2) return cards;
    const strength = (c: Card) => rankStrength(c, this.mode, this.trumpSuit);
    const others = ([0, 1, 2, 3] as Seat[]).filter((s) => s !== seat).flatMap((s) => hands[s]);
    const sorted = [...cards].sort((a, b) => (a.suit === b.suit ? strength(a) - strength(b) : a.suit < b.suit ? -1 : 1));
    const kept: Card[] = [];
    for (const c of sorted) {
      const prev = kept[kept.length - 1];
      const same =
        prev &&
        prev.suit === c.suit &&
        cardPoints(prev, this.mode, this.trumpSuit) === cardPoints(c, this.mode, this.trumpSuit) &&
        !others.some((o) => o.suit === c.suit && strength(o) > strength(prev) && strength(o) < strength(c));
      if (!same) kept.push(c);
    }
    return kept;
  }

  /** Big cards first: they decide tricks and cut the search soonest. */
  private order(cards: Card[]): Card[] {
    return [...cards].sort((a, b) => cardPoints(b, this.mode, this.trumpSuit) - cardPoints(a, this.mode, this.trumpSuit));
  }
}

/** One computer play measured against the best line with every card face up. */
export interface PlayReview {
  trick: number;
  seat: Seat;
  played: Card;
  best: Card;
  /** Raw points (أبناط) the seat's team gave up against the best card. */
  lost: number;
}

/**
 * Replays a finished (or unfinished) hand from the cards each seat started play with, and
 * measures every play by `seats` against the best card with all hands visible.
 */
export function reviewHand(
  start: Record<Seat, Card[]>,
  tricks: Trick[],
  mode: Mode,
  trumpSuit: Suit | undefined,
  seats: Seat[],
  opts: { closed?: boolean; lastTrickBonus?: number } = {},
): PlayReview[] {
  const solver = new Solver(mode, trumpSuit, opts.closed, opts.lastTrickBonus);
  const reviews: PlayReview[] = [];
  let hands = { ...start } as Record<Seat, Card[]>;
  // A replay can start mid-hand: the tricks already gone are the cards missing from a full hand.
  const before = tricks.length ? 8 - start[tricks[0].leader].length : 0;
  tricks.forEach((played, t) => {
    let trick: Trick = { leader: played.leader, cards: {}, order: [] };
    for (const seat of played.order) {
      const card = played.cards[seat]!;
      if (seats.includes(seat)) {
        const options = solver.moves(hands, trick, before + t);
        const bestMove = options.reduce((a, b) => (b.value > a.value ? b : a));
        const mine = options.find((o) => o.card.suit === card.suit && o.card.rank === card.rank);
        if (mine) reviews.push({ trick: t + 1, seat, played: card, best: bestMove.card, lost: bestMove.value - mine.value });
      }
      hands = { ...hands, [seat]: hands[seat].filter((c) => !(c.suit === card.suit && c.rank === card.rank)) } as Record<Seat, Card[]>;
      trick = { leader: trick.leader, cards: { ...trick.cards, [seat]: card }, order: [...trick.order, seat] };
    }
  });
  return reviews;
}
