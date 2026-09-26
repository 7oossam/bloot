import { cardId, isTrumpCard, rankStrength } from "../engine/cards";
import { currentWinner, wouldWinAgainstCurrent } from "../engine/trick";
import { Round } from "../engine/round";
import { SUITS, RANKS, teamOf, type Card, type Seat, type Suit, type Team, type Trick } from "../engine/types";
import { decideCard, defenderMayLeadTrump, isBoss, overRuffRisk, type PlayContext } from "./play-ai";
import { buildBeliefs } from "./beliefs";

/**
 * The search AI: determinized Monte Carlo over the cards this seat may play.
 *
 * For each of `worlds` guesses at the hidden hands — guesses that agree with everything the
 * table has shown (who can't follow a suit, who couldn't trump, where the ground card went,
 * projects laid down) — it plays every candidate card, then plays the hand out with the
 * rule-based AI in every seat, and scores it with the real scoring (projects, بلوت, كبوت,
 * the دبل, the buyer-loses rule). The card with the best average game-point margin for this
 * seat's team wins. The same guesses are used for every candidate, so they're compared on
 * equal cards.
 *
 * The player's own rules for the AI (docs/baloot-guide.md, the baloot-rules skill §9) stay
 * hard rules: no Ace fed to a winning partner or thrown away except as a برقية, and a
 * partner's برقية is always answered.
 */

export interface SearchOptions {
  /** How many guesses at the hidden hands to try (more = stronger and slower). */
  worlds?: number;
  /** Stop early once this many milliseconds have gone (the game stays responsive on a phone). */
  timeBudgetMs?: number;
  rand?: () => number;
  /** What the rule-based AI is told for this seat (أشكل signal, مقفل…). */
  ctx?: PlayContext;
}

export const DEFAULT_WORLDS = 20;

/**
 * Why a card was played — kept so the player can ask «ليش؟» at the table (and send notes to
 * improve the AI). `scores` is each candidate's average game-point margin for this seat's
 * team over the guessed hands; `ruledOut` are the legal cards the player's rules removed.
 */
export interface PlayTrace {
  kind: "only" | "convention" | "rules" | "search" | "habit" | "sawa";
  card: Card;
  /** What the rule-based habit would have played. */
  ruleChoice?: Card;
  ruledOut?: Card[];
  /** Which of the player's rules removed them, in the player's words. */
  rules?: string[];
  /** Soft rules: cards kept in play but marked down (already taken off their `scores`). */
  softRules?: Array<{ card: Card; points: number; reason: string }>;
  scores?: Array<{ card: Card; avg: number }>;
  worlds?: number;
}

export function searchCard(round: Round, seat: Seat, opts: SearchOptions = {}): Card {
  return searchCardTraced(round, seat, opts).card;
}

export function searchCardTraced(round: Round, seat: Seat, opts: SearchOptions = {}): PlayTrace {
  const rand = opts.rand ?? Math.random;
  const res = round.bidding.result!;
  const ctx: PlayContext = opts.ctx ?? { tricks: round.tricks, declarer: res.declarer, closed: round.closed };
  const ruleChoice = decideCard(round.hands[seat], round.currentTrick!, res.mode, res.trumpSuit, seat, ctx);
  const legal = round.legalMovesFor(seat);
  if (legal.length <= 1) return { kind: "only", card: legal[0] ?? ruleChoice };
  // A partner's برقية is a convention, not a calculation: answer it.
  if (!ctx.deaf && followsConvention(round, seat, ctx.answerFirst)) return { kind: "convention", card: ruleChoice, ruleChoice };

  const rules: string[] = [];
  const soft = new Map<string, SoftRule>();
  const candidates = playerRules(round, seat, legal, ruleChoice, rules, soft);
  const penalty = (c: Card) => soft.get(cardId(c))?.points ?? 0;
  const ruledOut = legal.filter((c) => !candidates.some((k) => cardId(k) === cardId(c)));
  if (candidates.length === 1) return { kind: "rules", card: candidates[0], ruleChoice, ruledOut, rules };

  const constraints = inferConstraints(round, seat);
  const totals = new Map<string, number>(candidates.map((c) => [cardId(c), 0]));
  const started = Date.now();
  const likely = likelihood(round, seat);
  let worlds = 0;
  let weightSum = 0;
  for (let w = 0; w < (opts.worlds ?? DEFAULT_WORLDS); w++) {
    const hands = sampleWorld(round, seat, constraints, rand);
    if (!hands) continue;
    worlds++;
    // Deals that fit the bidding and the signals count for more (see `likelihood`).
    const weight = likely(hands);
    weightSum += weight;
    for (const card of candidates) totals.set(cardId(card), totals.get(cardId(card))! + weight * rollout(round, hands, seat, card));
    if (opts.timeBudgetMs !== undefined && Date.now() - started > opts.timeBudgetMs) break;
  }
  if (worlds === 0) return { kind: "habit", card: ruleChoice, ruleChoice, ruledOut, rules };
  // Weighted averages from here on: "/ worlds" below reads as "/ total weight".
  for (const [id, total] of totals) totals.set(id, (total / weightSum) * worlds);

  // Best average margin; a near-tie goes to the rule-based choice.
  let best = ruleChoice;
  let bestScore = (totals.get(cardId(ruleChoice)) ?? -Infinity) / worlds - penalty(ruleChoice) + 0.25;
  for (const card of candidates) {
    const score = totals.get(cardId(card))! / worlds - penalty(card);
    if (score > bestScore) {
      best = card;
      bestScore = score;
    }
  }
  const scores = candidates.map((card) => ({ card, avg: totals.get(cardId(card))! / worlds - penalty(card) })).sort((a, b) => b.avg - a.avg);
  const softRules = [...soft.entries()].filter(([id]) => candidates.some((c) => cardId(c) === id)).map(([id, r]) => ({ card: candidates.find((c) => cardId(c) === id)!, ...r }));
  return { kind: "search", card: best, ruleChoice, ruledOut, scores, worlds, rules, softRules };
}

// ------------------------------------------------------------------ what's likely, not just possible

/**
 * How well a guessed deal fits what the table has *said*, not just shown: the bidding and the
 * signals. `sampleWorld` only rules out the impossible; this weighs the possible.
 * - A hokum buyer usually holds the ولد or the تسعة; a sun buyer usually holds Aces.
 * - A player who passed on a ground suit he held the ولد and the تسعة of is unlikely.
 * - A suit a player's discard said "don't lead me this" rarely hides his Ace there; a suit he
 *   asked for usually does.
 * Cards already played count toward what a seat held.
 *
 * Measured over 1,000 hands, each dealt twice (with and without): +0.14 a hand (± 0.21),
 * ahead in all four blocks of 250; squaring the weights was noisier (+0.21 ± 0.28, one block
 * behind). Small but steady, so kept at these values.
 */
export function likelihood(round: Round, me: Seat): (hands: Record<Seat, Card[]>) => number {
  const res = round.bidding.result!;
  const { mode, trumpSuit, declarer } = res;
  const tricks = [...round.tricks, ...(round.currentTrick ? [round.currentTrick] : [])];
  const playedBy = (s: Seat) => tricks.flatMap((t) => (t.cards[s] ? [t.cards[s]!] : []));
  const beliefs = buildBeliefs(round.tricks, round.currentTrick, mode, trumpSuit);
  const ground = round.groundCard;
  // Seats that passed on the ground suit in the first round (before anyone bought it).
  const firstRound = round.bidding.history.slice(0, 4);
  const passedOnGround = new Set(firstRound.filter((b) => b.call === "pass").map((b) => b.seat));
  const others = ([0, 1, 2, 3] as Seat[]).filter((s) => s !== me);
  return (hands) => {
    let w = 1;
    const held = (s: Seat) => [...playedBy(s), ...(hands[s] ?? [])];
    if (declarer !== me) {
      const cards = held(declarer);
      if (mode === "hokum" && trumpSuit) {
        const top = cards.filter((c) => c.suit === trumpSuit && (c.rank === "J" || c.rank === "9")).length;
        w *= top === 0 ? 0.35 : top === 1 ? 1 : 1.3;
      } else {
        const aces = cards.filter((c) => c.rank === "A").length;
        w *= [0.3, 0.7, 1, 1.2, 1.3][aces];
      }
    }
    for (const s of others) {
      const cards = held(s);
      if (passedOnGround.has(s) && s !== declarer) {
        const jack = cards.some((c) => c.suit === ground.suit && c.rank === "J");
        const nine = cards.some((c) => c.suit === ground.suit && c.rank === "9");
        if (jack && nine) w *= 0.5;
      }
      const hand = hands[s] ?? [];
      for (const suit of beliefs.rejects[s]) if (hand.some((c) => c.suit === suit && c.rank === "A")) w *= 0.5;
      for (const suit of beliefs.wants[s]) w *= hand.some((c) => c.suit === suit && c.rank === "A") ? 1.3 : 0.8;
    }
    return w;
  };
}

// ------------------------------------------------------------------ the player's rules

/** The partner sent a برقية (or, for الشايب, any signal) and this seat is leading: follow it. */
function followsConvention(round: Round, seat: Seat, answerFirst = false): boolean {
  const trick = round.currentTrick!;
  if (trick.order.length !== 0) return false;
  const res = round.bidding.result!;
  const partner = ((seat + 2) % 4) as Seat;
  const beliefs = buildBeliefs(round.tricks, trick, res.mode, res.trumpSuit);
  const hand = round.hands[seat];
  const asked = answerFirst ? [...beliefs.barqiya[partner], ...beliefs.wants[partner]] : beliefs.barqiya[partner];
  return asked.some((suit) => hand.some((c) => c.suit === suit));
}

/**
 * The player's rules, kept as hard rules over the search (each came from a note the player
 * wrote at the table):
 * - Leading, in hokum, the side that didn't buy: no trumps (bar the exceptions in
 *   `defenderMayLeadTrump`), and cash a side-suit Ace while it still wins — later the buyer
 *   may be void and ruff it.
 * - Leading against the buyer: never go back into a suit the buyer led (his حلة) unless with a
 *   sure winner in it.
 * - Following: never feed an Ace to a partner who's winning, and never throw an Ace away —
 *   unless it's the برقية the rule-based AI chose.
 * - Discarding: never from a suit where you hold its Ace — that tells the partner you don't
 *   want the suit you're strongest in.
 */
/**
 * A soft rule: the card stays in play, but its score is marked down by `points` (game points),
 * so the search only goes against the rule when the playouts say it clearly pays.
 */
export interface SoftRule {
  points: number;
  reason: string;
}

/**
 * Leading a small card under your own Ace: wrong almost always, but sometimes it drops their 10
 * (the player's word). The playouts must show a big gain to do it — in the player's noted hand
 * they favoured the 7 by 5.4, and it was still wrong.
 */
const UNDERLEAD_PENALTY = 6;

function playerRules(round: Round, seat: Seat, legal: Card[], ruleChoice: Card, why: string[] = [], soft: Map<string, SoftRule> = new Map()): Card[] {
  const trick = round.currentTrick!;
  const { mode, trumpSuit, declarer } = round.bidding.result!;
  const beliefs = buildBeliefs(round.tricks, trick, mode, trumpSuit);
  const hand = round.hands[seat];
  const against = teamOf(declarer) !== teamOf(seat);
  const narrow = (pool: Card[], keep: (c: Card) => boolean, reason: string) => {
    const kept = pool.filter(keep);
    if (kept.length === 0 || kept.length === pool.length) return pool;
    why.push(reason);
    return kept;
  };
  if (trick.order.length === 0) {
    let pool = legal;
    // Never lead a small card of a suit whose Ace you hold: it hands the trick over for nothing.
    // (Soft: leading low under the Ace can be right, to drop their 10 — the search decides.)
    const aceHeld = (suit: Suit) => hand.some((x) => x.suit === suit && x.rank === "A");
    for (const c of pool) {
      if (!isTrumpCard(c, mode, trumpSuit) && aceHeld(c.suit) && c.rank !== "A" && !isBoss(c, hand, beliefs, mode, trumpSuit)) {
        soft.set(cardId(c), { points: UNDERLEAD_PENALTY, reason: "يحل من تحت إكته" });
      }
    }
    if (against) {
      // حلة المشتري: suits the buying side's declarer opened.
      const buyerSuits = new Set(round.tricks.filter((t) => t.leader === declarer).map((t) => t.cards[t.leader]!.suit));
      // Only a sure winner of it may go (the top card still out): anything smaller just feeds the
      // buyer the cards he's strong in. Holding the Ace and the شايب, the Ace goes, then the
      // شايب is the top card and goes too.
      pool = narrow(pool, (c) => !buyerSuits.has(c.suit) || isBoss(c, hand, beliefs, mode, trumpSuit), "خصم المشتري ما يرجع في حلته إلا بورقة ماكلة");
    }
    if (mode === "hokum" && against) {
      if (!defenderMayLeadTrump(hand, mode, trumpSuit, beliefs)) pool = narrow(pool, (c) => !isTrumpCard(c, mode, trumpSuit), "اللي مو مشتري ما يبدأ بالحكم");
      pool = narrow(pool, (c) => c.rank === "A" && !isTrumpCard(c, mode, trumpSuit) && isBoss(c, hand, beliefs, mode, trumpSuit), "في الحكم تاكل إكتك قبل لا تنقطع");
    }
    return pool;
  }
  const led = trick.cards[trick.order[0]]!.suit;
  const partnerWinning = teamOf(currentWinner(trick, mode, trumpSuit)) === teamOf(seat);
  const following = legal.some((c) => c.suit === led);
  // In hokum an Ace plays the first time its suit comes round, while it still wins — held back
  // (الفرنكة) it gets ruffed later. Even onto the partner's trick.
  const ledTrump = isTrumpCard(trick.cards[trick.order[0]]!, mode, trumpSuit);
  if (mode === "hokum" && following && !ledTrump) {
    const ace = legal.find((c) => c.suit === led && c.rank === "A");
    if (ace && wouldWinAgainstCurrent(ace, trick, mode, trumpSuit)) {
      return narrow(legal, (c) => cardId(c) === cardId(ace), "في الحكم الإكة تنلعب أول ما يجي شكلها — لا تتفرنك");
    }
  }
  // In the last two tricks an Ace thrown onto the partner's trick isn't wasted: the lead may
  // never come back to it, so it's تكبير — fattening the partner's trick. (With three left it
  // can still take a trick, and there it reads as a برقية — the player's note 8.)
  const endgame = hand.length <= 2;
  let keep = narrow(legal, (c) => {
    if (c.rank !== "A" || isTrumpCard(c, mode, trumpSuit)) return true;
    if (cardId(c) === cardId(ruleChoice)) return true; // a برقية
    if (endgame && partnerWinning) return true; // تكبير
    if (!following) return false; // thrown away
    return !partnerWinning; // fed to the partner
  }, following ? "الإكة ما تنعطى لأكلة خويه" : "الإكة ما تنرمى");
  // Ruffing while the buyer's ولد is still out: ruff with the تسعة (14 points), or the ولد
  // catches it later.
  if (mode === "hokum" && !following && !ledTrump) {
    const nine = keep.find((c) => isTrumpCard(c, mode, trumpSuit) && c.rank === "9");
    const jackOut = !hand.some((c) => c.suit === trumpSuit && c.rank === "J") && !beliefs.played.some((c) => c.suit === trumpSuit && c.rank === "J");
    if (nine && jackOut && wouldWinAgainstCurrent(nine, trick, mode, trumpSuit) && !overRuffRisk(trick, seat, led, hand, beliefs, trumpSuit!)) {
      keep = narrow(keep, (c) => !isTrumpCard(c, mode, trumpSuit) || cardId(c) === cardId(nine), "إذا قطع والولد برا، يقطع بالتسعة قبل لا ينصادها");
    }
  }
  if (!following) {
    // Not from the Ace's suit — unless everything else costs: a 10 thrown, or a 10 left bare
    // (عشرة معلّقة). Then a small card of the Ace's suit may go; its 10 never does.
    const aceSuits = new Set(hand.filter((c) => c.rank === "A" && !isTrumpCard(c, mode, trumpSuit)).map((c) => c.suit));
    const aceOut = (suit: Suit) => !hand.some((x) => x.suit === suit && x.rank === "A") && !beliefs.played.some((x) => x.suit === suit && x.rank === "A");
    const costly = (c: Card) => {
      const rest = hand.filter((x) => x.suit === c.suit && cardId(x) !== cardId(c));
      return c.rank === "10" || (rest.length === 1 && rest[0].rank === "10" && aceOut(c.suit));
    };
    const others = keep.filter((c) => !aceSuits.has(c.suit));
    const allCostly = others.length > 0 && others.every(costly);
    keep = narrow(
      keep,
      (c) => !aceSuits.has(c.suit) || cardId(c) === cardId(ruleChoice) || (allCostly && c.rank !== "10") || (endgame && partnerWinning && c.rank === "A"),
      "ما يهرّب من شكل عنده إكته (يفهمها خويه إنه ما يبغاه)",
    );
  }
  return keep;
}

// ------------------------------------------------------------------ what the table has shown

interface Constraints {
  /** Suits each seat has shown it can't hold. */
  voids: Record<Seat, Set<Suit>>;
  /** No trump stronger than this (it under-trumped or discarded over an opponent's ruff). */
  maxTrump: Record<Seat, number>;
  /** Cards known to be in a seat's hand (the ground card, projects laid down). */
  known: Record<Seat, Card[]>;
}

export function inferConstraints(round: Round, me: Seat): Constraints {
  const { mode, trumpSuit, declarer, ashkal } = round.bidding.result!;
  const c: Constraints = {
    voids: { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set() },
    maxTrump: { 0: Infinity, 1: Infinity, 2: Infinity, 3: Infinity },
    known: { 0: [], 1: [], 2: [], 3: [] },
  };
  const tricks: Trick[] = [...round.tricks, ...(round.currentTrick && round.currentTrick.order.length ? [round.currentTrick] : [])];
  for (const trick of tricks) {
    const led = trick.cards[trick.order[0]]!.suit;
    trick.order.forEach((seat, i) => {
      const card = trick.cards[seat]!;
      if (card.suit === led) return;
      c.voids[seat].add(led);
      if (mode !== "hokum" || !trumpSuit) return;
      // Replay the legal-move rule: what did this seat have to do here?
      const before: Trick = { leader: trick.leader, order: trick.order.slice(0, i), cards: trick.cards, rules: trick.rules };
      if (teamOf(currentWinner(before, mode, trumpSuit)) === teamOf(seat)) return; // free discard
      const trumpsBefore = before.order.map((s) => trick.cards[s]!).filter((x) => isTrumpCard(x, mode, trumpSuit));
      const best = trumpsBefore.length ? Math.max(...trumpsBefore.map((x) => rankStrength(x, mode, trumpSuit))) : undefined;
      if (best === undefined) {
        // Had to cut and didn't: no trump at all.
        if (!isTrumpCard(card, mode, trumpSuit)) c.voids[seat].add(trumpSuit);
      } else if (!isTrumpCard(card, mode, trumpSuit) || rankStrength(card, mode, trumpSuit) < best) {
        // Had to overtrump if able, and didn't: nothing above the best trump played.
        c.maxTrump[seat] = Math.min(c.maxTrump[seat], best);
      }
    });
  }
  const played = new Set(tricks.flatMap((t) => t.order.map((s) => cardId(t.cards[s]!))));
  // The ground card went to whoever took it.
  const taker = ashkal?.groundTo ?? declarer;
  const ground = round.groundCard;
  if (taker !== me && !played.has(cardId(ground))) c.known[taker].push(ground);
  // Projects are laid down in the second trick by the side whose projects count.
  const proj = round.projects;
  if (proj && proj.winner !== undefined && round.tricks.length >= 1) {
    for (const p of proj.declared) {
      if (p.seat === me || teamOf(p.seat) !== proj.winner) continue;
      for (const card of p.cards) {
        if (!played.has(cardId(card)) && !c.known[p.seat].some((k) => cardId(k) === cardId(card))) c.known[p.seat].push(card);
      }
    }
  }
  return c;
}

/**
 * One guess at every other seat's hand that fits the constraints, or undefined if the table
 * no longer adds up (a joker duplicated a card) or no fitting deal turned up.
 */
export function sampleWorld(round: Round, me: Seat, c: Constraints, rand: () => number): Record<Seat, Card[]> | undefined {
  const { mode, trumpSuit } = round.bidding.result!;
  const others = ([0, 1, 2, 3] as Seat[]).filter((s) => s !== me);
  const seen = new Set<string>(round.hands[me].map(cardId));
  for (const t of [...round.tricks, ...(round.currentTrick ? [round.currentTrick] : [])]) {
    for (const s of t.order) seen.add(cardId(t.cards[s]!));
  }
  for (const s of others) for (const k of c.known[s]) seen.add(cardId(k));
  const pool = SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank }))).filter((x) => !seen.has(cardId(x)));
  const need = Object.fromEntries(others.map((s) => [s, round.hands[s].length - c.known[s].length])) as Record<Seat, number>;
  if (others.some((s) => need[s] < 0) || pool.length !== others.reduce<number>((n, s) => n + need[s], 0)) return undefined;

  const allowed = (card: Card, s: Seat) =>
    !c.voids[s].has(card.suit) && !(isTrumpCard(card, mode, trumpSuit) && rankStrength(card, mode, trumpSuit) > c.maxTrump[s]);
  // Most constrained cards first, so a void never leaves a card with nowhere to go.
  const order = shuffle(pool, rand).sort((a, b) => others.filter((s) => allowed(a, s)).length - others.filter((s) => allowed(b, s)).length);
  for (let attempt = 0; attempt < 12; attempt++) {
    const left = { ...need };
    const hands = { 0: [], 1: [], 2: [], 3: [] } as Record<Seat, Card[]>;
    let ok = true;
    for (const card of order) {
      const fits = others.filter((s) => left[s] > 0 && allowed(card, s));
      if (fits.length === 0) {
        ok = false;
        break;
      }
      // Weighted by room left, so a seat with more hidden cards takes more of them.
      const room = fits.reduce<number>((n, s) => n + left[s], 0);
      let r = rand() * room;
      const seat = fits.find((s) => (r -= left[s]) < 0) ?? fits[fits.length - 1];
      hands[seat].push(card);
      left[seat]--;
    }
    if (ok) {
      for (const s of others) hands[s].push(...c.known[s]);
      hands[me] = [...round.hands[me]];
      return hands;
    }
  }
  return undefined;
}

// ------------------------------------------------------------------ playing a guess out

/** A copy of the round with `hands` in place of the real ones. Nothing is shared with the real game. */
function cloneRound(r: Round, hands: Record<Seat, Card[]>): Round {
  const c = Object.assign(Object.create(Round.prototype), r) as Round;
  c.hands = { 0: [...hands[0]], 1: [...hands[1]], 2: [...hands[2]], 3: [...hands[3]] };
  c.tricks = r.tricks.map((t) => ({ ...t, cards: { ...t.cards }, order: [...t.order] }));
  c.currentTrick = r.currentTrick ? { ...r.currentTrick, cards: { ...r.currentTrick.cards }, order: [...r.currentTrick.order] } : undefined;
  c.result = undefined;
  const { mode, trumpSuit } = r.bidding.result!;
  // Who holds بلوت is hidden until it's shown: read it off the guess, not the real hands.
  if (mode === "hokum" && !r.balootDeclared && (r as unknown as { balootPlayed: number }).balootPlayed === 0) {
    c.balootHolder = ([0, 1, 2, 3] as Seat[]).find((s) =>
      (["K", "Q"] as const).every((rank) => c.hands[s].some((x) => x.suit === trumpSuit && x.rank === rank)),
    );
  }
  return c;
}

/**
 * العارفين (an opponent rule): plays the hand out from here with every card known and the
 * rule-based AI in every seat, undoubled, and says whether the buyer would lose it.
 */
export function buyerWouldLose(round: Round): boolean {
  const sim = cloneRound(round, round.hands);
  sim.doubling = undefined;
  sim.phase = "playing";
  const res = sim.bidding.result!;
  while (sim.phase === "playing") {
    const s = sim.turnSeat!;
    const pick = decideCard(sim.hands[s], sim.currentTrick!, res.mode, res.trumpSuit, s, {
      tricks: sim.tricks,
      declarer: res.declarer,
      ashkalSuits: s === res.ashkal?.groundTo ? res.ashkal.signalSuits : undefined,
    });
    sim.playCard(s, pick);
  }
  const sheet = sim.result!.sheet;
  return !!sheet && sheet.judgedTeam === res.declarerTeam && sheet.outcome === "lost";
}

/** Plays `card` for `seat` in a copy of the round, lets the rule-based AI finish, and returns the margin. */
function rollout(round: Round, hands: Record<Seat, Card[]>, seat: Seat, card: Card): number {
  const sim = cloneRound(round, hands);
  const res = sim.bidding.result!;
  sim.playCard(seat, card);
  while (sim.phase === "playing") {
    const s = sim.turnSeat!;
    const pick = decideCard(sim.hands[s], sim.currentTrick!, res.mode, res.trumpSuit, s, {
      tricks: sim.tricks,
      declarer: res.declarer,
      ashkalSuits: s === res.ashkal?.groundTo ? res.ashkal.signalSuits : undefined,
      closed: sim.closed,
    });
    sim.playCard(s, pick);
  }
  const team: Team = teamOf(seat);
  const other = (1 - team) as Team;
  const g = sim.result!.gamePoints;
  const raw = sim.result!.rawPoints;
  // Game points are rounded to tens, so cards that differ by a 10 or an Ace often tie there;
  // the raw points (أبناط) break those ties. Only a tie-break: weighed any heavier, they made
  // the search weaker (600 hands: 1.71 a hand at 0, 1.47 at 0.25, 1.31 at 0.5).
  return g[team] - g[other] + (raw[team] - raw[other]) * RAW_TIEBREAK;
}

/** A raw point (أبنط) in a playout's score: 20 of them are a tenth of a game point. */
const RAW_TIEBREAK = 0.005;

function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
