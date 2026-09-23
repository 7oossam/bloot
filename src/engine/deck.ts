import { RANKS, SUITS, type BiddingResult, type Card, type Seat } from "./types";
import { shuffle } from "./rng";

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export interface InitialDeal {
  /** 5 cards per seat, dealt first. */
  hands: Record<Seat, Card[]>;
  /** The 12 remaining cards. stock[0] is shown face-up as the ground card. */
  stock: Card[];
}

/** Deals 5 cards to each of the 4 seats (20 cards), leaving 12 in the stock. */
export function dealInitial(rand: () => number = Math.random): InitialDeal {
  const deck = shuffle(buildDeck(), rand);
  const hands: Record<Seat, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  let i = 0;
  for (let round = 0; round < 5; round++) {
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      hands[seat].push(deck[i++]);
    }
  }
  const stock = deck.slice(i);
  return { hands, stock };
}

const SEAT_ORDER: readonly Seat[] = [0, 1, 2, 3];

/**
 * Completes each seat's hand to 8 cards from the 12-card stock. Whoever bought — sun or
 * hokum, first or second round — takes the face-up ground card plus 2 more from the stock;
 * everyone else gets 3.
 */
export function finalizeDeal(
  initial: InitialDeal,
  result: BiddingResult,
): Record<Seat, Card[]> {
  const hands: Record<Seat, Card[]> = {
    0: [...initial.hands[0]],
    1: [...initial.hands[1]],
    2: [...initial.hands[2]],
    3: [...initial.hands[3]],
  };
  hands[result.declarer].push(initial.stock[0]);
  let i = 1;
  for (const seat of SEAT_ORDER) {
    const count = seat === result.declarer ? 2 : 3;
    for (let n = 0; n < count; n++) hands[seat].push(initial.stock[i++]);
  }
  return hands;
}
