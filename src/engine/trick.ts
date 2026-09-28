import { cardId, isTrumpCard, rankStrength } from "./cards";
import type { Card, Mode, Seat, Suit, Trick, TrickRules } from "./types";
import { teamOf } from "./types";

interface Played {
  seat: Seat;
  card: Card;
}

function playedInOrder(trick: Trick): Played[] {
  return trick.order.map((seat) => ({ seat, card: trick.cards[seat]! }));
}

/** Whose turn it is in an unfinished trick: clockwise from the leader, a deferred seat last (آخر الكلام). */
export function turnOf(trick: Trick): Seat {
  const seats = [0, 1, 2, 3].map((k) => ((trick.leader + k) % 4) as Seat);
  const order = trick.deferred === undefined ? seats : [...seats.filter((s) => s !== trick.deferred), trick.deferred];
  return order.find((s) => !trick.order.includes(s)) ?? trick.leader;
}

const isLowCard = (c: Card | undefined) => !!c && (c.rank === "7" || c.rank === "8");

/** Resolves the winner among whatever cards have been played so far in the trick. */
export function currentWinner(trick: Trick, mode: Mode, trumpSuit?: Suit): Seat {
  // الفزعة: you and your partner both throw a small card — the trick is yours.
  const f = trick.rules?.faz3a;
  if (f !== undefined && isLowCard(trick.cards[f]) && isLowCard(trick.cards[((f + 2) % 4) as Seat])) return f;
  const played = playedInOrder(trick);
  const ledSuit = played[0].card.suit;
  const guarded = isGuarded(trick, mode, trumpSuit);
  let best = played[0];
  for (const p of played.slice(1)) {
    if (isBetter(p, best, ledSuit, mode, trumpSuit, trick.rules, guarded)) best = p;
  }
  return best.seat;
}

/**
 * How strong a played card is in this trick: a real trump beats a joker's "personal trump"
 * (ملك السبيت), which beats the led suit; anything else can't win.
 */
function tier(p: Played, ledSuit: Suit, mode: Mode, trumpSuit: Suit | undefined, rules?: TrickRules, guarded = false): number {
  // الحارسة: a guarded lead can't be cut — a trump on it is just a card thrown away.
  if (isTrumpCard(p.card, mode, trumpSuit)) return guarded ? (p.card.suit === ledSuit ? 1 : 0) : 3;
  const pt = rules?.personalTrump;
  if (pt && pt.seat === p.seat && pt.suit === p.card.suit) return 2;
  // الملكية: a stamped card counts as a trump for its holder, under a real one.
  if (hasStamp(rules, "royal", p)) return 2;
  return p.card.suit === ledSuit ? 1 : 0;
}

/** Whether `p` was played by the stamps' seat and carries that stamp. */
function hasStamp(rules: TrickRules | undefined, kind: "royal" | "guard" | "diver" | "top", p: Played): boolean {
  const st = rules?.stamps;
  return !!st && st.seat === p.seat && !!st[kind]?.includes(cardId(p.card));
}

/** الحارسة: the trick was led by the stamps' seat with a guarded card, in hokum. */
function isGuarded(trick: Trick, mode: Mode, trumpSuit: Suit | undefined): boolean {
  if (mode !== "hokum" || trick.order.length === 0) return false;
  const lead = trick.order[0];
  const card = trick.cards[lead]!;
  return !isTrumpCard(card, mode, trumpSuit) && hasStamp(trick.rules, "guard", { seat: lead, card });
}

/** الختم: a sealed card sits under every other card of its suit. */
function isSealed(card: Card, rules?: TrickRules): boolean {
  return !!rules?.sealed?.length && rules.sealed.includes(cardId(card));
}

/** A card's rank inside its own suit, with الختم applied (a sealed card counts under the 7). */
export function sealedStrength(card: Card, mode: Mode, trumpSuit: Suit | undefined, rules?: TrickRules): number {
  return isSealed(card, rules) ? -1 : rankStrength(card, mode, trumpSuit);
}

function strength(p: Played, mode: Mode, trumpSuit: Suit | undefined, rules?: TrickRules): number {
  if (isSealed(p.card, rules)) return -1;
  // الورقة الأخيرة: that seat's card counts as the top of its suit (and so does a grown الكبّارة).
  const top = rules?.topCard === p.seat || hasStamp(rules, "top", p) ? 100 : 0;
  // ثورة الصغار: only the joker holder's team, and only outside the trump suit (a trump 7 over the
  // trump Jack would make every hokum a walkover).
  const low =
    rules?.trashBeatsAce !== undefined &&
    teamOf(p.seat) === rules.trashBeatsAce &&
    (p.card.rank === "7" || p.card.rank === "8" || (!!rules.trashNine && p.card.rank === "9")) &&
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

function isBetter(candidate: Played, current: Played, ledSuit: Suit, mode: Mode, trumpSuit?: Suit, rules?: TrickRules, guarded = false): boolean {
  const a = tier(candidate, ledSuit, mode, trumpSuit, rules, guarded);
  const b = tier(current, ledSuit, mode, trumpSuit, rules, guarded);
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
  const seat = turnOf(trick);
  return isBetter({ seat, card }, { seat: winnerSeat, card: trick.cards[winnerSeat]! }, ledSuit, mode, trumpSuit, trick.rules, isGuarded(trick, mode, trumpSuit));
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
  const legal = baseLegalMoves(hand, trick, mode, trumpSuit, seat, closed);
  // الغطّاسة: the stamps' seat may play a stamped card whatever the led suit.
  const st = trick.rules?.stamps;
  if (trick.order.length === 0 || !st?.diver?.length || st.seat !== seat) return legal;
  const extra = hand.filter((c) => st.diver!.includes(cardId(c)) && !legal.some((l) => cardId(l) === cardId(c)));
  return extra.length ? [...legal, ...extra] : legal;
}

function baseLegalMoves(hand: Card[], trick: Trick, mode: Mode, trumpSuit: Suit | undefined, seat: Seat, closed: boolean): Card[] {
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
    // الطُّعم: whoever took the bait leads its suit, if they hold any.
    const forced = trick.rules?.forcedLead;
    if (forced) {
      const inSuit = lead.filter((c) => c.suit === forced);
      if (inSuit.length > 0) lead = inSuit;
    }
    return lead;
  }

  const ledSuit = trick.cards[trick.order[0]]!.suit;
  const followSuit = hand.filter((c) => c.suit === ledSuit);
  if (followSuit.length > 0) {
    // اللعب طلوع: when trumps are led, follow with a higher trump than the best one on the table
    // if you hold one.
    if (mode === "hokum" && ledSuit === trumpSuit) {
      const power = (c: Card) => sealedStrength(c, mode, trumpSuit, trick.rules);
      const best = Math.max(...playedInOrder(trick).map((p) => p.card).filter((c) => c.suit === trumpSuit).map(power));
      const higher = followSuit.filter((c) => power(c) > best);
      if (higher.length > 0) return higher;
    }
    return followSuit;
  }

  if (mode === "sun") return hand;
  // الحارسة: nobody may cut a guarded lead, so a void player just throws something.
  if (isGuarded(trick, mode, trumpSuit)) return hand;

  const trumps = hand.filter((c) => isTrumpCard(c, mode, trumpSuit));
  if (trumps.length === 0) return hand;

  const winnerSoFar = currentWinner(trick, mode, trumpSuit);
  if (teamOf(winnerSoFar) === teamOf(seat)) return hand; // partner/self already winning: free discard

  const trumpsPlayed = playedInOrder(trick)
    .map((p) => p.card)
    .filter((c) => isTrumpCard(c, mode, trumpSuit));

  if (trumpsPlayed.length === 0) return trumps; // must cut, any trump will do

  const power = (c: Card) => sealedStrength(c, mode, trumpSuit, trick.rules);
  const bestTrumpStrength = Math.max(...trumpsPlayed.map(power));
  const overtrumps = trumps.filter((c) => power(c) > bestTrumpStrength);
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


