import { sawaHolds, sawaMove, type SawaTable } from "../engine/sawa";
import { decideBid } from "../ai/bidding-ai";
import { decideCard, type PlayContext } from "../ai/play-ai";
import { buildBeliefs } from "../ai/beliefs";
import { buyerWouldLose, searchCardTraced, type PlayTrace } from "../ai/mcts";
import { mulberry32 } from "../engine/rng";
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
import { raiserTeam } from "../engine/doubling";
import { cardId } from "../engine/cards";
import { Emitter } from "./emitter";
import { recordHand } from "./notes";
import type { RivalOptions } from "../roguelike/opponents";
import type { PartnerOptions } from "../roguelike/partners";

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
  /** Your team's 7s and 8s outside the trump suit beat the rest of their suit (ثورة الصغار). */
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
  // ---- build packages (see the design bible, PART 4)
  /** الحظ الواطي: your first five always hold this many 7s/8s. */
  guaranteedLow?: number;
  /** المرتّب: one card short of a run this long at the deal, you're dealt the missing card. */
  completeRunTo?: 3 | 4;
  /** المنزّل: once the contract is set, turn this many of your cards into the 8 of their suit. */
  lowForge?: number;
  /** الصبّاغ: once the contract is set, turn this many of your cards into the spade of the same rank. */
  dyeForge?: number;
  /** المرسال: once the contract is set, give your partner a card for their best card of its suit. */
  partnerSwap?: boolean;
  /** ثأر الصغار: points per trick your team takes with a 7 or an 8. */
  lowTrickBonus?: number;
  /** الزحف: from the third trick in a row, each one pays — level 1: 1, 1, 2, 2, 3, 3; level 2: 1, 2, 3, 4, 5, 6. */
  streakBonus?: number;
  /** الكاسر: when the other team buys sun and loses, your hand result is multiplied by this. */
  sunBreakMultiplier?: number;
  /** الصبر: gold for every hand the other team bought and you out-scored them. */
  defenseGold?: number;
  /** المترجم: the table shows you what every player's التهريب (and برقية) asks for. */
  translator?: boolean;
  /** الإشارة الذهبية: a hand where your partner answered your signal and you took that trick is multiplied by this. */
  signalMultiplier?: number;
  /** The تهريب synergy: points per trick your partner leads in a suit you asked for and your team takes. */
  signalTrickBonus?: number;
  /** الآكه الذهبية: gold per آكه your team leads that takes its trick; points lost per one that gets cut. */
  akkaGamble?: { gold: number; penalty: number };
  /** السوا joker: a right سوا pays `bonus` (the button itself is for everyone). */
  sawa?: { bonus: number };
  /** الجريء: your team may double a sun contract whatever the 100-point rule says. */
  freeSunDouble?: boolean;
  /** رأس المال: a doubled hand your team wins pays (double level × this) gold. */
  doubleGold?: number;
  /** الوجه البارد: once your team has raised, the opponents never raise back. */
  pokerFace?: boolean;
  /** The دبل synergy: points on every doubled hand your team wins. */
  doubleWinPoints?: number;
  /**
   * The computer players think ahead (src/ai/mcts.ts): each card is tried against guesses at the
   * hidden hands and played out. Off, they play the rule-based AI straight. The table turns it on.
   */
  searchAI?: boolean;
  /** Who sits across from you and how they play (src/roguelike/partners.ts). */
  partner?: PartnerOptions;
  /** Their name for the table (UI only). */
  partnerLabel?: string;
  /** The opponents this match is played against and their rules (src/roguelike/opponents.ts). */
  rival?: RivalOptions;
  /** Their name and icon, for the table. */
  rivalLabel?: string;
  /** Their rule as the table shows it (UI only). */
  rivalRule?: string;
  /** بحر المشاريع (a blessing): your team may not buy sun. */
  noSun?: boolean;
  /** المعطّل: the joker sitting this match out (UI only — it's already left out of these options). */
  disabledJoker?: string;
  /** UI-only effects, read by the table scene. */
  spyCards?: number;
  revealPartner?: boolean;
  /** الذاكرة: 1 = cards still out per suit; 2 = also which Aces and 10s are still out. */
  memory?: number;
}

/** 7-2: the score line for doubling a sun. */
export const SUN_DOUBLE_LIMIT = 100;

/** Something the human has to decide mid-hand because a joker fired: which card to use. */
export type PendingAction =
  | { kind: "transform"; to: Card }
  | { kind: "swap"; preferTrump: boolean; suit?: Suit; best?: boolean }
  /** المنزّل: the card you pick becomes the 8 of its suit. */
  | { kind: "lower" }
  /** الصبّاغ: the card you pick becomes the spade of its rank. */
  | { kind: "dye" }
  /** المرسال: the card you pick goes to your partner for their best card of its suit. */
  | { kind: "partner" };

/** What an action would turn `card` into (lower/dye), or undefined if it would change nothing. */
export function actionTarget(action: PendingAction, card: Card, hand: Card[]): Card | undefined {
  const to = action.kind === "transform" ? action.to : action.kind === "lower" ? { suit: card.suit, rank: "8" as const } : action.kind === "dye" ? { suit: "S" as const, rank: card.rank } : undefined;
  if (!to) return undefined;
  // Turning a card into itself, or into a card already in your hand, would waste the joker.
  if (cardId(to) === cardId(card) || (action.kind !== "transform" && hand.some((c) => cardId(c) === cardId(to)))) return undefined;
  return to;
}

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

/** A joker that just paid out mid-hand, so the table can light it up at that moment. */
export interface JokerFired {
  label: string;
  points?: number;
  gold?: number;
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
  "joker:fired": JokerFired;
  /** السوا was claimed: `ok` if every card left really does win. */
  sawa: { ok: boolean };
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
/** One card the computer played, and why. */
export interface PlayLogEntry {
  seat: Seat;
  /** Which trick of the hand (1–8), and how many cards were already down in it. */
  trick: number;
  position: number;
  trace: PlayTrace;
  /** What this seat's partner was asking for by التهريب at that moment. */
  partnerAsks: Suit[];
  partnerBarqiya: Suit[];
}

/** A hand frozen at the moment of a note (cards as ids like "JH"). */
export interface HandSnapshot {
  dealer: Seat;
  initialHands: Record<Seat, string[]>;
  groundCard: string;
  bids: string[];
  contract?: { mode: Mode; trumpSuit?: Suit; declarer: Seat; ashkal: boolean };
  doubleLevel?: number;
  hands: Record<Seat, string[]>;
  startHands: Record<Seat, string[]>;
  tricks: Array<{ leader: Seat; cards: string[]; winner?: Seat }>;
  currentTrick: string[];
  matchScore: Record<Team, number>;
  partner?: string;
  rival?: string;
  plays: Array<{ seat: Seat; trick: number; card: string; kind: string; habit?: string; scores?: string[]; ruledOut?: string[]; rules?: string[] }>;
}

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
  private lowTricks = 0;
  private streak = 0;
  private streakPoints = 0;
  /** The suits your discards ask your partner for (latest first), read by the rules of التهريب. */
  private humanAsks: Suit[] = [];
  private signalHits = 0;
  private akkaCuts = 0;
  /** السوا this hand: undefined = not claimed, true = claimed right (you auto-play the rest), false = wrong. */
  private sawaClaim?: boolean;
  private playLog: PlayLogEntry[] = [];
  private lastHand?: { plays: PlayLogEntry[]; snapshot: HandSnapshot };
  /** Every finished hand of this صكة, for «انسخ الصكة» and the analysis. */
  private matchLog: HandSnapshot[] = [];
  /** Tags this صكة's hands in the saved record of everything played. */
  private matchId = "";
  /** The search AI's own random stream, so thinking never shifts the deal's. */
  private searchRand?: () => number;

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

  /** What each seat's discards ask its partner for (التهريب) and any برقية — for المترجم. */
  getSignals(): Record<Seat, { wants: Suit[]; barqiya: Suit[] }> | undefined {
    const res = this.round?.bidding.result;
    if (!res || this.round.tricks.length + (this.round.currentTrick?.order.length ? 1 : 0) === 0) return undefined;
    const b = buildBeliefs(this.round.tricks, this.round.currentTrick, res.mode, res.trumpSuit);
    const out = {} as Record<Seat, { wants: Suit[]; barqiya: Suit[] }>;
    for (const seat of [0, 1, 2, 3] as Seat[]) out[seat] = { wants: b.wants[seat], barqiya: b.barqiya[seat] };
    return out;
  }

  /** Every card the computer played this hand, with why (for «ليش؟» and the player's notes). */
  getPlayLog(): readonly PlayLogEntry[] {
    return this.playLog;
  }

  /**
   * The whole صكة so far: every finished hand, plus the one in play if it has started — each
   * with every seat's cards, every trick and the computer's reasons.
   */
  getMatchLog(): HandSnapshot[] {
    const now = this.round.phase === "playing" ? [this.snapshot()] : [];
    return [...this.matchLog, ...now];
  }

  /** The hand before this one, as it ended — so «ليش؟» can still look back at it. */
  getLastHand(): { plays: readonly PlayLogEntry[]; snapshot: HandSnapshot } | undefined {
    return this.lastHand;
  }

  private logPlay(seat: Seat, trace: PlayTrace): void {
    const r = this.round;
    const { mode, trumpSuit } = r.bidding.result!;
    const beliefs = buildBeliefs(r.tricks, r.currentTrick, mode, trumpSuit);
    const partner = partnerOf(seat);
    this.playLog.push({
      seat,
      trick: r.tricks.length + 1,
      position: r.currentTrick!.order.length,
      trace,
      partnerAsks: beliefs.wants[partner],
      partnerBarqiya: beliefs.barqiya[partner],
    });
  }

  /**
   * Everything needed to replay a moment of this hand, for a note the player writes about it:
   * the deal, the contract, the tricks so far, every hand as it stands, and the AI's reasons.
   */
  snapshot(): HandSnapshot {
    const r = this.round;
    const ids = (cards: readonly Card[]) => cards.map(cardId);
    const res = r.bidding.result;
    return {
      dealer: r.dealer,
      initialHands: Object.fromEntries(([0, 1, 2, 3] as Seat[]).map((s) => [s, ids(r.initial.hands[s])])) as Record<Seat, string[]>,
      groundCard: cardId(r.initial.stock[0]),
      bids: r.bidding.history.map((b) => `${b.seat}:${b.call}${b.suit ?? ""}`),
      contract: res ? { mode: res.mode, trumpSuit: res.trumpSuit, declarer: res.declarer, ashkal: !!res.ashkal } : undefined,
      doubleLevel: r.doubling?.level,
      hands: Object.fromEntries(([0, 1, 2, 3] as Seat[]).map((s) => [s, ids(r.hands[s])])) as Record<Seat, string[]>,
      // Every seat's cards as play began: what it still holds plus what it has played.
      startHands: Object.fromEntries(
        ([0, 1, 2, 3] as Seat[]).map((s) => [
          s,
          ids([...[...r.tricks, ...(r.currentTrick ? [r.currentTrick] : [])].flatMap((t) => (t.cards[s] ? [t.cards[s]!] : [])), ...r.hands[s]]),
        ]),
      ) as Record<Seat, string[]>,
      tricks: r.tricks.map((t) => ({ leader: t.leader, cards: t.order.map((s) => `${s}:${cardId(t.cards[s]!)}`), winner: t.winner })),
      currentTrick: r.currentTrick ? r.currentTrick.order.map((s) => `${s}:${cardId(r.currentTrick!.cards[s]!)}`) : [],
      matchScore: { ...this.matchScore },
      partner: this.options.partnerLabel,
      rival: this.options.rivalLabel,
      plays: this.playLog.map((p) => ({
        seat: p.seat,
        trick: p.trick,
        card: cardId(p.trace.card),
        kind: p.trace.kind,
        habit: p.trace.ruleChoice ? cardId(p.trace.ruleChoice) : undefined,
        scores: p.trace.scores?.map((x) => `${cardId(x.card)}=${x.avg.toFixed(2)}`),
        ruledOut: p.trace.ruledOut?.map(cardId),
        rules: p.trace.rules,
      })),
    };
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
    this.matchLog = [];
    this.matchId = Date.now().toString(36);
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
    this.lowTricks = 0;
    this.streak = 0;
    this.streakPoints = 0;
    this.humanAsks = [];
    this.signalHits = 0;
    this.akkaCuts = 0;
    this.sawaClaim = undefined;
    this.playLog = [];
    const o = this.options;
    const supplied = !!(o.guaranteedJacks || o.guaranteedLow || o.completeRunTo);
    this.round = new Round(this.dealer, this.rand, {
      lastTrickBonus: this.lastTrickBonus,
      guaranteeJackFor: supplied ? HUMAN_SEAT : undefined,
      guaranteedJacks: o.guaranteedJacks ?? 0,
      guaranteedLow: o.guaranteedLow,
      completeRunTo: o.completeRunTo,
      lockedHokumTeams: this.options.lockedHokum ? [teamOf(HUMAN_SEAT)] : [],
      // 7-2: sun is doubled only by a side at 100 or under against a side past 100 — the real
      // 100, whatever the match's target (the player's call), so short matches never see it.
      doubling: { matchScore: { ...this.matchScore }, sunLimit: SUN_DOUBLE_LIMIT },
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
    if (o.trashBeatsAce) { rules.trickRules = rules.trickRules ?? {}; rules.trickRules.trashBeatsAce = us; }
    if (o.lastCardTop) rules.lastCardTop = HUMAN_SEAT;
    if (o.freeSunDouble) rules.freeSunDoubleFor = us;
    if (o.noSun) rules.noSunFor = us;
    // الجفرة: your partner is always dealt an Ace.
    if (o.partner?.luckyAces) rules.luckyAces = { seat: partnerOf(HUMAN_SEAT), count: o.partner.luckyAces };
    // The opponents' rules (src/roguelike/opponents.ts): the game bent against your team.
    const r = o.rival;
    const them: Team = us === 0 ? 1 : 0;
    if (r?.weakJack || r?.noAceLead) {
      rules.trickRules = {
        ...rules.trickRules,
        rival: {
          weakJack: r.weakJack ? us : undefined,
          jackBottom: r.weakJack === "bottom",
          noAceLead: r.noAceLead ? us : undefined,
        },
      };
    }
    if (r?.groundTheirs) rules.groundTo = them;
    if (r?.cancelProjects) rules.cancelProjectsOf = us;
    // The one on your right: you still get a say (sun, or over their hokum) before the hand is theirs.
    if (r?.hokumHands) rules.hokumSeat = nextSeat(HUMAN_SEAT);
    // العارفين may double your sun at any score.
    if (r?.doubleKnown) rules.freeSunDoubleFor = them;
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
      const eager = seat === partnerOf(HUMAN_SEAT) ? (this.options.partner?.bidEager ?? 0) : 0;
      const bid = decideBid(seat, this.round.hands[seat], this.round.bidding, eager);
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
      // الوجه البارد: once your team has raised, the other side won't raise back.
      const us = teamOf(HUMAN_SEAT);
      const cowed = this.options.pokerFace && teamOf(seat) !== us && state.level > 1 && raiserTeam(state) === us;

      // العارفين: they see how the hand would go, and double exactly the contracts you'd lose.
      const res = this.round.bidding.result!;
      if (this.options.rival?.doubleKnown && teamOf(seat) !== us && state.level === 1 && !cowed) {
        const double = this.round.legalDoubleCalls().find((c) => c.call === "double");
        if (double && buyerWouldLose(this.round)) {
          this.applyDouble({ seat, call: "double", closed: double.closed === undefined ? undefined : res.mode === "hokum" });
          return "advanced";
        }
      }
      // Your partner's temper: الشايب never raises, المتحمس raises on a lower bar.
      const p = seat === partnerOf(HUMAN_SEAT) ? this.options.partner : undefined;
      const call: DoubleBid = cowed || p?.neverDoubles ? { seat, call: "pass" } : decideDouble(seat, this.doublingHand(seat), state, res.trumpSuit, p?.doubleEager ?? 0);
      this.applyDouble(call);
      return "advanced";
    }

    if (this.round.phase === "playing" && this.pendingActions.length > 0) {
      this.emit("action:turn", { action: this.pendingActions[0] });
      return "waiting-human";
    }

    if (this.round.phase === "playing") {
      const seat = this.round.turnSeat!;
      // A right سوا plays your sure winners out for you.
      if (seat === HUMAN_SEAT && this.sawaClaim === undefined) {
        this.emit("play:turn", { seat, legal: this.round.legalMovesFor(seat) });
        return "waiting-human";
      }
      const result = this.round.bidding.result!;
      const ctx: PlayContext = {
        tricks: this.round.tricks,
        declarer: result.declarer,
        // أشكل is a message to the caller's partner only (docs/baloot-guide.md §3).
        ashkalSuits: seat === result.ashkal?.groundTo ? result.ashkal.signalSuits : undefined,
        closed: this.round.closed,
        answerFirst: seat === partnerOf(HUMAN_SEAT) && !!this.options.partner?.answerFirst,
        deaf: seat === partnerOf(HUMAN_SEAT) && !!this.options.partner?.deaf,
      };
      // After a right سوا, you and your partner play the order that wins every trick.
      const trick = this.round.currentTrick!;
      if (this.sawaClaim && (seat === HUMAN_SEAT || (seat === partnerOf(HUMAN_SEAT) && trick.leader === HUMAN_SEAT))) {
        const sure = sawaMove(this.sawaTable(), trick, seat);
        if (sure) {
          this.logPlay(seat, { kind: "sawa", card: sure });
          this.applyCard(seat, sure);
          return "advanced";
        }
      }
      // Your own seat on autopilot after a سوا plays the rule-based way.
      const think = this.options.searchAI && seat !== HUMAN_SEAT && !(seat === partnerOf(HUMAN_SEAT) && this.options.partner?.noSearch);
      if (think && !this.searchRand) this.searchRand = mulberry32(Math.floor(this.rand() * 2147483647));
      const trace: PlayTrace = think
        ? searchCardTraced(this.round, seat, {
            ctx,
            rand: this.searchRand,
            worlds: 40,
            timeBudgetMs: 150,
          })
        : { kind: "habit", card: decideCard(this.round.hands[seat], this.round.currentTrick!, result.mode, result.trumpSuit, seat, ctx) };
      if (seat !== HUMAN_SEAT) this.logPlay(seat, trace);
      this.applyCard(seat, trace.card);
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

  /**
   * What a seat can see in the دبل round: it comes before the rest of the deal, so only the
   * first five cards, plus the ground card for whoever takes it.
   */
  private doublingHand(seat: Seat): Card[] {
    const r = this.round;
    const res = r.bidding.result!;
    const taker = res.ashkal?.groundTo ?? res.declarer;
    return [...r.initial.hands[seat], ...(seat === taker ? [r.initial.stock[0]] : [])];
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
    if (action.kind === "transform" || action.kind === "lower" || action.kind === "dye") {
      const to = actionTarget(action, card, this.round.hands[HUMAN_SEAT]);
      if (!to) return; // a pointless pick: the joker simply does nothing
      this.round.replaceCard(HUMAN_SEAT, card, to);
      this.emit("hand:changed", { kind: "transform", seat: HUMAN_SEAT, from: card, to });
      return;
    }
    if (action.kind === "partner") {
      const partner = partnerOf(HUMAN_SEAT);
      const theirs = this.round.hands[partner];
      if (theirs.length === 0) return;
      const { mode, trumpSuit } = this.round.bidding.result!;
      const ofSuit = theirs.filter((c) => c.suit === card.suit);
      const pool = ofSuit.length > 0 ? ofSuit : theirs;
      const got = pool.reduce((a, b) => (rankStrength(b, mode, trumpSuit) > rankStrength(a, mode, trumpSuit) ? b : a));
      this.round.swapCards(HUMAN_SEAT, card, partner, got);
      this.emit("hand:changed", { kind: "swap", seat: HUMAN_SEAT, gave: card, got, otherSeat: partner });
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

  /** Lets a joker's pick go unused (every action is optional). */
  skipPlayerAction(): void {
    if (!this.pendingActions.shift()) throw new Error("No joker action is waiting");
  }

  /** السوا is on offer: you haven't claimed this hand, and you're leading a trick. */
  canClaimSawa(): boolean {
    const r = this.round;
    return this.sawaClaim === undefined && r.phase === "playing" && this.pendingActions.length === 0 &&
      r.turnSeat === HUMAN_SEAT && r.currentTrick!.order.length === 0 && r.hands[HUMAN_SEAT].length >= 2;
  }

  /**
   * السوا: you lay your cards down, claiming every trick left. It's right when some order of
   * your cards takes every trick whatever the opponents hold and play — leading the 9 of trumps
   * to draw their King, say, before the 8 (engine/sawa.ts). Either way the rest plays itself
   * out, a right one in that order: it keeps the hand as it falls (the السوا joker pays a
   * bonus); a wrong one is judged like a buy that failed — the whole hand to the other side.
   */
  claimSawa(): boolean {
    if (!this.canClaimSawa()) throw new Error("السوا isn't available now");
    const ok = sawaHolds(this.sawaTable());
    this.sawaClaim = ok;
    this.emit("sawa", { ok });
    return ok;
  }

  private sawaTable(): SawaTable {
    const r = this.round;
    const { mode, trumpSuit } = r.bidding.result!;
    return { hands: r.hands, claimer: HUMAN_SEAT, mode, trumpSuit, rules: r.currentTrick?.rules, closed: r.closed };
  }

  /** Jokers that fire the moment a trick is decided. */
  private onTrickDecided(trick: Trick): void {
    const winner = trick.winner!;
    const us = teamOf(HUMAN_SEAT);
    const ours = teamOf(winner) === us;
    const card = trick.cards[winner]!;
    const result = this.round.bidding.result!;
    const trump = result.mode === "hokum" ? result.trumpSuit : undefined;
    const isTrumpJack = !!trump && card.suit === trump && card.rank === "J";
    const isTrumpNine = !!trump && card.suit === trump && card.rank === "9";
    const handOver = this.round.tricks.length === 8;
    const o = this.options;

    if (ours && card.rank === "J") {
      this.jackTricks++;
      if (o.jackTrickBonus) this.emit("joker:fired", { label: "أكلات الأولاد", points: o.jackTrickBonus });
    }
    if (ours && (card.rank === "7" || card.rank === "8")) {
      this.lowTricks++;
      if (o.lowTrickBonus) this.emit("joker:fired", { label: "ثأر الصغار", points: o.lowTrickBonus });
    }
    if (o.streakBonus) {
      if (ours) {
        this.streak++;
        const pts = o.streakBonus >= 2 ? Math.max(0, this.streak - 2) : Math.floor((this.streak - 1) / 2);
        this.streakPoints += pts;
        if (pts > 0) this.emit("joker:fired", { label: "الزحف", points: pts });
      } else this.streak = 0;
    }
    const ledCard = trick.cards[trick.order[0]]!;
    // A signal answered: your partner led a suit you'd asked for, and your side took it.
    if (ours && trick.leader === partnerOf(HUMAN_SEAT) && this.humanAsks.includes(ledCard.suit)) {
      this.signalHits++;
      if (o.signalTrickBonus || o.signalMultiplier) this.emit("joker:fired", { label: "الإشارة الذهبية", points: o.signalTrickBonus });
    }
    // الآكه الذهبية: your side's آكه either takes its trick (gold) or gets cut (points lost).
    if (o.akkaGamble && teamOf(trick.leader) === us && this.akkaCards.has(cardId(ledCard))) {
      if (ours) {
        this.emit("gold:earned", { amount: o.akkaGamble.gold, reason: "الآكه الذهبية" });
        this.emit("joker:fired", { label: "الآكه الذهبية", gold: o.akkaGamble.gold });
      } else {
        this.akkaCuts++;
        this.emit("joker:fired", { label: "الآكه الذهبية", points: -o.akkaGamble.penalty });
      }
    }
    const index = this.round.tricks.length - 1;
    if (index === 0 && ours) this.firstTrickOurs = true;
    if (handOver && ours) this.lastTrickOurs = true;
    if (ours && this.akkaCards.has(cardId(card))) {
      this.akkaWins++;
      if (o.akkaTrickBonus) this.emit("joker:fired", { label: "ملك الآكه", points: o.akkaTrickBonus });
    }
    if (ours && o.suitTrickBonus && card.suit === o.suitTrickBonus.suit) {
      this.suitTricks++;
      this.emit("joker:fired", { label: "كنز السبيت", points: o.suitTrickBonus.points });
    }
    const led = ledCard;
    if (ours && trump && card.suit === trump && led.suit !== trump) {
      this.ruffTricks++;
      if (o.ruffBonus) this.emit("joker:fired", { label: "القطّاع", points: o.ruffBonus });
    }
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
      for (let i = 0; i < (this.options.lowForge ?? 0); i++) this.pendingActions.push({ kind: "lower" });
      for (let i = 0; i < (this.options.dyeForge ?? 0); i++) this.pendingActions.push({ kind: "dye" });
      if (this.options.partnerSwap) this.pendingActions.push({ kind: "partner" });
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
      if (couldWin && !wouldWinAgainstCurrent(card, trick, mode, trumpSuit)) {
        this.ducks++;
        if (this.options.duckBonus) this.emit("joker:fired", { label: "المخلّي", points: this.options.duckBonus });
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
    // المتحمس: a hand your partner bought and made pays more.
    if (o.partner?.buyBonus && this.round.bidding.result?.declarer === partnerOf(HUMAN_SEAT) && buyerWonEarly(result) && gained[us] > 0) {
      const extra = Math.round(gained[us] * o.partner.buyBonus);
      gained[us] += extra;
      bonuses.push({ label: "المتحمس", points: extra });
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
    // ---- build packages: flat points first, multipliers last (the bible, PART 1.3)
    if (o.lowTrickBonus && this.lowTricks > 0) {
      gained[us] += o.lowTrickBonus * this.lowTricks;
      bonuses.push({ label: "ثأر الصغار", points: o.lowTrickBonus * this.lowTricks });
    }
    if (this.streakPoints > 0) {
      gained[us] += this.streakPoints;
      bonuses.push({ label: "الزحف", points: this.streakPoints });
    }
    if (o.signalTrickBonus && this.signalHits > 0) {
      gained[us] += o.signalTrickBonus * this.signalHits;
      bonuses.push({ label: "تآزر التهريب", points: o.signalTrickBonus * this.signalHits });
    }
    if (o.akkaGamble && this.akkaCuts > 0) {
      const lost = Math.min(gained[us], o.akkaGamble.penalty * this.akkaCuts);
      gained[us] -= lost;
      if (lost) bonuses.push({ label: "الآكه الذهبية", points: -lost });
    }
    if (this.sawaClaim && o.sawa?.bonus) {
      gained[us] += o.sawa.bonus;
      bonuses.push({ label: "السوا", points: o.sawa.bonus });
    }
    const wonDouble = !!sheet?.double && sheet.winner === us;
    if (o.doubleWinPoints && wonDouble) {
      gained[us] += o.doubleWinPoints;
      bonuses.push({ label: "تآزر الدبل", points: o.doubleWinPoints });
    }
    if (o.doubleGold && wonDouble) this.emit("gold:earned", { amount: o.doubleGold * sheet!.double!.level, reason: "رأس المال" });
    if (o.defenseGold && result.declarerTeam === them && gained[us] > gained[them]) {
      this.emit("gold:earned", { amount: o.defenseGold, reason: "الصبر" });
    }
    if (o.sunBreakMultiplier && result.mode === "sun" && result.declarerTeam === them && !buyerWon && gained[us] > 0) {
      const extra = Math.round(gained[us] * (o.sunBreakMultiplier - 1));
      gained[us] += extra;
      bonuses.push({ label: "الكاسر", points: extra });
    }
    if (o.signalMultiplier && this.signalHits > 0 && gained[us] > 0) {
      const extra = Math.round(gained[us] * (o.signalMultiplier - 1));
      gained[us] += extra;
      bonuses.push({ label: "الإشارة الذهبية", points: extra });
    }
    if (o.comeback && gained[us] > 0 && this.matchScore[them] - this.matchScore[us] >= o.comeback.deficit) {
      gained[us] += o.comeback.bonus;
      bonuses.push({ label: "الرجعة", points: o.comeback.bonus });
    }
    // سوا غلط: the hand goes to the other side — the whole of it, projects too — and you score
    // zero, your بلوت included (it goes to no one). None of your jokers' bonuses count.
    // The sheet says so too: the hand reads as a خسرانة for your side, whoever bought it.
    if (this.sawaClaim === false) {
      // Your بلوت goes to no one: the other side never takes it.
      const ourBaloot = result.baloot !== undefined && teamOf(result.baloot) === us && result.gamePoints[us] > 0 ? BALOOT_VALUE : 0;
      gained[them] = result.gamePoints[us] + result.gamePoints[them] - ourBaloot;
      gained[us] = 0;
      bonuses.length = 0;
      if (result.sheet) {
        result.sheet.outcome = "lost";
        result.sheet.judgedTeam = us;
        result.sheet.winner = them;
        result.sheet.result = { ...gained };
      }
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
    // التهريب: what your discards ask your partner for, read by the table's rules (docs/baloot-guide.md §4أ).
    if (seat === HUMAN_SEAT) this.humanAsks = buildBeliefs(this.round.tricks, this.round.currentTrick, mode, trumpSuit).wants[HUMAN_SEAT];

    if (this.round.phase === "complete") {
      // Kept for «ليش؟» after the hand is over.
      this.lastHand = { plays: [...this.playLog], snapshot: this.snapshot() };
      this.matchLog.push(this.lastHand.snapshot);
      recordHand(this.lastHand.snapshot, this.matchId);
      const result = this.round.result!;
      const { gained, bonuses } = this.applyJokers(result);
      // المدبّلين: a hand your team bought and lost counts double for them.
      const ourTeam = teamOf(HUMAN_SEAT);
      if (this.options.rival?.lossDoubled && result.declarerTeam === ourTeam && !buyerWonEarly(result)) gained[ourTeam === 0 ? 1 : 0] *= 2;
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
function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

function buyerWonEarly(result: HandResult): boolean {
  const sheet = result.sheet;
  return !sheet || (sheet.judgedTeam === result.declarerTeam ? sheet.outcome === "won" : sheet.outcome === "lost");
}




