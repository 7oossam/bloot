import { cardPoints, isTrumpCard, rankStrength } from "../engine/cards";
import { currentWinner, legalMoves, wouldWinAgainstCurrent } from "../engine/trick";
import { SUITS, teamOf, type Card, type Mode, type Seat, type Suit, type Trick } from "../engine/types";
import { buildBeliefs, outstanding, suitsOf, type Beliefs } from "./beliefs";
import { RANK_NAME_AR, SUIT_NAME_AR } from "../scenes/cardArt";

/** Everything the table knows beyond the current trick, for the tactics in docs/baloot-guide.md. */
export interface PlayContext {
  tricks: Trick[];
  /** Suits أشكل asked the dealer to play (§3), if this hand came from أشكل. */
  ashkalSuits?: Suit[];
  /** The seat that bought the hand. */
  declarer?: Seat;
  /** مقفل: a closed دبل — no leading trumps while holding anything else. */
  closed?: boolean;
  /**
   * المترجم: suits the partner signalled (discarded from), latest first. With it this seat reads
   * every discard as "lead me this suit" and answers before anything else but a برقية.
   */
  partnerAsks?: Suit[];
  /** When given, each decision adds a one-line reason (Arabic) — for the AI exam, not for play. */
  explain?: string[];
  /**
   * Set by the AI when its lead answered the partner by convention (a برقية, a signal, the
   * partner's hokum, the brother suit). The search AI never overrides such a lead.
   */
  followedConvention?: boolean;
}

const name = (c: Card) => `${RANK_NAME_AR[c.rank]} ${SUIT_NAME_AR[c.suit]}`;
function note(ctx: PlayContext | undefined, card: Card, why: string): Card {
  ctx?.explain?.push(why);
  return card;
}
/** A lead that answers the partner by convention: noted, and marked so the search keeps it. */
function convention(ctx: PlayContext | undefined, card: Card, why: string): Card {
  if (ctx) ctx.followedConvention = true;
  return note(ctx, card, why);
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
  const legal = legalMoves(hand, trick, mode, trumpSuit, seat, ctx?.closed);
  if (legal.length === 1) return note(ctx, legal[0], "ما عندي غيرها مسموحة.");
  const beliefs = buildBeliefs(ctx?.tricks ?? [], trick, mode, trumpSuit);
  const partner = ((seat + 2) % 4) as Seat;

  if (trick.order.length === 0) {
    const lead = chooseLead(hand, mode, trumpSuit, seat, partner, beliefs, ctx);
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
    const ledSuit = trick.cards[trick.order[0]]!.suit;
    const discarding = !legal.some((c) => c.suit === ledSuit);

    // برقية: an Ace thrown on the partner's trick says "come back to me in this suit" — only
    // when every card left after it is a sure winner.
    if (safe && discarding) {
      const barqiya = barqiyaAce(pool, hand, mode, trumpSuit, seat, beliefs);
      if (barqiya) return note(ctx, barqiya, `برقية: أرمي ${name(barqiya)} على أكلة خويي — كل ورقة باقية عندي أكيدة، فأقول له "ارجع لي بالـ${SUIT_NAME_AR[barqiya.suit]}".`);
    }
    // Otherwise keep the strength: Aces and sure winners are how we get the lead back once
    // the partner's tricks run out, so they're never fed to the partner or thrown away.
    // An Ace is kept above any other winner: it only goes as a برقية.
    const cost = (c: Card) =>
      (isTrumpCard(c, mode, trumpSuit) ? 1000 : 0) +
      (c.rank === "A" ? 800 : isBoss(c, hand, beliefs, mode, trumpSuit) ? 500 : 0);
    // Bank points only if the trick is safe (§4ب.2 دعم الخوي الماكل); otherwise keep the 10s
    // and Aces out of it (§4أ.3 حماية الأبناط).
    if (safe) {
      const under = pool.filter((c) => winnerSoFar === seat || !wouldWinAgainstCurrent(c, trick, mode, trumpSuit));
      const card = maxBy(under.length > 0 ? under : pool, (c) => cardPoints(c, mode, trumpSuit) * 10 - rankStrength(c, mode, trumpSuit) - cost(c));
      return note(ctx, card, `الأكلة لخويي ومضمونة — أعطيه أبناط بـ${name(card)} (دعم الخوي الماكل)، وأحتفظ بالإكك والأوراق الأكيدة.`);
    }
    const card = minBy(pool, (c) => cardPoints(c, mode, trumpSuit) * 10 + rankStrength(c, mode, trumpSuit) + cost(c));
    return note(ctx, card, `الأكلة لخويي لكنها مو مضمونة — أرمي أقل شي (${name(card)}) وأحمي أبناطي.`);
  }

  const winningCards = legal.filter((c) => wouldWinAgainstCurrent(c, trick, mode, trumpSuit));
  if (winningCards.length > 0) {
    // Win as cheaply as possible — save strong cards for later tricks.
    const card = minBy(winningCards, (c) => rankStrength(c, mode, trumpSuit) + (isTrumpCard(c, mode, trumpSuit) ? 20 : 0));
    return note(ctx, card, `أقدر آكل — آكل بأرخص ورقة تاكل (${name(card)}) وأحتفظ بالكبار لبعدين.`);
  }

  // Can't win. If we're not following suit this discard is a message to the partner (§4).
  const ledSuit = trick.cards[trick.order[0]]!.suit;
  if (!legal.some((c) => c.suit === ledSuit)) return chooseDiscard(legal, hand, mode, trumpSuit, beliefs, ctx);
  const card = minBy(legal, (c) => cardPoints(c, mode, trumpSuit) * 10 + rankStrength(c, mode, trumpSuit));
  return note(ctx, card, `ما أقدر آكل — أنزل أقل ورقة من اللون (${name(card)}) عشان ما أعطيهم أبناط.`);
}

/**
 * التهريب: in sun, throw a 7/8 from the suit you hold the Ace in to ask for it (§4أ.1);
 * otherwise throw from the weakest suit (§4أ.2). Never a 10 or Ace if anything else will do.
 */
function chooseDiscard(legal: Card[], hand: Card[], mode: Mode, trumpSuit: Suit | undefined, beliefs: Beliefs, ctx?: PlayContext): Card {
  const by = suitsOf(hand);
  const nonTrump = legal.filter((c) => !isTrumpCard(c, mode, trumpSuit));
  const pool = nonTrump.length > 0 ? nonTrump : legal;

  if (mode === "sun") {
    const ask = pool.find(
      (c) => (c.rank === "7" || c.rank === "8") && by[c.suit].some((x) => x.rank === "A") && by[c.suit].length >= 2,
    );
    if (ask) return note(ctx, ask, `تهريب: أرمي ${name(ask)} صغيرة من لون عندي إكته — أطلب من خويي يلعب لي ${SUIT_NAME_AR[ask.suit]}.`);
  }
  const weakness = (suit: Suit) =>
    by[suit].reduce((sum, c) => sum + cardPoints(c, mode, trumpSuit), 0) + (by[suit].some((c) => c.rank === "A") ? 30 : 0);
  // Sure winners stay in hand: they're the way back in later.
  const keep = (c: Card) => (c.rank === "A" ? 500 : isBoss(c, hand, beliefs, mode, trumpSuit) ? 400 : 0);
  const card = minBy(pool, (c) => weakness(c.suit) * 2 + cardPoints(c, mode, trumpSuit) * 10 + rankStrength(c, mode, trumpSuit) + keep(c));
  return note(ctx, card, `ما عندي من اللون — أرمي ${name(card)} من أضعف لون عندي (تنفير: لا تلعب لي ${SUIT_NAME_AR[card.suit]}).`);
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

  // The partner sent a برقية: they hold the rest — give them the lead in that suit.
  for (const suit of beliefs.barqiya[partner]) {
    if (by[suit].length > 0) return convention(ctx, lowest(by[suit]), `خويي أرسل برقية في ${SUIT_NAME_AR[suit]} — يعني الباقي كله عنده، أرجع له بأصغر ${SUIT_NAME_AR[suit]}.`);
  }
  // المترجم: answer the partner's last signal first.
  for (const suit of ctx?.partnerAsks ?? []) {
    if (by[suit].length > 0) return convention(ctx, lowest(by[suit]), `المترجم: خويي هرّب ${SUIT_NAME_AR[suit]} — ألعب له منه.`);
  }

  // The partner discarded from both suits of one colour: he wants the other colour. Of those
  // suits, prefer one the opponents have been throwing away (they're weak there).
  const colour = beliefs.wantsColor[partner].filter((s) => by[s].length > 0 && !opponentsCanRuff(s));
  if (colour.length > 0) {
    const oppThrew = (s: Suit) => opponents.some((o) => beliefs.rejects[o].includes(s) || beliefs.wants[o].includes(s));
    const suit = maxBy(colour, (s) => (oppThrew(s) ? 100 : 0) + by[s].length);
    const other = beliefs.wantsColor[partner].map((x) => SUIT_NAME_AR[x]).join(" أو ");
    return convention(ctx, lowest(by[suit]), `خويي هرّب من اللونين الثانيين (نوعين ${suit === "S" || suit === "C" ? "أحمر" : "أسود"}) — يبي ${other}. أرجع له ${SUIT_NAME_AR[suit]}${oppThrew(suit) ? "، والخصم يرمي منه (ضعيف فيه)" : ""}.`);
  }

  if (mode === "hokum" && trumpSuit) {
    const trumps = by[trumpSuit];
    const opponentsOutOfTrump = opponents.every((o) => beliefs.voids[o][trumpSuit]);
    // خويي مشتري حكم والحلة عندي: ألعب حكم أول شيء، أكبر شيء عندي (the player's rule).
    if (ctx?.declarer === partner && trumps.length > 0 && !opponentsOutOfTrump && outstanding(beliefs, hand, trumpSuit).length > 0) {
      const top = maxBy(trumps, (c) => rankStrength(c, mode, trumpSuit));
      return convention(ctx, top, `خويي مشتري حكم ${SUIT_NAME_AR[trumpSuit]} — ألعب له حكم أول شيء وبأكبر حكم عندي (${name(top)}) أساعده يسحب حكم الخصم.`);
    }
    const ourContract = ctx?.declarer !== undefined && teamOf(ctx.declarer) === teamOf(seat);
    // سحب الحكم: the buying side pulls trumps with the top trump while opponents may still hold some.
    if (ourContract && !opponentsOutOfTrump && trumps.length >= 2) {
      const top = maxBy(trumps, (c) => rankStrength(c, mode, trumpSuit));
      if (isBoss(top)) return note(ctx, top, `الحكم لنا والخصم عنده حكم — أسحب الحكم بـ${name(top)} (أكبر حكم باقي) عشان ما يقطعون أوراقنا.`);
      if (trumps.length >= 4) return note(ctx, lowest(trumps), `الحكم لنا وعندي ${trumps.length} حكم — أسحب الحكم بالصغير وأخلي الكبار.`);
    }
    // إظهار القاطع: the partner showed a void and still has trumps — lead that suit to be ruffed.
    const ruffFor = sideSuits.find((s) => beliefs.voids[partner][s] && !beliefs.voids[partner][trumpSuit] && !opponentsCanRuff(s));
    if (ruffFor) return note(ctx, lowest(by[ruffFor]), `خويي فاضي من ${SUIT_NAME_AR[ruffFor]} وعنده حكم — ألعب له منه يقطعه (إظهار القاطع).`);
  }

  // The partner asked for a suit — by أشكل (§3) or by a small discard (§4أ.1).
  for (const suit of [...(ctx?.ashkalSuits ?? []), ...beliefs.wants[partner]]) {
    if (by[suit].length > 0 && !opponentsCanRuff(suit)) {
      const how = ctx?.ashkalSuits?.includes(suit) ? "بالأشكل" : "بتهريب ورقة صغيرة";
      return convention(ctx, lowest(by[suit]), `خويي طلب ${SUIT_NAME_AR[suit]} ${how} — ألعب له بأصغر ${SUIT_NAME_AR[suit]} عشان ياكلها هو.`);
    }
  }

  // الحلة: the suit the partner led is usually the one he wants — return it, with the highest
  // card you have in it (the player's rule). Not the brother suit: that's تهريب, not a lead.
  const hisLead = [...(ctx?.tricks ?? [])].reverse().find((t) => t.leader === partner);
  if (hisLead) {
    const led = hisLead.cards[partner]!.suit;
    if (by[led].length > 0 && !opponentsCanRuff(led) && !(mode === "hokum" && led === trumpSuit)) {
      const top = maxBy(by[led], (c) => rankStrength(c, mode, trumpSuit));
      return convention(ctx, top, `خويي حل ${SUIT_NAME_AR[led]} — يعني غالباً يبيه. أرجع له ${SUIT_NAME_AR[led]} بأكبر ورقة عندي (${name(top)}).`);
    }
  }

  // أول حلة في الصن: لا تصرف الإكة — اطلع برا اللعب بصغيرة من لون ما فيه إكة، وخلّ الإكك
  // مداخل لبعدين. Measured (scripts/deep-analysis.ts, 200 hands × 40 deals per buyer): better than
  // cashing an Ace by +1.4 ± 0.4 (you bought), +0.9 ± 0.4 (partner), +1.4 ± 0.3 (opponent).
  // The exception is السرد: five sure winners in a row from the Ace (A 10 K Q J) — then cash
  // and run it (measured: clearly best in every buyer case; with 2–4 in a row it's a toss-up).
  const SUN_TOP: Card["rank"][] = ["A", "10", "K", "Q", "J", "9", "8", "7"];
  const topRun = (suit: Suit) => {
    let n = 0;
    while (n < SUN_TOP.length && by[suit].some((c) => c.rank === SUN_TOP[n])) n++;
    return n;
  };
  if (mode === "sun" && (ctx?.tricks.length ?? 0) === 0 && !SUITS.some((suit) => topRun(suit) >= 5)) {
    const outside = hand.filter((c) => !by[c.suit].some((x) => x.rank === "A"));
    if (outside.length > 0 && hand.some((c) => c.rank === "A")) {
      const card = lowest(outside);
      return note(ctx, card, `أول حلة: ما أصرف الإكة وأخسر قوتي — أطلع برا اللعب بـ${name(card)} من لون ما فيه إكة، والإكك تبقى مداخل لبعدين.`);
    }
  }

  // Cash a sure winner in a side suit that won't be ruffed.
  const bosses = sideSuits.flatMap((s) => by[s]).filter((c) => isBoss(c) && !opponentsCanRuff(c.suit));
  if (bosses.length > 0) {
    // Run the longest suit first — تسييل السرد (§5): strip, then keep leading it.
    const card = maxBy(bosses, (c) => by[c.suit].length * 100 + cardPoints(c, mode, trumpSuit));
    return note(ctx, card, `${name(card)} أكبر ورقة باقية في ${SUIT_NAME_AR[card.suit]} ومحد يقطعها — آكل اللي عندي أول، وأبدأ بأطول لون عندي (${by[card.suit].length} أوراق) عشان أسيّله (السرد).`);
  }

  // Otherwise lead low from the longest suit that no opponent can ruff and the partner hasn't rejected.
  const candidates = sideSuits.filter((s) => !opponentsCanRuff(s) && !beliefs.rejects[partner].includes(s));
  const pool = candidates.length > 0 ? candidates : sideSuits.length > 0 ? sideSuits : SUITS.filter((s) => by[s].length > 0);
  const longest = maxBy(pool, (s) => by[s].length * 10 - by[s].reduce((a, c) => a + cardPoints(c, mode, trumpSuit), 0) / 10);
  const card = lowest(by[longest]);
  return note(ctx, card, `ما عندي ورقة أكيدة — أحل بالصغير (${name(card)}) من أطول لون ما يقطعه الخصم وما رفضه خويي.`);
}

/** No card still out in this suit beats it — it wins whenever it's led (bar a ruff). */
function isBoss(card: Card, hand: Card[], beliefs: Beliefs, mode: Mode, trumpSuit: Suit | undefined): boolean {
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
