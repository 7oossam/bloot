import Phaser from "phaser";
import { cardId } from "../engine/cards";
import type { LegalCall } from "../engine/bidding";
import type { Bid, Card, HandResult, Mode, Seat, Suit, Team, Trick } from "../engine/types";
import { teamOf } from "../engine/types";
import {
  GameController,
  HUMAN_SEAT,
  type HandBonus,
  type HandChange,
  type MatchOptions,
  type PendingAction,
} from "../game/GameController";
import { mulberry32 } from "../engine/rng";
import { runController } from "../roguelike/RunController";
import type { NodeType } from "../roguelike/types";
import { CardView, CARD_W } from "./CardView";
import { RANK_NAME_AR, SUIT_NAME_AR, SUIT_SYMBOL } from "./cardArt";
import { PROJECT_NAME_AR, type ProjectsOutcome } from "../engine/projects";
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
const LOG_LINES = 4;

/** Card draw sizes per on-screen role (see CardView: these size the art, not a shrink transform). */
const HAND_CARD_SIZE = 1;
const TRICK_CARD_SIZE = 0.95;
const WIDGET_CARD_SIZE = 0.62;

const OPPONENT_SEATS: Seat[] = [1, 2, 3];
const SEAT_LABEL_COLOR = "#cfe0d6";
const TURN_LABEL_COLOR = "#ffd54a";

const NODE_TYPE_LABEL_AR: Record<NodeType, string> = {
  match: "مباراة",
  elite: "نخبة",
  shop: "متجر",
  boss: "الزعيم",
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
  private highlightedSeat: Seat | null = null;
  /** Face-up cards drawn for the spy / partner-eyes jokers, rebuilt whenever a hand changes. */
  private revealViews: CardView[] = [];
  /** Which of each opponent's cards the spy joker is showing this hand. */
  private spied: Partial<Record<Seat, string[]>> = {};
  private actionPrompt?: Phaser.GameObjects.Text;

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
    this.trickSettling = false;
    this.afterSettle = [];
    this.seatLabels = {};
    this.contractChip = undefined;
    this.dealerChip = undefined;
    this.highlightedSeat = null;
    this.revealViews = [];
    this.spied = {};
    this.actionPrompt = undefined;
  }

  create(): void {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0b3d2e).setOrigin(0);
    this.drawTable();
    this.buildStaticUI();
    this.controller = new GameController(mulberry32(Date.now() % 2147483647), {
      matchTarget: this.nodeData.matchTarget,
      ...this.nodeData.modifiers,
    });
    this.wireControllerEvents();
    this.controller.startMatch();
  }

  /** A square-ish felt table (not a landscape-style oval) with the 4 real seats around its edges. */
  private drawTable(): void {
    const { left, top, right, bottom } = TABLE_RECT;
    const w = right - left;
    const h = bottom - top;
    const gfx = this.add.graphics();
    gfx.fillStyle(0x0f5132, 1);
    gfx.fillRoundedRect(left, top, w, h, 52);
    gfx.lineStyle(10, 0x0a3524, 1);
    gfx.strokeRoundedRect(left, top, w, h, 52);
    gfx.lineStyle(4, 0x1c6b45, 0.6);
    gfx.strokeRoundedRect(left + 20, top + 20, w - 40, h - 40, 36);
  }

  // ---------------------------------------------------------------- setup

  private buildStaticUI(): void {
    this.hudScoreText = arabicText(this, CENTER_X, 46, "", { fontSize: "30px" }).setDepth(5);
    this.hudModeText = arabicText(this, CENTER_X, 92, "", { fontSize: "23px", color: "#ffd54a" }).setDepth(5);

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
      this.seatLabels[seat] = arabicText(this, anchor.x, anchor.y - back.displayH / 2 - 26, SEAT_LABEL_AR[seat], {
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
    c.on("projects:declared", (e) => this.onProjectsDeclared(e));
    c.on("gold:earned", (e) => this.onGoldEarned(e));
    c.on("action:turn", (e) => this.onActionTurn(e));
    c.on("hand:changed", (e) => this.onHandChanged(e));
    c.on("play:turn", (e) => this.onPlayTurn(e));
    c.on("play:card", (e) => this.onPlayCard(e));
    c.on("trick:complete", (e) => this.onTrickComplete(e));
    c.on("hand:complete", (e) => this.onHandComplete(e));
    c.on("match:complete", (e) => this.onMatchComplete(e));
  }

  // -------------------------------------------------------------- logging

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
    runController.addGold(e.amount);
    const pop = arabicText(this, CENTER_X, CENTER_Y - 120, `+${e.amount} ذهب 💰`, {
      fontSize: "34px",
      color: "#ffd54a",
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

  // ------------------------------------------------------------- AI pacing

  private driveAI(): void {
    if (this.trickSettling || this.showingHandSummary || this.matchOver) return;
    const status = this.controller.step();
    if (this.showingHandSummary || this.matchOver) return;
    if (status === "advanced") {
      const delay = this.controller.getRound().phase === "bidding" ? AI_BID_DELAY_MS : AI_PLAY_DELAY_MS;
      this.time.delayedCall(delay, () => this.driveAI());
    }
  }

  /** Pops a short label beside a seat ("جلي", "حكم ♠") so a call is attributable at a glance. */
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
    bg.fillStyle(0x08201a, 0.94);
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

    let dealIndex = 0;
    const cards = sortHandForDisplay(e.hands[HUMAN_SEAT]);
    const positions = handPositions(HUMAN_SEAT, cards.length, CARD_W);
    this.playerHandViews = cards.map((card, i) => {
      const view = this.dealCardTo(positions[i].x, positions[i].y, card, true, dealIndex * 30, HAND_CARD_SIZE);
      dealIndex++;
      return view;
    });

    for (const seat of OPPONENT_SEATS) this.setOpponentCount(seat, e.hands[seat].length);

    this.groundCardView = this.dealCardTo(
      GROUND_CARD_POS.x,
      GROUND_CARD_POS.y,
      e.groundCard,
      true,
      dealIndex * 30,
      HAND_CARD_SIZE,
    );
    this.groundLabel = arabicText(this, GROUND_CARD_POS.x, GROUND_CARD_POS.labelY, "ورقة الأرض", {
      fontSize: "24px",
      color: "#ffe08a",
    });

    this.hudModeText.setText(
      `${NODE_TYPE_LABEL_AR[this.nodeData.nodeType]} — مزايدة — ورقة الأرض: ${SUIT_NAME_AR[e.groundCard.suit]} ${SUIT_SYMBOL[e.groundCard.suit]}`,
    );
    this.log(`توزيع جديد — الموزع: ${SEAT_LABEL_AR[e.dealer]}`);
    this.placeDealerChip(e.dealer);
    this.spied = {};
    this.refreshReveals();
    this.updateScoreHud();
  }

  private onBiddingTurn(e: { seat: Seat; calls: LegalCall[]; round: 1 | 2; challenge?: { seat: Seat; suit: Suit } }): void {
    this.clearBidButtons();
    if (e.seat !== HUMAN_SEAT) return;

    const bought = e.challenge ? `${SEAT_LABEL_AR[e.challenge.seat]} اشترى حكم ${SUIT_SYMBOL[e.challenge.suit]}` : "";
    const prompt = !e.challenge
      ? `دورك — الجولة ${e.round}`
      : e.calls.length === 1
        ? `${bought} على إكة — ما يقلبها صن إلا اللي على يمين الموزع`
        : e.calls.some((c) => c.call === "ashkal")
          ? `${bought} — تاخذها صن أو أشكل؟`
          : `${bought} — تاخذها صن؟`;
    this.bidPrompt = arabicText(this, CENTER_X, BID_BUTTON_ROW_Y - 86, prompt, {
      fontSize: "28px",
      color: "#ffd54a",
    }).setDepth(6);

    const labels = e.calls.map((c) => this.callLabel(c));
    const perRow = labels.length <= 3 ? labels.length : Math.ceil(labels.length / 2);
    const spacingX = 200;

    e.calls.forEach((call, i) => {
      const row = Math.floor(i / perRow);
      const rowStart = row * perRow;
      const itemsInRow = Math.min(perRow, labels.length - rowStart);
      const col = i - rowStart;
      const startX = CENTER_X - ((itemsInRow - 1) * spacingX) / 2;

      const btn = makeButton(
        this,
        startX + col * spacingX,
        BID_BUTTON_ROW_Y + row * BID_BUTTON_ROW_GAP,
        labels[i],
        () => {
          const bid: Bid = { seat: HUMAN_SEAT, call: call.call, suit: call.suit };
          this.clearBidButtons();
          this.controller.submitPlayerBid(bid);
          this.driveAI();
        },
        { width: 184, height: 74, fontSize: "26px" },
      );
      this.bidButtons.push(btn);
    });
  }

  private callLabel(call: LegalCall): string {
    if (call.call === "pass") return "جلي";
    if (call.call === "sun") return "صن";
    if (call.call === "ashkal") return "أشكل";
    return `حكم ${SUIT_SYMBOL[call.suit!]}`;
  }

  private clearBidButtons(): void {
    for (const b of this.bidButtons) b.destroy();
    this.bidButtons = [];
    this.bidPrompt?.destroy();
    this.bidPrompt = undefined;
  }

  private onBiddingBid(e: { bid: Bid }): void {
    const who = SEAT_LABEL_AR[e.bid.seat];
    if (e.bid.call === "pass") {
      this.log(`${who}: جلي`);
      this.showSeatBubble(e.bid.seat, "جلي", 0x8aa79a);
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
    this.clearBidButtons();
    this.groundCardView?.destroy();
    this.groundLabel?.destroy();
    this.groundCardView = undefined;
    this.groundLabel = undefined;

    let dealIndex = 0;
    const alreadyHeld = new Set(this.playerHandViews.map((v) => cardId(v.card)));
    for (const view of this.playerHandViews) view.destroy();
    const cards = sortHandForDisplay(e.hands[HUMAN_SEAT], e.trumpSuit);
    const positions = handPositions(HUMAN_SEAT, cards.length, CARD_W);
    this.playerHandViews = cards.map((card, i) => {
      const pos = positions[i];
      if (alreadyHeld.has(cardId(card))) {
        return new CardView(this, pos.x, pos.y, card, true, HAND_CARD_SIZE);
      }
      const view = this.dealCardTo(pos.x, pos.y, card, true, dealIndex * 60, HAND_CARD_SIZE);
      dealIndex++;
      return view;
    });

    for (const seat of OPPONENT_SEATS) this.setOpponentCount(seat, e.hands[seat].length);

    const modeLabel =
      e.mode === "hokum" ? `حكم ${SUIT_SYMBOL[e.trumpSuit!]} ${SUIT_NAME_AR[e.trumpSuit!]}` : "صن (بدون حكم)";
    this.hudModeText.setText(
      `${NODE_TYPE_LABEL_AR[this.nodeData.nodeType]} — ${modeLabel} — المعلن: ${SEAT_LABEL_AR[e.declarer]}`,
    );
    this.log(`${modeLabel} — المعلن ${SEAT_LABEL_AR[e.declarer]}`);
    const ashkal = !!this.controller.getRound().bidding.result?.ashkal;
    this.placeContractChip(e.declarer, e.mode === "hokum" ? `حكم ${SUIT_SYMBOL[e.trumpSuit!]}` : ashkal ? "أشكل · صن" : "صن");
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
      if (isLegal) {
        setBoxHitArea(view, view.displayW, view.displayH);
        view.input!.cursor = "pointer";
        view.once("pointerdown", () => this.onHumanCardClick(view));
      }
    }
  }

  /** A joker needs you to pick one of your cards (to transform, or to trade away). */
  private onActionTurn(e: { action: PendingAction }): void {
    const a = e.action;
    const text =
      a.kind === "transform"
        ? `🎭 اختر ورقة تتحول إلى ${RANK_NAME_AR[a.to.rank]} ${SUIT_SYMBOL[a.to.suit]}`
        : `🪝 اختر ورقة تعطيها للخصم مقابل ورقة من يده${a.preferTrump ? " (حكم إن وُجد)" : ""}`;
    this.actionPrompt?.destroy();
    this.actionPrompt = arabicText(this, CENTER_X, HAND_ANCHOR[0].y - 190, text, {
      fontSize: "27px",
      color: "#ffd54a",
      backgroundColor: "#0a2318",
      padding: { x: 18, y: 10 },
    }).setDepth(12);

    for (const view of this.playerHandViews) {
      view.off("pointerdown");
      view.disableInteractive();
      view.setHighlighted(false);
      // Turning the trump Jack into itself would waste the joker.
      const pointless = a.kind === "transform" && cardId(view.card) === cardId(a.to);
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
    this.controller.submitPlayerAction(view.card);
    this.time.delayedCall(900, () => this.driveAI());
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
  }

  /** Rebuilds the player's hand views from the engine, popping `fresh` so it's easy to spot. */
  private redrawHumanHand(fresh?: Card): void {
    for (const view of this.playerHandViews) view.destroy();
    const trump = this.controller.getRound().bidding.result?.trumpSuit;
    const cards = sortHandForDisplay(this.controller.getRound().hands[HUMAN_SEAT], trump);
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

  private onHumanCardClick(view: CardView): void {
    if (this.controller.getRound().turnSeat !== HUMAN_SEAT) return; // stale click, ignore
    for (const v of this.playerHandViews) {
      v.off("pointerdown");
      v.disableInteractive();
      v.setDimmed(false);
    }
    this.controller.submitPlayerCard(view.card);
    this.driveAI();
  }

  /** المشاريع: each seat calls its projects as play starts; only the best team's count. */
  private onProjectsDeclared(e: ProjectsOutcome): void {
    const bySeat = new Map<Seat, string[]>();
    for (const p of e.declared) bySeat.set(p.seat, [...(bySeat.get(p.seat) ?? []), PROJECT_NAME_AR[p.kind]]);
    let delay = 900;
    for (const [seat, names] of bySeat) {
      const text = names.join(" + ");
      const counts = e.winner !== undefined && teamOf(seat) === e.winner;
      this.time.delayedCall(delay, () => this.showSeatBubble(seat, text, counts ? 0x5ad469 : 0x8aa79a));
      this.log(`${SEAT_LABEL_AR[seat]}: ${text}${counts ? "" : " (ما تنحسب)"}`);
      delay += 500;
    }
  }

  private onPlayCard(e: { seat: Seat; card: Card; akka?: boolean; baloot?: boolean }): void {
    const dest = TRICK_ANCHOR[e.seat];
    if (e.akka) {
      this.showSeatBubble(e.seat, "آكه", 0x9cc3ff);
      this.log(`${SEAT_LABEL_AR[e.seat]}: آكه`);
    }
    if (e.baloot) {
      this.showSeatBubble(e.seat, "بلوت 👑", 0xffd54a);
      this.log(`${SEAT_LABEL_AR[e.seat]}: بلوت (+2)`);
    }

    if (e.seat === HUMAN_SEAT) {
      const idx = this.playerHandViews.findIndex((v) => cardId(v.card) === cardId(e.card));
      const view = this.playerHandViews[idx];
      this.playerHandViews.splice(idx, 1);
      this.relayoutHand();
      this.trickViews[e.seat] = view;
      this.tweens.add({
        targets: view,
        x: dest.x,
        y: dest.y,
        scale: TRICK_CARD_SIZE / HAND_CARD_SIZE,
        duration: CARD_MOVE_TWEEN_MS,
        ease: "Cubic.Out",
      });
    } else {
      this.setOpponentCount(e.seat, this.controller.getRound().hands[e.seat].length);

      const anchor = HAND_ANCHOR[e.seat];
      const view = new CardView(this, anchor.x, anchor.y, e.card, true, TRICK_CARD_SIZE);
      this.trickViews[e.seat] = view;
      this.tweens.add({ targets: view, x: dest.x, y: dest.y, duration: CARD_MOVE_TWEEN_MS, ease: "Cubic.Out" });
    }
  }

  /** Creates a card at the table center and tweens it out to its seat position, like a real deal. */
  private dealCardTo(x: number, y: number, card: Card, faceUp: boolean, delay: number, sizeScale: number): CardView {
    const view = new CardView(this, CENTER_X, CENTER_Y, card, faceUp, sizeScale);
    view.setScale(0.5);
    view.setAlpha(0.85);
    this.tweens.add({ targets: view, x, y, scale: 1, alpha: 1, delay, duration: 240, ease: "Cubic.Out" });
    return view;
  }

  private relayoutHand(): void {
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
    const isLast = this.controller.getRound().tricks.length === 8;
    // The last trick carries the 10-point bonus, which Baloot players call "الأرض".
    this.log(isLast ? `الأرض: ${SEAT_LABEL_AR[e.winner]} (+${this.lastTrickBonus()})` : `الأكلة: ${SEAT_LABEL_AR[e.winner]}`);
    const dest = HAND_ANCHOR[e.winner];
    const views = { ...this.trickViews };
    this.trickViews = {};

    // A quick pop on the winning card sells the moment before everything collects.
    const winningView = views[e.winner];
    if (winningView) {
      this.tweens.add({
        targets: winningView,
        scale: winningView.scale * 1.18,
        duration: 140,
        yoyo: true,
        ease: "Quad.Out",
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
    this.showingHandSummary = true;
    // The controller deals the next hand right after this event, so read the finished
    // round's contract now.
    const ashkal = !!this.controller.getRound().bidding.result?.ashkal;
    const snapshot: HandCompleteEvent = { ...e, matchScore: { ...e.matchScore }, ashkal };
    this.whenTableSettled(() => this.showHandSummary(snapshot));
  }

  /**
   * النشرة — the score sheet after every hand, laid out like the one real Baloot apps show:
   * the contract and how the buy went on top, then الأكلات / الأرض / المشاريع / الأبناط /
   * النتيجة for لنا and لهم, then whatever the run's jokers added.
   */
  private showHandSummary(e: HandCompleteEvent): void {
    if (this.matchOver) return; // the match-end panel replaces it
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
    const mode = r.mode === "hokum" ? `حكم ${SUIT_SYMBOL[r.trumpSuit!]} ${SUIT_NAME_AR[r.trumpSuit!]}` : e.ashkal ? "صن (أشكل)" : "صن";
    put(right - 40, y + 48, `اللعبة: ${mode}`, { fontSize: "26px" }, 1);
    put(left + 40, y + 48, `المشتري: ${r.declarerTeam === us ? "فريقنا" : "فريقهم"}`, { fontSize: "26px" }, 0);
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

    // ---- the run's jokers, then the match score
    for (const b of e.bonuses) {
      put(CENTER_X, y, `🃏 ${b.label}: +${b.points}`, { fontSize: "25px", color: "#9cc3ff" });
      y += 42;
    }
    if (e.bonuses.length > 0) {
      put(CENTER_X, y, `المكتسب: لنا ${e.gained[us]} — لهم ${e.gained[them]}`, { fontSize: "25px", color: "#ffffff" });
      y += 42;
    }
    put(CENTER_X, y, `المجموع: لنا ${e.matchScore[us]} — لهم ${e.matchScore[them]}  (الهدف ${this.controller.getMatchTarget()})`, {
      fontSize: "26px",
      color: "#ffd54a",
    });

    const btn = makeButton(
      this,
      CENTER_X,
      y + 100,
      "التالي",
      () => {
        panel.destroy();
        this.handSummaryPanel = undefined;
        this.showingHandSummary = false;
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

  private onMatchComplete(e: { winner: Team; matchScore: Record<Team, number> }): void {
    this.matchOver = true;
    const matchScore = { ...e.matchScore };
    this.whenTableSettled(() => this.showMatchEnd({ winner: e.winner, matchScore }));
  }

  private showMatchEnd(e: { winner: Team; matchScore: Record<Team, number> }): void {
    this.updateScoreHud(e.matchScore);
    // The match can end on the same synchronous step that just completed a hand — the
    // "التالي" summary panel above may still be up (never clicked), so clear it first.
    this.handSummaryPanel?.destroy();
    this.handSummaryPanel = undefined;
    this.showingHandSummary = false;
    this.matchOver = true;

    const won = e.winner === teamOf(HUMAN_SEAT);
    const { shieldUsed } = runController.resolveMatchNode(won);
    const runState = runController.getState();

    const title = won ? "فزتم بالعقدة! 🎉" : "خسرتم العقدة";
    const rewardLine = won
      ? `+${runState.nodes[runState.currentIndex].reward} ذهب`
      : shieldUsed
        ? `🛡️ الدرع حماك — ما نقصت حياة`
        : `-1 حياة (متبقي ${runState.lives})`;

    const panelW = WIDTH - 120;
    const panel = this.add.container(CENTER_X, CENTER_Y).setDepth(20);
    const bg = this.add.graphics();
    bg.fillStyle(0x0a2318, 1);
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

    const btn = makeButton(
      this,
      0,
      150,
      "المتابعة للخريطة",
      () => {
        panel.destroy();
        this.scene.start("map");
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
