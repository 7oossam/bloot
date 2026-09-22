import { isTrumpCard, rankStrength } from "./cards";
import type { Card, Mode, Seat, Suit, Trick } from "./types";
import { teamOf } from "./types";

interface Played {
  seat: Seat;
  card: Card;
}

function playedInOrder(trick: Trick): Played[] {
  return trick.order.map((seat) => ({ seat, card: trick.cards[seat]! }));
}

/** Resolves the winner among whatever cards have been played so far in the trick. */
export function currentWinner(trick: Trick, mode: Mode, trumpSuit?: Suit): Seat {
  const played = playedInOrder(trick);
  const ledSuit = played[0].card.suit;
  let best = played[0];
  for (const p of played.slice(1)) {
    if (isBetter(p.card, best.card, ledSuit, mode, trumpSuit)) best = p;
  }
  return best.seat;
}

function isBetter(candidate: Card, current: Card, ledSuit: Suit, mode: Mode, trumpSuit?: Suit): boolean {
  const candidateTrump = isTrumpCard(candidate, mode, trumpSuit);
  const currentTrump = isTrumpCard(current, mode, trumpSuit);
  if (candidateTrump !== currentTrump) return candidateTrump; // trump always beats non-trump
  if (candidateTrump && currentTrump) {
    return rankStrength(candidate, mode, trumpSuit) > rankStrength(current, mode, trumpSuit);
  }
  // neither is trump: only the led suit can win
  if (candidate.suit !== ledSuit) return false;
  if (current.suit !== ledSuit) return true;
  return rankStrength(candidate, mode, trumpSuit) > rankStrength(current, mode, trumpSuit);
}

/** Resolves the winner of a completed (4-card) trick. */
export function resolveTrick(trick: Trick, mode: Mode, trumpSuit?: Suit): Seat {
  return currentWinner(trick, mode, trumpSuit);
}

/**
 * Which cards `seat` may legally play right now.
 *
 * Rules: follow the led suit if you can. If you can't, and it's Hokum and you
 * hold trump, you must trump — and if a trump has already been played in this
 * trick, you must overtrump it if you're able to. The one exception: if your
 * own team is currently winning the trick, you're free to discard anything
 * (no obligation to trump your partner's win). Sun has no trump, so a void
 * player may discard freely.
 */
export function legalMoves(
  hand: Card[],
  trick: Trick,
  mode: Mode,
  trumpSuit: Suit | undefined,
  seat: Seat,
): Card[] {
  if (trick.order.length === 0) return hand; // leading: anything goes

  const ledSuit = trick.cards[trick.order[0]]!.suit;
  const followSuit = hand.filter((c) => c.suit === ledSuit);
  if (followSuit.length > 0) return followSuit;

  if (mode === "sun") return hand;

  const trumps = hand.filter((c) => isTrumpCard(c, mode, trumpSuit));
  if (trumps.length === 0) return hand;

  const winnerSoFar = currentWinner(trick, mode, trumpSuit);
  if (teamOf(winnerSoFar) === teamOf(seat)) return hand; // partner/self already winning: free discard

  const trumpsPlayed = playedInOrder(trick)
    .map((p) => p.card)
    .filter((c) => isTrumpCard(c, mode, trumpSuit));

  if (trumpsPlayed.length === 0) return trumps; // must cut, any trump will do

  const bestTrumpStrength = Math.max(...trumpsPlayed.map((c) => rankStrength(c, mode, trumpSuit)));
  const overtrumps = trumps.filter((c) => rankStrength(c, mode, trumpSuit) > bestTrumpStrength);
  return overtrumps.length > 0 ? overtrumps : trumps; // must overtrump if able, else any trump
}
