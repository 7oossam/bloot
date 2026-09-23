import { cardId, isTrumpCard } from "../engine/cards";
import { currentWinner } from "../engine/trick";
import { teamOf } from "../engine/types";
import { SUITS, type Card, type Mode, type Seat, type Suit, type Trick } from "../engine/types";

/**
 * What a seat can infer from the table so far (docs/baloot-guide.md §4ج, §6.2):
 * which cards are gone, who is void in what, and what the partner has signalled.
 */
export interface Beliefs {
  played: Card[];
  /** voids[seat][suit] — that seat failed to follow the suit, so it holds none of it. */
  voids: Record<Seat, Record<Suit, boolean>>;
  /**
   * Suits a seat asked for with a small discard (7/8) when void: "play this to me, I hold
   * the Ace". Sun only (§4أ.1); in hokum a small discard shows a void to ruff (§4ب.1),
   * which `voids` already captures.
   */
  wants: Record<Seat, Suit[]>;
  /** Suits a seat discarded a non-small card from: weak or empty, don't lead it to them (§4أ.2). */
  rejects: Record<Seat, Suit[]>;
  /**
   * برقية: a seat threw an Ace onto a trick its partner was already winning. It means "take
   * this one, then come back to me in this suit" — the sender holds every trick that's left.
   */
  barqiya: Record<Seat, Suit[]>;
}

const emptyBySuit = (): Record<Suit, boolean> => ({ S: false, H: false, D: false, C: false });

export function buildBeliefs(tricks: Trick[], current: Trick | undefined, mode: Mode, trumpSuit?: Suit): Beliefs {
  const beliefs: Beliefs = {
    played: [],
    voids: { 0: emptyBySuit(), 1: emptyBySuit(), 2: emptyBySuit(), 3: emptyBySuit() },
    wants: { 0: [], 1: [], 2: [], 3: [] },
    rejects: { 0: [], 1: [], 2: [], 3: [] },
    barqiya: { 0: [], 1: [], 2: [], 3: [] },
  };
  for (const trick of current ? [...tricks, current] : tricks) {
    if (trick.order.length === 0) continue;
    const led = trick.cards[trick.order[0]]!.suit;
    trick.order.forEach((seat, i) => {
      const card = trick.cards[seat]!;
      beliefs.played.push(card);
      if (card.suit === led) return;
      beliefs.voids[seat][led] = true;
      if (mode === "hokum" && card.suit === trumpSuit) return; // a ruff, not a signal
      if (card.rank === "A" && !isTrumpCard(card, mode, trumpSuit)) {
        const before: Trick = { leader: trick.leader, order: trick.order.slice(0, i), cards: trick.cards };
        const winner = currentWinner(before, mode, trumpSuit);
        if (winner !== seat && teamOf(winner) === teamOf(seat)) {
          if (!beliefs.barqiya[seat].includes(card.suit)) beliefs.barqiya[seat].push(card.suit);
          return;
        }
      }
      const small = card.rank === "7" || card.rank === "8";
      const list = small && mode === "sun" ? beliefs.wants[seat] : beliefs.rejects[seat];
      if (!list.includes(card.suit)) list.push(card.suit);
    });
  }
  return beliefs;
}

/** The unplayed cards of a suit that nobody at the table can see in `hand`. */
export function outstanding(beliefs: Beliefs, hand: Card[], suit: Suit): Card[] {
  const gone = new Set([...beliefs.played, ...hand].map(cardId));
  return (["7", "8", "9", "10", "J", "Q", "K", "A"] as const)
    .map((rank) => ({ suit, rank }))
    .filter((c) => !gone.has(cardId(c)));
}

export function suitsOf(hand: Card[]): Record<Suit, Card[]> {
  const by: Record<Suit, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const c of hand) by[c.suit].push(c);
  return by;
}

export { SUITS };
