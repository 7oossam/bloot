import { decideBid } from "../ai/bidding-ai";
import { decideCard } from "../ai/play-ai";
import { decideDouble } from "../ai/doubling-ai";
import type { DoubleBid, DoubleLevel, LegalDouble } from "../engine/doubling";
import type { LegalCall } from "../engine/bidding";
import { Round, type RoundOptions } from "../engine/round";
import { finalizeDeal } from "../engine/deck";
import type { Bid, BiddingResult, Card, HandResult, Mode, Seat, Suit, Team, Trick } from "../engine/types";
import { nextSeat, teamOf } from "../engine/types";
import { rankStrength } from "../engine/cards";
import { BALOOT_VALUE, PROJECT_VALUE, type ProjectsOutcome } from "../engine/projects";
import { currentWinner, isAkka, wouldWinAgainstCurrent } from "../engine/trick";
import { cardId } from "../engine/cards";
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
    /** 7s and 8s now have higher trick-taking power than Aces in their tier. */
    trashBeatsAce?: boolean;
    /** 3-of-a-kind projects count as 4-of-a-kind, and 3-card Sira counts as 4-card. */
    phantomProjects?: boolean;
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
  /** Flat bonuses paid on every hand your team wins (شيخ القبيلة، المايسترو، الحصالة). */
  winBonuses?: Array<{ label: string; points: number }>;
  /** الصراف: at the end of each hand, +1 point per `per` gold held (gold at the start plus earned), capped. */
  goldToPoints?: { per: number; cap: number; startingGold: number };
  /** Points per trick your team takes by trumping (hokum). */
  ruffBonus?: number;
  /** المقامر: multiplies your team's hand result... */
  gamblerMultiplier?: number;
  /** ...and costs this much gold every hand you lose. */
  lossGoldCost?: number;
  /** Gold per game point of projects your team scores (×this). */
  projectGold?: number;
  /** Gold for every hand your team wins (the ذهب synergy at 4). */
  winGold?: number;
  /** Your team's projects count even when the other side's are bigger (the مشروع synergy at 3). */
  projectsAlwaysCount?: boolean;
  // ---- play-changing jokers
  /** سيد الأرض: taking الأرض (the last trick) takes the whole hand. */
  groundWins?: boolean;
  /** المخلّي: points every time you could have taken a trick from the opponents and didn't. */
  duckBonus?: number;
  /** الورقة الأخيرة: your card in the last trick counts as the top of its suit. */
  lastCardTop?: boolean;
  /** الحكم الأعزل: a hokum you buy without the trump Jack and 9 and make pays this multiple. */
  bareHokumMultiplier?: number;
  /** الحكم الحر / سبيت دايم: you may buy hokum in these suits in either round. */
  extraHokumSuits?: Suit[];
  /** الحكم المقفول: nobody may double your team's contract. */
  noDoubleAgainst?: boolean;
  /** نص سرا: two cards in sequence make a سرا for you. */
  shortSira?: boolean;
  /** الأربع الصغار: four 7s/8s/9s are a مئة for you. */
  lowFours?: boolean;
  /** صانع السرا: every سرا your team scores pays points and gold. */
  siraBonus?: { points: number; gold: number };
  /** صاحب الحلة: you always lead the first trick. */
  alwaysLead?: boolean;
  /** الضربة الأولى: your team takes the first trick. */
  firstTrickBonus?: number;
  /** العرّاف: see the cards you'd get if you buy (UI). */
  oracle?: boolean;
  /** ملك الآكه: every trick your team takes with a card it called آكه on. */
  akkaTrickBonus?: number;
  /** ملك السبيت: your cards of this suit act as trumps (below a real trump). */
  personalTrump?: Suit;
  /** سارق السبيت: at the start of play, trade a card for an opponent's spade (their best at `best`). */
  spadeThief?: { best: boolean; twice: boolean };
  /** كنز السبيت: every trick your team takes with a card of this suit. */
  suitTrickBonus?: { suit: Suit; points: number };
  /** UI-only effects, read by the table scene. */
  spyCards?: number;
  revealPartner?: boolean;
}

/** Something the human has to decide mid-hand because a joker fired: which card to use. */
export type PendingAction =
  | { kind: "transform"; to: Card }
  | { kind: "swap"; preferTrump: boolean; suit?: Suit; best?: boolean };

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
  private ruffTricks = 0;
  private ducks = 0;
  private akkaWins = 0;
  private suitTricks = 0;
  private firstTrickOurs = false;
  private lastTrickOurs = false;
  /** undefined until your first card of the hand: did you hold neither the trump J nor 9? */
  private bareHokum?: boolean;
  private akkaCards = new Set<string>();
  /** Gold this match has paid out so far (for الصراف). */
  private goldEarned = 0;

  constructor(rand: () => number = Math.random, options: MatchOptions = {}) {
    super();
    this.rand = rand;
    this.options = options;
    this.matchTarget = options.matchTarget ?? MATCH_TARGET;
    this.headStart = options.headStart ?? {};
    this.lastTrickBonus = options.lastTrickBonus;
  }

  /** Counts every gold payout, so الصراف can see what's been earned this match. */
  override emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    if (event === "gold:earned") this.goldEarned += (payload as { amount: number }).amount;
    super.emit(event, payload);
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
    this.goldEarned = 0;
    this.dealer = 0;
    this.dealHand();
  }

  private dealHand(): void {
    this.pendingActions = [];
    this.jackTricks = 0;
    this.sunAceTricks = 0;
    this.ruffTricks = 0;
    this.ducks = 0;
    this.akkaWins = 0;
    this.suitTricks = 0;
    this.firstTrickOurs = false;
    this.lastTrickOurs = false;
    this.bareHokum = undefined;
    this.akkaCards = new Set();
    this.round = new Round(this.dealer, this.rand, {
      lastTrickBonus: this.lastTrickBonus,
      guaranteeJackFor: this.options.guaranteedJacks ? HUMAN_SEAT : undefined,
      guaranteedJacks: this.options.guaranteedJacks,
      lockedHokumTeams: this.options.lockedHokum ? [teamOf(HUMAN_SEAT)] : [],
      // 7-2's "100 of 152" scaled to this match's target.
      doubling: { matchScore: { ...this.matchScore }, sunLimit: Math.round((this.matchTarget * 100) / 152) },
      ...this.jokerRoundRules(),
    });
    this.emit("hand:dealt", {
      dealer: this.dealer,
      hands: this.round.hands,
      groundCard: this.round.groundCard,
      round: this.round.bidding.round,
    });
  }

  /** The Round-level rules the run's jokers bend. */
  private jokerRoundRules(): Partial<RoundOptions> {
    const o = this.options;
    const us = teamOf(HUMAN_SEAT);
    const rules: Partial<RoundOptions> = {};
    if (o.extraHokumSuits?.length) rules.extraHokum = { seat: HUMAN_SEAT, suits: o.extraHokumSuits };
    if (o.alwaysLead) rules.firstLeader = HUMAN_SEAT;
    if (o.shortSira || o.lowFours || o.phantomProjects) rules.projectRules = { [HUMAN_SEAT]: { shortSira: o.shortSira, lowFours: o.lowFours, phantomProjects: o.phantomProjects } };
    if (o.noDoubleAgainst) rules.noDoubleAgainst = [us];
    if (o.personalTrump) { rules.trickRules = rules.trickRules ?? {}; rules.trickRules.personalTrump = { seat: HUMAN_SEAT, suit: o.personalTrump }; }
    if (o.trashBeatsAce) { rules.trickRules = rules.trickRules ?? {}; rules.trickRules.trashBeatsAce = true; }
    if (o.lastCardTop) rules.lastCardTop = HUMAN_SEAT;
    return rules;
  }

  /** العرّاف: the cards you'd be dealt on top of your five if you bought now. */
  previewIfBuy(): Card[] {
    if (this.round.phase !== "bidding") return [];
    const fake = { mode: "sun", declarer: HUMAN_SEAT, declarerTeam: teamOf(HUMAN_SEAT), history: [] } as BiddingResult;
    return finalizeDeal(this.round.initial, fake)[HUMAN_SEAT].slice(5);
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
    const trump = this.round.bidding.result?.trumpSuit;
    const wanted = action.suit ?? (action.preferTrump ? trump : undefined);
    let opponents = ([1, 3] as Seat[]).filter((s) => this.round.hands[s].length > 0);
    // A suit-seeking swap goes to whoever holds that suit.
    const holders = wanted ? opponents.filter((s) => this.round.hands[s].some((c) => c.suit === wanted)) : [];
    if (holders.length) opponents = holders;
    const other = opponents[Math.floor(this.rand() * opponents.length)];
    const theirHand = this.round.hands[other];
    const ofSuit = wanted ? theirHand.filter((c) => c.suit === wanted) : [];
    const pool = ofSuit.length > 0 ? ofSuit : theirHand;
    const mode = this.round.bidding.result?.mode ?? "sun";
    const got = action.best
      ? pool.reduce((a, b) => (rankStrength(b, mode, trump) > rankStrength(a, mode, trump) ? b : a))
      : pool[Math.floor(this.rand() * pool.length)];
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
    const index = this.round.tricks.length - 1;
    if (index === 0 && ours) this.firstTrickOurs = true;
    if (handOver && ours) this.lastTrickOurs = true;
    if (ours && this.akkaCards.has(cardId(card))) this.akkaWins++;
    if (ours && o.suitTrickBonus && card.suit === o.suitTrickBonus.suit) this.suitTricks++;
    const led = trick.cards[trick.order[0]]!;
    if (ours && trump && card.suit === trump && led.suit !== trump) this.ruffTricks++;
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
      const thief = this.options.spadeThief;
      if (thief) {
        this.pendingActions.push({ kind: "swap", preferTrump: false, suit: "S", best: thief.best });
        if (thief.twice) this.pendingActions.push({ kind: "swap", preferTrump: false, suit: "S", best: thief.best });
      }
      if (forged && mode === "hokum" && ourBuy) {
        this.pendingActions.push({ kind: "transform", to: { suit: trumpSuit!, rank: "J" } });
        if (forged.nine) this.pendingActions.push({ kind: "transform", to: { suit: trumpSuit!, rank: "9" } });
      }
    }
  }

  /** Tallies for the play-changing jokers, read off the human's card before it's played. */
  private noteHumanPlay(card: Card): void {
    const trick = this.round.currentTrick!;
    const { mode, trumpSuit, declarer } = this.round.bidding.result!;
    if (this.bareHokum === undefined) {
      const hand = this.round.hands[HUMAN_SEAT];
      this.bareHokum =
        mode === "hokum" &&
        declarer === HUMAN_SEAT &&
        !hand.some((c) => c.suit === trumpSuit && (c.rank === "J" || c.rank === "9"));
    }
    // المخلّي: the opponents have the trick, you could take it, and you don't.
    if (trick.order.length > 0 && teamOf(currentWinner(trick, mode, trumpSuit)) !== teamOf(HUMAN_SEAT)) {
      const couldWin = this.round.legalMovesFor(HUMAN_SEAT).some((c) => wouldWinAgainstCurrent(c, trick, mode, trumpSuit));
      if (couldWin && !wouldWinAgainstCurrent(card, trick, mode, trumpSuit)) this.ducks++;
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

    // سيد الأرض: الأرض takes the whole hand — everything but the other side's own بلوت.
    if (o.groundWins && this.lastTrickOurs) {
      const theirBaloot = result.baloot !== undefined && teamOf(result.baloot) === them ? BALOOT_VALUE : 0;
      const total = result.gamePoints[us] + result.gamePoints[them];
      const extra = total - theirBaloot - gained[us];
      if (extra > 0) {
        gained[us] += extra;
        gained[them] = theirBaloot;
        bonuses.push({ label: "سيد الأرض", points: extra });
      }
    }
    if (o.bareHokumMultiplier && this.bareHokum && buyerWonEarly(result) && gained[us] > 0) {
      const extra = Math.round(gained[us] * (o.bareHokumMultiplier - 1));
      gained[us] += extra;
      bonuses.push({ label: "الحكم الأعزل", points: extra });
    }
    if (o.gamblerMultiplier && gained[us] > 0) {
      const extra = Math.round(gained[us] * (o.gamblerMultiplier - 1));
      if (extra > 0) {
        gained[us] += extra;
        bonuses.push({ label: "المقامر", points: extra });
      }
    }
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
    if (o.duckBonus && this.ducks > 0) {
      gained[us] += o.duckBonus * this.ducks;
      bonuses.push({ label: "المخلّي", points: o.duckBonus * this.ducks });
    }
    if (o.firstTrickBonus && this.firstTrickOurs) {
      gained[us] += o.firstTrickBonus;
      bonuses.push({ label: "الضربة الأولى", points: o.firstTrickBonus });
    }
    if (o.akkaTrickBonus && this.akkaWins > 0) {
      gained[us] += o.akkaTrickBonus * this.akkaWins;
      bonuses.push({ label: "ملك الآكه", points: o.akkaTrickBonus * this.akkaWins });
    }
    if (o.suitTrickBonus && this.suitTricks > 0) {
      gained[us] += o.suitTrickBonus.points * this.suitTricks;
      bonuses.push({ label: "كنز السبيت", points: o.suitTrickBonus.points * this.suitTricks });
    }
    if (o.siraBonus && this.round.projects) {
      const p = this.round.projects;
      const counts = p.winner === us || !!o.projectsAlwaysCount;
      const siras = counts ? p.declared.filter((d) => teamOf(d.seat) === us && d.kind === "sira").length : 0;
      if (siras > 0) {
        gained[us] += o.siraBonus.points * siras;
        bonuses.push({ label: "صانع السرا", points: o.siraBonus.points * siras });
        this.emit("gold:earned", { amount: o.siraBonus.gold * siras, reason: "صانع السرا" });
      }
    }
    if (o.ruffBonus && this.ruffTricks > 0) {
      const pts = o.ruffBonus * this.ruffTricks;
      gained[us] += pts;
      bonuses.push({ label: "القطّاع", points: pts });
    }
    // مشروع 3: our projects count even when theirs were bigger.
    const proj = this.round.projects;
    if (o.projectsAlwaysCount && proj && proj.winner !== undefined && proj.winner !== us) {
      const ours = proj.declared.filter((p) => teamOf(p.seat) === us).reduce((n, p) => n + PROJECT_VALUE[result.mode][p.kind], 0);
      if (ours > 0) {
        gained[us] += ours;
        bonuses.push({ label: "تآزر المشاريع", points: ours });
      }
    }
    if (o.projectGold && ourProjects > 0) this.emit("gold:earned", { amount: ourProjects * o.projectGold, reason: "دفتر المشاريع" });
    const handWon = result.gamePoints[us] > result.gamePoints[them];
    if (handWon) {
      for (const b of o.winBonuses ?? []) {
        gained[us] += b.points;
        bonuses.push(b);
      }
      if (o.winGold) this.emit("gold:earned", { amount: o.winGold, reason: "تآزر الذهب" });
    }
    if (o.goldToPoints) {
      const held = o.goldToPoints.startingGold + this.goldEarned;
      const pts = Math.min(Math.floor(held / o.goldToPoints.per), o.goldToPoints.cap);
      if (pts > 0) {
        gained[us] += pts;
        bonuses.push({ label: "الصراف", points: pts });
      }
    }
    if (o.lossGold && gained[us] < gained[them]) this.emit("gold:earned", { amount: o.lossGold, reason: "الصبر مفتاح" });
    if (o.lossGoldCost && gained[us] < gained[them]) this.emit("gold:earned", { amount: -o.lossGoldCost, reason: "المقامر" });
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
    if (seat === HUMAN_SEAT) this.noteHumanPlay(card);
    if (akka && teamOf(seat) === teamOf(HUMAN_SEAT)) this.akkaCards.add(cardId(card));
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

/** Whether the buying side made its contract (a دبل can flip who's judged). */
function buyerWonEarly(result: HandResult): boolean {
  const sheet = result.sheet;
  return !sheet || (sheet.judgedTeam === result.declarerTeam ? sheet.outcome === "won" : sheet.outcome === "lost");
}



