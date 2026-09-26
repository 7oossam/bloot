import Phaser from "phaser";
import { cardId, rankStrength } from "../engine/cards";
import type { LegalCall } from "../engine/bidding";
import type { Bid, Card, HandResult, Mode, Seat, Suit, Team, Trick } from "../engine/types";
import { SUITS, teamOf } from "../engine/types";
import {
  GameController,
  HUMAN_SEAT,
  actionTarget,
  type HandBonus,
  type JokerFired,
  type HandChange,
  type MatchOptions,
  type PendingAction,
} from "../game/GameController";
import { mulberry32 } from "../engine/rng";
import { runController } from "../roguelike/RunController";
import { getJokerDef, jokersBehind } from "../roguelike/jokers";
import type { NodeType } from "../roguelike/types";
import { CardView, CARD_W } from "./CardView";
import { RANK_NAME_AR, SUIT_COLOR_HEX, SUIT_NAME_AR, SUIT_SYMBOL } from "./cardArt";
import { PROJECT_NAME_AR, type ProjectsOutcome } from "../engine/projects";
import { DOUBLE_NAME_AR, doubleLabel, type DoubleBid, type DoubleLevel, type LegalDouble } from "../engine/doubling";
import {
  BID_BUTTON_ROW_GAP,
  BID_BUTTON_ROW_Y,
  CENTER_X,
  CENTER_Y,
  GROUND_CARD_POS,
  HAND_ANCHOR,
  HEIGHT,
  SEAT_LABEL_AR,
  TABLE_RECT,
  TRICK_ANCHOR,
  WIDTH,
  handPositions,
  sortHandForDisplay,
} from "./layout";
import { arabicText, makeButton, setBoxHitArea, type ButtonHandle } from "./ui";
import { openNotesPanel, type HandView } from "./notesPanel";
import { addAmbience, addCameraGrade, arcTo, celebrate, ensureFxTextures, flare, paintBackdrop, rise, screenFlash } from "./fx";
import { contractLines, handLines, matchLines, projectLines, trickLines, type ChatLine } from "../game/chatter";

// Bidding gets a slower beat than card play: each call is a single word that has to be read
// and attributed to a seat before the next one lands.
const AI_BID_DELAY_MS = 1250;
const AI_PLAY_DELAY_MS = 1000;
/** How long a finished trick stays on the table, all four cards visible, before it's collected. */
const TRICK_COLLECT_DELAY_MS = 1300;
const TRICK_COLLECT_TWEEN_MS = 420;
/** A beat of empty table after a collect, before the next trick is led. */
const NEXT_TRICK_GAP_MS = 350;
const CARD_MOVE_TWEEN_MS = 380;
const BUBBLE_HOLD_MS = 1100;
/** The deal: each card's flight, the gap between cards in a packet, and between packets. */
const DEAL_FLY_MS = 260;
const DEAL_CARD_GAP_MS = 45;
const DEAL_PACKET_GAP_MS = 80;
const LOG_LINES = 4;

/** Card draw sizes per on-screen role (see CardView: these size the art, not a shrink transform). */
const HAND_CARD_SIZE = 1;
const TRICK_CARD_SIZE = 0.95;
const WIDGET_CARD_SIZE = 0.62;

const OPPONENT_SEATS: Seat[] = [1, 2, 3];
/** The run's jokers, in a row above the table: tap one to read it, and it lights up when it pays. */
const JOKER_ROW_Y = 158;
const JOKER_ICON = 66;
const JOKER_GAP = 80;
/** How the hand is ordered; the sort button cycles through them and a sideways drag makes it "manual". */
type HandSort = "suit" | "strength" | "color" | "manual";
const SORT_LABEL_AR: Record<HandSort, string> = {
  suit: "ترتيب: حسب الشكل",
  strength: "ترتيب: الأقوى أول",
  color: "ترتيب: الألوان متناوبة",
  manual: "ترتيب: يدوي",
};
/** Pause between one joker line and the next in the hand summary's count-up. */
const BONUS_STEP_MS = 520;
const SEAT_LABEL_COLOR = "#cfe0d6";
const TURN_LABEL_COLOR = "#ffd54a";

const NODE_TYPE_LABEL_AR: Record<NodeType, string> = {
  match: "مباراة",
  elite: "نخبة",
  shop: "متجر",
  boss: "الزعيم",
  diwaniya: "الديوانية",
};

export interface TableSceneData {
  nodeType: NodeType;
  matchTarget: number;
  modifiers: MatchOptions;
}

interface OpponentWidget {
  back: CardView;
  count: Phaser.GameObjects.Text;
}

type HandCompleteEvent = {
  result: HandResult;
  matchScore: Record<Team, number>;
  gained: Record<Team, number>;
  bonuses: HandBonus[];
  kaboot: boolean;
  /** Filled in by the scene: the contract came from أشكل. */
  ashkal?: boolean;
};

export class TableScene extends Phaser.Scene {
  private controller!: GameController;
  private nodeData!: TableSceneData;

  private playerHandViews: CardView[] = [];
  private selectedCardView: CardView | undefined;
  private opponentWidget: Partial<Record<Seat, OpponentWidget>> = {};
  private trickViews: Partial<Record<Seat, CardView>> = {};
  private seatBubble: Partial<Record<Seat, Phaser.GameObjects.Container>> = {};
  private groundCardView?: CardView;
  private groundLabel?: Phaser.GameObjects.Text;
  private bidPrompt?: Phaser.GameObjects.Text;
  private bidButtons: ButtonHandle[] = [];

  private hudScoreText!: Phaser.GameObjects.Text;
  private hudModeText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private logLines: string[] = [];

  private showingHandSummary = false;
  private handSummaryPanel?: Phaser.GameObjects.Container;
  private pendingDeal: { dealer: Seat; hands: Record<Seat, Card[]>; groundCard: Card } | null = null;
  private matchOver = false;
  /** True while cards are flying out of the dealer's hands; nothing is decided meanwhile. */
  private dealing = false;
  /** driveAI() was asked to run mid-deal; run it once the last card lands. */
  private resumeAfterDeal = false;
  /** A match that ended on the hand whose النشرة is still up. */
  private pendingMatchEnd?: { winner: Team; matchScore: Record<Team, number>; qahwa?: boolean };
  /**
   * True from the moment a trick's fourth card lands until its cards have been collected.
   * Nothing advances while it's set — without it the AI led the next trick while the last
   * one was still lying on the table.
   */
  private trickSettling = false;
  /** Work that has to wait for the table to clear (the hand/match panels). */
  private afterSettle: Array<() => void> = [];
  private seatLabels: Partial<Record<Seat, Phaser.GameObjects.Text>> = {};
  private dealerChip?: Phaser.GameObjects.Container;
  /** The contract ("حكم ♠" / "صن" / "أشكل") shown beside the buyer's name. */
  private contractChip?: Phaser.GameObjects.Container;
  /** العرّاف's preview during bidding. */
  private oraclePanel?: Phaser.GameObjects.Container;
  /** This hand's المشاريع, said in the first trick and laid down in the second. */
  private projects?: ProjectsOutcome;
  /** A wrong سوا this hand: the score sheet says why the hand went to them. */
  private sawaWrong = false;
  /** The rest of the deal, held back while the دبل round is played on the first five. */
  private pendingRest?: { mode: Mode; trumpSuit?: Suit; declarer: Seat; hands: Record<Seat, Card[]> };
  private highlightedSeat: Seat | null = null;
  /** Face-up cards drawn for the spy / partner-eyes jokers, rebuilt whenever a hand changes. */
  private revealViews: CardView[] = [];
  /** Hands finished this match (the first one gets its own line). */
  private handsPlayed = 0;
  /** Who you're playing and whether their rule is on this hand. */
  private rivalText?: Phaser.GameObjects.Text;
  /** المترجم: what each seat's التهريب asks for, shown over its name. */
  private signalTexts: Phaser.GameObjects.Text[] = [];
  /** Which of each opponent's cards the spy joker is showing this hand. */
  private spied: Partial<Record<Seat, string[]>> = {};
  private actionPrompt?: Phaser.GameObjects.Text;
  private actionSkip?: ButtonHandle;
  /** Each owned joker's icon in the row above the table, by id. */
  private jokerIcons = new Map<string, Phaser.GameObjects.Container>();
  private jokerTip?: Phaser.GameObjects.Container;
  private handSort: HandSort = "suit";
  /** The order you dragged your cards into (card ids), while `handSort` is "manual". */
  private manualOrder: string[] = [];
  private memoryPanel?: Phaser.GameObjects.Container;
  private sawaButton?: ButtonHandle;

  constructor() {
    super("table");
  }

  init(data: TableSceneData): void {
    this.nodeData = data;
    // Phaser reuses this one scene object for every match, and field initialisers only run
    // once, at construction. Without this reset the second match inherited `matchOver = true`
    // from the first, so driveAI() returned immediately and the table froze in bidding — and
    // the view lists still pointed at objects the previous run had already destroyed.
    this.playerHandViews = [];
    this.opponentWidget = {};
    this.trickViews = {};
    this.seatBubble = {};
    this.groundCardView = undefined;
    this.groundLabel = undefined;
    this.bidPrompt = undefined;
    this.bidButtons = [];
    this.logLines = [];
    this.showingHandSummary = false;
    this.handSummaryPanel = undefined;
    this.pendingDeal = null;
    this.matchOver = false;
    this.dealing = false;
    this.resumeAfterDeal = false;
    this.pendingMatchEnd = undefined;
    this.trickSettling = false;
    this.afterSettle = [];
    this.seatLabels = {};
    this.contractChip = undefined;
    this.projects = undefined;
    this.pendingRest = undefined;
    this.sawaWrong = false;
    this.oraclePanel = undefined;
    this.dealerChip = undefined;
    this.highlightedSeat = null;
    this.revealViews = [];
    this.signalTexts = [];
    this.handsPlayed = 0;
    this.spied = {};
    this.actionPrompt = undefined;
    this.actionSkip = undefined;
    this.jokerIcons = new Map();
    this.jokerTip = undefined;
    this.manualOrder = [];
    this.memoryPanel = undefined;
    this.sawaButton = undefined;
    // The sort you picked sticks from match to match.
    if (this.handSort === "manual") this.handSort = "suit";
  }

  preload(): void {
    
  }

  create(): void {
    ensureFxTextures(this);
    paintBackdrop(this, { table: true });
    addAmbience(this);
    addCameraGrade(this);
    this.buildStaticUI();
    this.controller = new GameController(mulberry32(Date.now() % 2147483647), {
      matchTarget: this.nodeData.matchTarget,
      searchAI: true,
      ...this.nodeData.modifiers,
    });
    this.wireControllerEvents();
    this.buildJokerRow();
    this.buildHandTools();
    this.controller.startMatch();
  }

/** أكّة and بلوت: a flare on the card and a lift of motes in the call's colour. */
  private createImpactJuice(x: number, y: number, color: number): void {
    this.cameras.main.shake(110, 0.002);
    flare(this, x, y, color, 1.1);
    rise(this, x, y, [color, 0xffffff], 16);
  }

  // ---------------------------------------------------------------- setup

  private buildStaticUI(): void {
    this.hudScoreText = arabicText(this, CENTER_X, 46, "", { fontSize: "30px" }).setDepth(5);
    this.hudModeText = arabicText(this, CENTER_X, 92, "", { fontSize: "23px", color: "#ffd54a" }).setDepth(5);
    if (this.nodeData.modifiers.rivalLabel) {
      this.rivalText = arabicText(this, CENTER_X, JOKER_ROW_Y + JOKER_ICON / 2 + 34, "", { fontSize: "21px", color: "#ffb3b3", wordWrap: { width: WIDTH - 80 } }).setDepth(5);
      this.refreshRival();
    }

    this.seatLabels[0] = arabicText(this, HAND_ANCHOR[0].x, HAND_ANCHOR[0].y - 128, SEAT_LABEL_AR[0], {
      fontSize: "26px",
      color: SEAT_LABEL_COLOR,
    }).setDepth(5);

    for (const seat of OPPONENT_SEATS) {
      const anchor = HAND_ANCHOR[seat];
      const back = new CardView(this, anchor.x, anchor.y, { suit: "S", rank: "7" }, false, WIDGET_CARD_SIZE);
      const count = arabicText(this, anchor.x, anchor.y + back.displayH / 2 + 26, "×8", {
        fontSize: "24px",
        color: "#dbeee1",
      }).setDepth(5);
      // Your partner goes by their name (شخصيات الخوي).
      const name = seat === 2 && this.nodeData.modifiers.partnerLabel ? this.nodeData.modifiers.partnerLabel : SEAT_LABEL_AR[seat];
      this.seatLabels[seat] = arabicText(this, anchor.x, anchor.y - back.displayH / 2 - 26, name, {
        fontSize: "24px",
        color: SEAT_LABEL_COLOR,
      }).setDepth(5);
      this.opponentWidget[seat] = { back, count };
    }

    this.logText = arabicText(this, 22, HEIGHT - 12, "", {
      fontSize: "24px",
      color: "#b9d7c5",
      align: "left",
    })
      .setOrigin(0, 1)
      .setDepth(5);
  }

  private wireControllerEvents(): void {
    const c = this.controller;
    c.on("hand:dealt", (e) => this.onHandDealt(e));
    c.on("bidding:turn", (e) => this.onBiddingTurn(e));
    c.on("bidding:bid", (e) => this.onBiddingBid(e));
    c.on("bidding:resolved", (e) => this.onBiddingResolved(e));
    c.on("double:turn", (e) => this.onDoubleTurn(e));
    c.on("double:call", (e) => this.onDoubleCall(e));
    c.on("projects:declared", (e) => this.onProjectsDeclared(e));
    c.on("gold:earned", (e) => this.onGoldEarned(e));
    c.on("action:turn", (e) => this.onActionTurn(e));
    c.on("hand:changed", (e) => this.onHandChanged(e));
    c.on("play:turn", (e) => this.onPlayTurn(e));
    c.on("play:card", (e) => this.onPlayCard(e));
    c.on("trick:complete", (e) => this.onTrickComplete(e));
    c.on("hand:complete", (e) => this.onHandComplete(e));
    c.on("match:complete", (e) => this.onMatchComplete(e));
    c.on("joker:fired", (e) => this.onJokerFired(e));
    c.on("sawa", (e) => this.onSawa(e));
  }

  // -------------------------------------------------------------- logging

  private floatText(x: number, y: number, text: string, color: string): void {
      const t = arabicText(this, x, y, text, { fontSize: '28px', color });
      this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 1200, ease: 'Quad.Out', onComplete: () => t.destroy() });
    }

    private log(line: string): void {
    this.logLines.push(line);
    if (this.logLines.length > LOG_LINES) this.logLines.shift();
    this.logText.setText(this.logLines.join("\n"));
  }

  private setOpponentCount(seat: Seat, count: number): void {
    const widget = this.opponentWidget[seat];
    if (!widget) return;
    widget.count.setText(`×${count}`);
    widget.back.setVisible(count > 0);
    widget.count.setVisible(count > 0);
    this.refreshReveals();
  }

  /** Draws what the spy / partner-eyes jokers let you see, from the engine's current hands. */
  private refreshReveals(): void {
    for (const v of this.revealViews) v.destroy();
    this.revealViews = [];
    const mods = this.nodeData.modifiers;
    if (!mods.spyCards && !mods.revealPartner) return;
    const hands = this.controller?.getRound()?.hands;
    if (!hands) return;

    if (mods.revealPartner && hands[2].length > 0) {
      const cards = sortHandForDisplay(hands[2]);
      const anchor = HAND_ANCHOR[2];
      const spacing = 64;
      cards.forEach((card, i) => {
        const x = anchor.x + (i - (cards.length - 1) / 2) * spacing;
        this.revealViews.push(new CardView(this, x, anchor.y, card, true, WIDGET_CARD_SIZE).setDepth(4));
      });
      this.opponentWidget[2]?.back.setVisible(false);
    }

    const spyCount = mods.spyCards ?? 0;
    if (spyCount > 0) {
      for (const seat of [1, 3] as Seat[]) {
        const hand = hands[seat];
        if (hand.length === 0) continue;
        // Keep showing the same cards while they're still held; top up from the rest.
        const shown = (this.spied[seat] ?? []).filter((id) => hand.some((c) => cardId(c) === id));
        const rest = hand.map(cardId).filter((id) => !shown.includes(id));
        while (shown.length < Math.min(spyCount, hand.length) && rest.length > 0) {
          shown.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
        }
        this.spied[seat] = shown;
        const anchor = HAND_ANCHOR[seat];
        shown.forEach((id, i) => {
          const card = hand.find((c) => cardId(c) === id)!;
          const y = anchor.y + (i - (shown.length - 1) / 2) * 46;
          this.revealViews.push(new CardView(this, anchor.x, y, card, true, WIDGET_CARD_SIZE).setDepth(4 + i * 0.01));
        });
        this.opponentWidget[seat]?.back.setVisible(false);
      }
    }
  }

  private onGoldEarned(e: { amount: number; reason: string }): void {
    // A cost (المقامر) can't take you below zero.
    const amount = Math.max(e.amount, -runController.getState().gold);
    if (amount === 0) return;
    runController.addGold(amount);
    this.pulseJokers(e.reason);
    const text = amount > 0 ? `+${amount} ذهب 💰 ${e.reason}` : `${amount} ذهب 🎰 ${e.reason}`;
    const pop = arabicText(this, CENTER_X, CENTER_Y - 120, text, {
      fontSize: "30px",
      color: amount > 0 ? "#ffd54a" : "#ff7a7a",
    }).setDepth(30);
    this.tweens.add({
      targets: pop,
      y: pop.y - 90,
      alpha: 0,
      delay: 500,
      duration: 900,
      ease: "Cubic.Out",
      onComplete: () => pop.destroy(),
    });
  }

  // --------------------------------------------------------- the joker row

  /** Your jokers in a row above the table. Tap one to read what it does right now. */
  private buildJokerRow(): void {
    const state = runController.getState();
    const ids = state.jokerIds;
    // No cap on jokers: past ten the row tightens to stay on the screen.
    const gap = Math.min(JOKER_GAP, (WIDTH - 60) / Math.max(ids.length, 1));
    const startX = CENTER_X - ((ids.length - 1) * gap) / 2;
    ids.forEach((id, i) => {
      const def = getJokerDef(id);
      if (!def) return;
      const level = state.jokerLevels[id] ?? 1;
      const bg = this.add.graphics();
      bg.fillStyle(0x14303b, 0.95);
      bg.fillRoundedRect(-JOKER_ICON / 2, -JOKER_ICON / 2, JOKER_ICON, JOKER_ICON, 14);
      bg.lineStyle(3, def.rarity === "legendary" ? 0xffb33a : def.rarity === "rare" ? 0x9cc3ff : 0x8aa79a, 1);
      bg.strokeRoundedRect(-JOKER_ICON / 2, -JOKER_ICON / 2, JOKER_ICON, JOKER_ICON, 14);
      const icon = this.add.text(0, -2, def.icon, { fontSize: "36px" }).setOrigin(0.5);
      const parts: Phaser.GameObjects.GameObject[] = [bg, icon];
      // المعطّل: this joker sits the match out.
      const off = this.nodeData.modifiers.disabledJoker === id;
      if (off) {
        icon.setAlpha(0.3);
        parts.push(this.add.text(0, 0, "🔒", { fontSize: "30px" }).setOrigin(0.5));
      }
      if (def.levels.length > 1) {
        parts.push(arabicText(this, JOKER_ICON / 2 - 12, JOKER_ICON / 2 - 12, String(level), { fontSize: "18px", color: "#ffd54a", fontStyle: "bold" }));
      }
      const box = this.add.container(startX + i * gap, JOKER_ROW_Y, parts).setDepth(21);
      if (gap < JOKER_GAP) box.setScale(gap / JOKER_GAP);
      setBoxHitArea(box, JOKER_ICON, JOKER_ICON);
      box.input!.cursor = "pointer";
      box.on("pointerdown", () => this.toggleJokerTip(id));
      this.jokerIcons.set(id, box);
    });
  }

  /** A card under the row saying what a joker does at its current level (tap again to close). */
  private toggleJokerTip(id: string): void {
    const same = this.jokerTip?.getData("id") === id;
    this.jokerTip?.destroy();
    this.jokerTip = undefined;
    if (same) return;
    const def = getJokerDef(id);
    const box = this.jokerIcons.get(id);
    if (!def || !box) return;
    const level = runController.getState().jokerLevels[id] ?? 1;
    const lines = [`${def.icon} ${def.name}${def.levels.length > 1 ? ` — المستوى ${level}` : ""}`, def.levels[0]];
    if (level > 1) lines.push(`المستوى ${level}: ${def.levels[Math.min(level, def.levels.length) - 1]}`);
    if (def.tags.length) lines.push(`العائلة: ${def.tags.join("، ")}`);
    const w = WIDTH - 80;
    const text = arabicText(this, 0, 0, lines.join("\n"), {
      fontSize: "24px",
      wordWrap: { width: w - 40, useAdvancedWrap: true },
      lineSpacing: 6,
    });
    const h = text.height + 36;
    const bg = this.add.graphics();
    bg.fillStyle(0x14303b, 0.97);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    bg.lineStyle(3, 0xffd54a, 0.9);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    const tip = this.add.container(CENTER_X, JOKER_ROW_Y + JOKER_ICON / 2 + 16 + h / 2, [bg, text]).setDepth(40);
    tip.setData("id", id);
    setBoxHitArea(tip, w, h);
    tip.on("pointerdown", () => this.toggleJokerTip(id));
    this.jokerTip = tip;
    this.time.delayedCall(5000, () => {
      if (this.jokerTip === tip) {
        tip.destroy();
        this.jokerTip = undefined;
      }
    });
  }

  /** Lights up the jokers behind a payout, with the amount floating off them. */
  private pulseJokers(label: string, amount?: string): void {
    const ids = jokersBehind(label, runController.getState().jokerIds);
    for (const id of ids) {
      const box = this.jokerIcons.get(id);
      if (!box) continue;
      this.tweens.killTweensOf(box);
      box.setScale(1);
      this.tweens.add({ targets: box, scale: 1.35, duration: 130, yoyo: true, ease: "Quad.Out" });
      if (!amount) continue;
      const pop = arabicText(this, box.x, box.y + JOKER_ICON / 2 + 18, amount, {
        fontSize: "24px",
        color: amount.startsWith("-") ? "#ff7a7a" : "#ffd54a",
        fontStyle: "bold",
      }).setDepth(41);
      this.tweens.add({ targets: pop, y: pop.y + 40, alpha: 0, delay: 450, duration: 700, onComplete: () => pop.destroy() });
    }
  }

  private onJokerFired(e: JokerFired): void {
    const amount = e.points !== undefined ? `${e.points > 0 ? "+" : ""}${e.points}` : e.gold ? `+${e.gold} 💰` : undefined;
    this.pulseJokers(e.label, amount);
    if (amount) this.log(`🃏 ${e.label}: ${amount}`);
  }

  // ------------------------------------------------------- your hand's tools

  /** The sort button beside your name, and (with الذاكرة) the cards-still-out line. */
  private buildHandTools(): void {
    const y = HAND_ANCHOR[HUMAN_SEAT].y - 128;
    const btn = makeButton(this, WIDTH - 110, y, "🔀 ترتيب", () => this.cycleSort(), { width: 170, height: 58, fontSize: "24px", color: 0x2d4a3e });
    btn.container.setDepth(6);
    // «ليش؟»: why the computer played what it did, and the player's notes for Claude.
    const why = makeButton(this, 78, 46, "ليش؟ 📝", () => this.openNotes(), { width: 132, height: 56, fontSize: "22px", color: 0x2d4a3e });
    why.container.setDepth(6);
    if (this.nodeData.modifiers.memory) {
      // In the strip between the table and your hand, clear of the names and the rival line.
      this.memoryPanel = this.add.container(CENTER_X, TABLE_RECT.bottom + 32).setDepth(5);
    }
  }

  private openNotes(): void {
    const round = this.controller.getRound();
    const last = this.controller.getLastHand();
    // This hand once play has started; the one before is there too once it's over.
    const views: HandView[] = [];
    if (round.phase === "playing" || round.phase === "complete") {
      views.push({ title: "هاليد", plays: this.controller.getPlayLog(), snapshot: () => this.controller.snapshot() });
    }
    if (last) views.push({ title: views.length ? "اليد اللي قبل" : "آخر يد", plays: last.plays, snapshot: () => last.snapshot });
    if (views.length === 0) views.push({ title: "هاليد", plays: [], snapshot: () => this.controller.snapshot() });
    this.scene.pause();
    openNotesPanel({
      views,
      match: () => this.controller.getMatchLog(),
      seatName: (seat) => (seat === 2 && this.nodeData.modifiers.partnerLabel ? this.nodeData.modifiers.partnerLabel : SEAT_LABEL_AR[seat]),
      onClose: () => this.scene.resume(),
    });
  }

  private cycleSort(): void {
    const order: HandSort[] = ["suit", "strength", "color"];
    this.handSort = order[(order.indexOf(this.handSort) + 1) % order.length];
    this.flashNote(SORT_LABEL_AR[this.handSort]);
    this.applyHandOrder();
  }

  /** Your cards in the order you've chosen. */
  private orderHand(cards: Card[], trump?: Suit): Card[] {
    const bySuit = sortHandForDisplay(cards, trump);
    if (this.handSort === "suit") return bySuit;
    if (this.handSort === "manual") {
      const at = (c: Card) => {
        const i = this.manualOrder.indexOf(cardId(c));
        return i === -1 ? 100 + bySuit.indexOf(c) : i;
      };
      return [...cards].sort((a, b) => at(a) - at(b));
    }
    const res = this.controller.getRound()?.bidding.result;
    const mode = res?.mode ?? "sun";
    const t = res?.trumpSuit ?? trump;
    if (this.handSort === "strength") {
      // Trumps first, then the rest strongest-first.
      const score = (c: Card) => (mode === "hokum" && c.suit === t ? 100 : 0) + rankStrength(c, mode, t);
      return [...cards].sort((a, b) => score(b) - score(a) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
    }
    // Colours alternating (♠ ♥ ♣ ♦) so two red or two black suits never sit side by side.
    const colorOrder: Suit[] = ["S", "H", "C", "D"];
    return [...bySuit].sort((a, b) => colorOrder.indexOf(a.suit) - colorOrder.indexOf(b.suit));
  }

  /** Re-lays the hand views in the chosen order. */
  private applyHandOrder(): void {
    const round = this.controller.getRound();
    const ordered = this.orderHand(this.playerHandViews.map((v) => v.card), round.bidding.result?.trumpSuit);
    const ids = ordered.map(cardId);
    this.playerHandViews.sort((a, b) => ids.indexOf(cardId(a.card)) - ids.indexOf(cardId(b.card)));
    for (const v of this.playerHandViews) this.children.bringToTop(v);
    this.relayoutHand();
  }

  /** A sideways drag drops the card where your finger let go. */
  private dropInHand(view: CardView): void {
    const others = this.playerHandViews.filter((v) => v !== view);
    const index = others.filter((v) => v.x < view.x).length;
    others.splice(index, 0, view);
    this.playerHandViews = others;
    this.handSort = "manual";
    this.manualOrder = others.map((v) => cardId(v.card));
    for (const v of this.playerHandViews) this.children.bringToTop(v);
    this.relayoutHand();
  }

  /** The opponents' line under the header. */
  private refreshRival(): void {
    const mods = this.nodeData.modifiers;
    if (!this.rivalText || !mods.rivalLabel) return;
    this.rivalText.setText(`${mods.rivalLabel}: ${mods.rivalRule ?? ""}`);
  }

  /** المترجم: over each player, what their discards ask their partner for (docs/baloot-guide.md §4أ). */
  private refreshSignals(): void {
    for (const t of this.signalTexts) t.destroy();
    this.signalTexts = [];
    if (!this.nodeData.modifiers.translator) return;
    const signals = this.controller.getSignals();
    if (!signals) return;
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const { wants, barqiya } = signals[seat];
      const parts: string[] = [];
      if (barqiya.length) parts.push("برقية " + barqiya.map((x) => SUIT_SYMBOL[x]).join(""));
      if (wants.length) parts.push("يبي " + wants.map((x) => SUIT_SYMBOL[x]).join(""));
      const label = this.seatLabels[seat];
      if (!parts.length || !label) continue;
      const text = arabicText(this, label.x, label.y - 34, "🗣️ " + parts.join(" · "), { fontSize: "22px", color: "#ffd54a" }).setDepth(5);
      this.signalTexts.push(text);
    }
  }

  /** الذاكرة: how many cards of each suit you haven't seen yet (level 2: the Aces and 10s among them). */
  /**
   * الذاكرة: four tiles, one per suit — how many of its cards are still out (not in your hand,
   * not played), and at level 2 which of its Ace and 10 are still out.
   */
  private refreshMemory(): void {
    const panel = this.memoryPanel;
    if (!panel) return;
    panel.removeAll(true);
    const round = this.controller.getRound();
    if (!round || round.phase === "bidding") return;
    const seen = new Set([...round.hands[HUMAN_SEAT], ...round.tricks.flatMap((t) => Object.values(t.cards) as Card[]), ...(Object.values(round.currentTrick?.cards ?? {}) as Card[])].map(cardId));
    const out = SUITS.flatMap((suit) => (["7", "8", "9", "10", "J", "Q", "K", "A"] as const).map((rank) => ({ suit, rank }))).filter((c) => !seen.has(cardId(c)));
    const bigToo = (this.nodeData.modifiers.memory ?? 0) >= 2;
    const w = 196;
    const h = 60;
    const gap = 10;
    SUITS.forEach((suit, i) => {
      const x = (i - 1.5) * (w + gap);
      const left = out.filter((c) => c.suit === suit);
      const color = SUIT_COLOR_HEX[suit];
      const g = this.add.graphics();
      g.fillStyle(0x140804, 0.3);
      g.fillRoundedRect(x - w / 2 + 2, -h / 2 + 4, w, h, 14);
      g.fillStyle(0xf3e9d6, left.length ? 0.96 : 0.55);
      g.fillRoundedRect(x - w / 2, -h / 2, w, h, 14);
      g.lineStyle(2, 0xe3a33b, 0.8);
      g.strokeRoundedRect(x - w / 2, -h / 2, w, h, 14);
      panel.add(g);
      const plain = { offsetX: 0, offsetY: 0, color: "rgba(0,0,0,0)", blur: 0 };
      panel.add(this.add.text(x - w / 2 + 14, 0, SUIT_SYMBOL[suit], { fontFamily: "Tajawal, Arial", fontSize: "36px", color }).setOrigin(0, 0.5));
      const top = bigToo ? -12 : 0;
      panel.add(arabicText(this, x + 18, top, left.length ? `باقي ${left.length}` : "خلص", { fontSize: "23px", color: "#3a2620", fontStyle: "bold", shadow: plain }));
      if (bigToo) {
        const big = left.filter((c) => c.rank === "A" || c.rank === "10").map((c) => (c.rank === "A" ? "إكة" : "عشرة"));
        panel.add(arabicText(this, x + 18, 15, big.length ? big.join(" · ") : "لا كبار", { fontSize: "18px", color: big.length ? color : "#8a6a54", shadow: plain }));
      }
    });
  }

  // ---------------------------------------------------------------- السوا

  private showSawaButton(): void {
    this.sawaButton?.destroy();
    this.sawaButton = undefined;
    if (!this.controller.canClaimSawa()) return;
    this.sawaButton = makeButton(this, 110, HAND_ANCHOR[HUMAN_SEAT].y - 128, "سوا ✋", () => {
      this.sawaButton?.destroy();
      this.sawaButton = undefined;
      // Right or wrong, the hand plays itself out from here.
      this.controller.claimSawa();
      for (const v of this.playerHandViews) {
        v.off("pointerdown");
        v.off("dragstart");
        v.off("drag");
        v.off("dragend");
        if (v.input) {
          this.input.setDraggable(v, false);
          v.disableInteractive();
        }
        v.setDimmed(false);
      }
      this.driveAI();
    }, { width: 170, height: 58, fontSize: "25px", color: 0x8a5a12 });
    this.sawaButton.container.setDepth(6);
  }

  private onSawa(e: { ok: boolean }): void {
    this.showSeatBubble(HUMAN_SEAT, e.ok ? "سوا ✋" : "سوا غلط", e.ok ? 0xffd54a : 0xd45a5a);
    this.flashNote(e.ok ? "✋ سوا! الباقي كله لكم" : "✋ سوا غلط — فيه ورقة أكبر من ورقتك");
    this.pulseJokers("السوا", e.ok ? undefined : "-");
    this.log(e.ok ? "أنت: سوا ✋" : "أنت: سوا غلط");
    this.sawaWrong = !e.ok;
  }

  // ------------------------------------------------------------- AI pacing

  private async driveAI(): Promise<void> {
    if (this.dealing) {
      this.resumeAfterDeal = true;
      return;
    }
    if (this.trickSettling || this.showingHandSummary || this.matchOver) return;
    const status = await this.controller.step();
    if (this.showingHandSummary || this.matchOver) return;
    if (status === "advanced") {
      const phase = this.controller.getRound().phase;
      const delay = phase === "bidding" || phase === "doubling" ? AI_BID_DELAY_MS : AI_PLAY_DELAY_MS;
      this.time.delayedCall(delay, () => this.driveAI());
    }
  }

  /** Pops a short label beside a seat ("بس", "حكم ♠") so a call is attributable at a glance. */
  private showSeatBubble(seat: Seat, text: string, color: number): void {
    this.seatBubble[seat]?.destroy();

    const anchor = HAND_ANCHOR[seat];
    const offset = 165;
    const x = seat === 1 ? anchor.x - offset : seat === 3 ? anchor.x + offset : anchor.x;
    const y = seat === 0 ? anchor.y - 210 : seat === 2 ? anchor.y + 150 : anchor.y;

    const label = arabicText(this, 0, 0, text, { fontSize: "27px" });
    const w = Math.max(120, label.width + 44);
    const h = 66;
    const bg = this.add.graphics();
    bg.fillStyle(0x14303b, 0.94);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    bg.lineStyle(4, color, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);

    const bubble = this.add.container(x, y, [bg, label]).setDepth(15);
    bubble.setScale(0.7).setAlpha(0);
    this.seatBubble[seat] = bubble;

    this.tweens.add({ targets: bubble, scale: 1, alpha: 1, duration: 160, ease: "Back.Out" });
    this.tweens.add({
      targets: bubble,
      alpha: 0,
      delay: BUBBLE_HOLD_MS,
      duration: 220,
      onComplete: () => {
        bubble.destroy();
        if (this.seatBubble[seat] === bubble) this.seatBubble[seat] = undefined;
      },
    });
  }

  private clearSeatBubbles(): void {
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      this.seatBubble[seat]?.destroy();
      this.seatBubble[seat] = undefined;
    }
  }

  // ------------------------------------------------------------- handlers

  private onHandDealt(e: { dealer: Seat; hands: Record<Seat, Card[]>; groundCard: Card }): void {
    if (this.showingHandSummary) {
      this.pendingDeal = e;
      return;
    }
    this.rebuildTable(e);
    this.driveAI();
  }

  private rebuildTable(e: { dealer: Seat; hands: Record<Seat, Card[]>; groundCard: Card }): void {
    this.refreshRival();
    this.clearBidButtons();
    this.clearSeatBubbles();
    for (const view of this.playerHandViews) view.destroy();
    this.playerHandViews = [];
    for (const trick of Object.values(this.trickViews)) trick?.destroy();
    this.trickViews = {};
    this.groundCardView?.destroy();
    this.groundLabel?.destroy();
    this.contractChip?.destroy();
    this.contractChip = undefined;
    this.projects = undefined;
    this.pendingRest = undefined;

    // The deal, as at a real table (the infographic's steps 1–3): counter-clockwise from the
    // dealer's right, three cards each, then two each, then the ground card turned face up.
    this.manualOrder = [];
    const cards = this.orderHand(e.hands[HUMAN_SEAT]);
    const positions = handPositions(HUMAN_SEAT, cards.length, CARD_W);
    const from = this.dealerPoint(e.dealer);
    const counts: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const seat of OPPONENT_SEATS) this.setOpponentCount(seat, 0);
    let t = 0;
    let dealt = 0;
    for (const packet of [3, 2]) {
      for (const seat of this.seatsFrom(e.dealer)) {
        for (let k = 0; k < packet; k++) {
          if (seat === HUMAN_SEAT) {
            const i = dealt + k;
            this.playerHandViews.push(this.flyCardTo(cards[i], from, positions[i], t));
          } else {
            this.flyBackTo(seat, from, t, () => this.setOpponentCount(seat, ++counts[seat]));
          }
          t += DEAL_CARD_GAP_MS;
        }
        t += DEAL_PACKET_GAP_MS;
      }
      dealt += packet;
    }
    this.groundCardView = this.flyCardTo(e.groundCard, from, GROUND_CARD_POS, t);
    this.holdForDeal(t + DEAL_FLY_MS);
    this.groundLabel = arabicText(this, GROUND_CARD_POS.x, GROUND_CARD_POS.labelY, "ورقة الأرض", {
      fontSize: "24px",
      color: "#ffe08a",
    }).setAlpha(0);
    this.tweens.add({ targets: this.groundLabel, alpha: 1, delay: t, duration: DEAL_FLY_MS });

    this.hudModeText.setText(
      `${NODE_TYPE_LABEL_AR[this.nodeData.nodeType]} — مزايدة — ورقة الأرض: ${SUIT_NAME_AR[e.groundCard.suit]} ${SUIT_SYMBOL[e.groundCard.suit]}`,
    );
    this.log(`توزيع جديد — الموزع: ${SEAT_LABEL_AR[e.dealer]}`);
    this.placeDealerChip(e.dealer);
    this.spied = {};
    this.refreshReveals();
    this.refreshMemory();
    this.updateScoreHud();
  }

  private onBiddingTurn(e: { seat: Seat; calls: LegalCall[]; round: 1 | 2; challenge?: { seat: Seat; suit: Suit } }): void {
    this.clearBidButtons();
    if (e.seat !== HUMAN_SEAT) return;

    const bought = e.challenge ? `${SEAT_LABEL_AR[e.challenge.seat]} اشترى حكم ${SUIT_SYMBOL[e.challenge.suit]}` : "";
    const canSun = e.calls.some((c) => c.call === "sun");
    const canAshkal = e.calls.some((c) => c.call === "ashkal");
    // No sun on offer is either the Ace rule (only the dealer's right may flip a hokum bought on
    // an Ace) or a rule of this run that bars your side from sun altogether.
    const aceGround = this.controller.getRound().bidding.groundCard.rank === "A";
    const noSunWhy = aceGround ? "على إكة — ما يقلبها صن إلا اللي على يمين الموزع" : "— الصن ممنوع عليكم في هالرن";
    const prompt = !e.challenge
      ? `دورك — ${e.round === 1 ? "الأول" : "الثاني"}`
      : !canSun
        ? canAshkal
          ? `${bought} ${noSunWhy}، لكن تقدر تشكّل`
          : `${bought} ${noSunWhy}`
        : canAshkal
          ? `${bought} — تاخذها صن أو أشكل؟`
          : `${bought} — تاخذها صن؟`;
    this.showChoices(
      prompt,
      e.calls.map((call) => ({
        label: this.callLabel(call, e.round),
        onClick: () => {
          this.controller.submitPlayerBid({ seat: HUMAN_SEAT, call: call.call, suit: call.suit });
          this.driveAI();
        },
      })),
    );
    // After the buttons: showing them clears the bidding widgets, this one included.
    this.showOracle();
  }

  /** العرّاف: the two hidden cards you'd be dealt if you bought now. */
  private showOracle(): void {
    if (!this.nodeData.modifiers.oracle) return;
    const ground = this.controller.getRound().groundCard;
    const cards = this.controller.previewIfBuy().filter((c) => cardId(c) !== cardId(ground));
    if (cards.length === 0) return;
    const panel = this.add.container(CENTER_X, BID_BUTTON_ROW_Y - 250).setDepth(7);
    const w = 330;
    const bg = this.add.graphics();
    bg.fillStyle(0x1d1433, 0.92);
    bg.fillRoundedRect(-w / 2, -95, w, 190, 18);
    bg.lineStyle(3, 0xb58cff, 1);
    bg.strokeRoundedRect(-w / 2, -95, w, 190, 18);
    panel.add(bg);
    panel.add(arabicText(this, 0, -72, "🔮 لو اشتريت يجيك:", { fontSize: "22px", color: "#d8c4ff" }));
    cards.forEach((c, i) => panel.add(new CardView(this, (i - (cards.length - 1) / 2) * 96, 18, c, true, WIDGET_CARD_SIZE)));
    this.oraclePanel = panel;
  }

  /** A prompt line plus a row (or two) of buttons for the human's decision. */
  private showChoices(prompt: string, items: Array<{ label: string; onClick: () => void }>): void {
    this.clearBidButtons();
    this.bidPrompt = arabicText(this, CENTER_X, BID_BUTTON_ROW_Y - 86, prompt, {
      fontSize: "28px",
      color: "#ffd54a",
      wordWrap: { width: WIDTH - 120, useAdvancedWrap: true },
    }).setDepth(6);

    const perRow = items.length <= 3 ? items.length : Math.ceil(items.length / 2);
    const spacingX = 200;
    items.forEach((item, i) => {
      const row = Math.floor(i / perRow);
      const rowStart = row * perRow;
      const itemsInRow = Math.min(perRow, items.length - rowStart);
      const col = i - rowStart;
      const startX = CENTER_X - ((itemsInRow - 1) * spacingX) / 2;
      const btn = makeButton(
        this,
        startX + col * spacingX,
        BID_BUTTON_ROW_Y + row * BID_BUTTON_ROW_GAP,
        item.label,
        () => {
          this.clearBidButtons();
          item.onClick();
        },
        { width: 184, height: 74, fontSize: "26px" },
      );
      this.bidButtons.push(btn);
    });
  }

  /** The pass word depends on the round: بس in the first, ولا in the second. */
  private passWord(round: 1 | 2): string {
    return round === 1 ? "بس" : "ولا";
  }

  private callLabel(call: LegalCall, round: 1 | 2): string {
    if (call.call === "pass") return this.passWord(round);
    if (call.call === "sun") return "صن";
    if (call.call === "ashkal") return "أشكل";
    return `حكم ${SUIT_SYMBOL[call.suit!]}`;
  }

  // ---------------------------------------------------------------- الدبل

  private contractLabel(): string {
    const round = this.controller.getRound();
    const res = round.bidding.result;
    if (!res) return "";
    const base = res.mode === "hokum" ? `حكم ${SUIT_SYMBOL[res.trumpSuit!]}` : res.ashkal ? "أشكل · صن" : "صن";
    const d = round.doubling;
    const extra = d ? doubleLabel(d.level, d.closed, res.mode) : "";
    return extra ? `${base} · ${extra}` : base;
  }

  private onDoubleTurn(e: { seat: Seat; calls: LegalDouble[]; level: DoubleLevel }): void {
    this.clearBidButtons();
    if (e.seat !== HUMAN_SEAT) return;
    const round = this.controller.getRound();
    const res = round.bidding.result!;
    const d = round.doubling!;
    const contract = res.mode === "hokum" ? `حكم ${SUIT_SYMBOL[res.trumpSuit!]}` : "صن";
    const prompt =
      e.level === 1
        ? `${SEAT_LABEL_AR[res.declarer]} اشترى ${contract} — تدبل؟`
        : e.level === 2
          ? `${SEAT_LABEL_AR[d.doubler!]} دبّل عليك — ثري؟`
          : e.level === 3
            ? `${SEAT_LABEL_AR[res.declarer]} قال ثري — فور؟`
            : `${SEAT_LABEL_AR[d.doubler!]} قال فور — قهوة؟ (الجولة تحسم المباراة)`;
    this.showChoices(
      prompt,
      e.calls.map((call) => ({
        label: call.call === "pass" ? "بس" : `${DOUBLE_NAME_AR[call.call]}${call.closed ? " مقفل" : ""}`,
        onClick: () => {
          this.controller.submitPlayerDouble({ seat: HUMAN_SEAT, call: call.call, closed: call.closed });
          this.driveAI();
        },
      })),
    );
  }

  private onDoubleCall(e: { bid: DoubleBid; level: DoubleLevel; closed: boolean }): void {
    this.showDoubleCall(e);
    // The دبل round is over: now the rest of the cards come.
    if (this.pendingRest && this.controller.getRound().phase !== "doubling") {
      const rest = this.pendingRest;
      this.pendingRest = undefined;
      this.dealRest(rest);
    }
  }

  private showDoubleCall(e: { bid: DoubleBid; level: DoubleLevel; closed: boolean }): void {
    const who = SEAT_LABEL_AR[e.bid.seat];
    if (e.bid.call === "pass") {
      this.showSeatBubble(e.bid.seat, "بس", 0x8aa79a);
      this.log(`${who}: بس`);
      return;
    }
    const word = `${DOUBLE_NAME_AR[e.bid.call]}${e.bid.closed ? " مقفل" : ""}`;
    this.showSeatBubble(e.bid.seat, word, 0xff6b4a);
    this.log(`${who}: ${word}${e.bid.call === "qahwa" ? " ☕ — الجولة تحسم المباراة" : ""}`);
    this.flashNote(`${word}!${e.bid.call === "qahwa" ? " ☕" : ""}`);
    const res = this.controller.getRound().bidding.result!;
    this.placeContractChip(res.declarer, this.contractLabel());
    this.hudModeText.setText(`${NODE_TYPE_LABEL_AR[this.nodeData.nodeType]} — ${this.contractLabel()} — المعلن: ${SEAT_LABEL_AR[res.declarer]}`);
  }

  private clearBidButtons(): void {
    this.oraclePanel?.destroy();
    this.oraclePanel = undefined;
    for (const b of this.bidButtons) b.destroy();
    this.bidButtons = [];
    this.bidPrompt?.destroy();
    this.bidPrompt = undefined;
  }

  private onBiddingBid(e: { bid: Bid; round: 1 | 2 }): void {
    const who = SEAT_LABEL_AR[e.bid.seat];
    if (e.bid.call === "pass") {
      const word = this.passWord(e.round);
      this.log(`${who}: ${word}`);
      this.showSeatBubble(e.bid.seat, word, 0x8aa79a);
    } else if (e.bid.call === "sun") {
      this.log(`${who}: صن`);
      this.showSeatBubble(e.bid.seat, "صن", 0xffd54a);
    } else if (e.bid.call === "ashkal") {
      const signal = this.controller.getRound().bidding.result?.ashkal?.signalSuits ?? [];
      this.log(`${who}: أشكل — يطلب ${signal.map((x) => SUIT_NAME_AR[x]).join(" أو ")}`);
      this.showSeatBubble(e.bid.seat, "أشكل", 0xffb33a);
    } else {
      this.log(`${who}: حكم ${SUIT_SYMBOL[e.bid.suit!]}`);
      this.showSeatBubble(e.bid.seat, `حكم ${SUIT_SYMBOL[e.bid.suit!]}`, 0xffd54a);
    }
    if (this.controller.getRound().bidding.redeal) {
      this.log("محد اشترى — يعاد التوزيع");
    }
  }

  private onBiddingResolved(e: { mode: Mode; trumpSuit?: Suit; declarer: Seat; hands: Record<Seat, Card[]> }): void {
    this.chat(contractLines(e.declarer, e.mode));
    this.clearBidButtons();
    const modeLabel =
      e.mode === "hokum" ? `حكم ${SUIT_SYMBOL[e.trumpSuit!]} ${SUIT_NAME_AR[e.trumpSuit!]}` : "صن (بدون حكم)";
    this.hudModeText.setText(
      `${NODE_TYPE_LABEL_AR[this.nodeData.nodeType]} — ${modeLabel} — المعلن: ${SEAT_LABEL_AR[e.declarer]}`,
    );
    this.log(`${modeLabel} — المعلن ${SEAT_LABEL_AR[e.declarer]}`);
    this.placeContractChip(e.declarer, this.contractLabel());
    // The دبل round is played on the first five cards: the rest is dealt once it's settled.
    if (this.controller.getRound().phase === "doubling") this.pendingRest = e;
    else this.dealRest(e);
  }

  /** The rest of the deal, after the buy (and the دبل round, if there is one). */
  private dealRest(e: { mode: Mode; trumpSuit?: Suit; declarer: Seat; hands: Record<Seat, Card[]> }): void {
    this.groundLabel?.destroy();
    this.groundLabel = undefined;

    // The rest of the deal: the ground card goes to whoever takes it (the buyer, or after أشكل
    // the caller's partner), then three more each — two for the taker — from the dealer's right.
    const round = this.controller.getRound();
    const result = round.bidding.result!;
    const taker = result.ashkal?.groundTo ?? e.declarer;
    const from = this.dealerPoint(round.dealer);
    const ground = this.groundCardView;
    this.groundCardView = undefined;

    const alreadyHeld = new Set(this.playerHandViews.map((v) => cardId(v.card)));
    const cards = this.orderHand(e.hands[HUMAN_SEAT], e.trumpSuit);
    const positions = handPositions(HUMAN_SEAT, cards.length, CARD_W);
    const counts: Record<Seat, number> = { 0: 5, 1: 5, 2: 5, 3: 5 };
    for (const seat of OPPONENT_SEATS) this.setOpponentCount(seat, 5);
    // Reuse the views still in hand (sliding them to their new places), and queue the new ones.
    const oldViews = new Map(this.playerHandViews.map((v) => [cardId(v.card), v]));
    const fresh: Array<{ card: Card; pos: { x: number; y: number } }> = [];
    this.playerHandViews = [];
    cards.forEach((card, i) => {
      const held = alreadyHeld.has(cardId(card)) ? oldViews.get(cardId(card)) : undefined;
      if (held) {
        oldViews.delete(cardId(card));
        this.tweens.add({ targets: held, x: positions[i].x, y: positions[i].y, duration: 240, ease: "Cubic.Out" });
        this.playerHandViews.push(held);
      } else {
        fresh.push({ card, pos: positions[i] });
      }
    });
    for (const v of oldViews.values()) v.destroy();

    let t = 0;
    const groundId = ground ? cardId(ground.card) : "";
    if (ground) {
      if (taker === HUMAN_SEAT) {
        const slot = fresh.findIndex((f) => cardId(f.card) === groundId);
        const target = slot >= 0 ? fresh.splice(slot, 1)[0].pos : { x: ground.x, y: ground.y };
        this.tweens.add({ targets: ground, x: target.x, y: target.y, duration: DEAL_FLY_MS + 80, ease: "Cubic.Out" });
        this.playerHandViews.push(ground);
      } else {
        const to = HAND_ANCHOR[taker];
        this.tweens.add({
          targets: ground,
          x: to.x,
          y: to.y,
          scale: 0.6,
          alpha: 0.2,
          duration: DEAL_FLY_MS + 80,
          ease: "Cubic.In",
          onComplete: () => {
            ground.destroy();
            this.setOpponentCount(taker, ++counts[taker]);
          },
        });
      }
      t += DEAL_FLY_MS + 120;
    }
    for (const seat of this.seatsFrom(round.dealer)) {
      const n = seat === taker ? 2 : 3;
      for (let k = 0; k < n; k++) {
        if (seat === HUMAN_SEAT) {
          const next = fresh.shift();
          if (next) this.playerHandViews.push(this.flyCardTo(next.card, from, next.pos, t));
        } else {
          this.flyBackTo(seat, from, t, () => this.setOpponentCount(seat, ++counts[seat]));
        }
        t += DEAL_CARD_GAP_MS;
      }
      t += DEAL_PACKET_GAP_MS;
    }
    // Keep the hand in display order for the card-picking code.
    const order = new Map(cards.map((c, i) => [cardId(c), i]));
    this.playerHandViews.sort((a, b) => order.get(cardId(a.card))! - order.get(cardId(b.card))!);
    // …and stack them so each card covers the one to its left, as the fan expects.
    for (const v of this.playerHandViews) this.children.bringToTop(v);
    this.holdForDeal(t + DEAL_FLY_MS);
    this.refreshMemory();
  }

  /** Writes the contract beside the buyer's name, so the table always shows who bought what. */
  private placeContractChip(seat: Seat, label: string): void {
    this.contractChip?.destroy();
    const name = this.seatLabels[seat];
    if (!name) return;
    const text = arabicText(this, 0, 0, label, { fontSize: "22px", color: "#1b1b1b", fontStyle: "bold" });
    const w = text.width + 28;
    const bg = this.add.graphics();
    bg.fillStyle(0xffd54a, 1);
    bg.fillRoundedRect(-w / 2, -19, w, 38, 19);
    // Left of the name for you and your partner (the dealer tag sits on the right); above the
    // name for the side seats, which sit too close to the screen edge for anything beside them.
    const side = seat === 1 || seat === 3;
    const x = side ? name.x : name.x - name.width / 2 - w / 2 - 14;
    const y = side ? name.y - 44 : name.y;
    this.contractChip = this.add.container(x, y, [bg, text]).setDepth(6);
    this.contractChip.setScale(0.6);
    this.tweens.add({ targets: this.contractChip, scale: 1, duration: 260, ease: "Back.Out" });
  }

  private onPlayTurn(e: { seat: Seat; legal: Card[] }): void {
    if (e.seat !== HUMAN_SEAT) return;
    this.showSawaButton();
    const legalIds = new Set(e.legal.map(cardId));
    for (const view of this.playerHandViews) {
      // A card can stay in hand, legal-but-unclicked, across more than one of our turns
      // (a different card gets played each time) — clear any stale listener before
      // re-arming, or a later click would fire every handler ever registered on it.
      view.off("pointerdown");
      view.disableInteractive();

      const isLegal = legalIds.has(cardId(view.card));
      view.setDimmed(!isLegal);
      view.setHighlighted(false);
      view.setPlayable(isLegal);
      if (isLegal) {
        setBoxHitArea(view, view.displayW, view.displayH);
        view.input!.cursor = "pointer";
        view.on("pointerdown", () => this.onHumanCardClick(view));
        
        // Drag-to-play logic
        this.input.setDraggable(view);
        let startX = view.x;
        view.on("dragstart", () => {
          startX = view.x;
          this.children.bringToTop(view);
          if (navigator.vibrate) navigator.vibrate(5);
        });
        view.on("drag", (_pointer: any, dragX: number, dragY: number) => {
          view.x = dragX;
          view.y = dragY;
        });
        view.on("dragend", () => {
          // If dragged high enough (e.g. above the hand), play it
          if (view.y < HAND_ANCHOR[HUMAN_SEAT].y - 100) {
            this.onHumanCardClick(view, true); // force play
          } else if (Math.abs(view.x - startX) > CARD_W / 3) {
            this.dropInHand(view); // dragged sideways: reorder your hand
          } else {
            this.relayoutHand(); // snap back
          }
        });
      }
    }
  }

  /** A joker needs you to pick one of your cards (to transform, or to trade away). */
  private onActionTurn(e: { action: PendingAction }): void {
    const a = e.action;
    const text =
      a.kind === "transform"
        ? `🎭 اختر ورقة تتحول إلى ${RANK_NAME_AR[a.to.rank]} ${SUIT_SYMBOL[a.to.suit]}`
        : a.kind === "lower"
          ? "⬇️ المنزّل: اختر ورقة تصير الثمانية من شكلها"
          : a.kind === "dye"
            ? "🖌️ الصبّاغ: اختر ورقة تصير سبيت بنفس رقمها"
            : a.kind === "partner"
              ? "✉️ المرسال: اختر ورقة لشريكك — ويعطيك أكبر ورقة عنده من شكلها"
              : a.suit
                ? `🦊 اختر ورقة تعطيها للخصم مقابل ${a.best ? "أكبر " : ""}${SUIT_NAME_AR[a.suit]} عنده`
                : `🪝 اختر ورقة تعطيها للخصم مقابل ورقة من يده${a.preferTrump ? " (حكم إن وُجد)" : ""}`;
    this.actionPrompt?.destroy();
    this.actionPrompt = arabicText(this, CENTER_X, HAND_ANCHOR[0].y - 190, text, {
      fontSize: "27px",
      color: "#ffd54a",
      backgroundColor: "#0a2318",
      padding: { x: 18, y: 10 },
      wordWrap: { width: WIDTH - 80, useAdvancedWrap: true },
    }).setDepth(12);
    // Every joker pick is optional.
    this.actionSkip?.destroy();
    this.actionSkip = makeButton(this, CENTER_X, HAND_ANCHOR[0].y - 285, "تخطّي", () => this.onActionSkip(), {
      width: 170,
      height: 60,
      fontSize: "24px",
      color: 0x5d5d5d,
    });
    this.actionSkip.container.setDepth(12);

    const hand = this.controller.getRound().hands[HUMAN_SEAT];
    for (const view of this.playerHandViews) {
      view.off("pointerdown");
      view.disableInteractive();
      view.setHighlighted(false);
      // A pick that would change nothing (the trump Jack into itself, an 8 into an 8) wastes the joker.
      const pointless = (a.kind === "transform" || a.kind === "lower" || a.kind === "dye") && !actionTarget(a, view.card, hand);
      view.setDimmed(pointless);
      if (pointless) continue;
      setBoxHitArea(view, view.displayW, view.displayH);
      view.input!.cursor = "pointer";
      view.once("pointerdown", () => this.onActionCardClick(view));
    }
  }

  private onActionCardClick(view: CardView): void {
    if (!this.controller.getPendingAction()) return;
    for (const v of this.playerHandViews) {
      v.off("pointerdown");
      v.disableInteractive();
      v.setDimmed(false);
    }
    this.actionPrompt?.destroy();
    this.actionPrompt = undefined;
    this.actionSkip?.destroy();
    this.actionSkip = undefined;
    this.controller.submitPlayerAction(view.card);
    this.time.delayedCall(900, () => this.driveAI());
  }

  private onActionSkip(): void {
    if (!this.controller.getPendingAction()) return;
    for (const v of this.playerHandViews) {
      v.off("pointerdown");
      v.disableInteractive();
      v.setDimmed(false);
    }
    this.actionPrompt?.destroy();
    this.actionPrompt = undefined;
    this.actionSkip?.destroy();
    this.actionSkip = undefined;
    this.controller.skipPlayerAction();
    this.time.delayedCall(250, () => this.driveAI());
  }

  /** A joker changed someone's hand: redraw it and say what happened. */
  private onHandChanged(e: HandChange): void {
    const label = (c: Card) => `${RANK_NAME_AR[c.rank]} ${SUIT_SYMBOL[c.suit]}`;
    let note: string;
    if (e.kind === "transform") {
      note = `🎭 ${label(e.from)} صارت ${label(e.to)}`;
    } else if (e.kind === "swap") {
      note = `🪝 أعطيت ${label(e.gave)} لـ${SEAT_LABEL_AR[e.otherSeat]} وسحبت ${label(e.got)}`;
    } else {
      note = `🧨 احترقت ${label(e.from)} عند ${SEAT_LABEL_AR[e.seat]}`;
    }
    this.log(note);
    this.flashNote(note);

    if (e.seat === HUMAN_SEAT || e.kind === "swap") this.redrawHumanHand(e.kind === "transform" ? e.to : e.kind === "swap" ? e.got : undefined);
    this.refreshReveals();
    this.refreshMemory();
  }

  /** Rebuilds the player's hand views from the engine, popping `fresh` so it's easy to spot. */
  private redrawHumanHand(fresh?: Card): void {
    for (const view of this.playerHandViews) view.destroy();
    this.selectedCardView = undefined;
    const trump = this.controller.getRound().bidding.result?.trumpSuit;
    const cards = this.orderHand(this.controller.getRound().hands[HUMAN_SEAT], trump);
    const positions = handPositions(HUMAN_SEAT, cards.length, CARD_W);
    let popped = false;
    this.playerHandViews = cards.map((card, i) => {
      const view = new CardView(this, positions[i].x, positions[i].y, card, true, HAND_CARD_SIZE);
      if (fresh && !popped && cardId(card) === cardId(fresh)) {
        popped = true;
        view.setHighlighted(true);
        view.y -= 40;
        this.tweens.add({ targets: view, y: positions[i].y, duration: 700, ease: "Back.Out", delay: 250 });
        this.time.delayedCall(1600, () => view.active && view.setHighlighted(false));
      }
      return view;
    });
  }

  private flashNote(text: string): void {
    const note = arabicText(this, CENTER_X, CENTER_Y + 60, text, {
      fontSize: "30px",
      color: "#ffe08a",
      backgroundColor: "#0a2318",
      padding: { x: 20, y: 12 },
    }).setDepth(30);
    note.setScale(0.7);
    this.tweens.add({ targets: note, scale: 1, duration: 200, ease: "Back.Out" });
    this.tweens.add({ targets: note, alpha: 0, delay: 1900, duration: 400, onComplete: () => note.destroy() });
  }

  private onHumanCardClick(view: CardView, forcePlay = false): void {
    if (this.controller.getRound().turnSeat !== HUMAN_SEAT) return; // stale click, ignore
    
    // First tap: Select the card
    if (!forcePlay && this.selectedCardView !== view) {
      if (this.selectedCardView) {
        // Lower the previously selected card
        this.selectedCardView.y += 40;
        this.selectedCardView.setHighlighted(false);
      }
      this.selectedCardView = view;
      view.y -= 40; // Raise it
      view.setHighlighted(true);
      if (navigator.vibrate) navigator.vibrate(5);
      return;
    }

    // Second tap (or forced drag): Play it
    this.selectedCardView = undefined;
    view.setHighlighted(false);
    if (navigator.vibrate) navigator.vibrate(15);
    
    for (const v of this.playerHandViews) {
      v.off("pointerdown");
      v.off("dragstart");
      v.off("drag");
      v.off("dragend");
      if (this.input && v.input) this.input.setDraggable(v, false);
      if (v.input) v.disableInteractive();
      v.setDimmed(false);
      v.setPlayable(false);
    }
    
    this.controller.submitPlayerCard(view.card);
    this.driveAI();
  }

  /** المشاريع: each seat calls its projects as play starts; only the best team's count. */
  /**
   * المشاريع are known the moment play starts, but at the table they're said in the first
   * trick (each player names theirs as they play) and laid down (فرش) in the second — only
   * by the side whose projects count. The scene follows that rhythm off the play events.
   */
  private onProjectsDeclared(e: ProjectsOutcome): void {
    this.projects = e;
    this.chat(projectLines(e), 1400);
  }

  /** سوالف الطاولة: the computer players' lines, as bubbles a moment after what they react to. */
  private chat(lines: ChatLine[], delay = 900): void {
    for (const line of lines) {
      this.time.delayedCall(delay, () => this.showSeatBubble(line.seat, line.text, 0xffd54a));
    }
  }

  /** Which trick (0-based) the card `seat` just played belongs to. */
  private trickIndexOf(seat: Seat): number {
    const round = this.controller.getRound();
    return round.currentTrick?.order.includes(seat) ? round.tricks.length : round.tricks.length - 1;
  }

  private projectMoment(seat: Seat): void {
    const e = this.projects;
    if (!e) return;
    const mine = e.declared.filter((p) => p.seat === seat);
    if (mine.length === 0) return;
    const trick = this.trickIndexOf(seat);
    const names = mine.map((p) => PROJECT_NAME_AR[p.kind]).join(" + ");
    const counts = e.winner !== undefined && teamOf(seat) === e.winner;
    if (trick === 0) {
      // First trick: the call.
      this.time.delayedCall(250, () => this.showSeatBubble(seat, names, 0xffd54a));
      this.log(`${SEAT_LABEL_AR[seat]}: ${names}`);
    } else if (trick === 1) {
      // Second trick: the winning side lays its projects down; the other side's don't count.
      if (!counts) {
        this.log(`${SEAT_LABEL_AR[seat]}: ${names} (ما تنحسب — مشروعهم أكبر)`);
        return;
      }
      const cards = mine.flatMap((p) => p.cards);
      this.log(`${SEAT_LABEL_AR[seat]} فرش: ${names} — ${cards.map((c) => `${RANK_NAME_AR[c.rank]} ${SUIT_SYMBOL[c.suit]}`).join("، ")}`);
      this.layDownProjects(seat, names, mine.map((p) => p.cards));
    }
  }

  /** Shows a seat's projects face up for a few seconds, like cards laid on the table. */
  private layDownProjects(seat: Seat, label: string, groups: Card[][]): void {
    const at: Record<Seat, { x: number; y: number }> = {
      0: { x: CENTER_X, y: 1300 },
      1: { x: TABLE_RECT.right - 170, y: CENTER_Y + 225 },
      2: { x: CENTER_X, y: TABLE_RECT.top + 250 },
      3: { x: TABLE_RECT.left + 170, y: CENTER_Y + 225 },
    };
    const pos = at[seat];
    const panel = this.add.container(pos.x, pos.y).setDepth(14);
    const cards = groups.flat();
    const step = 44;
    const width = (cards.length - 1) * step + CARD_W * WIDGET_CARD_SIZE + 24;
    const bg = this.add.graphics();
    bg.fillStyle(0x14303b, 0.9);
    bg.fillRoundedRect(-width / 2, -92, width, 176, 16);
    bg.lineStyle(3, 0x5ad469, 1);
    bg.strokeRoundedRect(-width / 2, -92, width, 176, 16);
    panel.add(bg);
    panel.add(arabicText(this, 0, -70, `فرش: ${label}`, { fontSize: "22px", color: "#5ad469" }));
    cards.forEach((card, i) => {
      panel.add(new CardView(this, (i - (cards.length - 1) / 2) * step, 18, card, true, WIDGET_CARD_SIZE));
    });
    panel.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 220, ease: "Back.Out" });
    this.tweens.add({ targets: panel, alpha: 0, delay: 3400, duration: 400, onComplete: () => panel.destroy() });
  }

  private onPlayCard(e: { seat: Seat; card: Card; akka?: boolean; baloot?: boolean }): void {
    const dest = TRICK_ANCHOR[e.seat];
    if (e.seat === HUMAN_SEAT) {
      this.sawaButton?.destroy();
      this.sawaButton = undefined;
    }
    this.time.delayedCall(0, () => {
      this.refreshMemory();
      this.refreshSignals();
    });
    this.projectMoment(e.seat);
    let juiceColor = 0xffffff;
    let shouldJuice = false;
    if (e.akka) {
      this.showSeatBubble(e.seat, "أكّة", 0x9cc3ff);
      this.log(`${SEAT_LABEL_AR[e.seat]}: أكّة`);
      juiceColor = 0x9cc3ff;
      shouldJuice = true;
    }
    if (e.baloot) {
      this.showSeatBubble(e.seat, "بلوت", 0xffd54a);
      this.log(`${SEAT_LABEL_AR[e.seat]}: بلوت (+2)`);
      juiceColor = 0xffd54a;
      shouldJuice = true;
    }

    if (shouldJuice) {
      this.time.delayedCall(CARD_MOVE_TWEEN_MS, () => this.createImpactJuice(dest.x, dest.y, juiceColor));
    }

    if (e.seat === HUMAN_SEAT) {
      const idx = this.playerHandViews.findIndex((v) => cardId(v.card) === cardId(e.card));
      const view = this.playerHandViews[idx];
      this.playerHandViews.splice(idx, 1);
      this.relayoutHand();
      this.trickViews[e.seat] = view;
      view.setPlayable(false);
      this.children.bringToTop(view);
      arcTo(this, view, dest, {
        duration: CARD_MOVE_TWEEN_MS + 70,
        scale: TRICK_CARD_SIZE / HAND_CARD_SIZE,
        angle: this.restingAngle(),
        land: true,
      });
    } else {
      this.setOpponentCount(e.seat, this.controller.getRound().hands[e.seat].length);

      const anchor = HAND_ANCHOR[e.seat];
      const view = new CardView(this, anchor.x, anchor.y, e.card, true, TRICK_CARD_SIZE);
      this.trickViews[e.seat] = view;
      view.setAngle(e.seat === 1 ? -25 : e.seat === 3 ? 25 : 0).setScale(0.7);
      arcTo(this, view, dest, { duration: CARD_MOVE_TWEEN_MS + 70, scale: 1, angle: this.restingAngle(), land: true });
    }
  }

  /** Cards on the table lie a little askew, as if dropped by hand. */
  private restingAngle(): number {
    return (Math.random() - 0.5) * 12;
  }

  /** Creates a card at the table center and tweens it out to its seat position, like a real deal. */
  /** Where the dealer's cards come from: their seat, pulled in toward the table. */
  private dealerPoint(dealer: Seat): { x: number; y: number } {
    const a = HAND_ANCHOR[dealer];
    return { x: a.x + (CENTER_X - a.x) * 0.25, y: a.y + (CENTER_Y - a.y) * 0.25 };
  }

  /** The four seats in dealing (and playing) order: the dealer's right first, the dealer last. */
  private seatsFrom(dealer: Seat): Seat[] {
    return [1, 2, 3, 4].map((k) => ((dealer + k) % 4) as Seat);
  }

  /** A face-up card flying from `from` to `to`, hidden until its turn in the deal. */
  private flyCardTo(card: Card, from: { x: number; y: number }, to: { x: number; y: number }, delay: number): CardView {
    const view = new CardView(this, from.x, from.y, card, true, HAND_CARD_SIZE);
    view.setScale(0.45).setAlpha(0).setAngle((Math.random() - 0.5) * 40);
    this.tweens.add({ targets: view, alpha: 1, delay, duration: DEAL_FLY_MS * 0.4 });
    arcTo(this, view, to, { delay, duration: DEAL_FLY_MS + 60, scale: 1, angle: 0, lift: 60 });
    return view;
  }

  /** A card back flying to another player's seat; `onArrive` bumps their count. */
  private flyBackTo(seat: Seat, from: { x: number; y: number }, delay: number, onArrive: () => void): void {
    const to = HAND_ANCHOR[seat];
    const view = new CardView(this, from.x, from.y, { suit: "S", rank: "7" }, false, WIDGET_CARD_SIZE);
    view.setAlpha(0).setDepth(12);
    this.tweens.add({
      targets: view,
      x: to.x,
      y: to.y,
      alpha: 1,
      delay,
      duration: DEAL_FLY_MS,
      ease: "Cubic.Out",
      onComplete: () => {
        view.destroy();
        onArrive();
      },
    });
  }

  /** Blocks the game loop until the deal animation has landed. */
  private holdForDeal(ms: number): void {
    this.dealing = true;
    this.time.delayedCall(ms, () => {
      this.dealing = false;
      if (this.resumeAfterDeal) {
        this.resumeAfterDeal = false;
        this.driveAI();
      }
    });
  }

  private relayoutHand(): void {
    if (this.selectedCardView) {
      this.selectedCardView.setHighlighted(false);
      this.selectedCardView = undefined;
    }
    const positions = handPositions(HUMAN_SEAT, this.playerHandViews.length, CARD_W);
    this.playerHandViews.forEach((view, i) => {
      this.tweens.add({ targets: view, x: positions[i].x, y: positions[i].y, duration: 180, ease: "Cubic.Out" });
    });
  }

  /** A small "موزع" tag beside the dealer's name, so it's clear who dealt and who starts. */
  private placeDealerChip(dealer: Seat): void {
    this.dealerChip?.destroy();
    const label = this.seatLabels[dealer];
    if (!label) return;
    const text = arabicText(this, 0, 0, "موزع", { fontSize: "20px", color: "#0b3d2e" });
    const w = text.width + 26;
    const bg = this.add.graphics();
    bg.fillStyle(0xe8d9a8, 1);
    bg.fillRoundedRect(-w / 2, -17, w, 34, 17);
    // Beside the name for you and your partner; under the card count for the side seats,
    // which sit too close to the screen edge for anything to their side.
    const side = dealer === 1 || dealer === 3;
    const x = side ? label.x : label.x + label.width / 2 + w / 2 + 14;
    const y = side ? HAND_ANCHOR[dealer].y + 128 : label.y;
    this.dealerChip = this.add.container(x, y, [bg, text]).setDepth(6);
  }

  update(): void {
    // Whose turn it is, shown by lighting up their name. Read straight off the engine each
    // frame so it can never drift from what's actually happening.
    let seat: Seat | null = null;
    if (!this.showingHandSummary && !this.matchOver && this.controller) {
      const round = this.controller.getRound();
      if (round?.phase === "bidding") seat = round.bidding.turnSeat;
      else if (round?.phase === "doubling") seat = round.doubling?.turnSeat ?? null;
      else if (round?.phase === "playing" && !this.trickSettling) seat = round.turnSeat ?? null;
    }
    if (seat === this.highlightedSeat) return;
    if (this.highlightedSeat !== null) this.seatLabels[this.highlightedSeat]?.setColor(SEAT_LABEL_COLOR).setScale(1);
    if (seat !== null) this.seatLabels[seat]?.setColor(TURN_LABEL_COLOR).setScale(1.15);
    this.highlightedSeat = seat;
  }

  /** Runs `fn` now, or once the finished trick has been collected if one is still on the table. */
  private whenTableSettled(fn: () => void): void {
    if (this.trickSettling) this.afterSettle.push(fn);
    else fn();
  }

  private onTrickComplete(e: { trick: Trick; winner: Seat }): void {
    this.trickSettling = true;
    const contract = this.controller.getRound().bidding.result;
    if (contract) this.chat(trickLines(e.trick, e.winner, contract.mode, contract.trumpSuit), 300);
    const isLast = this.controller.getRound().tricks.length === 8;
    // The last trick carries the 10-point bonus, which Baloot players call "الأرض".
    this.log(isLast ? `الأرض: ${SEAT_LABEL_AR[e.winner]} (+${this.lastTrickBonus()})` : `الأكلة: ${SEAT_LABEL_AR[e.winner]}`);
    const dest = HAND_ANCHOR[e.winner];
    const views = { ...this.trickViews };
    this.trickViews = {};

    // The winning card flares and rises a little before everything collects.
    const winningView = views[e.winner];
    const ours = teamOf(e.winner) === teamOf(HUMAN_SEAT);
    if (isLast) {
      this.cameras.main.shake(160, 0.003);
      this.floatText(dest.x, dest.y - 60, `الأرض +${this.lastTrickBonus()}`, "#ffd98a");
    }
    if (winningView) {
      this.children.bringToTop(winningView);
      flare(this, winningView.x, winningView.y, ours ? 0xffd98a : 0x8fd6cb, 0.9);
      rise(this, winningView.x, winningView.y, ours ? [0xffd98a, 0xfff1d6] : [0x8fd6cb, 0xe8f7f4], 10);
      this.tweens.add({
        targets: winningView,
        scale: winningView.scale * 1.14,
        angle: 0,
        duration: 180,
        yoyo: true,
        hold: 220,
        ease: "Back.Out",
      });
    }

    this.time.delayedCall(TRICK_COLLECT_DELAY_MS, () => {
      for (const view of Object.values(views)) {
        if (!view) continue;
        this.tweens.add({
          targets: view,
          x: dest.x,
          y: dest.y,
          alpha: 0,
          scale: view.scale * 0.6,
          angle: view.angle + (Math.random() < 0.5 ? -60 : 60),
          duration: TRICK_COLLECT_TWEEN_MS,
          ease: "Cubic.In",
          onComplete: () => view.destroy(),
        });
      }
    });

    this.time.delayedCall(TRICK_COLLECT_DELAY_MS + TRICK_COLLECT_TWEEN_MS + NEXT_TRICK_GAP_MS, () => {
      this.trickSettling = false;
      const queued = this.afterSettle;
      this.afterSettle = [];
      for (const fn of queued) fn();
      this.driveAI();
    });
  }

  private lastTrickBonus(): number {
    return this.nodeData.modifiers.lastTrickBonus ?? 10;
  }

  private onHandComplete(e: HandCompleteEvent): void {
    this.chat(handLines(e.result, this.handsPlayed === 0), 200);
    this.whenTableSettled(() => this.handMoment(e.result));
    this.handsPlayed++;
    this.showingHandSummary = true;
    // The controller deals the next hand right after this event, so read the finished
    // round's contract now.
    const ashkal = !!this.controller.getRound().bidding.result?.ashkal;
    const snapshot: HandCompleteEvent = { ...e, matchScore: { ...e.matchScore }, ashkal };
    this.whenTableSettled(() => this.showHandSummary(snapshot));
  }

  /** كبوت gets fireworks; any other won hand, a quiet lift of gold. */
  private handMoment(r: HandResult): void {
    const us = teamOf(HUMAN_SEAT);
    if (r.tricksWon[us] === 8) {
      this.cameras.main.shake(300, 0.006);
      screenFlash(this, 0xffe6b0, 0.45);
      celebrate(this, CENTER_X, CENTER_Y + 100);
      this.time.delayedCall(250, () => celebrate(this, CENTER_X - 220, CENTER_Y - 150, undefined, 30));
      this.time.delayedCall(450, () => celebrate(this, CENTER_X + 220, CENTER_Y - 150, undefined, 30));
    } else if (r.sheet?.winner === us) {
      rise(this, CENTER_X, CENTER_Y + 80, [0xffd98a, 0xfff1d6, 0x8fd6cb], 30);
    }
  }

  /**
   * النشرة — the score sheet after every hand, laid out like the one real Baloot apps show:
   * the contract and how the buy went on top, then الأكلات / الأرض / المشاريع / الأبناط /
   * النتيجة for لنا and لهم, then whatever the run's jokers added.
   */
  private showHandSummary(e: HandCompleteEvent): void {
    this.updateScoreHud(e.matchScore);

    const r = e.result;
    const sheet = r.sheet!;
    const us = teamOf(HUMAN_SEAT);
    const them: Team = us === 0 ? 1 : 0;
    const INK = "#262626";

    const panel = this.add.container(0, 0).setDepth(20);
    this.handSummaryPanel = panel;
    const g = this.add.graphics();
    panel.add(g);
    g.fillStyle(0x000000, 0.6);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    const put = (x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle, originX = 0.5) => {
      const t = arabicText(this, x, y, text, { color: INK, ...style }).setOrigin(originX, 0.5);
      panel.add(t);
      return t;
    };

    // ---- header: the contract, who bought it, and how it went
    const left = 36;
    const right = WIDTH - 36;
    let y = 210;
    g.fillStyle(0xf3f3f3, 1);
    g.fillRoundedRect(left, y, right - left, 176, 24);
    g.fillStyle(0xe2e2e2, 1);
    g.fillRoundedRect(left + 14, y + 14, right - left - 28, 68, 16);
    g.fillRoundedRect(left + 14, y + 94, right - left - 28, 68, 16);
    const base = r.mode === "hokum" ? `حكم ${SUIT_SYMBOL[r.trumpSuit!]}` : e.ashkal ? "صن (أشكل)" : "صن";
    const dbl = sheet.double ? ` ${doubleLabel(sheet.double.level, sheet.double.closed, r.mode)}` : "";
    put(right - 40, y + 48, `اللعبة: ${base}${dbl}`, { fontSize: "26px", color: dbl ? "#b3261e" : INK }, 1);
    // After a دبل the side being judged is whoever raised last — the buyer or the doubler.
    const judgedIsBuyer = sheet.judgedTeam === r.declarerTeam;
    put(left + 40, y + 48, `${judgedIsBuyer ? "المشتري" : "المدبل"}: ${sheet.judgedTeam === us ? "فريقنا" : "فريقهم"}`, { fontSize: "26px" }, 0);
    const outcome = { won: ["ربحانة", "#3c9a2e"], lost: ["خسرانة", "#c8322d"], tie: ["متعادلة", "#c07a12"] }[sheet.outcome];
    const kabootNote = sheet.kaboot !== undefined ? (sheet.kaboot === us ? " — كبوت لنا! 💥" : " — كبوت علينا") : "";
    put(CENTER_X, y + 128, `نتيجة الشراء: ${outcome[0]}${kabootNote}`, { fontSize: "28px", color: outcome[1], fontStyle: "bold" });

    // ---- the sheet: a label column on the right, then لنا, then لهم
    y += 206;
    const labelL = right - 150;
    const usX = left + (labelL - 12 - left) * 0.75;
    const themX = left + (labelL - 12 - left) * 0.25;
    const colMid = left + (labelL - 12 - left) / 2;
    const rowH = 60;
    const projectLines = Math.max(1, sheet.projects[us].length, sheet.projects[them].length);
    const bodyH = 64 + rowH * 2 + projectLines * 50 + 24 + rowH;
    const resultH = 76;

    put(labelL + 75, y - 2, "النشرة", { fontSize: "32px", color: "#ffffff", fontStyle: "bold" });
    y += 32;
    g.fillStyle(0xf3f3f3, 1);
    g.fillRoundedRect(left, y, labelL - 12 - left, bodyH + resultH + 28, 24);
    g.fillStyle(0xb9b9b9, 1);
    g.fillRoundedRect(labelL, y + 64, 150, bodyH - 64, 22);
    g.lineStyle(2, 0xcfcfcf, 1);
    g.lineBetween(colMid, y + 10, colMid, y + bodyH);
    g.lineBetween(left + 10, y + 64, labelL - 22, y + 64);
    put(usX, y + 34, "لنا", { fontSize: "28px", fontStyle: "bold" });
    put(themX, y + 34, "لهم", { fontSize: "28px", fontStyle: "bold" });

    const num = (n: number) => (n ? String(n) : "");
    const row = (label: string, rowY: number, a: string, b: string) => {
      put(labelL + 75, rowY, label, { fontSize: "26px" });
      put(usX, rowY, a, { fontSize: "30px" });
      put(themX, rowY, b, { fontSize: "30px" });
    };
    let ry = y + 64 + rowH / 2 + 4;
    row("الأكلات", ry, String(sheet.cards[us]), String(sheet.cards[them]));
    ry += rowH;
    row("الأرض", ry, num(sheet.ground[us]), num(sheet.ground[them]));
    ry += rowH;
    put(labelL + 75, ry, "المشاريع", { fontSize: "26px" });
    ([us, them] as Team[]).forEach((team) => {
      const cx = team === us ? usX : themX;
      sheet.projects[team].forEach((p, i) => {
        put(cx + 50, ry + i * 50, p.name, { fontSize: "25px" });
        put(cx - 60, ry + i * 50, String(p.raw), { fontSize: "27px" });
      });
    });
    ry += (projectLines - 1) * 50 + 24 + rowH / 2 + 6;
    g.lineBetween(left + 10, ry - rowH / 2, labelL - 22, ry - rowH / 2);
    row("الأبناط", ry, String(sheet.abnat[us]), String(sheet.abnat[them]));

    // النتيجة: game points, in the darker strip at the bottom.
    const resY = y + bodyH + 10;
    g.fillStyle(0xc9c9c9, 1);
    g.fillRoundedRect(left + 12, resY, labelL - 36 - left, resultH, 16);
    g.fillStyle(0xe7b3b3, 1);
    g.fillRoundedRect(labelL, resY, 150, resultH, 18);
    put(labelL + 75, resY + resultH / 2, "النتيجة", { fontSize: "27px", color: "#b3261e", fontStyle: "bold" });
    put(usX, resY + resultH / 2, String(sheet.result[us]), { fontSize: "34px", fontStyle: "bold" });
    put(themX, resY + resultH / 2, String(sheet.result[them]), { fontSize: "34px", fontStyle: "bold" });
    y = resY + resultH + 44;
    if (this.sawaWrong) {
      this.sawaWrong = false;
      put(CENTER_X, y, "سوا غلط — اليد كلها لهم، كأنكم شريتوا وخسرتوا", { fontSize: "25px", color: "#ff9a9a", fontStyle: "bold" });
      y += 44;
    }

    // ---- the run's jokers, counted up one at a time (the bible: never show the total first)
    const bonusTotal = e.bonuses.reduce((n, b) => n + b.points, 0);
    let running = e.gained[us] - bonusTotal;
    const lines = e.bonuses.map((b, i) =>
      put(CENTER_X, y + i * 42, `🃏 ${b.label}: ${b.points >= 0 ? "+" : ""}${b.points}`, {
        fontSize: "25px",
        color: b.points < 0 ? "#ff9a9a" : "#9cc3ff",
      }).setAlpha(0),
    );
    y += e.bonuses.length * 42;
    const gainedLine = (n: number) => `المكتسب: لنا ${n} — لهم ${e.gained[them]}`;
    const gainedText = e.bonuses.length > 0 ? put(CENTER_X, y, gainedLine(running), { fontSize: "27px", color: "#ffffff", fontStyle: "bold" }) : undefined;
    if (gainedText) y += 46;
    const totalText = put(CENTER_X, y, `المجموع: لنا ${e.matchScore[us]} — لهم ${e.matchScore[them]}  (الهدف ${this.controller.getMatchTarget()})`, {
      fontSize: "26px",
      color: "#ffd54a",
    });
    const reveal = 300 + e.bonuses.length * BONUS_STEP_MS;
    if (e.bonuses.length > 0) totalText.setAlpha(0);
    lines.forEach((line, i) =>
      this.time.delayedCall(300 + i * BONUS_STEP_MS, () => {
        if (!panel.active) return;
        const b = e.bonuses[i];
        line.setAlpha(1).setScale(0.6);
        this.tweens.add({ targets: line, scale: 1, duration: 220, ease: "Back.Out" });
        running += b.points;
        gainedText!.setText(gainedLine(running));
        this.tweens.add({ targets: gainedText, scale: 1.15, duration: 110, yoyo: true });
        this.pulseJokers(b.label);
      }),
    );
    if (e.bonuses.length > 0) {
      this.time.delayedCall(reveal, () => {
        if (!panel.active) return;
        this.tweens.add({ targets: totalText, alpha: 1, duration: 250 });
        if (bonusTotal >= 10) this.cameras.main.shake(140, 0.004);
      });
    }

    const btn = makeButton(
      this,
      CENTER_X,
      y + 100,
      "التالي",
      () => {
        panel.destroy();
        this.handSummaryPanel = undefined;
        this.showingHandSummary = false;
        if (this.pendingMatchEnd) {
          const end = this.pendingMatchEnd;
          this.pendingMatchEnd = undefined;
          this.showMatchEnd(end);
          return;
        }
        if (this.pendingDeal) {
          const deal = this.pendingDeal;
          this.pendingDeal = null;
          this.rebuildTable(deal);
        }
        this.driveAI();
      },
      { width: right - left, height: 88, color: 0x5d5d5d },
    );
    panel.add(btn.container);
  }

  private onMatchComplete(e: { winner: Team; matchScore: Record<Team, number>; qahwa?: boolean }): void {
    this.chat(matchLines(e.winner), 200);
    this.matchOver = true;
    const end = { winner: e.winner, matchScore: { ...e.matchScore }, qahwa: e.qahwa };
    // The hand that ended the match still gets its النشرة; the match panel follows it.
    if (this.showingHandSummary) this.pendingMatchEnd = end;
    else this.whenTableSettled(() => this.showMatchEnd(end));
  }

  private showMatchEnd(e: { winner: Team; matchScore: Record<Team, number>; qahwa?: boolean }): void {
    this.updateScoreHud(e.matchScore);
    // The match can end on the same synchronous step that just completed a hand — the
    // "التالي" summary panel above may still be up (never clicked), so clear it first.
    this.handSummaryPanel?.destroy();
    this.handSummaryPanel = undefined;
    this.showingHandSummary = false;
    this.matchOver = true;

    const won = e.winner === teamOf(HUMAN_SEAT);
    if (won) {
      screenFlash(this, 0xffe6b0, 0.4, 600);
      celebrate(this, CENTER_X, CENTER_Y - 260, undefined, 80);
    }
    const { shieldUsed, goldEarned } = runController.resolveMatchNode(won);
    const runState = runController.getState();

    const title = (won ? "فزتم بالعقدة! 🎉" : "خسرتم العقدة") + (e.qahwa ? " — قهوة ☕" : "");
    const rewardLine = won
      ? `+${goldEarned} ذهب${runState.salary ? ` (منها ${runState.salary} راتب)` : ""}`
      : shieldUsed
        ? `🛡️ الدرع حماك — ما نقصت حياة`
        : `-1 حياة (متبقي ${runState.lives})`;

    const panelW = WIDTH - 120;
    const panel = this.add.container(CENTER_X, CENTER_Y).setDepth(20);
    const bg = this.add.graphics();
    bg.fillStyle(0x14303b, 1);
    bg.fillRoundedRect(-panelW / 2, -230, panelW, 460, 28);
    bg.lineStyle(6, won ? 0x5ad469 : 0xd45a5a, 0.9);
    bg.strokeRoundedRect(-panelW / 2, -230, panelW, 460, 28);
    panel.add(bg);
    panel.add(arabicText(this, 0, -150, title, { fontSize: "38px" }));
    panel.add(arabicText(this, 0, -70, `أنتم ${e.matchScore[0]} — الخصم ${e.matchScore[1]}`, { fontSize: "27px" }));
    panel.add(arabicText(this, 0, -10, rewardLine, { fontSize: "25px", color: "#ffd54a" }));

    if (runState.over) {
      const runTitle = runState.won ? "أكملتم الرن! 🏆" : "انتهى الرن";
      panel.add(arabicText(this, 0, 48, runTitle, { fontSize: "29px", color: runState.won ? "#5ad469" : "#d45a5a" }));
    }

    // A won match (not the last one) opens the spoils; otherwise straight back to the map.
    const spoils = won && !!runState.pendingRewards;
    const btn = makeButton(
      this,
      0,
      150,
      spoils ? "الغنائم 🎁" : "المتابعة للخريطة",
      () => {
        panel.destroy();
        if (spoils) this.scene.start("reward", { goldEarned });
        else this.scene.start("map");
      },
      { width: 380, height: 80, fontSize: "28px" },
    );
    panel.add(btn.container);
  }

  private updateScoreHud(matchScore?: Record<Team, number>): void {
    const score = matchScore ?? this.controller.getMatchScore();
    this.hudScoreText.setText(`أنتم ${score[0]}  —  الخصم ${score[1]}  (هدف ${this.controller.getMatchTarget()})`);
  }
}



