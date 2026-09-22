import type { Card, Mode, Rank, Suit } from "./types";

/**
 * Rank order, weakest→strongest, for a NON-TRUMP suit (used in Sun for every
 * suit, and in Hokum for the three suits that are not trump).
 */
const NORMAL_ORDER: readonly Rank[] = ["7", "8", "9", "J", "Q", "K", "10", "A"];

/** Rank order, weakest→strongest, for the TRUMP suit in Hokum. */
const TRUMP_ORDER: readonly Rank[] = ["7", "8", "Q", "K", "10", "A", "9", "J"];

/** Card points for a NON-TRUMP suit (Sun uses this table for every suit). */
const NORMAL_POINTS: Record<Rank, number> = {
  "7": 0,
  "8": 0,
  "9": 0,
  J: 2,
  Q: 3,
  K: 4,
  "10": 10,
  A: 11,
};

/** Card points for the TRUMP suit in Hokum. */
const TRUMP_POINTS: Record<Rank, number> = {
  "7": 0,
  "8": 0,
  Q: 3,
  K: 4,
  "10": 10,
  A: 11,
  "9": 14,
  J: 20,
};

/** Points a team banks for winning the last trick of the hand. */
export const LAST_TRICK_BONUS = 10;

/** Sun hand points count double toward the cumulative match score. */
export const MODE_MULTIPLIER: Record<Mode, number> = { hokum: 1, sun: 2 };

export function cardId(card: Card): string {
  return `${card.suit}${card.rank}`;
}

export function isTrumpCard(card: Card, mode: Mode, trumpSuit?: Suit): boolean {
  return mode === "hokum" && card.suit === trumpSuit;
}

export function cardPoints(card: Card, mode: Mode, trumpSuit?: Suit): number {
  return isTrumpCard(card, mode, trumpSuit) ? TRUMP_POINTS[card.rank] : NORMAL_POINTS[card.rank];
}

/** Strength for ordering within a single suit under the given mode. Higher wins. */
export function rankStrength(card: Card, mode: Mode, trumpSuit?: Suit): number {
  const order = isTrumpCard(card, mode, trumpSuit) ? TRUMP_ORDER : NORMAL_ORDER;
  return order.indexOf(card.rank);
}
