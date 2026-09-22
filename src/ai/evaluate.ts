import { cardPoints, rankStrength } from "../engine/cards";
import { SUITS, type Card, type Suit } from "../engine/types";

/**
 * Utility scoring for bidding decisions (game-ai: "continuous preference
 * evaluation" — we only see our own 5-card hand at bid time, so this is a
 * rough estimate, not a lookahead search).
 */

/** How strong this hand would be if `suit` were trump. */
export function hokumStrength(hand: Card[], suit: Suit): number {
  let score = 0;
  for (const card of hand) {
    if (card.suit === suit) {
      // Trump cards drive tricks: weight by both point value and rank control.
      score += cardPoints(card, "hokum", suit) + rankStrength(card, "hokum", suit) * 1.5;
    } else if (card.rank === "A") {
      score += 4; // an off-suit ace can still steal a trick before it's trumped
    } else if (card.rank === "10") {
      score += 1.5;
    }
  }
  // Extra trumps compound in value (control multiple tricks), not just their sum.
  const trumpCount = hand.filter((c) => c.suit === suit).length;
  if (trumpCount >= 3) score += (trumpCount - 2) * 3;
  return score;
}

/** How strong this hand would be with no trump (Sun): aces/tens and long suits matter most. */
export function sunStrength(hand: Card[]): number {
  let score = 0;
  const bySuit: Record<Suit, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const card of hand) {
    bySuit[card.suit].push(card);
    score += cardPoints(card, "sun") + rankStrength(card, "sun") * 0.5;
  }
  for (const suit of SUITS) {
    const count = bySuit[suit].length;
    if (count >= 3) score += (count - 2) * 2; // a long suit runs once opponents are out
  }
  return score;
}

/** Best hokum suit for this hand and its score, restricted to `allowedSuits`. */
export function bestHokumOption(hand: Card[], allowedSuits: readonly Suit[]): { suit: Suit; score: number } {
  let best = { suit: allowedSuits[0], score: -Infinity };
  for (const suit of allowedSuits) {
    const score = hokumStrength(hand, suit);
    if (score > best.score) best = { suit, score };
  }
  return best;
}
