import Phaser from "phaser";
import { RANKS, type Seat, type Suit } from "../engine/types";
import { rankStrength } from "../engine/cards";
import {
  answerText,
  DRILL_TYPE_AR,
  isCorrect,
  pickQuestions,
  RANK_AR,
  SEAT_AR,
  SUIT_AR,
  SUIT_SIGN,
  type DrillAnswer,
  type DrillQuestion,
  type DrillTable,
  type DrillType,
} from "../drill/questions";
import { finishHand, loadProgress, recordAnswer, saveProgress, stopsFor, typesFor, weightOf, type DrillProgress } from "../drill/progress";
import { CENTER_X, HEIGHT, TABLE_RECT, WIDTH } from "./layout";
import { arabicText, makeButton, type ButtonHandle } from "./ui";
import { flare, rise } from "./fx";
import { mulberry32 } from "../engine/rng";

/**
 * تمرين الذاكرة at the table: after some tricks (by your level) play stops and a question comes
 * up over the table; you answer from memory (the tricks are gone, the log is hidden), see at once
 * whether you were right and where the answer was on the table, and play on.
 */
export class DrillCoach {
  readonly progress: DrillProgress;
  asked = 0;
  right = 0;
  readonly byType: Partial<Record<DrillType, { asked: number; right: number }>> = {};
  private panel?: Phaser.GameObjects.Container;
  private readonly rand = mulberry32(Date.now() % 2147483647);

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly table: () => DrillTable,
  ) {
    this.progress = loadProgress();
  }

  get level(): number {
    return this.progress.level;
  }

  /** After trick `n` (1-based): ask, if this level stops here, then `done`. */
  afterTrick(n: number, done: () => void): void {
    const { after, perStop } = stopsFor(this.level);
    if (!after.includes(n)) return done();
    const qs = pickQuestions(this.table(), perStop, (t) => weightOf(this.progress, t), this.rand, typesFor(this.level));
    if (!qs.length) return done();
    const next = (i: number) => (i < qs.length ? this.ask(qs[i], i, qs.length, () => next(i + 1)) : done());
    next(0);
  }

  // ------------------------------------------------------------------ one question

  private ask(q: DrillQuestion, i: number, of: number, done: () => void): void {
    this.panel?.destroy();
    const w = WIDTH - 110;
    const top = TABLE_RECT.top + 70;
    const panel = this.scene.add.container(CENTER_X, top).setDepth(60);
    this.panel = panel;
    const shade = this.scene.add.rectangle(0, HEIGHT / 2 - top, WIDTH * 2, HEIGHT * 2, 0x000000, 0.35).setInteractive();
    panel.add(shade);
    const bg = this.scene.add.graphics();
    panel.add(bg);
    const head = arabicText(this.scene, 0, 0, `سؤال${of > 1 ? ` ${i + 1} من ${of}` : ""} · ${DRILL_TYPE_AR[q.type]}`, { fontSize: "24px", color: "#f0cb7a" }).setOrigin(0.5, 0);
    const text = arabicText(this.scene, 0, head.height + 18, q.text, { fontSize: "30px", wordWrap: { width: w - 70, useAdvancedWrap: true }, lineSpacing: 6 }).setOrigin(0.5, 0);
    panel.add([head, text]);
    // The answer's verdict takes the buttons' place.
    const widgetsTop = head.height + text.height + 60;
    const buttons: ButtonHandle[] = [];
    const answer = (given: DrillAnswer) => {
      for (const b of buttons) b.destroy();
      this.feedback(q, given, widgetsTop, w, bg, done);
    };
    const bottom = this.widgets(q, widgetsTop, w, buttons, answer);
    this.frame(bg, w, bottom + 30);
    panel.setAlpha(0).setScale(0.95);
    this.scene.tweens.add({ targets: panel, alpha: 1, scale: 1, duration: 180, ease: "Back.Out" });
  }

  private frame(bg: Phaser.GameObjects.Graphics, w: number, h: number): void {
    bg.clear();
    bg.fillStyle(0x0d2229, 0.97);
    bg.fillRoundedRect(-w / 2, -30, w, h + 30, 24);
    bg.lineStyle(3, 0xf0cb7a, 1);
    bg.strokeRoundedRect(-w / 2, -30, w, h + 30, 24);
  }

  /** The answer buttons for the question's kind; returns the y under them. */
  private widgets(q: DrillQuestion, y: number, _w: number, buttons: ButtonHandle[], answer: (a: DrillAnswer) => void): number {
    const panel = this.panel!;
    const btn = (x: number, by: number, label: string, onClick: () => void, width = 150, tone: "hokum" | "sun" | "pass" = "hokum") => {
      const b = makeButton(this.scene, x, by, label, onClick, { width, height: 74, kind: "play", tone });
      panel.add(b.container);
      buttons.push(b);
      return b;
    };
    const row = (labels: string[], by: number, width: number, onPick: (i: number) => void) => {
      const gap = width + 14;
      labels.forEach((l, i) => btn((((labels.length - 1) / 2) - i) * gap, by, l, () => onPick(i), width));
    };
    const a = q.answer;
    switch (a.kind) {
      case "number": {
        // 0–4 then 5–8, right to left like the reading.
        row(["0", "1", "2", "3", "4"], y, 120, (i) => answer({ kind: "number", value: i }));
        row(["5", "6", "7", "8"], y + 90, 120, (i) => answer({ kind: "number", value: i + 5 }));
        return y + 140;
      }
      case "yesno":
        row(["نزلت", "ما نزلت"], y, 240, (i) => answer({ kind: "yesno", value: i === 0 }));
        return y + 50;
      case "suit": {
        const suits: Suit[] = ["S", "H", "D", "C"];
        row(suits.map((s) => `${SUIT_SIGN[s]} ${SUIT_AR[s]}`), y, 160, (i) => answer({ kind: "suit", value: suits[i] }));
        return y + 50;
      }
      case "rank": {
        // The suit's ranks, strongest first (by the hand's order), and «ولا ورقة».
        const t = this.table();
        const ranks = [...RANKS].sort((x, z) => rankStrength({ suit: a.suit, rank: z }, t.mode, t.trumpSuit) - rankStrength({ suit: a.suit, rank: x }, t.mode, t.trumpSuit));
        row(ranks.slice(0, 4).map((r) => RANK_AR[r]), y, 150, (i) => answer({ kind: "rank", suit: a.suit, value: ranks[i] }));
        row(ranks.slice(4).map((r) => RANK_AR[r]), y + 90, 150, (i) => answer({ kind: "rank", suit: a.suit, value: ranks[i + 4] }));
        btn(0, y + 180, "ولا ورقة", () => answer({ kind: "rank", suit: a.suit, value: "none" }), 220, "pass");
        return y + 230;
      }
      case "seats": {
        // Pick every seat that's void, then confirm (or «محد»).
        const picked = new Set<Seat>();
        const seats: Seat[] = [1, 2, 3];
        seats.forEach((s, i) => {
          const b = btn((1 - i) * 200, y, SEAT_AR[s], () => {
            if (picked.has(s)) picked.delete(s);
            else picked.add(s);
            b.container.setAlpha(picked.has(s) ? 1 : 0.55);
            b.container.setScale(picked.has(s) ? 1.06 : 1);
          }, 180);
          b.container.setAlpha(0.55);
        });
        btn(110, y + 95, "تمام", () => answer({ kind: "seats", value: [...picked] }), 200, "sun");
        btn(-110, y + 95, "محد", () => answer({ kind: "seats", value: [] }), 200, "pass");
        return y + 145;
      }
    }
  }

  /** Right or wrong at once, with where the answer was on the table. */
  private feedback(q: DrillQuestion, given: DrillAnswer, y: number, w: number, bg: Phaser.GameObjects.Graphics, done: () => void): void {
    const panel = this.panel!;
    const ok = isCorrect(q.answer, given);
    this.asked++;
    if (ok) this.right++;
    const t = (this.byType[q.type] ??= { asked: 0, right: 0 });
    t.asked++;
    if (ok) t.right++;
    recordAnswer(this.progress, q.type, ok);
    saveProgress(this.progress);

    const mark = arabicText(this.scene, 0, y - 20, ok ? "صح!" : `غلط — الجواب: ${answerText(q.answer)}`, { fontSize: "32px", color: ok ? "#9be07a" : "#ff9a8a" }).setOrigin(0.5, 0);
    const why = arabicText(this.scene, 0, y + mark.height - 6, q.evidence, { fontSize: "24px", color: "#dcebe2", wordWrap: { width: w - 70, useAdvancedWrap: true }, lineSpacing: 4 }).setOrigin(0.5, 0);
    panel.add([mark, why]);
    const by = y + mark.height + why.height + 30;
    const go = makeButton(this.scene, 0, by, "كمّل", () => {
      this.panel?.destroy();
      this.panel = undefined;
      done();
    }, { width: 220, height: 70, kind: "play", tone: "sun" });
    panel.add(go.container);
    this.frame(bg, w, by + 50);
    const p = panel.getWorldTransformMatrix();
    if (ok) {
      flare(this.scene, p.tx, p.ty + y, 0x9be07a, 0.9);
      rise(this.scene, p.tx, p.ty + y, [0x9be07a, 0xfff1d6], 14);
    } else {
      this.scene.cameras.main.shake(140, 0.003);
    }
  }

  // ------------------------------------------------------------------ the end of a hand

  /** How the hand went, kind by kind, and the level after it. */
  summary(onAgain: () => void, onHome: () => void): void {
    this.panel?.destroy();
    const change = finishHand(this.progress, this.right, this.asked);
    saveProgress(this.progress);
    const w = WIDTH - 110;
    const panel = this.scene.add.container(CENTER_X, HEIGHT / 2 - 260).setDepth(70);
    this.panel = panel;
    const shade = this.scene.add.rectangle(0, 260, WIDTH * 2, HEIGHT * 2, 0x000000, 0.55).setInteractive();
    const bg = this.scene.add.graphics();
    panel.add([shade, bg]);
    const rate = this.asked ? Math.round((this.right / this.asked) * 100) : 0;
    const lines = [
      `${this.right} من ${this.asked} صح (${rate}٪)`,
      ...(Object.entries(this.byType) as Array<[DrillType, { asked: number; right: number }]>).map(([k, v]) => `${DRILL_TYPE_AR[k]}: ${v.right} من ${v.asked}`),
      change > 0 ? `طلعت للمستوى ${this.level}: الأسئلة بتصير أبعد عن بعض` : change < 0 ? `نزلت للمستوى ${this.level}: الأسئلة بتصير أقرب` : `المستوى ${this.level}${this.level < 5 ? ` — يدين ورا بعض بـ 80٪ وتطلع` : ""}`,
    ];
    const title = arabicText(this.scene, 0, 0, "خلصت اليد", { fontSize: "40px", color: "#f0cb7a" }).setOrigin(0.5, 0);
    const body = arabicText(this.scene, 0, title.height + 24, lines.join("\n"), { fontSize: "28px", lineSpacing: 12, wordWrap: { width: w - 70 } }).setOrigin(0.5, 0);
    panel.add([title, body]);
    const by = title.height + body.height + 80;
    panel.add(makeButton(this.scene, 130, by, "يد ثانية", onAgain, { width: 230, height: 76, kind: "play", tone: "sun" }).container);
    panel.add(makeButton(this.scene, -130, by, "رجوع", onHome, { width: 230, height: 76, kind: "play", tone: "pass" }).container);
    this.frame(bg, w, by + 60);
  }
}
