import { decideBid } from "../ai/bidding-ai";
import { decideCard } from "../ai/play-ai";
import { decideDouble } from "../ai/doubling-ai";
import type { DoubleBid, DoubleLevel, LegalDouble } from "../engine/doubling";
import type { LegalCall } from "../engine/bidding";
import { Round } from "../engine/round";
import type { Bid, Card, HandResult, Mode, Seat, Suit, Team, Trick } from "../engine/types";
import { nextSeat, teamOf } from "../engine/types";
import { rankStrength } from "../engine/cards";
import type { ProjectsOutcome } from "../engine/projects";
import { isAkka } from "../engine/trick";
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
  /** Your team's projects are worth this many times their game points. */
  projectMultiplier?: number;
  /** +points every hand your team scores a project (the مشروع synergy). */
  projectSynergyBonus?: number;
  /** Your team's بلوت pays extra points and gold. */
  balootBonus?: { points: number; gold: number };
  /** Gold whenever your team takes الأرض (the last trick). */
  groundGold?: number;
  /** +points whenever the other team bought and lost (خسرانة). */
  rivalLossBonus?: number;
  /** A doubled hand your team wins pays this fraction extra. */
  doubleWinBonus?: number;
  /** Gold for every آكه your team calls. */
  akkaGold?: number;
  /** Gold for every hand your team loses. */
  lossGold?: number;
  /** Extra points and gold when your team takes a كبوت. */
  kabootBonus?: { points: number; gold: number };
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
  /** `round` is the bidding round the call was made in (a pass is بس in the first, ولا in the second). */
  "bidding:bid": { bid: Bid; round: 1 | 2 };
  /** The human may raise in the دبل round. */
  "double:turn": { seat: Seat; calls: LegalDouble[]; level: DoubleLevel };
  "double:call": { bid: DoubleBid; level: DoubleLevel; closed: boolean };
  "bidding:resolved": { mode: Mode; trumpSuit?: Suit; declarer: Seat; hands: Record<Seat, Card[]> };
  "play:turn": { seat: Seat; legal: Card[] };
  /** `akka` when the lead is آكه; `baloot` when this card completes بلوت. */
  "play:card": { seat: Seat; card: Card; akka?: boolean; baloot?: boolean };
  /** المشاريع, decided the moment play starts. */
  "projects:declared": ProjectsOutcome;
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
  /** `qahwa` when a قهوة hand decided the match outright. */
  "match:complete": { winner: Team; matchScore: Record<Team, number>; qahwa?: boolean };
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
      // 7-2's "100 of 152" scaled to this match's target.
      doubling: { matchScore: { ...this.matchScore }, sunLimit: Math.round((this.matchTarget * 100) / 152) },
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

    if (this.round.phase === "doubling") {
      const state = this.round.doubling!;
      const seat = state.turnSeat;
      if (seat === HUMAN_SEAT) {
        this.emit("double:turn", { seat, calls: this.round.legalDoubleCalls(), level: state.level });
        return "waiting-human";
      }
      this.applyDouble(decideDouble(seat, this.round.hands[seat], state, this.round.bidding.result!.trumpSuit));
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
      const result = this.round.bidding.result!;
      const card = decideCard(this.round.hands[seat], this.round.currentTrick!, result.mode, result.trumpSuit, seat, {
        tricks: this.round.tricks,
        declarer: result.declarer,
        // أشكل is a message to the caller's partner only (docs/baloot-guide.md §3).
        ashkalSuits: seat === result.ashkal?.groundTo ? result.ashkal.signalSuits : undefined,
        closed: this.round.closed,
      });
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

  submitPlayerDouble(bid: DoubleBid): void {
    if (this.round.phase !== "doubling" || this.round.doubling?.turnSeat !== HUMAN_SEAT) {
      throw new Error("Not the human's turn in the دبل round");
    }
    this.applyDouble(bid);
  }

  private applyDouble(bid: DoubleBid): void {
    this.round.double(bid);
    const state = this.round.doubling!;
    this.emit("double:call", { bid, level: state.level, closed: state.closed });
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
    if (o.groundGold && ours && handOver) this.emit("gold:earned", { amount: o.groundGold, reason: "حارس الأرض" });
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
    const round = this.round.bidding.round;
    this.round.bid(bid);
    this.emit("bidding:bid", { bid, round });

    if (this.round.bidding.redeal) {
      this.dealer = nextSeat(this.dealer);
      this.dealHand();
      return;
    }
    if (this.round.bidding.result) {
      const { mode, trumpSuit, declarer } = this.round.bidding.result;
      this.emit("bidding:resolved", { mode, trumpSuit, declarer, hands: this.round.hands });
      if (this.round.projects) this.emit("projects:declared", this.round.projects);

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
    // "Made" = the buyer's side wasn't the one that lost the hand (a دبل can flip who's judged).
    const sheet = result.sheet;
    const buyerWon = !sheet || (sheet.judgedTeam === result.declarerTeam ? sheet.outcome === "won" : sheet.outcome === "lost");
    const madeHokum = result.mode === "hokum" && weBought && buyerWon;
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
    const ourProjects = result.projectPoints?.[us] ?? 0;
    if (o.projectMultiplier && ourProjects > 0) {
      const extra = Math.round(ourProjects * (o.projectMultiplier - 1));
      gained[us] += extra;
      bonuses.push({ label: "مهندس المشاريع", points: extra });
    }
    if (o.projectSynergyBonus && ourProjects > 0) {
      gained[us] += o.projectSynergyBonus;
      bonuses.push({ label: "تآزر المشاريع", points: o.projectSynergyBonus });
    }
    if (o.balootBonus && result.baloot !== undefined && teamOf(result.baloot) === us) {
      gained[us] += o.balootBonus.points;
      bonuses.push({ label: "البلوت الملكي", points: o.balootBonus.points });
      this.emit("gold:earned", { amount: o.balootBonus.gold, reason: "البلوت الملكي" });
    }
    if (o.rivalLossBonus && result.declarerTeam === them && !buyerWon) {
      gained[us] += o.rivalLossBonus;
      bonuses.push({ label: "الفخ", points: o.rivalLossBonus });
    }
    if (o.doubleWinBonus && sheet?.double && sheet.winner === us) {
      const extra = Math.round(result.gamePoints[us] * o.doubleWinBonus);
      gained[us] += extra;
      bonuses.push({ label: "القهوجي", points: extra });
    }
    if (o.kabootBonus && result.tricksWon[us] === 8) {
      gained[us] += o.kabootBonus.points;
      bonuses.push({ label: "الكبوت الذهبي", points: o.kabootBonus.points });
      this.emit("gold:earned", { amount: o.kabootBonus.gold, reason: "الكبوت الذهبي" });
    }
    if (o.lossGold && gained[us] < gained[them]) this.emit("gold:earned", { amount: o.lossGold, reason: "الصبر مفتاح" });
    if (o.comeback && gained[us] > 0 && this.matchScore[them] - this.matchScore[us] >= o.comeback.deficit) {
      gained[us] += o.comeback.bonus;
      bonuses.push({ label: "الرجعة", points: o.comeback.bonus });
    }
    return { gained, bonuses };
  }

  private applyCard(seat: Seat, card: Card): void {
    const tricksBefore = this.round.tricks.length;
    const { mode, trumpSuit } = this.round.bidding.result!;
    const leading = this.round.currentTrick!.order.length === 0;
    const akka = leading && isAkka(card, this.round.tricks.flatMap((t) => Object.values(t.cards) as Card[]), mode, trumpSuit);
    const balootBefore = this.round.balootDeclared;
    this.round.playCard(seat, card);
    const baloot = !balootBefore && this.round.balootDeclared;
    this.emit("play:card", { seat, card, akka: akka || undefined, baloot: baloot || undefined });
    if (akka && this.options.akkaGold && teamOf(seat) === teamOf(HUMAN_SEAT)) {
      this.emit("gold:earned", { amount: this.options.akkaGold, reason: "ذهب الآكه" });
    }

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

      // قهوة: whoever took the hand takes the match.
      if (result.sheet?.double?.level === 5 && result.sheet.winner !== undefined) {
        this.matchOver = true;
        this.emit("match:complete", { winner: result.sheet.winner, matchScore: this.matchScore, qahwa: true });
        return;
      }

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
