import { isTrumpCard, rankStrength } from "./cards";
import type { Card, Mode, Seat, Suit, Trick, TrickRules } from "./types";
import { nextSeat, teamOf } from "./types";

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
    if (isBetter(p, best, ledSuit, mode, trumpSuit, trick.rules)) best = p;
  }
  return best.seat;
}

/**
 * How strong a played card is in this trick: a real trump beats a joker's "personal trump"
 * (ملك السبيت), which beats the led suit; anything else can't win.
 */
function tier(p: Played, ledSuit: Suit, mode: Mode, trumpSuit: Suit | undefined, rules?: TrickRules): number {
  if (isTrumpCard(p.card, mode, trumpSuit)) return 3;
  const pt = rules?.personalTrump;
  if (pt && pt.seat === p.seat && pt.suit === p.card.suit) return 2;
  return p.card.suit === ledSuit ? 1 : 0;
}

function strength(p: Played, mode: Mode, trumpSuit: Suit | undefined, rules?: TrickRules): number {
  // الورقة الأخيرة: that seat's card counts as the top of its suit.
  const top = rules?.topCard === p.seat ? 100 : 0;
  // ثورة الصغار: only the joker holder's team, and only outside the trump suit (a trump 7 over the
  // trump Jack would make every hokum a walkover).
  const low =
    rules?.trashBeatsAce !== undefined &&
    teamOf(p.seat) === rules.trashBeatsAce &&
    (p.card.rank === "7" || p.card.rank === "8") &&
    !isTrumpCard(p.card, mode, trumpSuit)
      ? 50
      : 0;
  // خاطفين الولد: that team's trump Jack sits just under the trump 9.
  const jack =
    rules?.rival?.weakJack !== undefined && teamOf(p.seat) === rules.rival.weakJack && p.card.rank === "J" && isTrumpCard(p.card, mode, trumpSuit)
      ? rankStrength({ suit: p.card.suit, rank: rules.rival.jackBottom ? "7" : "9" }, mode, trumpSuit) - 0.5
      : undefined;
  return (jack ?? rankStrength(p.card, mode, trumpSuit)) + top + low;
}

function isBetter(candidate: Played, current: Played, ledSuit: Suit, mode: Mode, trumpSuit?: Suit, rules?: TrickRules): boolean {
  const a = tier(candidate, ledSuit, mode, trumpSuit, rules);
  const b = tier(current, ledSuit, mode, trumpSuit, rules);
  if (a !== b) return a > b;
  if (a === 0) return false;
  // Equal cards (a duplicated Jack): the one played first keeps it.
  return strength(candidate, mode, trumpSuit, rules) > strength(current, mode, trumpSuit, rules);
}

/** Resolves the winner of a completed (4-card) trick. */
export function resolveTrick(trick: Trick, mode: Mode, trumpSuit?: Suit): Seat {
  return currentWinner(trick, mode, trumpSuit);
}

/** Would `card` currently be winning the trick if played right now (before it's actually played)? */
export function wouldWinAgainstCurrent(card: Card, trick: Trick, mode: Mode, trumpSuit?: Suit): boolean {
  if (trick.order.length === 0) return true; // leading always "wins" so far
  const ledSuit = trick.cards[trick.order[0]]!.suit;
  const winnerSeat = currentWinner(trick, mode, trumpSuit);
  const seat = nextSeat(trick.order[trick.order.length - 1]);
  return isBetter({ seat, card }, { seat: winnerSeat, card: trick.cards[winnerSeat]! }, ledSuit, mode, trumpSuit, trick.rules);
}

/**
 * Which cards `seat` may legally play right now.
 *
 * Rules: follow the led suit if you can. If you can't, and it's Hokum and you
 * hold trump, you must trump — and if an opponent has already trumped, you must
 * overtrump (ترقيع) if you're able to; if you can't beat their trump you're free
 * to play anything, since a lower trump would be thrown away. If your own team
 * is currently winning the trick, you're free to discard anything (no obligation
 * to trump your partner's win). Sun has no trump, so a void player may discard
 * freely.
 */
export function legalMoves(
  hand: Card[],
  trick: Trick,
  mode: Mode,
  trumpSuit: Suit | undefined,
  seat: Seat,
  closed = false,
): Card[] {
  if (trick.order.length === 0) {
    let lead = hand; // leading: anything goes, but…
    // مقفل (a closed دبل): no leading a trump while holding anything else.
    if (closed && mode === "hokum") {
      const side = lead.filter((c) => !isTrumpCard(c, mode, trumpSuit));
      if (side.length > 0) lead = side;
    }
    // حرّاس الإكك (an opponent rule): this team can't lead an Ace or a 10 while holding anything else.
    if (trick.rules?.rival?.noAceLead !== undefined && teamOf(seat) === trick.rules.rival.noAceLead) {
      const noAce = lead.filter((c) => c.rank !== "A" && c.rank !== "10");
      if (noAce.length > 0) lead = noAce;
    }
    return lead;
  }

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
  return overtrumps.length > 0 ? overtrumps : hand; // must overtrump if able, else free
}

/**
 * آكه (docs/baloot-guide.md §6.1): in hokum, leading a non-trump card that is now the highest
 * one left in its suit — every card above it has already been played. It tells the partner
 * not to trump it. An Ace is left out; it's the top card anyway and nobody announces it.
 */
export function isAkka(card: Card, alreadyPlayed: Card[], mode: Mode, trumpSuit: Suit | undefined): boolean {
  if (mode !== "hokum" || card.suit === trumpSuit || card.rank === "A") return false;
  const strength = rankStrength(card, mode, trumpSuit);
  const RANKS_ABOVE = (["7", "8", "9", "J", "Q", "K", "10", "A"] as const).filter(
    (rank) => rankStrength({ suit: card.suit, rank }, mode, trumpSuit) > strength,
  );
  return RANKS_ABOVE.every((rank) => alreadyPlayed.some((c) => c.suit === card.suit && c.rank === rank));
}


