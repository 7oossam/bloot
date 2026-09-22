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
import { CENTER_X, CENTER_Y, HAND_ANCHOR, SEAT_LABEL_AR, TRICK_ANCHOR, handPositions, sortHandForDisplay } from "./layout";
import { arabicText, makeButton, type ButtonHandle } from "./ui";

const AI_STEP_DELAY_MS = 650;
const TRICK_COLLECT_DELAY_MS = 700;
const TRICK_COLLECT_TWEEN_MS = 350;
const CARD_MOVE_TWEEN_MS = 260;
const LOG_LINES = 5;

const NODE_TYPE_LABEL_AR: Record<NodeType, string> = {
  match: "مباراة",
  elite: "مباراة نخبة",
  shop: "متجر",
  boss: "الزعيم",
};

export interface TableSceneData {
  nodeType: NodeType;
  matchTarget: number;
  modifiers: MatchOptions;
}

export class TableScene extends Phaser.Scene {
  private controller!: GameController;
  private nodeData!: TableSceneData;

  private handViews: Record<Seat, CardView[]> = { 0: [], 1: [], 2: [], 3: [] };
  private trickViews: Partial<Record<Seat, CardView>> = {};
  private groundCardView?: CardView;
  private groundLabel?: Phaser.GameObjects.Text;
  private bidButtons: ButtonHandle[] = [];

  private hudScoreText!: Phaser.GameObjects.Text;
  private hudModeText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private logLines: string[] = [];
  private seatLabels: Record<Seat, Phaser.GameObjects.Text> = {} as Record<Seat, Phaser.GameObjects.Text>;

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
      .ellipse(this.scale.width / 2, this.scale.height / 2, 900, 480, 0x0f5132)
      .setStrokeStyle(6, 0x0a3524);
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
    // Seat labels sit clear of every hand's card area (never behind a stack) and above
    // static HUD text (setDepth) so a redraw can never bury them again.
    const seatLabelPos: Record<Seat, { x: number; y: number }> = {
      0: { x: HAND_ANCHOR[0].x, y: HAND_ANCHOR[0].y - CARD_H / 2 - 22 }, // above your hand
      2: { x: HAND_ANCHOR[2].x, y: HAND_ANCHOR[2].y + CARD_H / 2 + 18 }, // below partner's hand
      1: { x: HAND_ANCHOR[1].x, y: HAND_ANCHOR[1].y - 190 }, // above the left stack
      3: { x: HAND_ANCHOR[3].x, y: HAND_ANCHOR[3].y - 190 }, // above the right stack
    };
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const pos = seatLabelPos[seat];
      this.seatLabels[seat] = arabicText(this, pos.x, pos.y, SEAT_LABEL_AR[seat], {
        fontSize: "16px",
        color: "#e8e8e8",
      }).setDepth(5);
    }

    this.hudScoreText = arabicText(this, this.scale.width / 2, 20, "", { fontSize: "18px" }).setDepth(5);
    this.hudModeText = arabicText(this, this.scale.width / 2, 44, "", {
      fontSize: "15px",
      color: "#ffd54a",
    }).setDepth(5);
    this.logText = arabicText(this, 20, this.scale.height - 20, "", {
      fontSize: "13px",
      color: "#cfe8d8",
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
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      for (const view of this.handViews[seat]) view.destroy();
      this.handViews[seat] = [];
    }
    for (const trick of Object.values(this.trickViews)) trick?.destroy();
    this.trickViews = {};
    this.groundCardView?.destroy();
    this.groundLabel?.destroy();

    let dealIndex = 0;
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const cards = seat === HUMAN_SEAT ? sortHandForDisplay(e.hands[seat]) : e.hands[seat];
      const positions = handPositions(seat, cards.length);
      this.handViews[seat] = cards.map((card, i) => {
        const view = this.dealCardTo(positions[i].x, positions[i].y, card, seat === HUMAN_SEAT, dealIndex * 30);
        dealIndex++;
        return view;
      });
    }

    this.groundCardView = this.dealCardTo(
      this.scale.width / 2,
      this.scale.height / 2 - 50,
      e.groundCard,
      true,
      dealIndex * 30,
    );
    this.groundLabel = arabicText(this, this.scale.width / 2, this.scale.height / 2 - 105, "ورقة الأرض", {
      fontSize: "14px",
      color: "#ffe08a",
    });

    this.hudModeText.setText(`${NODE_TYPE_LABEL_AR[this.nodeData.nodeType]} — المزايدة — ورقة الأرض: ${SUIT_NAME_AR[e.groundCard.suit]} ${SUIT_SYMBOL[e.groundCard.suit]}`);
    this.log(`توزيع جديد — الموزع: ${SEAT_LABEL_AR[e.dealer]}`);
    this.updateScoreHud();
  }

  private onBiddingTurn(e: { seat: Seat; calls: LegalCall[]; round: 1 | 2 }): void {
    this.clearBidButtons();
    if (e.seat !== HUMAN_SEAT) return;

    const labels = e.calls.map((c) => this.callLabel(c));
    const spacing = 150;
    const startX = this.scale.width / 2 - ((labels.length - 1) * spacing) / 2;
    const y = this.scale.height - 190;

    e.calls.forEach((call, i) => {
      const btn = makeButton(this, startX + i * spacing, y, labels[i], () => {
        const bid: Bid = { seat: HUMAN_SEAT, call: call.call, suit: call.suit };
        this.clearBidButtons();
        this.controller.submitPlayerBid(bid);
        this.driveAI();
      });
      this.bidButtons.push(btn);
    });
  }

  private callLabel(call: LegalCall): string {
    if (call.call === "pass") return "جلي (تمرير)";
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
      this.log(`${who}: اشترى صن`);
    } else {
      this.log(`${who}: اشترى حكم ${SUIT_SYMBOL[e.bid.suit!]}`);
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
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const alreadyHeld = new Set(this.handViews[seat].map((v) => cardId(v.card)));
      for (const view of this.handViews[seat]) view.destroy();
      const cards = seat === HUMAN_SEAT ? sortHandForDisplay(e.hands[seat], e.trumpSuit) : e.hands[seat];
      const positions = handPositions(seat, cards.length);
      this.handViews[seat] = cards.map((card, i) => {
        const pos = positions[i];
        if (alreadyHeld.has(cardId(card))) {
          return new CardView(this, pos.x, pos.y, card, seat === HUMAN_SEAT);
        }
        // A newly-dealt card (the ground card, or one of the final 3): deal it in from center.
        const view = this.dealCardTo(pos.x, pos.y, card, seat === HUMAN_SEAT, dealIndex * 60);
        dealIndex++;
        return view;
      });
    }

    const modeLabel =
      e.mode === "hokum"
        ? `حكم ${SUIT_SYMBOL[e.trumpSuit!]} ${SUIT_NAME_AR[e.trumpSuit!]}`
        : "صن (بدون حكم)";
    this.hudModeText.setText(`${NODE_TYPE_LABEL_AR[this.nodeData.nodeType]} — ${modeLabel} — المعلن: ${SEAT_LABEL_AR[e.declarer]}`);
    this.log(`تم! ${modeLabel} — المعلن ${SEAT_LABEL_AR[e.declarer]}`);
  }

  private onPlayTurn(e: { seat: Seat; legal: Card[] }): void {
    if (e.seat !== HUMAN_SEAT) return;
    const legalIds = new Set(e.legal.map(cardId));
    for (const view of this.handViews[HUMAN_SEAT]) {
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
    for (const v of this.handViews[HUMAN_SEAT]) {
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
      const idx = this.handViews[HUMAN_SEAT].findIndex((v) => cardId(v.card) === cardId(e.card));
      const view = this.handViews[HUMAN_SEAT][idx];
      this.handViews[HUMAN_SEAT].splice(idx, 1);
      this.relayoutHand(HUMAN_SEAT);
      this.trickViews[e.seat] = view;
      this.tweens.add({ targets: view, x: dest.x, y: dest.y, duration: CARD_MOVE_TWEEN_MS, ease: "Cubic.Out" });
    } else {
      const stack = this.handViews[e.seat];
      const removed = stack.pop();
      removed?.destroy();
      this.relayoutHand(e.seat);

      const anchor = HAND_ANCHOR[e.seat];
      const view = new CardView(this, anchor.x, anchor.y, e.card, true);
      this.trickViews[e.seat] = view;
      this.tweens.add({ targets: view, x: dest.x, y: dest.y, duration: CARD_MOVE_TWEEN_MS, ease: "Cubic.Out" });
    }
  }

  /** Creates a card at the table center and tweens it out to its seat position, like a real deal. */
  private dealCardTo(x: number, y: number, card: Card, faceUp: boolean, delay: number): CardView {
    const view = new CardView(this, CENTER_X, CENTER_Y, card, faceUp);
    view.setScale(0.5);
    view.setAlpha(0.85);
    this.tweens.add({ targets: view, x, y, scale: 1, alpha: 1, delay, duration: 240, ease: "Cubic.Out" });
    return view;
  }

  private relayoutHand(seat: Seat): void {
    const positions = handPositions(seat, this.handViews[seat].length);
    this.handViews[seat].forEach((view, i) => {
      this.tweens.add({ targets: view, x: positions[i].x, y: positions[i].y, duration: 180, ease: "Cubic.Out" });
    });
  }

  private onTrickComplete(e: { trick: Trick; winner: Seat }): void {
    this.log(`أخذ الأكلة: ${SEAT_LABEL_AR[e.winner]}`);
    const dest = HAND_ANCHOR[e.winner];
    const views = { ...this.trickViews };
    this.trickViews = {};

    // A quick pop on the winning card sells the moment before everything collects.
    const winningView = views[e.winner];
    if (winningView) {
      this.tweens.add({
        targets: winningView,
        scale: 1.18,
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
      `نقاط الفريقين: أنتم ${r.scoredPoints[0]} — الخصم ${r.scoredPoints[1]}`,
      `المجموع: أنتم ${e.matchScore[0]} — الخصم ${e.matchScore[1]} (الهدف ${this.controller.getMatchTarget()})`,
    ];

    const panel = this.add.container(this.scale.width / 2, this.scale.height / 2);
    this.handSummaryPanel = panel;
    const bg = this.add.graphics();
    bg.fillStyle(0x0a2318, 0.95);
    bg.fillRoundedRect(-260, -110, 520, 220, 14);
    bg.lineStyle(2, 0xffd54a, 0.8);
    bg.strokeRoundedRect(-260, -110, 520, 220, 14);
    panel.add(bg);

    lines.forEach((line, i) => {
      panel.add(arabicText(this, 0, -60 + i * 32, line, { fontSize: "16px" }));
    });

    const btn = makeButton(this, 0, 75, "التالي", () => {
      panel.destroy();
      this.handSummaryPanel = undefined;
      this.showingHandSummary = false;
      if (this.pendingDeal) {
        const deal = this.pendingDeal;
        this.pendingDeal = null;
        this.rebuildTable(deal);
      }
      this.driveAI();
    });
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

    const panel = this.add.container(this.scale.width / 2, this.scale.height / 2);
    const bg = this.add.graphics();
    bg.fillStyle(0x0a2318, 0.97);
    bg.fillRoundedRect(-260, -120, 520, 240, 14);
    bg.lineStyle(3, won ? 0x5ad469 : 0xd45a5a, 0.9);
    bg.strokeRoundedRect(-260, -120, 520, 240, 14);
    panel.add(bg);
    panel.add(arabicText(this, 0, -70, title, { fontSize: "24px" }));
    panel.add(
      arabicText(this, 0, -25, `النتيجة: أنتم ${e.matchScore[0]} — الخصم ${e.matchScore[1]}`, { fontSize: "16px" }),
    );
    panel.add(arabicText(this, 0, 5, rewardLine, { fontSize: "15px", color: "#ffd54a" }));

    if (runState.over) {
      const runTitle = runState.won ? "أكملتم الرن! 🏆" : "انتهى الرن — نفدت أرواحكم";
      panel.add(arabicText(this, 0, 35, runTitle, { fontSize: "17px", color: runState.won ? "#5ad469" : "#d45a5a" }));
    }

    const btn = makeButton(this, 0, 85, "المتابعة للخريطة", () => {
      panel.destroy();
      this.scene.start("map");
    });
    panel.add(btn.container);
  }

  private updateScoreHud(matchScore?: Record<Team, number>): void {
    const score = matchScore ?? this.controller.getMatchScore();
    this.hudScoreText.setText(`أنتم ${score[0]}   —   الخصم ${score[1]}   (الهدف ${this.controller.getMatchTarget()})`);
  }
}
