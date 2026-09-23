import { type BiddingState, legalCalls, startBidding, submitBid } from "./bidding";
import { dealInitial, finalizeDeal, type InitialDeal } from "./deck";
import { legalMoves, resolveTrick } from "./trick";
import { scoreHand } from "./scoring";
import { cardId } from "./cards";
import type { Bid, Card, HandResult, Seat, Team, Trick } from "./types";
import { nextSeat } from "./types";

export type RoundPhase = "bidding" | "redeal" | "playing" | "complete";

export interface RoundOptions {
  /** Overrides the last-trick ("الأرض") bonus, normally 10. */
  lastTrickBonus?: number;
  /** Makes sure this seat's first five cards include a Jack (a joker effect). */
  guaranteeJackFor?: Seat;
  /** How many Jacks that seat is guaranteed (default 1). */
  guaranteedJacks?: number;
  /** Teams whose hokum can't be challenged to sun. */
  lockedHokumTeams?: Team[];
}

/**
 * If `seat` was dealt no Jack, swaps one of its cards for a Jack from somewhere else in the
 * deal. The face-up ground card is never touched, so the auction the table sees is unchanged.
 */
function giveAJack(initial: InitialDeal, seat: Seat, rand: () => number, wanted = 1): void {
  const hand = initial.hands[seat];
  if (hand.filter((c) => c.rank === "J").length >= wanted) return;

  const sources: Array<{ list: Card[]; index: number }> = [];
  for (const other of [0, 1, 2, 3] as Seat[]) {
    if (other === seat) continue;
    initial.hands[other].forEach((c, index) => c.rank === "J" && sources.push({ list: initial.hands[other], index }));
  }
  initial.stock.forEach((c, index) => index > 0 && c.rank === "J" && sources.push({ list: initial.stock, index }));
  if (sources.length === 0) return; // only possible if the ground card is the last Jack left

  const from = sources[Math.floor(rand() * sources.length)];
  const nonJacks = hand.map((c, i) => (c.rank === "J" ? -1 : i)).filter((i) => i >= 0);
  const giveIndex = nonJacks[Math.floor(rand() * nonJacks.length)];
  const jack = from.list[from.index];
  from.list[from.index] = hand[giveIndex];
  hand[giveIndex] = jack;
  giveAJack(initial, seat, rand, wanted);
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

  private readonly lastTrickBonus?: number;

  constructor(dealer: Seat, rand: () => number = Math.random, options: RoundOptions = {}) {
    this.dealer = dealer;
    this.lastTrickBonus = options.lastTrickBonus;
    this.initial = dealInitial(rand);
    if (options.guaranteeJackFor !== undefined) {
      giveAJack(this.initial, options.guaranteeJackFor, rand, options.guaranteedJacks ?? 1);
    }
    this.bidding = startBidding(dealer, this.initial.stock[0], options.lockedHokumTeams ?? []);
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
      const leader = nextSeat(this.dealer);
      this.currentTrick = { leader, cards: {}, order: [] };
    }
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
    return legalMoves(this.hands[seat], this.currentTrick, mode, trumpSuit, seat);
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

    if (this.currentTrick.order.length === 4) {
      const { mode, trumpSuit } = this.bidding.result;
      const winner = resolveTrick(this.currentTrick, mode, trumpSuit);
      this.currentTrick.winner = winner;
      this.tricks.push(this.currentTrick);

      if (this.tricks.length === 8) {
        this.result = scoreHand(
          this.tricks,
          mode,
          trumpSuit,
          this.bidding.result.declarerTeam,
          this.lastTrickBonus,
        );
        this.phase = "complete";
        this.currentTrick = undefined;
      } else {
        this.currentTrick = { leader: winner, cards: {}, order: [] };
      }
    }
  }
}
