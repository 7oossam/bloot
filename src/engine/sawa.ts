import { cardId } from "./cards";
import { currentWinner, legalMoves } from "./trick";
import type { Card, Mode, Seat, Suit, Trick, TrickRules } from "./types";

/**
 * السوا: a claim that you take every trick left. It's judged the way a player makes it: you
 * choose the order you lay your cards (the 9 of trumps first to draw the King, then the rest),
 * the opponents answer however hurts you most, and your partner plays along (he never has to
 * take a trick off you if he can help it). The claim holds if some order wins every trick
 * whatever the opponents do.
 */
export interface SawaTable {
  hands: Record<Seat, Card[]>;
  claimer: Seat;
  mode: Mode;
  trumpSuit?: Suit;
  rules?: TrickRules;
  closed?: boolean;
}

/** Search budget: past this many positions the claim is judged the old, strict way. */
const MAX_NODES = 200_000;

class Budget extends Error {}

function without(hand: Card[], card: Card): Card[] {
  const i = hand.findIndex((c) => cardId(c) === cardId(card));
  return [...hand.slice(0, i), ...hand.slice(i + 1)];
}

function makeSolver(t: SawaTable) {
  const partner = ((t.claimer + 2) % 4) as Seat;
  const memo = new Map<string, boolean>();
  let nodes = 0;
  const trickOf = (leader: Seat): Trick => (t.rules ? { leader, cards: {}, order: [], rules: t.rules } : { leader, cards: {}, order: [] });
  const key = (hands: Record<Seat, Card[]>) => ([0, 1, 2, 3] as Seat[]).map((s) => hands[s].map(cardId).sort().join(",")).join("|");

  /** The claimer leads and must win every trick from here. */
  const wins = (hands: Record<Seat, Card[]>): boolean => {
    if (hands[t.claimer].length === 0) return true;
    const k = key(hands);
    const seen = memo.get(k);
    if (seen !== undefined) return seen;
    const ok = legalMoves(hands[t.claimer], trickOf(t.claimer), t.mode, t.trumpSuit, t.claimer, t.closed).some((lead) =>
      rest(play(trickOf(t.claimer), t.claimer, lead), { ...hands, [t.claimer]: without(hands[t.claimer], lead) }),
    );
    memo.set(k, ok);
    return ok;
  };

  /** The trick in progress, the others still to play: opponents do their worst, the partner his best. */
  const rest = (trick: Trick, hands: Record<Seat, Card[]>): boolean => {
    if (++nodes > MAX_NODES) throw new Budget();
    if (trick.order.length === 4) return currentWinner(trick, t.mode, t.trumpSuit) === t.claimer && wins(hands);
    const seat = ((trick.leader + trick.order.length) % 4) as Seat;
    const moves = legalMoves(hands[seat], trick, t.mode, t.trumpSuit, seat, t.closed);
    const next = (card: Card) => rest(play(trick, seat, card), { ...hands, [seat]: without(hands[seat], card) });
    return seat === partner ? moves.some(next) : moves.every(next);
  };

  return { wins, rest };
}

function play(trick: Trick, seat: Seat, card: Card): Trick {
  return { ...trick, cards: { ...trick.cards, [seat]: card }, order: [...trick.order, seat] };
}

/** The strict reading, for when the search runs out of budget: every card beats everything left. */
function everyCardBeatsAll(t: SawaTable): boolean {
  const others = ([0, 1, 2, 3] as Seat[]).filter((s) => s !== t.claimer).flatMap((s) => t.hands[s].map((card) => ({ seat: s, card })));
  return t.hands[t.claimer].every((mine) =>
    others.every(({ seat, card }) => {
      // Anyone still holding a trump can cut a side-suit card once they run out of its suit.
      if (t.mode === "hokum" && card.suit === t.trumpSuit && mine.suit !== t.trumpSuit) return false;
      if (card.suit !== mine.suit) return true;
      const trick: Trick = { leader: t.claimer, order: [t.claimer, seat], cards: { [t.claimer]: mine, [seat]: card }, rules: t.rules };
      return currentWinner(trick, t.mode, t.trumpSuit) === t.claimer;
    }),
  );
}

/** Is the claim right? (The claimer is about to lead.) */
export function sawaHolds(t: SawaTable): boolean {
  try {
    return makeSolver(t).wins(t.hands);
  } catch (e) {
    if (e instanceof Budget) return everyCardBeatsAll(t);
    throw e;
  }
}

/**
 * The card to play next in a right السوا, for the claimer (leading) or the partner (following):
 * one that keeps every remaining trick safe. Undefined when none does (the claim was wrong, or
 * the opponents' cards have since made it so), and the caller plays on as usual.
 */
export function sawaMove(t: SawaTable, trick: Trick, seat: Seat): Card | undefined {
  try {
    const solver = makeSolver(t);
    const moves = legalMoves(t.hands[seat], trick, t.mode, t.trumpSuit, seat, t.closed);
    return moves.find((card) => solver.rest(play(trick, seat, card), { ...t.hands, [seat]: without(t.hands[seat], card) }));
  } catch (e) {
    if (e instanceof Budget) return undefined;
    throw e;
  }
}
