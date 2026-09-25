import { type BiddingState, legalCalls, startBidding, submitBid } from "./bidding";
import { dealInitial, finalizeDeal, type InitialDeal } from "./deck";
import { legalMoves, resolveTrick } from "./trick";
import { scoreHand } from "./scoring";
import { cardId } from "./cards";
import { SEQUENCE_ORDER } from "./projects";
import type { Bid, Card, HandResult, Seat, Suit, Team, Trick, TrickRules } from "./types";
import { SUITS, nextSeat, teamOf } from "./types";
import {
  legalDoubles,
  raiserTeam,
  startDoubling,
  submitDouble,
  sunDoubleAllowed,
  type DoubleBid,
  type DoublingState,
} from "./doubling";
import {
  findProjects,
  hasFourKingsOrQueens,
  resolveProjects,
  sequenceHoldsKQ,
  type ProjectRules,
  type ProjectsOutcome,
} from "./projects";

export type RoundPhase = "bidding" | "redeal" | "doubling" | "playing" | "complete";

export interface RoundOptions {
  /** Overrides the last-trick ("الأرض") bonus, normally 10. */
  lastTrickBonus?: number;
  /** Makes sure this seat's first five cards include a Jack (a joker effect). */
  guaranteeJackFor?: Seat;
  /** How many Jacks that seat is guaranteed (default 1). */
  guaranteedJacks?: number;
  /** الحظ الواطي: this many 7s/8s in `guaranteeJackFor`'s first five. */
  guaranteedLow?: number;
  /** المرتّب: at the deal, one card short of a run of this length → that seat gets the card. */
  completeRunTo?: 3 | 4;
  /** الجريء: this team may double a sun contract whatever the 100-point rule says. */
  freeSunDoubleFor?: Team;
  /** Teams whose hokum can't be challenged to sun. */
  lockedHokumTeams?: Team[];
  /**
   * Plays the دبل round between the buy and the first card. Sun may only be doubled while the
   * doubling side is at or under `sunLimit` and the buyer's side is past it (7-2).
   */
  doubling?: { matchScore: Record<Team, number>; sunLimit: number };
  /** Joker rules — see BiddingState.extraHokum. */
  extraHokum?: { seat: Seat; suits: Suit[] };
  /** صاحب الحلة: this seat always leads the first trick. */
  firstLeader?: Seat;
  /** Per-seat project rules (نص سرا، الأربع الصغار). */
  projectRules?: Partial<Record<Seat, ProjectRules>>;
  /** Nobody may double this team's contract (الحكم المقفول). */
  noDoubleAgainst?: Team[];
  /** Rules that bend who wins a trick, every trick (ملك السبيت). */
  trickRules?: TrickRules;
  /** الورقة الأخيرة: this seat's card in the last trick counts as the top of its suit. */
  lastCardTop?: Seat;
  /** حرّاس الأرض: these (opponent) seats' cards in the last trick count as the top of their suit. */
  rivalLastCardTop?: Seat[];
}

/**
 * Until `seat`'s first five hold `wanted` cards matching `match`, swaps one of its other cards
 * for a matching card from somewhere else in the deal (never inventing one: the deck is shared,
 * so the opponents simply don't get it). Cards `keep` protects are never the ones given away.
 * The face-up ground card is never touched, so the auction the table sees is unchanged.
 */
function giveCards(
  initial: InitialDeal,
  seat: Seat,
  rand: () => number,
  wanted: number,
  match: (c: Card) => boolean,
  keep: (c: Card) => boolean = () => false,
): void {
  const hand = initial.hands[seat];
  while (hand.filter(match).length < wanted) {
    const sources = dealSources(initial, seat, match);
    const spare = hand.map((c, i) => (match(c) || keep(c) ? -1 : i)).filter((i) => i >= 0);
    // Only possible if the ground card holds the last one, or every card is protected.
    if (sources.length === 0 || spare.length === 0) return;
    const from = sources[Math.floor(rand() * sources.length)];
    const giveIndex = spare[Math.floor(rand() * spare.length)];
    const got = from.list[from.index];
    from.list[from.index] = hand[giveIndex];
    hand[giveIndex] = got;
  }
}

/** Where in the deal (other hands, the stock bar the ground card) cards matching `match` sit. */
function dealSources(initial: InitialDeal, seat: Seat, match: (c: Card) => boolean): Array<{ list: Card[]; index: number }> {
  const sources: Array<{ list: Card[]; index: number }> = [];
  for (const other of [0, 1, 2, 3] as Seat[]) {
    if (other === seat) continue;
    initial.hands[other].forEach((c, index) => match(c) && sources.push({ list: initial.hands[other], index }));
  }
  initial.stock.forEach((c, index) => index > 0 && match(c) && sources.push({ list: initial.stock, index }));
  return sources;
}

/**
 * المرتّب: if `seat`'s first five hold a run one card short of `upTo` (two in a row toward a
 * سرا, or three toward a خمسين), fetch the missing card from elsewhere in the deal. One card
 * per deal, and never one of the run's own cards or a protected card given away for it.
 */
function completeRun(initial: InitialDeal, seat: Seat, rand: () => number, upTo: 3 | 4, keep: (c: Card) => boolean): void {
  const hand = initial.hands[seat];
  const options: Array<{ need: Card; run: Card[] }> = [];
  for (const suit of SUITS) {
    const idx = [...new Set(hand.filter((c) => c.suit === suit).map((c) => SEQUENCE_ORDER.indexOf(c.rank)))].sort((a, b) => a - b);
    let start = 0;
    for (let i = 1; i <= idx.length; i++) {
      if (i < idx.length && idx[i] === idx[i - 1] + 1) continue;
      const run = idx.slice(start, i);
      start = i;
      if (run.length < 2 || run.length >= upTo) continue;
      const cards = run.map((r) => ({ suit, rank: SEQUENCE_ORDER[r] }));
      for (const end of [run[0] - 1, run[run.length - 1] + 1]) {
        if (end >= 0 && end < SEQUENCE_ORDER.length) options.push({ need: { suit, rank: SEQUENCE_ORDER[end] }, run: cards });
      }
    }
  }
  // The longest run first: finishing a خمسين beats starting a سرا.
  options.sort((a, b) => b.run.length - a.run.length);
  for (const { need, run } of options) {
    const sources = dealSources(initial, seat, (c) => cardId(c) === cardId(need));
    const inRun = (c: Card) => run.some((r) => cardId(r) === cardId(c));
    const spare = hand.map((c, i) => (inRun(c) || keep(c) ? -1 : i)).filter((i) => i >= 0);
    if (sources.length === 0 || spare.length === 0) continue;
    const from = sources[0];
    const giveIndex = spare[Math.floor(rand() * spare.length)];
    from.list[from.index] = hand[giveIndex];
    hand[giveIndex] = { ...need };
    return;
  }
}

/**
 * Drives one full hand of Baloot: deal → two-round bidding → 8 tricks → score.
 * Framework-agnostic; the caller (AI loop or UI) drives it by calling `bid`
 * and `playCard`, reading `legalBids`/`legalMovesFor` to know what's allowed.
 */
export class Round {
  readonly dealer: Seat;
  readonly initial: InitialDeal;
  bidding: BiddingState;
  hands: Record<Seat, Card[]>;
  phase: RoundPhase = "bidding";
  tricks: Trick[] = [];
  currentTrick?: Trick;
  result?: HandResult;
  /** المشاريع, decided as soon as play starts. */
  projects?: ProjectsOutcome;
  /** Seat that holds trump K + Q (بلوت) at the start of play, if any. */
  balootHolder?: Seat;
  /** Set once that seat has played the second of the pair — بلوت is announced then. */
  balootDeclared = false;
  /** The holder's بلوت is part of a counted sequence, so it scores even if never announced. */
  private balootInSequence = false;
  private balootPlayed = 0;

  /** The دبل round, once the contract is set (only when doubling is enabled). */
  doubling?: DoublingState;

  private readonly lastTrickBonus?: number;
  private readonly doublingRules?: RoundOptions["doubling"];
  private readonly options: RoundOptions;

  constructor(dealer: Seat, rand: () => number = Math.random, options: RoundOptions = {}) {
    this.dealer = dealer;
    this.lastTrickBonus = options.lastTrickBonus;
    this.doublingRules = options.doubling;
    this.options = options;
    this.initial = dealInitial(rand);
    const supplied = options.guaranteeJackFor;
    if (supplied !== undefined) {
      const isJack = (c: Card) => c.rank === "J";
      const isLow = (c: Card) => c.rank === "7" || c.rank === "8";
      const jacks = options.guaranteedJacks ?? (options.guaranteedLow || options.completeRunTo ? 0 : 1);
      if (jacks) giveCards(this.initial, supplied, rand, jacks, isJack);
      if (options.guaranteedLow) giveCards(this.initial, supplied, rand, options.guaranteedLow, isLow, (c) => jacks > 0 && isJack(c));
      if (options.completeRunTo) {
        completeRun(this.initial, supplied, rand, options.completeRunTo, (c) => (jacks > 0 && isJack(c)) || (!!options.guaranteedLow && isLow(c)));
      }
    }
    this.bidding = startBidding(dealer, this.initial.stock[0], options.lockedHokumTeams ?? [], options.extraHokum);
    this.hands = {
      0: [...this.initial.hands[0]],
      1: [...this.initial.hands[1]],
      2: [...this.initial.hands[2]],
      3: [...this.initial.hands[3]],
    };
  }

  get groundCard(): Card {
    return this.initial.stock[0];
  }

  legalBids() {
    return legalCalls(this.bidding);
  }

  bid(bid: Bid): void {
    if (this.phase !== "bidding") throw new Error(`Cannot bid during phase "${this.phase}"`);
    this.bidding = submitBid(this.bidding, bid);
    if (this.bidding.redeal) {
      this.phase = "redeal";
      return;
    }
    if (this.bidding.result) {
      this.hands = finalizeDeal(this.initial, this.bidding.result);
      this.phase = "playing";
      if (this.doublingRules) {
        const { mode: m, declarer, declarerTeam } = this.bidding.result;
        const allowed =
          !this.options.noDoubleAgainst?.includes(declarerTeam) &&
          (m === "hokum" ||
            (this.options.freeSunDoubleFor !== undefined && this.options.freeSunDoubleFor !== declarerTeam) ||
            sunDoubleAllowed(declarerTeam, this.doublingRules.matchScore, this.doublingRules.sunLimit));
        this.doubling = startDoubling(m, declarer, allowed);
        if (!this.doubling.done) this.phase = "doubling";
      }
      const leader = this.options.firstLeader ?? nextSeat(this.dealer);
      this.currentTrick = this.newTrick(leader);
      const { mode, trumpSuit } = this.bidding.result;
      this.projects = resolveProjects(this.hands, mode, leader, this.options.projectRules);
      if (mode === "hokum") {
        const holder = ([0, 1, 2, 3] as Seat[]).find((seat) =>
          (["K", "Q"] as const).every((rank) => this.hands[seat].some((c) => c.suit === trumpSuit && c.rank === rank)),
        );
        // بلوت isn't called by a player who laid down four Kings or four Queens (5-8); if the
        // pair sits inside a sequence project it counts even unannounced (5-6).
        const own = holder !== undefined ? findProjects(this.hands[holder], mode, holder, this.options.projectRules?.[holder]) : [];
        if (holder !== undefined && !hasFourKingsOrQueens(own)) {
          this.balootHolder = holder;
          this.balootInSequence = this.projects.winner === teamOf(holder) && sequenceHoldsKQ(own, trumpSuit!);
        }
      }
    }
  }

  /** A fresh trick carrying the joker rules in force for it. */
  private newTrick(leader: Seat): Trick {
    const last = this.tricks.length === 7;
    const rules: TrickRules = { ...this.options.trickRules };
    if (last && this.options.lastCardTop !== undefined) rules.topCard = this.options.lastCardTop;
    if (last && this.options.rivalLastCardTop?.length) rules.rival = { ...rules.rival, top: this.options.rivalLastCardTop };
    return Object.keys(rules).length ? { leader, cards: {}, order: [], rules } : { leader, cards: {}, order: [] };
  }

  legalDoubleCalls() {
    return this.doubling && this.phase === "doubling" ? legalDoubles(this.doubling) : [];
  }

  /** One answer in the دبل round; play starts once it's settled. */
  double(bid: DoubleBid): void {
    if (this.phase !== "doubling" || !this.doubling) throw new Error(`Cannot double during phase "${this.phase}"`);
    this.doubling = submitDouble(this.doubling, bid);
    if (this.doubling.done) this.phase = "playing";
  }

  /** مقفل: set when a closed دبل or فور stands. */
  get closed(): boolean {
    return !!this.doubling && this.doubling.level > 1 && this.doubling.closed;
  }

  /**
   * Turns one card in a seat's hand into another (a joker effect). The result may duplicate a
   * card that exists elsewhere — two trump Jacks, say. Tricks cope: between equal cards, the
   * one played first wins.
   */
  replaceCard(seat: Seat, from: Card, to: Card): void {
    const hand = this.hands[seat];
    const i = hand.findIndex((c) => cardId(c) === cardId(from));
    if (i === -1) throw new Error(`Seat ${seat} has no ${cardId(from)} to replace`);
    hand[i] = { ...to };
  }

  /** Exchanges one card between two seats' hands. */
  swapCards(seatA: Seat, cardA: Card, seatB: Seat, cardB: Card): void {
    const a = this.hands[seatA].findIndex((c) => cardId(c) === cardId(cardA));
    const b = this.hands[seatB].findIndex((c) => cardId(c) === cardId(cardB));
    if (a === -1 || b === -1) throw new Error("swapCards: card not in hand");
    this.hands[seatA][a] = { ...cardB };
    this.hands[seatB][b] = { ...cardA };
  }

  /** The seat whose turn it is to play, or undefined once the hand is complete. */
  get turnSeat(): Seat | undefined {
    if (this.phase !== "playing" || !this.currentTrick) return undefined;
    const { leader, order } = this.currentTrick;
    return order.length === 0 ? leader : nextSeat(order[order.length - 1]);
  }

  legalMovesFor(seat: Seat): Card[] {
    if (this.phase !== "playing" || !this.currentTrick) return [];
    if (!this.bidding.result) return [];
    const { mode, trumpSuit } = this.bidding.result;
    return legalMoves(this.hands[seat], this.currentTrick, mode, trumpSuit, seat, this.closed);
  }

  playCard(seat: Seat, card: Card): void {
    if (this.phase !== "playing" || !this.currentTrick || !this.bidding.result) {
      throw new Error(`Cannot play during phase "${this.phase}"`);
    }
    if (seat !== this.turnSeat) throw new Error(`It is seat ${this.turnSeat}'s turn, not ${seat}'s`);

    const legal = this.legalMovesFor(seat);
    if (!legal.some((c) => cardId(c) === cardId(card))) {
      throw new Error(`Illegal card ${cardId(card)} for seat ${seat}`);
    }

    const hand = this.hands[seat];
    const idx = hand.findIndex((c) => cardId(c) === cardId(card));
    hand.splice(idx, 1);

    this.currentTrick.cards[seat] = card;
    this.currentTrick.order.push(seat);

    const trump = this.bidding.result.trumpSuit;
    if (seat === this.balootHolder && card.suit === trump && (card.rank === "K" || card.rank === "Q")) {
      this.balootPlayed++;
      if (this.balootPlayed === 2) this.balootDeclared = true;
    }

    if (this.currentTrick.order.length === 4) {
      const { mode, trumpSuit } = this.bidding.result;
      const winner = resolveTrick(this.currentTrick, mode, trumpSuit);
      this.currentTrick.winner = winner;
      this.tricks.push(this.currentTrick);

      if (this.tricks.length === 8) {
        const baloot = this.balootDeclared || this.balootInSequence ? this.balootHolder : undefined;
        this.result = scoreHand(this.tricks, mode, trumpSuit, this.bidding.result.declarerTeam, this.lastTrickBonus, {
          projects: this.projects,
          baloot,
          double:
            this.doubling && this.doubling.level > 1
              ? { level: this.doubling.level, raiserTeam: raiserTeam(this.doubling), closed: this.doubling.closed }
              : undefined,
        });
        this.phase = "complete";
        this.currentTrick = undefined;
      } else {
        this.currentTrick = this.newTrick(winner);
      }
    }
  }
}
