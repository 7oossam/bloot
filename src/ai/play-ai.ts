import { cardPoints, isTrumpCard, rankStrength } from "../engine/cards";
import { currentWinner, legalMoves, wouldWinAgainstCurrent } from "../engine/trick";
import { findProjects } from "../engine/projects";
import { SUITS, teamOf, type Card, type Mode, type Seat, type Suit, type Trick } from "../engine/types";
import { buildBeliefs, outstanding, readDiscards, suitsOf, type Beliefs } from "./beliefs";

/** Everything the table knows beyond the current trick, for the tactics in docs/baloot-guide.md. */
export interface PlayContext {
  tricks: Trick[];
  /** Suits أشكل asked the dealer to play (§3), if this hand came from أشكل. */
  ashkalSuits?: Suit[];
  /** The seat that bought the hand. */
  declarer?: Seat;
  /** مقفل: a closed دبل — no leading trumps while holding anything else. */
  closed?: boolean;
  /** الشايب (a partner): answers the partner's التهريب before cashing his own winners. */
  answerFirst?: boolean;
  /** الغشيم (a partner): can't read the partner's signals or برقية. */
  deaf?: boolean;
}

/**
 * Card-play policy. Without context it falls back to the plain "win cheaply / bank points on
 * a won trick / shed the least" rules; with the table's history it adds the guide's tactics:
 * signalling (التهريب, §4), void tracking and belief updates (§4د), protecting the abnat (§4أ.8),
 * supporting a partner who has the trick (§4ج.5), and running a long suit (السرد, §5).
 */
export function decideCard(
  hand: Card[],
  trick: Trick,
  mode: Mode,
  trumpSuit: Suit | undefined,
  seat: Seat,
  ctx?: PlayContext,
): Card {
  const legal = legalMoves(hand, trick, mode, trumpSuit, seat, ctx?.closed);
  if (legal.length === 1) return legal[0];
  const beliefs = buildBeliefs(ctx?.tricks ?? [], trick, mode, trumpSuit);
  const partner = ((seat + 2) % 4) as Seat;
  if (ctx?.deaf) {
    beliefs.wants[partner] = [];
    beliefs.rejects[partner] = [];
    beliefs.barqiya[partner] = [];
    beliefs.strong[partner] = [];
  }

  if (trick.order.length === 0) {
    // The defending side doesn't lead trumps (the player's rule), bar the two exceptions.
    const defending = mode === "hokum" && ctx?.declarer !== undefined && teamOf(ctx.declarer) !== teamOf(seat);
    const sideLeads = legal.filter((c) => !isTrumpCard(c, mode, trumpSuit));
    const pool = defending && sideLeads.length > 0 && !defenderMayLeadTrump(hand, mode, trumpSuit, beliefs) ? sideLeads : hand;
    const lead = chooseLead(pool, mode, trumpSuit, seat, partner, beliefs, ctx);
    // مقفل can rule out the trump lead the tactics wanted; pick again among what's allowed.
    return legal.some((c) => c.suit === lead.suit && c.rank === lead.rank)
      ? lead
      : chooseLead(legal, mode, trumpSuit, seat, partner, beliefs, ctx);
  }

  const winnerSoFar = currentWinner(trick, mode, trumpSuit);
  if (teamOf(winnerSoFar) === teamOf(seat)) {
    // Our side has it: never ruff the partner's trick — the rules don't force it — and when
    // it's safe, don't beat their card either; just feed it points.
    const ledIsTrump = isTrumpCard(trick.cards[trick.order[0]]!, mode, trumpSuit);
    const noRuff = legal.filter((c) => ledIsTrump || !isTrumpCard(c, mode, trumpSuit));
    const pool = noRuff.length > 0 ? noRuff : legal;
    const safe = trickIsSafe(trick, winnerSoFar, seat, mode, trumpSuit, beliefs, hand);
    const ledCard = trick.cards[trick.order[0]]!;
    const ledSuit = ledCard.suit;
    const discarding = !legal.some((c) => c.suit === ledSuit);

    // The partner led an Ace: early on, give them the 10 so they keep cashing; later, the 10
    // says "I want this suit", so it goes only with the شايب behind it (§4ب.4).
    if (!discarding && trick.leader === partner && winnerSoFar === partner && ledCard.rank === "A" && !isTrumpCard(ledCard, mode, trumpSuit)) {
      const ten = legal.find((c) => c.rank === "10");
      const early = (ctx?.tricks.length ?? 0) <= 1;
      if (ten && safe && (early || hand.some((c) => c.suit === ledSuit && c.rank === "K"))) return ten;
    }
    // The partner led and an opponent still plays after me: go in with my biggest card of the
    // suit to force the last player to spend a big one — or take it (§4ب.2). Not an Ace:
    // that's never fed to a winning partner.
    if (!discarding && !safe && trick.leader === partner && trick.order.length === 2) {
      const over = legal.filter((c) => c.rank !== "A" && !isTrumpCard(c, mode, trumpSuit) && wouldWinAgainstCurrent(c, trick, mode, trumpSuit));
      if (over.length > 0) return maxBy(over, (c) => rankStrength(c, mode, trumpSuit));
    }

    // برقية: an Ace thrown on the partner's trick says "come back to me in this suit" — only
    // when every card left after it is a sure winner.
    if (safe && discarding) {
      const barqiya = barqiyaAce(pool, hand, mode, trumpSuit, seat, beliefs);
      if (barqiya) return barqiya;
    }
    // Otherwise keep the strength: Aces and sure winners are how we get the lead back once
    // the partner's tricks run out, so they're never fed to the partner or thrown away.
    // An Ace is kept above any other winner: it only goes as a برقية.
    const cost = (c: Card) =>
      (isTrumpCard(c, mode, trumpSuit) ? 1000 : 0) +
      (c.rank === "A" ? 800 : isBoss(c, hand, beliefs, mode, trumpSuit) ? 500 : 0);
    // Bank points only if the trick is safe (§4ج.5 دعم الخوي الماكل); otherwise keep the 10s
    // and Aces out of it (§4أ.8 حماية الأبناط).
    // Holding a suit to ask for, the discard is a message first (the player's rule): the low
    // card of its brother says "come here" — a 10 thrown from the suit itself would say the
    // opposite. The points can wait for a later trick.
    if (safe && discarding && hasSuitToAsk(hand, ledSuit, mode, trumpSuit, beliefs)) {
      return chooseDiscard(pool, hand, mode, trumpSuit, seat, ledSuit, beliefs, ctx);
    }
    if (safe) {
      const under = pool.filter((c) => winnerSoFar === seat || !wouldWinAgainstCurrent(c, trick, mode, trumpSuit));
      const feed = maxBy(under.length > 0 ? under : pool, (c) => cardPoints(c, mode, trumpSuit) * 10 - rankStrength(c, mode, trumpSuit) - cost(c));
      // A 10 fed to the partner is support; anything smaller thrown off-suit is read as التهريب.
      if (discarding && cardPoints(feed, mode, trumpSuit) < 10) return chooseDiscard(pool, hand, mode, trumpSuit, seat, ledSuit, beliefs, ctx);
      return feed;
    }
    if (discarding) return chooseDiscard(pool, hand, mode, trumpSuit, seat, ledSuit, beliefs, ctx);
    return minBy(pool, (c) => cardPoints(c, mode, trumpSuit) * 10 + rankStrength(c, mode, trumpSuit) + cost(c));
  }

  const winningCards = legal.filter((c) => wouldWinAgainstCurrent(c, trick, mode, trumpSuit));
  if (winningCards.length > 0) {
    // Win as cheaply as possible — save strong cards for later tricks.
    return minBy(winningCards, (c) => rankStrength(c, mode, trumpSuit) + (isTrumpCard(c, mode, trumpSuit) ? 20 : 0));
  }

  // Can't win. If we're not following suit this discard is a message to the partner (§4) — and
  // whatever goes is theirs, so no points.
  const ledSuit = trick.cards[trick.order[0]]!.suit;
  if (!legal.some((c) => c.suit === ledSuit)) return chooseDiscard(legal, hand, mode, trumpSuit, seat, ledSuit, beliefs, ctx, true);
  return minBy(legal, (c) => cardPoints(c, mode, trumpSuit) * 10 + rankStrength(c, mode, trumpSuit));
}

/**
 * التهريب (§4أ): pick the discard whose reading asks the partner for my strongest suit — its
 * brother, the other colour, or the next step up a climb in it — and never one that says I
 * don't want it. Aces and sure winners stay in hand, a 10 is never left bare (لا تعلّق
 * عشرتك), and in hokum the buyer doesn't throw a side suit's last card (مقطوعك).
 */
function chooseDiscard(
  legal: Card[],
  hand: Card[],
  mode: Mode,
  trumpSuit: Suit | undefined,
  seat: Seat,
  led: Suit,
  beliefs: Beliefs,
  ctx: PlayContext | undefined,
  feedingThem = false,
): Card {
  const by = suitsOf(hand);
  const nonTrump = legal.filter((c) => !isTrumpCard(c, mode, trumpSuit));
  const pool = nonTrump.length > 0 ? nonTrump : legal;
  const boss = (c: Card) => isBoss(c, hand, beliefs, mode, trumpSuit);

  // The suit to ask for: where I hold sure winners (an Ace, or the top card still out).
  const strength = (s: Suit) => by[s].filter(boss).length * 3 + (by[s].some((c) => c.rank === "A") ? 3 : 0) + by[s].length;
  const askable = SUITS.filter((s) => s !== led && by[s].some(boss) && !(mode === "hokum" && s === trumpSuit));
  const want = askable.length > 0 ? maxBy(askable, strength) : undefined;

  const weakness = (suit: Suit) =>
    by[suit].reduce((sum, c) => sum + cardPoints(c, mode, trumpSuit), 0) + (by[suit].some((c) => c.rank === "A") ? 30 : 0);
  const cost = (c: Card) => {
    const rest = by[c.suit].filter((x) => x !== c);
    // Points thrown into the other side's trick are gone for sure — worth more than any worry
    // about what's left behind (a 10 thrown away to keep it from being bare is still a 10 lost).
    let score = weakness(c.suit) * 2 + cardPoints(c, mode, trumpSuit) * (feedingThem ? 40 : 10) + rankStrength(c, mode, trumpSuit);
    // Sure winners stay in hand: they're the way back in later.
    score += c.rank === "A" ? 500 : boss(c) ? 400 : 0;
    // لا تعلّق عشرتك: don't throw the card guarding a 10 you hold without its Ace.
    // Onto your own side's trick the message comes first — the small card now, the 10 fed in a
    // later trick (the player's note) — so there the worry weighs less than the 10 itself.
    if (rest.length === 1 && rest[0].rank === "10" && !beliefs.played.some((x) => x.suit === c.suit && x.rank === "A")) score += feedingThem ? 300 : 40;
    // مقطوعك: the hokum buyer keeps a card in each side suit so he isn't forced to ruff away his trumps.
    if (mode === "hokum" && ctx?.declarer === seat && rest.length === 0 && c.suit !== trumpSuit) score += 200;
    if (want) {
      const read = readDiscards([...beliefs.discards[seat], { card: c, led }]);
      // Exactly that suit (its brother, or a climb) beats "the other colour".
      if (read.wants[0] === want) score -= read.wants.length === 1 ? 60 : 50;
      else if (read.wants.includes(want)) score -= 20;
      if (read.rejects.includes(want)) score += 60;
    }
    return score;
  };
  return minBy(pool, cost);
}

/** A side suit (not the led one) where this hand holds a sure winner: something to ask for. */
function hasSuitToAsk(hand: Card[], led: Suit, mode: Mode, trumpSuit: Suit | undefined, beliefs: Beliefs): boolean {
  return hand.some((c) => c.suit !== led && !(mode === "hokum" && c.suit === trumpSuit) && isBoss(c, hand, beliefs, mode, trumpSuit));
}

/**
 * حل الحكم من غير المشتري: the side that didn't buy the hokum doesn't lead trumps — it only
 * pulls its own cuts and helps the buyer. The exceptions (the player's words): a strong hokum
 * of your own — 4+ trumps, or 3 with the ولد or the تسعة — that wants the buyer's big trumps
 * down so yours rule; or a very strong sun-like hand (4+ sure side-suit winners) that would
 * beat the buy once the trumps are gone. (A lone trump Ace led into the buyer is neither.)
 */
export function defenderMayLeadTrump(hand: Card[], mode: Mode, trumpSuit: Suit | undefined, beliefs: Beliefs): boolean {
  if (mode !== "hokum" || !trumpSuit) return true;
  const trumps = hand.filter((c) => c.suit === trumpSuit);
  if (trumps.length >= 4) return true;
  if (trumps.length === 3 && trumps.some((c) => c.rank === "J" || c.rank === "9")) return true;
  const sideWinners = hand.filter((c) => c.suit !== trumpSuit && isBoss(c, hand, beliefs, mode, trumpSuit)).length;
  return trumps.length > 0 && sideWinners >= 4;
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

  // Going to the partner, go with the biggest card of the suit: it clears the way for their
  // cards and they eat more (§4أ.6).
  const highest = (cards: Card[]) => maxBy(cards, (c) => rankStrength(c, mode, trumpSuit));

  // The partner sent a برقية: they hold the rest — stop everything and give them the lead there.
  for (const suit of beliefs.barqiya[partner]) {
    if (by[suit].length > 0) return highest(by[suit]);
  }
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
    // ربّع لخويك: the partner bought — lead the 10 to drop the Ace under their ولد, or the 9
    // from شايب-9 so a weak partner can come back for another round (§4ج.1).
    if (ctx?.declarer === partner && !opponentsOutOfTrump && !beliefs.voids[partner][trumpSuit]) {
      const ten = trumps.find((c) => c.rank === "10");
      if (ten) return ten;
      const nine = trumps.find((c) => c.rank === "9");
      if (nine && trumps.length >= 2) return nine;
    }
    // إظهار القاطع: the partner showed a void and still has trumps — lead that suit to be ruffed.
    const ruffFor = sideSuits.find((s) => beliefs.voids[partner][s] && !beliefs.voids[partner][trumpSuit] && !opponentsCanRuff(s));
    if (ruffFor) return lowest(by[ruffFor]);
  }

  // The partner asked for a suit by أشكل (§3).
  for (const suit of ctx?.ashkalSuits ?? []) {
    if (by[suit].length > 0 && !opponentsCanRuff(suit)) return highest(by[suit]);
  }

  // حل مشروعك: the hand's first lead comes from the project's suit, so the partner knows where
  // the strength is and comes back to it (§4ب.1).
  if (ctx && ctx.tricks.length === 0) {
    const run = findProjects(hand, mode, seat).find((p) => p.cards.every((c) => c.suit === p.cards[0].suit));
    // Lead low to draw the big card out — unless the run's top is already the boss: cash it.
    if (run) {
      const suit = run.cards[0].suit;
      const top = highest(by[suit]);
      return isBoss(top) ? top : lowest(by[suit]);
    }
  }

  // The partner's strength — the first suit they led, or took a trick in — is where to go back to (§4ب.3, §4ب.5).
  for (const suit of beliefs.strong[partner]) {
    if (by[suit].length > 0 && !opponentsCanRuff(suit) && !beliefs.rejects[partner].includes(suit) && !(mode === "hokum" && suit === trumpSuit)) {
      return highest(by[suit]);
    }
  }

  // الشايب answers your signal before his own winners.
  if (ctx?.answerFirst) {
    for (const suit of beliefs.wants[partner]) {
      if (by[suit].length > 0 && !opponentsCanRuff(suit)) return highest(by[suit]);
    }
  }

  // Cash a sure winner in a side suit that won't be ruffed.
  const bosses = sideSuits.flatMap((s) => by[s]).filter((c) => isBoss(c) && !opponentsCanRuff(c.suit));
  if (bosses.length > 0) {
    // Run the longest suit first — تسييل السرد (§5): strip, then keep leading it.
    return maxBy(bosses, (c) => by[c.suit].length * 100 + cardPoints(c, mode, trumpSuit));
  }

  // No winners of my own: go to the partner in the suit their التهريب asks for (§4أ).
  for (const suit of beliefs.wants[partner]) {
    if (by[suit].length > 0 && !opponentsCanRuff(suit)) return highest(by[suit]);
  }

  // Otherwise lead low from the longest suit that no opponent can ruff and the partner hasn't rejected.
  const candidates = sideSuits.filter((s) => !opponentsCanRuff(s) && !beliefs.rejects[partner].includes(s));
  const pool = candidates.length > 0 ? candidates : sideSuits.length > 0 ? sideSuits : SUITS.filter((s) => by[s].length > 0);
  const longest = maxBy(pool, (s) => by[s].length * 10 - by[s].reduce((a, c) => a + cardPoints(c, mode, trumpSuit), 0) / 10);
  return lowest(by[longest]);
}

/** No card still out in this suit beats it — it wins whenever it's led (bar a ruff). */
export function isBoss(card: Card, hand: Card[], beliefs: Beliefs, mode: Mode, trumpSuit: Suit | undefined): boolean {
  return !outstanding(beliefs, hand, card.suit).some((o) => rankStrength(o, mode, trumpSuit) > rankStrength(card, mode, trumpSuit));
}

/**
 * The Ace to throw as a برقية, if this hand can promise every trick after it: with the Ace
 * gone, every card left must be the top card still out in its suit, and in hokum a side-suit
 * card only counts once neither opponent can have a trump left.
 */
function barqiyaAce(pool: Card[], hand: Card[], mode: Mode, trumpSuit: Suit | undefined, seat: Seat, beliefs: Beliefs): Card | undefined {
  const opponents = [((seat + 1) % 4) as Seat, ((seat + 3) % 4) as Seat];
  const trumpsGone = !trumpSuit || opponents.every((o) => beliefs.voids[o][trumpSuit]) || outstanding(beliefs, hand, trumpSuit).length === 0;
  for (const ace of pool.filter((c) => c.rank === "A" && !isTrumpCard(c, mode, trumpSuit))) {
    const rest = hand.filter((c) => c !== ace);
    // A message needs tricks left to promise, and cards in the Ace's suit to come back to.
    if (rest.length < 2 || !rest.some((c) => c.suit === ace.suit)) continue;
    const played = { ...beliefs, played: [...beliefs.played, ace] };
    const allWin = rest.every(
      (c) => isBoss(c, rest, played, mode, trumpSuit) && (mode === "sun" || isTrumpCard(c, mode, trumpSuit) || trumpsGone),
    );
    if (allWin) return ace;
  }
  return undefined;
}

function minBy<T>(items: T[], score: (item: T) => number): T {
  return items.reduce((best, item) => (score(item) < score(best) ? item : best));
}

function maxBy<T>(items: T[], score: (item: T) => number): T {
  return items.reduce((best, item) => (score(item) > score(best) ? item : best));
}
