import { decideBid } from "../ai/bidding-ai";
import { decideCard } from "../ai/play-ai";
import type { LegalCall } from "../engine/bidding";
import { Round } from "../engine/round";
import type { Bid, Card, HandResult, Mode, Seat, Suit, Team, Trick } from "../engine/types";
import { nextSeat } from "../engine/types";
import { Emitter } from "./emitter";

export const HUMAN_SEAT: Seat = 0;
export const MATCH_TARGET = 152;

interface EventMap {
  [key: string]: unknown;
  "hand:dealt": { dealer: Seat; hands: Record<Seat, Card[]>; groundCard: Card; round: number };
  "bidding:turn": { seat: Seat; calls: LegalCall[]; round: 1 | 2 };
  "bidding:bid": { bid: Bid };
  "bidding:resolved": { mode: Mode; trumpSuit?: Suit; declarer: Seat; hands: Record<Seat, Card[]> };
  "play:turn": { seat: Seat; legal: Card[] };
  "play:card": { seat: Seat; card: Card };
  "trick:complete": { trick: Trick; winner: Seat };
  "hand:complete": { result: HandResult; matchScore: Record<Team, number> };
  "match:complete": { winner: Team; matchScore: Record<Team, number> };
}

/** True if the scene should call step() again shortly; false if it should wait (on a human, or the match ended). */
export type StepResult = "advanced" | "waiting-human" | "match-complete" | "idle";

/**
 * Bridges the pure Round/AI engine to the scene. Owns dealer rotation and the
 * running match score across hands. Emits events for the scene to render;
 * timing/animation stays entirely in the scene (see game-ui-ux: event-driven
 * HUD, no polling).
 */
export class GameController extends Emitter<EventMap> {
  private round!: Round;
  private dealer: Seat = 0;
  private matchScore: Record<Team, number> = { 0: 0, 1: 0 };
  private matchOver = false;
  private readonly rand: () => number;

  constructor(rand: () => number = Math.random) {
    super();
    this.rand = rand;
  }

  getRound(): Round {
    return this.round;
  }

  getMatchScore(): Readonly<Record<Team, number>> {
    return this.matchScore;
  }

  startMatch(): void {
    this.matchScore = { 0: 0, 1: 0 };
    this.matchOver = false;
    this.dealer = 0;
    this.dealHand();
  }

  private dealHand(): void {
    this.round = new Round(this.dealer, this.rand);
    this.emit("hand:dealt", {
      dealer: this.dealer,
      hands: this.round.hands,
      groundCard: this.round.groundCard,
      round: this.round.bidding.round,
    });
  }

  /** Advances the game by exactly one action. The scene calls this in a loop, pacing with its own delays. */
  step(): StepResult {
    if (this.matchOver) return "match-complete";

    if (this.round.phase === "bidding") {
      const seat = this.round.bidding.turnSeat;
      if (seat === HUMAN_SEAT) {
        this.emit("bidding:turn", { seat, calls: this.round.legalBids(), round: this.round.bidding.round });
        return "waiting-human";
      }
      const bid = decideBid(seat, this.round.hands[seat], this.round.bidding);
      this.applyBid(bid);
      return "advanced";
    }

    if (this.round.phase === "playing") {
      const seat = this.round.turnSeat!;
      if (seat === HUMAN_SEAT) {
        this.emit("play:turn", { seat, legal: this.round.legalMovesFor(seat) });
        return "waiting-human";
      }
      const card = decideCard(
        this.round.hands[seat],
        this.round.currentTrick!,
        this.round.bidding.result!.mode,
        this.round.bidding.result!.trumpSuit,
        seat,
      );
      this.applyCard(seat, card);
      return "advanced";
    }

    return "idle";
  }

  submitPlayerBid(bid: Bid): void {
    if (this.round.phase !== "bidding" || this.round.bidding.turnSeat !== HUMAN_SEAT) {
      throw new Error("Not the human's turn to bid");
    }
    this.applyBid(bid);
  }

  submitPlayerCard(card: Card): void {
    if (this.round.phase !== "playing" || this.round.turnSeat !== HUMAN_SEAT) {
      throw new Error("Not the human's turn to play");
    }
    this.applyCard(HUMAN_SEAT, card);
  }

  private applyBid(bid: Bid): void {
    this.round.bid(bid);
    this.emit("bidding:bid", { bid });

    if (this.round.bidding.redeal) {
      this.dealer = nextSeat(this.dealer);
      this.dealHand();
      return;
    }
    if (this.round.bidding.result) {
      const { mode, trumpSuit, declarer } = this.round.bidding.result;
      this.emit("bidding:resolved", { mode, trumpSuit, declarer, hands: this.round.hands });
    }
  }

  private applyCard(seat: Seat, card: Card): void {
    const tricksBefore = this.round.tricks.length;
    this.round.playCard(seat, card);
    this.emit("play:card", { seat, card });

    if (this.round.tricks.length > tricksBefore) {
      const finishedTrick = this.round.tricks[this.round.tricks.length - 1];
      this.emit("trick:complete", { trick: finishedTrick, winner: finishedTrick.winner! });
    }

    if (this.round.phase === "complete") {
      const result = this.round.result!;
      this.matchScore = {
        0: this.matchScore[0] + result.scoredPoints[0],
        1: this.matchScore[1] + result.scoredPoints[1],
      };
      this.emit("hand:complete", { result, matchScore: this.matchScore });

      if (this.matchScore[0] >= MATCH_TARGET || this.matchScore[1] >= MATCH_TARGET) {
        if (this.matchScore[0] !== this.matchScore[1]) {
          this.matchOver = true;
          const winner: Team = this.matchScore[0] > this.matchScore[1] ? 0 : 1;
          this.emit("match:complete", { winner, matchScore: this.matchScore });
          return;
        }
      }
      this.dealer = nextSeat(this.dealer);
      this.dealHand();
    }
  }
}
