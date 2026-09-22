import { type BiddingState, legalCalls, startBidding, submitBid } from "./bidding";
import { dealInitial, finalizeDeal, type InitialDeal } from "./deck";
import { legalMoves, resolveTrick } from "./trick";
import { scoreHand } from "./scoring";
import { cardId } from "./cards";
import type { Bid, Card, HandResult, Seat, Trick } from "./types";
import { nextSeat } from "./types";

export type RoundPhase = "bidding" | "redeal" | "playing" | "complete";

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

  constructor(dealer: Seat, rand: () => number = Math.random) {
    this.dealer = dealer;
    this.initial = dealInitial(rand);
    this.bidding = startBidding(dealer, this.initial.stock[0]);
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
        this.result = scoreHand(this.tricks, mode, trumpSuit, this.bidding.result.declarerTeam);
        this.phase = "complete";
        this.currentTrick = undefined;
      } else {
        this.currentTrick = { leader: winner, cards: {}, order: [] };
      }
    }
  }
}
