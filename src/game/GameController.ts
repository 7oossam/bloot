import { decideBid } from "../ai/bidding-ai";
import { decideCard } from "../ai/play-ai";
import type { LegalCall } from "../engine/bidding";
import { Round } from "../engine/round";
import type { Bid, Card, HandResult, Mode, Seat, Suit, Team, Trick } from "../engine/types";
import { nextSeat, teamOf } from "../engine/types";
import { Emitter } from "./emitter";

export const HUMAN_SEAT: Seat = 0;
export const MATCH_TARGET = 152;

export interface MatchOptions {
  /** Score needed to win the match. Defaults to the standard 152 — a roguelike node can shorten this. */
  matchTarget?: number;
  /** Extra points credited to each team before the first hand (a "head start" joker). */
  headStart?: Partial<Record<Team, number>>;
  /** Overrides the last-trick ("الأرض") bonus, normally 10, for every hand in this match. */
  lastTrickBonus?: number;
  /** Extra game points for your team when it bought hokum and out-scored the other side. */
  hokumMadeBonus?: number;
  /** Multiplies your team's game points on a hand it bought as sun. */
  sunMultiplier?: number;
  /** While the opponents lead by at least `deficit`, every hand your team scores in gets +`bonus`. */
  comeback?: { deficit: number; bonus: number };
  /** Gold for every trick your team takes that has an Ace in it. */
  goldPerAceTrick?: number;
  /** Your first five cards always include a Jack. */
  guaranteeJack?: boolean;
  /** Taking all eight tricks in a hand wins the match on the spot. */
  kabootWinsMatch?: boolean;
  /** UI-only effects, read by the table scene. */
  spy?: boolean;
  revealPartner?: boolean;
}

/** One line in the hand summary for each joker that paid out. */
export interface HandBonus {
  label: string;
  points: number;
}

interface EventMap {
  [key: string]: unknown;
  "hand:dealt": { dealer: Seat; hands: Record<Seat, Card[]>; groundCard: Card; round: number };
  /** `challenge` is set when the question is "take this hokum as sun?" rather than an open bid. */
  "bidding:turn": { seat: Seat; calls: LegalCall[]; round: 1 | 2; challenge?: { seat: Seat; suit: Suit } };
  "bidding:bid": { bid: Bid };
  "bidding:resolved": { mode: Mode; trumpSuit?: Suit; declarer: Seat; hands: Record<Seat, Card[]> };
  "play:turn": { seat: Seat; legal: Card[] };
  "play:card": { seat: Seat; card: Card };
  "trick:complete": { trick: Trick; winner: Seat };
  "hand:complete": {
    result: HandResult;
    matchScore: Record<Team, number>;
    /** Game points each team actually banked this hand, joker bonuses included. */
    gained: Record<Team, number>;
    bonuses: HandBonus[];
    /** True when your team took all eight tricks. */
    kaboot: boolean;
  };
  "gold:earned": { amount: number; reason: string };
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
  private readonly matchTarget: number;
  private readonly headStart: Partial<Record<Team, number>>;
  private readonly lastTrickBonus: number | undefined;
  private readonly options: MatchOptions;

  constructor(rand: () => number = Math.random, options: MatchOptions = {}) {
    super();
    this.rand = rand;
    this.options = options;
    this.matchTarget = options.matchTarget ?? MATCH_TARGET;
    this.headStart = options.headStart ?? {};
    this.lastTrickBonus = options.lastTrickBonus;
  }

  getRound(): Round {
    return this.round;
  }

  getMatchScore(): Readonly<Record<Team, number>> {
    return this.matchScore;
  }

  getMatchTarget(): number {
    return this.matchTarget;
  }

  startMatch(): void {
    this.matchScore = { 0: this.headStart[0] ?? 0, 1: this.headStart[1] ?? 0 };
    this.matchOver = false;
    this.dealer = 0;
    this.dealHand();
  }

  private dealHand(): void {
    this.round = new Round(this.dealer, this.rand, {
      lastTrickBonus: this.lastTrickBonus,
      guaranteeJackFor: this.options.guaranteeJack ? HUMAN_SEAT : undefined,
    });
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
        this.emit("bidding:turn", {
          seat,
          calls: this.round.legalBids(),
          round: this.round.bidding.round,
          challenge: this.round.bidding.pendingHokum,
        });
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

  /** Turns a hand's base game points into what each team banks, after the run's jokers. */
  private applyJokers(result: HandResult): { gained: Record<Team, number>; bonuses: HandBonus[] } {
    const us = teamOf(HUMAN_SEAT);
    const them: Team = us === 0 ? 1 : 0;
    const gained: Record<Team, number> = { ...result.gamePoints };
    const bonuses: HandBonus[] = [];
    const weBought = result.declarerTeam === us;
    const o = this.options;

    if (o.sunMultiplier && result.mode === "sun" && weBought && gained[us] > 0) {
      const extra = Math.round(gained[us] * (o.sunMultiplier - 1));
      if (extra > 0) {
        gained[us] += extra;
        bonuses.push({ label: "الصن الملكي", points: extra });
      }
    }
    if (o.hokumMadeBonus && result.mode === "hokum" && weBought && result.scoredPoints[us] > result.scoredPoints[them]) {
      gained[us] += o.hokumMadeBonus;
      bonuses.push({ label: "سيد الحكم", points: o.hokumMadeBonus });
    }
    if (o.comeback && gained[us] > 0 && this.matchScore[them] - this.matchScore[us] >= o.comeback.deficit) {
      gained[us] += o.comeback.bonus;
      bonuses.push({ label: "الرجعة", points: o.comeback.bonus });
    }
    return { gained, bonuses };
  }

  private applyCard(seat: Seat, card: Card): void {
    const tricksBefore = this.round.tricks.length;
    this.round.playCard(seat, card);
    this.emit("play:card", { seat, card });

    if (this.round.tricks.length > tricksBefore) {
      const finishedTrick = this.round.tricks[this.round.tricks.length - 1];
      this.emit("trick:complete", { trick: finishedTrick, winner: finishedTrick.winner! });
      const perAce = this.options.goldPerAceTrick;
      if (perAce && teamOf(finishedTrick.winner!) === teamOf(HUMAN_SEAT)) {
        const aces = Object.values(finishedTrick.cards).filter((c) => c?.rank === "A").length;
        if (aces > 0) this.emit("gold:earned", { amount: perAce * aces, reason: "اللمسة الذهبية" });
      }
    }

    if (this.round.phase === "complete") {
      const result = this.round.result!;
      const { gained, bonuses } = this.applyJokers(result);
      // Match targets are in game points (abnat), not card points — adding raw card points
      // (162 a hokum hand) against a target of 41 ended every match on its first hand.
      this.matchScore = {
        0: this.matchScore[0] + gained[0],
        1: this.matchScore[1] + gained[1],
      };
      const us = teamOf(HUMAN_SEAT);
      const kaboot = result.tricksWon[us] === 8;
      this.emit("hand:complete", { result, matchScore: this.matchScore, gained, bonuses, kaboot });

      if (kaboot && this.options.kabootWinsMatch) {
        this.matchOver = true;
        this.emit("match:complete", { winner: us, matchScore: this.matchScore });
        return;
      }

      if (this.matchScore[0] >= this.matchTarget || this.matchScore[1] >= this.matchTarget) {
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
