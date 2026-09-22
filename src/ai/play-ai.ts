import { cardPoints, rankStrength } from "../engine/cards";
import { currentWinner, legalMoves, wouldWinAgainstCurrent } from "../engine/trick";
import { SUITS, teamOf, type Card, type Mode, type Seat, type Suit, type Trick } from "../engine/types";

/**
 * Card-play policy (game-ai utility scoring): for each legal card, prefer
 * the move that either wins cheaply, dumps points onto a trick the team
 * already has locked up, or sheds the least value when the trick is lost.
 */
export function decideCard(hand: Card[], trick: Trick, mode: Mode, trumpSuit: Suit | undefined, seat: Seat): Card {
  const legal = legalMoves(hand, trick, mode, trumpSuit, seat);
  if (legal.length === 1) return legal[0];

  if (trick.order.length === 0) {
    return chooseLead(hand, mode, trumpSuit);
  }

  const winnerSoFar = currentWinner(trick, mode, trumpSuit);
  const partnerWinning = teamOf(winnerSoFar) === teamOf(seat);

  if (partnerWinning) {
    // Team already has this trick: dump the highest-point card to bank value.
    return maxBy(legal, (c) => cardPoints(c, mode, trumpSuit));
  }

  const winningCards = legal.filter((c) => wouldWinAgainstCurrent(c, trick, mode, trumpSuit));
  if (winningCards.length > 0) {
    // Win as cheaply as possible — save strong cards for later tricks.
    return minBy(winningCards, (c) => rankStrength(c, mode, trumpSuit));
  }

  // Can't win: shed the least valuable, weakest legal card.
  return minBy(legal, (c) => cardPoints(c, mode, trumpSuit) * 10 + rankStrength(c, mode, trumpSuit));
}

function chooseLead(hand: Card[], mode: Mode, trumpSuit: Suit | undefined): Card {
  const bySuit: Record<Suit, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const card of hand) bySuit[card.suit].push(card);

  const trumpCount = trumpSuit ? bySuit[trumpSuit].length : 0;
  if (mode === "hokum" && trumpSuit && trumpCount >= 4) {
    // Holding a lot of trump: lead it to strip opponents' trumps.
    return minBy(bySuit[trumpSuit], (c) => rankStrength(c, mode, trumpSuit));
  }

  let longestSuit: Suit = SUITS[0];
  let longestCount = -1;
  for (const suit of SUITS) {
    if (mode === "hokum" && suit === trumpSuit) continue; // hold trump back unless forced above
    if (bySuit[suit].length > longestCount) {
      longestSuit = suit;
      longestCount = bySuit[suit].length;
    }
  }
  const suitCards = bySuit[longestSuit].length > 0 ? bySuit[longestSuit] : hand;
  return minBy(suitCards, (c) => rankStrength(c, mode, trumpSuit));
}

function minBy<T>(items: T[], score: (item: T) => number): T {
  return items.reduce((best, item) => (score(item) < score(best) ? item : best));
}

function maxBy<T>(items: T[], score: (item: T) => number): T {
  return items.reduce((best, item) => (score(item) > score(best) ? item : best));
}
