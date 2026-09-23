import Phaser from "phaser";
import { cardId } from "../engine/cards";
import type { LegalCall } from "../engine/bidding";
import type { Bid, Card, HandResult, Mode, Seat, Suit, Team, Trick } from "../engine/types";
import { teamOf } from "../engine/types";
import { GameController, HUMAN_SEAT, type MatchOptions } from "../game/GameController";
import { mulberry32 } from "../engine/rng";
import { runController } from "../roguelike/RunController";
import type { NodeType } from "../roguelike/types";
import { CardView, CARD_W } from "./CardView";
import { SUIT_NAME_AR, SUIT_SYMBOL } from "./cardArt";
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
const AI_PLAY_DELAY_MS = 750;
const TRICK_COLLECT_DELAY_MS = 850;
const TRICK_COLLECT_TWEEN_MS = 350;
const CARD_MOVE_TWEEN_MS = 300;
const BUBBLE_HOLD_MS = 1100;
const LOG_LINES = 4;

/** Card draw sizes per on-screen role (see CardView: these size the art, not a shrink transform). */
const HAND_CARD_SIZE = 1;
const TRICK_CARD_SIZE = 0.95;
const WIDGET_CARD_SIZE = 0.62;

const OPPONENT_SEATS: Seat[] = [1, 2, 3];

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

    arabicText(this, HAND_ANCHOR[0].x, HAND_ANCHOR[0].y - 128, SEAT_LABEL_AR[0], {
      fontSize: "26px",
      color: "#e8e8e8",
    }).setDepth(5);

    for (const seat of OPPONENT_SEATS) {
      const anchor = HAND_ANCHOR[seat];
      const back = new CardView(this, anchor.x, anchor.y, { suit: "S", rank: "7" }, false, WIDGET_CARD_SIZE);
      const count = arabicText(this, anchor.x, anchor.y + back.displayH / 2 + 26, "×8", {
        fontSize: "24px",
        color: "#dbeee1",
      }).setDepth(5);
      arabicText(this, anchor.x, anchor.y - back.displayH / 2 - 26, SEAT_LABEL_AR[seat], {
        fontSize: "24px",
        color: "#bcd",
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
  }

  // ------------------------------------------------------------- AI pacing

  private driveAI(): void {
    if (this.showingHandSummary || this.matchOver) return;
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
      `${NODE_TYPE_LABEL_AR[this.nodeData.nodeType]} — مزايدة — الأرض: ${SUIT_NAME_AR[e.groundCard.suit]} ${SUIT_SYMBOL[e.groundCard.suit]}`,
    );
    this.log(`توزيع جديد — الموزع: ${SEAT_LABEL_AR[e.dealer]}`);
    this.updateScoreHud();
  }

  private onBiddingTurn(e: { seat: Seat; calls: LegalCall[]; round: 1 | 2 }): void {
    this.clearBidButtons();
    if (e.seat !== HUMAN_SEAT) return;

    this.bidPrompt = arabicText(this, CENTER_X, BID_BUTTON_ROW_Y - 86, `دورك — الجولة ${e.round}`, {
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

  private onPlayCard(e: { seat: Seat; card: Card }): void {
    const dest = TRICK_ANCHOR[e.seat];

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

  private onTrickComplete(e: { trick: Trick; winner: Seat }): void {
    this.log(`الأكلة: ${SEAT_LABEL_AR[e.winner]}`);
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
  }

  private onHandComplete(e: { result: HandResult; matchScore: Record<Team, number> }): void {
    this.showingHandSummary = true;
    this.updateScoreHud(e.matchScore);

    const r = e.result;
    const modeLabel = r.mode === "hokum" ? `حكم ${SUIT_SYMBOL[r.trumpSuit!]}` : "صن";
    const lines = [
      `انتهت اليد (${modeLabel})`,
      `أنتم ${r.gamePoints[0]} — الخصم ${r.gamePoints[1]}  (ورق ${r.scoredPoints[0]} — ${r.scoredPoints[1]})`,
      `المجموع: ${e.matchScore[0]} — ${e.matchScore[1]} (هدف ${this.controller.getMatchTarget()})`,
    ];

    const panelW = WIDTH - 120;
    const panel = this.add.container(CENTER_X, CENTER_Y).setDepth(20);
    this.handSummaryPanel = panel;
    const bg = this.add.graphics();
    bg.fillStyle(0x0a2318, 1);
    bg.fillRoundedRect(-panelW / 2, -200, panelW, 400, 28);
    bg.lineStyle(4, 0xffd54a, 0.8);
    bg.strokeRoundedRect(-panelW / 2, -200, panelW, 400, 28);
    panel.add(bg);

    lines.forEach((line, i) => {
      panel.add(arabicText(this, 0, -110 + i * 56, line, { fontSize: "27px" }));
    });

    const btn = makeButton(
      this,
      0,
      130,
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
      { width: 260, height: 80 },
    );
    panel.add(btn.container);
  }

  private onMatchComplete(e: { winner: Team; matchScore: Record<Team, number> }): void {
    // The match can end on the same synchronous step that just completed a hand — the
    // "التالي" summary panel above may still be up (never clicked), so clear it first.
    this.handSummaryPanel?.destroy();
    this.handSummaryPanel = undefined;
    this.showingHandSummary = false;
    this.matchOver = true;

    const won = e.winner === teamOf(HUMAN_SEAT);
    runController.resolveMatchNode(won);
    const runState = runController.getState();

    const title = won ? "فزتم بالعقدة! 🎉" : "خسرتم العقدة";
    const rewardLine = won
      ? `+${runState.nodes[runState.currentIndex].reward} ذهب`
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
