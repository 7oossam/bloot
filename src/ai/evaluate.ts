import { cardPoints, rankStrength } from "../engine/cards";
import { SUITS, type Card, type Suit } from "../engine/types";

/**
 * Bid-time hand evaluation. Only our own 5 cards are known, plus the face-up ground card,
 * which goes to whoever buys (docs/baloot-guide.md §1) — so every estimate includes it.
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

/**
 * معايير شراء الصن (§3): two clear Aces, or an Ace with a سرد suit (4 cards backed by a 10 or
 * a King) — plus either the lead (الحلة) or a stopper in the other suits.
 */
export function meetsSunCriteria(hand: Card[], hasHilla: boolean): boolean {
  const aces = hand.filter((c) => c.rank === "A").length;
  const sard = SUITS.some((s) => {
    const cards = hand.filter((c) => c.suit === s);
    return cards.length >= 4 && cards.some((c) => c.rank === "10" || c.rank === "K");
  });
  if (!(aces >= 2 || (aces >= 1 && sard))) return false;
  const stoppers = SUITS.filter((s) => hand.some((c) => c.suit === s && (c.rank === "A" || c.rank === "10"))).length;
  return hasHilla || stoppers >= 2;
}

/**
 * معايير شراء الحكم (§3): at least 3 trumps including the Jack or the 9, with an outside Ace
 * or a clear chance to ruff (a void or a single card in a side suit).
 */
export function meetsHokumCriteria(hand: Card[], suit: Suit): boolean {
  const trumps = hand.filter((c) => c.suit === suit);
  if (trumps.length < 3 || !trumps.some((c) => c.rank === "J" || c.rank === "9")) return false;
  const outsideAce = hand.some((c) => c.suit !== suit && c.rank === "A");
  const shortSide = SUITS.some((s) => s !== suit && hand.filter((c) => c.suit === s).length <= 1);
  return outsideAce || shortSide;
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
