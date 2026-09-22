import Phaser from "phaser";
import { cardId } from "../engine/cards";
import type { LegalCall } from "../engine/bidding";
import type { Bid, Card, HandResult, Mode, Seat, Suit, Team, Trick } from "../engine/types";
import { teamOf } from "../engine/types";
import { GameController, HUMAN_SEAT, type MatchOptions } from "../game/GameController";
import { mulberry32 } from "../engine/rng";
import { runController } from "../roguelike/RunController";
import type { NodeType } from "../roguelike/types";
import { CardView, CARD_H, CARD_W } from "./CardView";
import { SUIT_NAME_AR, SUIT_SYMBOL } from "./cardArt";
import { CENTER_X, CENTER_Y, HAND_ANCHOR, HEIGHT, SEAT_LABEL_AR, TRICK_ANCHOR, WIDTH, handPositions, sortHandForDisplay } from "./layout";
import { arabicText, makeButton, type ButtonHandle } from "./ui";

const AI_STEP_DELAY_MS = 650;
const TRICK_COLLECT_DELAY_MS = 700;
const TRICK_COLLECT_TWEEN_MS = 350;
const CARD_MOVE_TWEEN_MS = 260;
const LOG_LINES = 3;

// Scale factors applied to CardView's base 64x92 art at each on-screen role — the whole
// layout is authored at phone width, so every card renders smaller than its native size.
const HAND_SCALE = 0.62;
const WIDGET_SCALE = 0.5;
const TRICK_SCALE = 0.55;
const GROUND_SCALE = 0.62;

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
  private groundCardView?: CardView;
  private groundLabel?: Phaser.GameObjects.Text;
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
  }

  create(): void {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0b3d2e).setOrigin(0);
    this.add
      .ellipse(CENTER_X, CENTER_Y + 60, WIDTH - 30, HEIGHT - 340, 0x0f5132)
      .setStrokeStyle(5, 0x0a3524);
    this.buildStaticUI();
    this.controller = new GameController(mulberry32(Date.now() % 2147483647), {
      matchTarget: this.nodeData.matchTarget,
      ...this.nodeData.modifiers,
    });
    this.wireControllerEvents();
    this.controller.startMatch();
  }

  // ---------------------------------------------------------------- setup

  private buildStaticUI(): void {
    this.hudScoreText = arabicText(this, CENTER_X, 14, "", { fontSize: "14px" }).setDepth(5);
    this.hudModeText = arabicText(this, CENTER_X, 34, "", {
      fontSize: "11px",
      color: "#ffd54a",
    }).setDepth(5);

    arabicText(this, HAND_ANCHOR[0].x, HAND_ANCHOR[0].y - CARD_H * HAND_SCALE - 12, SEAT_LABEL_AR[0], {
      fontSize: "13px",
      color: "#e8e8e8",
    }).setDepth(5);

    for (const seat of OPPONENT_SEATS) {
      const anchor = HAND_ANCHOR[seat];
      const back = new CardView(this, anchor.x, anchor.y, { suit: "S", rank: "7" }, false);
      back.setScale(WIDGET_SCALE);
      const count = arabicText(this, anchor.x, anchor.y + CARD_H * WIDGET_SCALE * 0.5 + 12, "×8", {
        fontSize: "12px",
        color: "#dbeee1",
      }).setDepth(5);
      arabicText(this, anchor.x, anchor.y - CARD_H * WIDGET_SCALE * 0.5 - 12, SEAT_LABEL_AR[seat], {
        fontSize: "12px",
        color: "#bcd",
      }).setDepth(5);
      this.opponentWidget[seat] = { back, count };
    }

    this.logText = arabicText(this, 10, HEIGHT - 4, "", {
      fontSize: "10px",
      color: "#9fc2ab",
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
  }

  // ------------------------------------------------------------- AI pacing

  private driveAI(): void {
    if (this.showingHandSummary || this.matchOver) return;
    const status = this.controller.step();
    if (this.showingHandSummary || this.matchOver) return;
    if (status === "advanced") {
      this.time.delayedCall(AI_STEP_DELAY_MS, () => this.driveAI());
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
    for (const view of this.playerHandViews) view.destroy();
    this.playerHandViews = [];
    for (const trick of Object.values(this.trickViews)) trick?.destroy();
    this.trickViews = {};
    this.groundCardView?.destroy();
    this.groundLabel?.destroy();

    let dealIndex = 0;
    const cards = sortHandForDisplay(e.hands[HUMAN_SEAT]);
    const positions = handPositions(HUMAN_SEAT, cards.length);
    this.playerHandViews = cards.map((card, i) => {
      const view = this.dealCardTo(positions[i].x, positions[i].y, card, true, dealIndex * 30, HAND_SCALE);
      dealIndex++;
      return view;
    });

    for (const seat of OPPONENT_SEATS) this.setOpponentCount(seat, e.hands[seat].length);

    this.groundCardView = this.dealCardTo(CENTER_X, 235, e.groundCard, true, dealIndex * 30, GROUND_SCALE);
    this.groundLabel = arabicText(this, CENTER_X, 195, "ورقة الأرض", {
      fontSize: "12px",
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

    const labels = e.calls.map((c) => this.callLabel(c));
    const perRow = labels.length <= 3 ? labels.length : Math.ceil(labels.length / 2);
    const spacingX = 100;
    const spacingY = 44;
    const startY = 490;

    e.calls.forEach((call, i) => {
      const row = Math.floor(i / perRow);
      const rowStart = row * perRow;
      const itemsInRow = Math.min(perRow, labels.length - rowStart);
      const col = i - rowStart;
      const startX = CENTER_X - ((itemsInRow - 1) * spacingX) / 2;

      const btn = makeButton(
        this,
        startX + col * spacingX,
        startY + row * spacingY,
        labels[i],
        () => {
          const bid: Bid = { seat: HUMAN_SEAT, call: call.call, suit: call.suit };
          this.clearBidButtons();
          this.controller.submitPlayerBid(bid);
          this.driveAI();
        },
        { width: 92, height: 36, fontSize: "13px" },
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
  }

  private onBiddingBid(e: { bid: Bid }): void {
    const who = SEAT_LABEL_AR[e.bid.seat];
    if (e.bid.call === "pass") {
      this.log(`${who}: جلي`);
    } else if (e.bid.call === "sun") {
      this.log(`${who}: صن`);
    } else {
      this.log(`${who}: حكم ${SUIT_SYMBOL[e.bid.suit!]}`);
    }
    if (this.controller.getRound().bidding.redeal) {
      this.log("يعاد التوزيع");
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
    const positions = handPositions(HUMAN_SEAT, cards.length);
    this.playerHandViews = cards.map((card, i) => {
      const pos = positions[i];
      if (alreadyHeld.has(cardId(card))) {
        const view = new CardView(this, pos.x, pos.y, card, true);
        view.setScale(HAND_SCALE);
        return view;
      }
      const view = this.dealCardTo(pos.x, pos.y, card, true, dealIndex * 60, HAND_SCALE);
      dealIndex++;
      return view;
    });

    for (const seat of OPPONENT_SEATS) this.setOpponentCount(seat, e.hands[seat].length);

    const modeLabel =
      e.mode === "hokum" ? `حكم ${SUIT_SYMBOL[e.trumpSuit!]} ${SUIT_NAME_AR[e.trumpSuit!]}` : "صن (بدون حكم)";
    this.hudModeText.setText(`${NODE_TYPE_LABEL_AR[this.nodeData.nodeType]} — ${modeLabel} — المعلن: ${SEAT_LABEL_AR[e.declarer]}`);
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
        view.setInteractive(
          new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H),
          Phaser.Geom.Rectangle.Contains,
        );
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
        scale: TRICK_SCALE,
        duration: CARD_MOVE_TWEEN_MS,
        ease: "Cubic.Out",
      });
    } else {
      const remaining = this.controller.getRound().hands[e.seat].length;
      this.setOpponentCount(e.seat, remaining);

      const anchor = HAND_ANCHOR[e.seat];
      const view = new CardView(this, anchor.x, anchor.y, e.card, true);
      view.setScale(WIDGET_SCALE);
      this.trickViews[e.seat] = view;
      this.tweens.add({
        targets: view,
        x: dest.x,
        y: dest.y,
        scale: TRICK_SCALE,
        duration: CARD_MOVE_TWEEN_MS,
        ease: "Cubic.Out",
      });
    }
  }

  /** Creates a card at the table center and tweens it out to its seat position, like a real deal. */
  private dealCardTo(x: number, y: number, card: Card, faceUp: boolean, delay: number, finalScale: number): CardView {
    const view = new CardView(this, CENTER_X, CENTER_Y, card, faceUp);
    view.setScale(finalScale * 0.5);
    view.setAlpha(0.85);
    this.tweens.add({ targets: view, x, y, scale: finalScale, alpha: 1, delay, duration: 240, ease: "Cubic.Out" });
    return view;
  }

  private relayoutHand(): void {
    const positions = handPositions(HUMAN_SEAT, this.playerHandViews.length);
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
        scale: TRICK_SCALE * 1.18,
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
      `أنتم ${r.scoredPoints[0]} — الخصم ${r.scoredPoints[1]}`,
      `المجموع: ${e.matchScore[0]} — ${e.matchScore[1]} (هدف ${this.controller.getMatchTarget()})`,
    ];

    const panelW = WIDTH - 60;
    const panel = this.add.container(CENTER_X, CENTER_Y);
    this.handSummaryPanel = panel;
    const bg = this.add.graphics();
    bg.fillStyle(0x0a2318, 0.96);
    bg.fillRoundedRect(-panelW / 2, -100, panelW, 200, 14);
    bg.lineStyle(2, 0xffd54a, 0.8);
    bg.strokeRoundedRect(-panelW / 2, -100, panelW, 200, 14);
    panel.add(bg);

    lines.forEach((line, i) => {
      panel.add(arabicText(this, 0, -55 + i * 28, line, { fontSize: "14px" }));
    });

    const btn = makeButton(
      this,
      0,
      65,
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
      { width: 130, height: 40 },
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

    const panelW = WIDTH - 60;
    const panel = this.add.container(CENTER_X, CENTER_Y);
    const bg = this.add.graphics();
    bg.fillStyle(0x0a2318, 0.97);
    bg.fillRoundedRect(-panelW / 2, -115, panelW, 230, 14);
    bg.lineStyle(3, won ? 0x5ad469 : 0xd45a5a, 0.9);
    bg.strokeRoundedRect(-panelW / 2, -115, panelW, 230, 14);
    panel.add(bg);
    panel.add(arabicText(this, 0, -75, title, { fontSize: "19px" }));
    panel.add(arabicText(this, 0, -35, `أنتم ${e.matchScore[0]} — الخصم ${e.matchScore[1]}`, { fontSize: "14px" }));
    panel.add(arabicText(this, 0, -5, rewardLine, { fontSize: "13px", color: "#ffd54a" }));

    if (runState.over) {
      const runTitle = runState.won ? "أكملتم الرن! 🏆" : "انتهى الرن";
      panel.add(arabicText(this, 0, 22, runTitle, { fontSize: "15px", color: runState.won ? "#5ad469" : "#d45a5a" }));
    }

    const btn = makeButton(
      this,
      0,
      75,
      "المتابعة للخريطة",
      () => {
        panel.destroy();
        this.scene.start("map");
      },
      { width: 190, height: 40, fontSize: "14px" },
    );
    panel.add(btn.container);
  }

  private updateScoreHud(matchScore?: Record<Team, number>): void {
    const score = matchScore ?? this.controller.getMatchScore();
    this.hudScoreText.setText(`أنتم ${score[0]}  —  الخصم ${score[1]}  (هدف ${this.controller.getMatchTarget()})`);
  }
}
