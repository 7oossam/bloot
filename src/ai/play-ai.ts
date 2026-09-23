import { cardPoints, isTrumpCard, rankStrength } from "../engine/cards";
import { currentWinner, legalMoves, wouldWinAgainstCurrent } from "../engine/trick";
import { SUITS, teamOf, type Card, type Mode, type Seat, type Suit, type Trick } from "../engine/types";
import { buildBeliefs, outstanding, suitsOf, type Beliefs } from "./beliefs";

/** Everything the table knows beyond the current trick, for the tactics in docs/baloot-guide.md. */
export interface PlayContext {
  tricks: Trick[];
  /** Suits أشكل asked the dealer to play (§3), if this hand came from أشكل. */
  ashkalSuits?: Suit[];
  /** The seat that bought the hand. */
  declarer?: Seat;
}

/**
 * Card-play policy. Without context it falls back to the plain "win cheaply / bank points on
 * a won trick / shed the least" rules; with the table's history it adds the guide's tactics:
 * signalling (التهريب, §4), void tracking and belief updates (§4ج), protecting the abnat (§4أ.3),
 * supporting a partner who has the trick (§4ب.2), and running a long suit (السرد, §5).
 */
export function decideCard(
  hand: Card[],
  trick: Trick,
  mode: Mode,
  trumpSuit: Suit | undefined,
  seat: Seat,
  ctx?: PlayContext,
): Card {
  const legal = legalMoves(hand, trick, mode, trumpSuit, seat);
  if (legal.length === 1) return legal[0];
  const beliefs = buildBeliefs(ctx?.tricks ?? [], trick, mode, trumpSuit);
  const partner = ((seat + 2) % 4) as Seat;

  if (trick.order.length === 0) return chooseLead(hand, mode, trumpSuit, seat, partner, beliefs, ctx);

  const winnerSoFar = currentWinner(trick, mode, trumpSuit);
  if (teamOf(winnerSoFar) === teamOf(seat)) {
    // Our side has it. Bank points only if the trick is safe (§4ب.2 دعم الخوي الماكل);
    // otherwise keep the 10s and Aces out of it (§4أ.3 حماية الأبناط).
    if (trickIsSafe(trick, winnerSoFar, seat, mode, trumpSuit, beliefs, hand)) {
      return maxBy(legal, (c) => cardPoints(c, mode, trumpSuit) * 10 - rankStrength(c, mode, trumpSuit));
    }
    return minBy(legal, (c) => cardPoints(c, mode, trumpSuit) * 10 + rankStrength(c, mode, trumpSuit));
  }

  const winningCards = legal.filter((c) => wouldWinAgainstCurrent(c, trick, mode, trumpSuit));
  if (winningCards.length > 0) {
    // Win as cheaply as possible — save strong cards for later tricks.
    return minBy(winningCards, (c) => rankStrength(c, mode, trumpSuit) + (isTrumpCard(c, mode, trumpSuit) ? 20 : 0));
  }

  // Can't win. If we're not following suit this discard is a message to the partner (§4).
  const ledSuit = trick.cards[trick.order[0]]!.suit;
  if (!legal.some((c) => c.suit === ledSuit)) return chooseDiscard(legal, hand, mode, trumpSuit);
  return minBy(legal, (c) => cardPoints(c, mode, trumpSuit) * 10 + rankStrength(c, mode, trumpSuit));
}

/**
 * التهريب: in sun, throw a 7/8 from the suit you hold the Ace in to ask for it (§4أ.1);
 * otherwise throw from the weakest suit (§4أ.2). Never a 10 or Ace if anything else will do.
 */
function chooseDiscard(legal: Card[], hand: Card[], mode: Mode, trumpSuit: Suit | undefined): Card {
  const by = suitsOf(hand);
  const nonTrump = legal.filter((c) => !isTrumpCard(c, mode, trumpSuit));
  const pool = nonTrump.length > 0 ? nonTrump : legal;

  if (mode === "sun") {
    const ask = pool.find(
      (c) => (c.rank === "7" || c.rank === "8") && by[c.suit].some((x) => x.rank === "A") && by[c.suit].length >= 2,
    );
    if (ask) return ask;
  }
  const weakness = (suit: Suit) =>
    by[suit].reduce((sum, c) => sum + cardPoints(c, mode, trumpSuit), 0) + (by[suit].some((c) => c.rank === "A") ? 30 : 0);
  return minBy(pool, (c) => weakness(c.suit) * 2 + cardPoints(c, mode, trumpSuit) * 10 + rankStrength(c, mode, trumpSuit));
}

/** Will the side currently winning keep this trick whatever the players still to come do? */
function trickIsSafe(
  trick: Trick,
  winner: Seat,
  seat: Seat,
  mode: Mode,
  trumpSuit: Suit | undefined,
  beliefs: Beliefs,
  hand: Card[],
): boolean {
  const toPlay = 4 - trick.order.length - 1; // players after me
  if (toPlay === 0) return true;
  const lastSeat = ((seat + 1) % 4) as Seat; // the one opponent still to play (I'm third)
  const ledSuit = trick.cards[trick.order[0]]!.suit;
  const best = trick.cards[winner]!;
  const higherOut = outstanding(beliefs, hand, best.suit).some((c) => rankStrength(c, mode, trumpSuit) > rankStrength(best, mode, trumpSuit));
  if (higherOut && !beliefs.voids[lastSeat][best.suit]) return false;
  // In hokum a void opponent can still ruff a non-trump winner.
  if (mode === "hokum" && !isTrumpCard(best, mode, trumpSuit) && beliefs.voids[lastSeat][ledSuit] && !beliefs.voids[lastSeat][trumpSuit!]) {
    return false;
  }
  return true;
}

function chooseLead(
  hand: Card[],
  mode: Mode,
  trumpSuit: Suit | undefined,
  seat: Seat,
  partner: Seat,
  beliefs: Beliefs,
  ctx: PlayContext | undefined,
): Card {
  const by = suitsOf(hand);
  const opponents = [((seat + 1) % 4) as Seat, ((seat + 3) % 4) as Seat];
  const isBoss = (c: Card) =>
    !outstanding(beliefs, hand, c.suit).some((o) => rankStrength(o, mode, trumpSuit) > rankStrength(c, mode, trumpSuit));
  const opponentsCanRuff = (suit: Suit) =>
    mode === "hokum" && suit !== trumpSuit && opponents.some((o) => beliefs.voids[o][suit] && !beliefs.voids[o][trumpSuit!]);
  const lowest = (cards: Card[]) => minBy(cards, (c) => cardPoints(c, mode, trumpSuit) * 10 + rankStrength(c, mode, trumpSuit));
  const sideSuits = SUITS.filter((s) => by[s].length > 0 && !(mode === "hokum" && s === trumpSuit));

  if (mode === "hokum" && trumpSuit) {
    const trumps = by[trumpSuit];
    const opponentsOutOfTrump = opponents.every((o) => beliefs.voids[o][trumpSuit]);
    const ourContract = ctx?.declarer !== undefined && teamOf(ctx.declarer) === teamOf(seat);
    // سحب الحكم: the buying side pulls trumps with the top trump while opponents may still hold some.
    if (ourContract && !opponentsOutOfTrump && trumps.length >= 2) {
      const top = maxBy(trumps, (c) => rankStrength(c, mode, trumpSuit));
      if (isBoss(top)) return top;
      if (trumps.length >= 4) return lowest(trumps);
    }
    // إظهار القاطع: the partner showed a void and still has trumps — lead that suit to be ruffed.
    const ruffFor = sideSuits.find((s) => beliefs.voids[partner][s] && !beliefs.voids[partner][trumpSuit] && !opponentsCanRuff(s));
    if (ruffFor) return lowest(by[ruffFor]);
  }

  // The partner asked for a suit — by أشكل (§3) or by a small discard (§4أ.1).
  for (const suit of [...(ctx?.ashkalSuits ?? []), ...beliefs.wants[partner]]) {
    if (by[suit].length > 0 && !opponentsCanRuff(suit)) return lowest(by[suit]);
  }

  // Cash a sure winner in a side suit that won't be ruffed.
  const bosses = sideSuits.flatMap((s) => by[s]).filter((c) => isBoss(c) && !opponentsCanRuff(c.suit));
  if (bosses.length > 0) {
    // Run the longest suit first — تسييل السرد (§5): strip, then keep leading it.
    return maxBy(bosses, (c) => by[c.suit].length * 100 + cardPoints(c, mode, trumpSuit));
  }

  // Otherwise lead low from the longest suit that no opponent can ruff and the partner hasn't rejected.
  const candidates = sideSuits.filter((s) => !opponentsCanRuff(s) && !beliefs.rejects[partner].includes(s));
  const pool = candidates.length > 0 ? candidates : sideSuits.length > 0 ? sideSuits : SUITS.filter((s) => by[s].length > 0);
  const longest = maxBy(pool, (s) => by[s].length * 10 - by[s].reduce((a, c) => a + cardPoints(c, mode, trumpSuit), 0) / 10);
  return lowest(by[longest]);
}

function minBy<T>(items: T[], score: (item: T) => number): T {
  return items.reduce((best, item) => (score(item) < score(best) ? item : best));
}

function maxBy<T>(items: T[], score: (item: T) => number): T {
  return items.reduce((best, item) => (score(item) > score(best) ? item : best));
}
