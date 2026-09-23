import { decideBid } from "../ai/bidding-ai";
import { decideCard } from "../ai/play-ai";
import type { LegalCall } from "../engine/bidding";
import { Round } from "../engine/round";
import type { Bid, Card, HandResult, Mode, Seat, Suit, Team, Trick } from "../engine/types";
import { nextSeat, teamOf } from "../engine/types";
import { rankStrength } from "../engine/cards";
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
  /** The same, from the حكم synergy rather than a joker (shown as its own line). */
  hokumSynergyBonus?: number;
  /** Multiplies your team's game points on a hand it bought as sun. */
  sunMultiplier?: number;
  /** While the opponents lead by at least `deficit`, every hand your team scores in gets +`bonus`. */
  comeback?: { deficit: number; bonus: number };
  /** Gold for every trick your team takes that has an Ace in it. */
  goldPerAceTrick?: number;
  /** Your first five cards always include at least this many Jacks. */
  guaranteedJacks?: number;
  /** Taking all eight tricks in a hand wins the match on the spot. */
  kabootWinsMatch?: boolean;
  /** Your team's hokum can't be taken over as sun. */
  lockedHokum?: boolean;
  /** Extra game points whenever your team buys sun and scores in it. */
  sunBuyBonus?: number;
  /** In sun, extra game points per trick your team takes that has an Ace in it. */
  sunAceBonus?: number;
  /** Extra game points per trick your team takes with a Jack as the winning card. */
  jackTrickBonus?: number;
  /** When you buy hokum, turn one of your cards into the trump Jack (and the 9 at level 2). */
  forgedJack?: { nine: boolean; partnerToo: boolean };
  /** Winning a trick with the trump Jack lets you swap a card with a random opponent card. */
  jackHunt?: { preferTrump: boolean; nineToo: boolean; partnerToo: boolean };
  /** Winning a trick with the trump Jack burns an opponent's best trump into a 7. */
  burn?: { bothOpponents: boolean; partnerToo: boolean };
  /** UI-only effects, read by the table scene. */
  spyCards?: number;
  revealPartner?: boolean;
}

/** Something the human has to decide mid-hand because a joker fired: which card to use. */
export type PendingAction =
  | { kind: "transform"; to: Card }
  | { kind: "swap"; preferTrump: boolean };

/** What a joker just did to someone's hand, for the scene to show. */
export type HandChange =
  | { kind: "transform"; seat: Seat; from: Card; to: Card }
  | { kind: "swap"; seat: Seat; gave: Card; got: Card; otherSeat: Seat }
  | { kind: "burn"; seat: Seat; from: Card; to: Card };

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
  "action:turn": { action: PendingAction };
  "hand:changed": HandChange;
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
  private pendingActions: PendingAction[] = [];
  /** Per-hand tallies for joker bonuses that pay out at the end of the hand. */
  private jackTricks = 0;
  private sunAceTricks = 0;

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
    this.pendingActions = [];
    this.jackTricks = 0;
    this.sunAceTricks = 0;
    this.round = new Round(this.dealer, this.rand, {
      lastTrickBonus: this.lastTrickBonus,
      guaranteeJackFor: this.options.guaranteedJacks ? HUMAN_SEAT : undefined,
      guaranteedJacks: this.options.guaranteedJacks,
      lockedHokumTeams: this.options.lockedHokum ? [teamOf(HUMAN_SEAT)] : [],
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

    if (this.round.phase === "playing" && this.pendingActions.length > 0) {
      this.emit("action:turn", { action: this.pendingActions[0] });
      return "waiting-human";
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

  /** The card the human picked for the pending joker action (a card from their own hand). */
  submitPlayerAction(card: Card): void {
    const action = this.pendingActions.shift();
    if (!action) throw new Error("No joker action is waiting");
    if (action.kind === "transform") {
      this.round.replaceCard(HUMAN_SEAT, card, action.to);
      this.emit("hand:changed", { kind: "transform", seat: HUMAN_SEAT, from: card, to: action.to });
      return;
    }
    const opponents = ([1, 3] as Seat[]).filter((s) => this.round.hands[s].length > 0);
    const other = opponents[Math.floor(this.rand() * opponents.length)];
    const theirHand = this.round.hands[other];
    const trump = this.round.bidding.result?.trumpSuit;
    const trumps = action.preferTrump && trump ? theirHand.filter((c) => c.suit === trump) : [];
    const pool = trumps.length > 0 ? trumps : theirHand;
    const got = pool[Math.floor(this.rand() * pool.length)];
    this.round.swapCards(HUMAN_SEAT, card, other, got);
    this.emit("hand:changed", { kind: "swap", seat: HUMAN_SEAT, gave: card, got, otherSeat: other });
  }

  getPendingAction(): PendingAction | undefined {
    return this.pendingActions[0];
  }

  /** Jokers that fire the moment a trick is decided. */
  private onTrickDecided(trick: Trick): void {
    const result = this.round.bidding.result!;
    const winner = trick.winner!;
    const us = teamOf(HUMAN_SEAT);
    const ours = teamOf(winner) === us;
    const card = trick.cards[winner]!;
    const trump = result.mode === "hokum" ? result.trumpSuit : undefined;
    const isTrumpJack = !!trump && card.suit === trump && card.rank === "J";
    const isTrumpNine = !!trump && card.suit === trump && card.rank === "9";
    const handOver = this.round.tricks.length === 8;
    const o = this.options;

    if (ours && card.rank === "J") this.jackTricks++;
    if (ours && result.mode === "sun" && Object.values(trick.cards).some((c) => c?.rank === "A")) this.sunAceTricks++;

    if (o.goldPerAceTrick && ours) {
      const aces = Object.values(trick.cards).filter((c) => c?.rank === "A").length;
      if (aces > 0) this.emit("gold:earned", { amount: o.goldPerAceTrick * aces, reason: "اللمسة الذهبية" });
    }
    if (handOver || !ours) return;

    const byMe = winner === HUMAN_SEAT;
    if (o.burn && isTrumpJack && (byMe || o.burn.partnerToo)) {
      const targets = ([1, 3] as Seat[]).filter((s) => this.round.hands[s].some((c) => c.suit === trump));
      const chosen = o.burn.bothOpponents || targets.length <= 1 ? targets : [targets[Math.floor(this.rand() * targets.length)]];
      for (const seat of chosen) {
        const best = this.round.hands[seat]
          .filter((c) => c.suit === trump)
          .sort((a, b) => rankStrength(b, "hokum", trump) - rankStrength(a, "hokum", trump))[0];
        const ash: Card = { suit: (["S", "H", "D", "C"] as Suit[]).find((x) => x !== trump)!, rank: "7" };
        this.round.replaceCard(seat, best, ash);
        this.emit("hand:changed", { kind: "burn", seat, from: best, to: ash });
      }
    }
    if (o.jackHunt && (isTrumpJack || (o.jackHunt.nineToo && isTrumpNine)) && (byMe || o.jackHunt.partnerToo)) {
      this.pendingActions.push({ kind: "swap", preferTrump: o.jackHunt.preferTrump });
    }
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

      const forged = this.options.forgedJack;
      const ourBuy = declarer === HUMAN_SEAT || (!!forged?.partnerToo && teamOf(declarer) === teamOf(HUMAN_SEAT));
      if (forged && mode === "hokum" && ourBuy) {
        this.pendingActions.push({ kind: "transform", to: { suit: trumpSuit!, rank: "J" } });
        if (forged.nine) this.pendingActions.push({ kind: "transform", to: { suit: trumpSuit!, rank: "9" } });
      }
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
    const madeHokum = result.mode === "hokum" && weBought && result.scoredPoints[us] > result.scoredPoints[them];
    if (madeHokum && o.hokumMadeBonus) {
      gained[us] += o.hokumMadeBonus;
      bonuses.push({ label: "سيد الحكم", points: o.hokumMadeBonus });
    }
    if (madeHokum && o.hokumSynergyBonus) {
      gained[us] += o.hokumSynergyBonus;
      bonuses.push({ label: "تآزر الحكم", points: o.hokumSynergyBonus });
    }
    if (o.sunBuyBonus && result.mode === "sun" && weBought && gained[us] > 0) {
      gained[us] += o.sunBuyBonus;
      bonuses.push({ label: "تآزر الصن", points: o.sunBuyBonus });
    }
    if (o.sunAceBonus && this.sunAceTricks > 0) {
      const pts = o.sunAceBonus * this.sunAceTricks;
      gained[us] += pts;
      bonuses.push({ label: "إكك الصن", points: pts });
    }
    if (o.jackTrickBonus && this.jackTricks > 0) {
      const pts = o.jackTrickBonus * this.jackTricks;
      gained[us] += pts;
      bonuses.push({ label: "أكلات الأولاد", points: pts });
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
      this.onTrickDecided(finishedTrick);
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
