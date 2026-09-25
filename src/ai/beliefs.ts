import { cardId, cardPoints, isTrumpCard, rankStrength } from "../engine/cards";
import { currentWinner } from "../engine/trick";
import { teamOf } from "../engine/types";
import { SUITS, type Card, type Mode, type Seat, type Suit, type Trick } from "../engine/types";

/**
 * What a seat can infer from the table so far (docs/baloot-guide.md §4): which cards are gone,
 * who is void in what, and what each seat has told its partner.
 */
export interface Beliefs {
  played: Card[];
  /** voids[seat][suit] — that seat failed to follow the suit, so it holds none of it. */
  voids: Record<Seat, Record<Suit, boolean>>;
  /** Suits a seat asked its partner for (التهريب §4أ, the 10 on the partner's Ace §4ب.4), latest first. */
  wants: Record<Seat, Suit[]>;
  /** Suits a seat discarded from without climbing: it doesn't want them led (§4أ). */
  rejects: Record<Seat, Suit[]>;
  /**
   * برقية: a seat threw an Ace onto a trick its partner was already winning. It means "take
   * this one, then come back to me in this suit" — the sender holds every trick that's left.
   */
  barqiya: Record<Seat, Suit[]>;
  /** A seat's strength (§4ب): the first suit it led, and suits it took a trick in by following. */
  strong: Record<Seat, Suit[]>;
  /** The discards each seat meant as messages, in order. */
  discards: Record<Seat, Discard[]>;
}

/** أخو اللون: the other suit of the same colour (♥/♦ red, ♠/♣ black). */
export const BROTHER: Record<Suit, Suit> = { H: "D", D: "H", S: "C", C: "S" };
const RED = (s: Suit) => s === "H" || s === "D";
const otherColour = (s: Suit): Suit[] => (RED(s) ? ["S", "C"] : ["H", "D"]);

const emptyBySuit = (): Record<Suit, boolean> => ({ S: false, H: false, D: false, C: false });
const bySeat = <T>(make: () => T): Record<Seat, T> => ({ 0: make(), 1: make(), 2: make(), 3: make() });

/** One discard, as the table reads it. */
export interface Discard {
  card: Card;
  led: Suit;
}

/**
 * Reads a seat's discards the way the video (شرح تهريب البلوت) teaches:
 * - climbing in one suit (7 then 8 then بنت…) asks for that suit, and overrides the rest;
 * - otherwise the discarded suit isn't wanted, and:
 *   - a discard of the led suit's brother asks for the other colour;
 *   - discards from both suits of one colour ask for the other colour;
 *   - any other discard asks for its brother (هرّب ديمن = يبي هاص).
 */
export function readDiscards(discards: Discard[]): { wants: Suit[]; rejects: Suit[] } {
  const bySuit: Record<Suit, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const d of discards) bySuit[d.card.suit].push(d.card);
  const climbing = (s: Suit) =>
    bySuit[s].length >= 2 && bySuit[s].every((c, i) => i === 0 || rankStrength(c, "sun") > rankStrength(bySuit[s][i - 1], "sun"));

  const rejects = SUITS.filter((s) => bySuit[s].length > 0 && !climbing(s));
  const wants: Suit[] = [];
  const add = (s: Suit) => {
    if (!wants.includes(s)) wants.push(s);
  };
  // Latest message first.
  for (const d of [...discards].reverse()) {
    const s = d.card.suit;
    if (climbing(s)) add(s);
    else if (d.led === BROTHER[s]) otherColour(s).forEach(add);
    else if (bySuit[BROTHER[s]].length > 0 && !climbing(BROTHER[s])) otherColour(s).forEach(add);
    else add(BROTHER[s]);
  }
  return { wants: wants.filter((s) => !rejects.includes(s) && !discards.some((d) => d.led === s)), rejects };
}

export function buildBeliefs(tricks: Trick[], current: Trick | undefined, mode: Mode, trumpSuit?: Suit): Beliefs {
  const beliefs: Beliefs = {
    played: [],
    voids: bySeat(emptyBySuit),
    wants: bySeat(() => []),
    rejects: bySeat(() => []),
    barqiya: bySeat(() => []),
    strong: bySeat(() => []),
    discards: bySeat(() => []),
  };
  const discards = beliefs.discards;
  const tenAsks: Record<Seat, Suit[]> = bySeat(() => []);
  const all = current ? [...tricks, current] : tricks;
  all.forEach((trick, index) => {
    if (trick.order.length === 0) return;
    const ledCard = trick.cards[trick.order[0]]!;
    const led = ledCard.suit;
    const leader = trick.order[0];
    if (!beliefs.strong[leader].length) beliefs.strong[leader].push(led);
    trick.order.forEach((seat, i) => {
      const card = trick.cards[seat]!;
      beliefs.played.push(card);
      const before: Trick = { leader: trick.leader, order: trick.order.slice(0, i), cards: trick.cards, rules: trick.rules };
      if (card.suit === led) {
        // In the middle of the hand, a 10 on the partner's Ace says "I want this suit" (§4ب.4).
        if (i > 0 && index >= 2 && card.rank === "10" && ledCard.rank === "A" && teamOf(leader) === teamOf(seat) && !isTrumpCard(card, mode, trumpSuit)) {
          if (!tenAsks[seat].includes(led)) tenAsks[seat].unshift(led);
        }
        return;
      }
      beliefs.voids[seat][led] = true;
      if (mode === "hokum" && card.suit === trumpSuit) return; // a ruff, not a signal
      const winner = i > 0 ? currentWinner(before, mode, trumpSuit) : seat;
      const partnerHasIt = winner !== seat && teamOf(winner) === teamOf(seat);
      if (card.rank === "A" && !isTrumpCard(card, mode, trumpSuit) && partnerHasIt) {
        if (!beliefs.barqiya[seat].includes(card.suit)) beliefs.barqiya[seat].push(card.suit);
        return;
      }
      // A 10 fed onto the partner's trick is support (دعم الخوي), not a message.
      if (partnerHasIt && cardPoints(card, "sun") >= 10) return;
      discards[seat].push({ card, led });
    });
    // صنع: a seat that took the trick by following suit (not its own lead) is strong there.
    const done = trick.order.length === 4 ? trick.winner ?? currentWinner(trick, mode, trumpSuit) : undefined;
    if (done !== undefined && done !== leader && trick.cards[done]!.suit === led && !beliefs.strong[done].includes(led)) {
      beliefs.strong[done].push(led);
    }
  });
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    const read = readDiscards(discards[seat]);
    const trumpless = (s: Suit) => !(mode === "hokum" && s === trumpSuit);
    beliefs.wants[seat] = [...tenAsks[seat], ...read.wants.filter((s) => !tenAsks[seat].includes(s))].filter(trumpless);
    beliefs.rejects[seat] = read.rejects;
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
