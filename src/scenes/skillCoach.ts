import Phaser from "phaser";
import type { DrillAnswer, DrillTable } from "../drill/questions";
import { answerText, isCorrect, SEAT_AR, SUIT_AR, SUIT_SIGN } from "../drill/questions";
import { makeSkill, type Skill, type SkillId, type SkillQuestion } from "../drill/skills";
import { finishSkillHand, loadProgress, saveProgress, skillOf, STAGES, type DrillProgress } from "../drill/progress";
import { CENTER_X, HEIGHT, TABLE_RECT, WIDTH } from "./layout";
import { arabicText, makeButton, type ButtonHandle } from "./ui";
import { flare, rise } from "./fx";
import type { Card, Seat, Suit, Trick } from "../engine/types";

/** The strip between the table and your name. */
const HELPER_Y = TABLE_RECT.bottom + 38;

const STAGE_LINES = [
  "المساعد تحت الطاولة يتابع معك طول اليد — راقبه، وجاوب لما نسألك.",
  "المساعد يطلع لك لمحة بعد كل أكلتين بس. الباقي في راسك.",
  "ما فيه مساعد. أنت اللي تتابع.",
];

/**
 * One skill of تمرين الذاكرة at the table (src/drill/skills.ts): its method on a card when the
 * hand starts, its helper under the table fading by stage (in view → a glance every other trick
 * → gone), and its questions at your turn, each answered with the working and why it matters.
 */
export class SkillCoach {
  readonly progress: DrillProgress;
  readonly skill: Skill;
  asked = 0;
  right = 0;
  private panel?: Phaser.GameObjects.Container;
  private helper?: Phaser.GameObjects.Container;
  private mainText?: Phaser.GameObjects.Text;
  private subText?: Phaser.GameObjects.Text;
  private quiet = 0;
  private askedThisTrick = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    id: SkillId,
    private readonly table: () => DrillTable | undefined,
  ) {
    this.progress = loadProgress();
    this.skill = makeSkill(id);
  }

  get stage(): number {
    return skillOf(this.progress, this.skill.id).stage;
  }

  get title(): string {
    return `تمرين: ${this.skill.name} · المرحلة ${this.stage} من ${STAGES}`;
  }

  // ------------------------------------------------------------------ the hand's start

  /** The contract is set: the method, then the helper at this stage's strength. */
  start(done: () => void): void {
    const t = this.table();
    if (!t) return done();
    const m = this.skill.method(t);
    this.card(m.title, [...m.lines, STAGE_LINES[this.stage - 1]], "يلا", () => {
      this.buildHelper();
      done();
    });
  }

  private buildHelper(): void {
    this.helper?.destroy();
    if (this.stage >= 3) return;
    const w = WIDTH - 120;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0d2229, 0.92);
    bg.fillRoundedRect(-w / 2, -32, w, 64, 18);
    bg.lineStyle(2, 0xf0cb7a, 0.9);
    bg.strokeRoundedRect(-w / 2, -32, w, 64, 18);
    // One line: the headline on the right, the working on the left.
    this.mainText = arabicText(this.scene, w / 2 - 24, 0, "", { fontSize: "24px", color: "#f0cb7a" }).setOrigin(1, 0.5);
    this.subText = arabicText(this.scene, -w / 2 + 24, 0, "", { fontSize: "22px", color: "#dcebe2" }).setOrigin(0, 0.5);
    this.helper = this.scene.add.container(CENTER_X, HELPER_Y, [bg, this.mainText, this.subText]).setDepth(8);
    this.refresh();
    if (this.stage === 2) this.helper.setVisible(false);
  }

  /** The helper's lines from the table as it stands. */
  refresh(): void {
    const t = this.table();
    if (!t || !this.mainText || !this.subText) return;
    const h = this.skill.helper(t);
    const changed = this.subText.text !== "" && this.subText.text !== h.sub;
    this.mainText.setText(h.main);
    this.subText.setText(h.sub).setScale(1);
    // The working fits in what the headline leaves.
    const room = WIDTH - 120 - this.mainText.width - 70;
    if (this.subText.width > room) this.subText.setScale(room / this.subText.width);
    if (changed && this.helper?.visible) this.scene.tweens.add({ targets: this.subText, alpha: { from: 0.3, to: 1 }, duration: 300 });
  }

  /** After a trick: stage 2's glance every other trick. */
  afterTrick(n: number): void {
    this.quiet++;
    this.refresh();
    if (this.stage === 2 && n % 2 === 0 && this.helper) {
      this.helper.setVisible(true).setAlpha(1);
      this.scene.tweens.add({ targets: this.helper, alpha: 0, delay: 2600, duration: 400, onComplete: () => this.helper?.setVisible(false) });
    }
  }

  // ------------------------------------------------------------------ the questions

  /** Your turn: the skill decides whether this moment gets a question (one a trick at most). */
  onYourTurn(trick: Trick, hand: Card[], legal: Card[], trickNo: number): void {
    const t = this.table();
    if (!t || this.askedThisTrick === trickNo) return;
    const q = this.skill.onTurn({ t, trick, hand, legal, quiet: this.quiet });
    if (!q) return;
    this.askedThisTrick = trickNo;
    this.quiet = 0;
    this.ask(q);
  }

  private ask(q: SkillQuestion): void {
    // The helper steps aside while you answer: it has to come from you.
    const wasVisible = this.helper?.visible ?? false;
    this.helper?.setVisible(false);
    this.panel?.destroy();
    const w = WIDTH - 110;
    const top = TABLE_RECT.top + 110;
    const panel = this.scene.add.container(CENTER_X, top).setDepth(60);
    this.panel = panel;
    const shade = this.scene.add.rectangle(0, HEIGHT / 2 - top, WIDTH * 2, HEIGHT * 2, 0x000000, 0.35).setInteractive();
    const bg = this.scene.add.graphics();
    panel.add([shade, bg]);
    const head = arabicText(this.scene, 0, 0, q.prompt, { fontSize: "30px", wordWrap: { width: w - 60, useAdvancedWrap: true }, lineSpacing: 6 }).setOrigin(0.5, 0);
    panel.add(head);
    const y = head.height + 50;
    const buttons: ButtonHandle[] = [];
    const answer = (given: DrillAnswer) => {
      for (const b of buttons) b.destroy();
      this.feedback(q, isCorrect(q.answer, given), y, w, bg, () => {
        if (wasVisible) this.helper?.setVisible(true);
      });
    };
    const bottom = this.widgets(q.answer, y, buttons, answer);
    this.frame(bg, w, bottom + 30);
  }

  /** Buttons for the answer's kind; returns the y under them. */
  private widgets(a: DrillAnswer, y: number, buttons: ButtonHandle[], answer: (g: DrillAnswer) => void): number {
    const panel = this.panel!;
    const btn = (x: number, by: number, label: string, onClick: () => void, width = 150, tone: "hokum" | "sun" | "pass" = "hokum") => {
      const b = makeButton(this.scene, x, by, label, onClick, { width, height: 74, kind: "play", tone });
      panel.add(b.container);
      buttons.push(b);
      return b;
    };
    const row = (labels: string[], by: number, width: number, onPick: (i: number) => void) =>
      labels.forEach((l, i) => btn(((labels.length - 1) / 2 - i) * (width + 14), by, l, () => onPick(i), width));
    switch (a.kind) {
      case "number":
        row(["0", "1", "2", "3", "4"], y, 120, (i) => answer({ kind: "number", value: i }));
        row(["5", "6", "7", "8"], y + 90, 120, (i) => answer({ kind: "number", value: i + 5 }));
        return y + 140;
      case "yesno":
        row(["نزلت", "ما نزلت"], y, 240, (i) => answer({ kind: "yesno", value: i === 0 }));
        return y + 50;
      case "suit": {
        const suits: Suit[] = ["S", "H", "D", "C"];
        row(suits.map((s) => `${SUIT_SIGN[s]} ${SUIT_AR[s]}`), y, 160, (i) => answer({ kind: "suit", value: suits[i] }));
        return y + 50;
      }
      case "choice":
        a.options.forEach((o, i) => btn(0, y + i * 90, o, () => answer({ kind: "choice", options: a.options, value: i }), 520));
        return y + a.options.length * 90 - 40;
      case "seats": {
        const picked = new Set<Seat>();
        ([1, 2, 3] as Seat[]).forEach((s, i) => {
          const b = btn((1 - i) * 200, y, SEAT_AR[s], () => {
            if (picked.has(s)) picked.delete(s);
            else picked.add(s);
            b.container.setAlpha(picked.has(s) ? 1 : 0.55).setScale(picked.has(s) ? 1.06 : 1);
          }, 180);
          b.container.setAlpha(0.55);
        });
        btn(110, y + 95, "تمام", () => answer({ kind: "seats", value: [...picked] }), 200, "sun");
        btn(-110, y + 95, "محد", () => answer({ kind: "seats", value: [] }), 200, "pass");
        return y + 145;
      }
      case "rank":
        return y;
    }
  }

  private feedback(q: SkillQuestion, ok: boolean, y: number, w: number, bg: Phaser.GameObjects.Graphics, done: () => void): void {
    const panel = this.panel!;
    this.asked++;
    if (ok) this.right++;
    const mark = arabicText(this.scene, 0, y - 20, ok ? `صح — ${answerText(q.answer)}` : `الجواب: ${answerText(q.answer)}`, { fontSize: "32px", color: ok ? "#9be07a" : "#ff9a8a" }).setOrigin(0.5, 0);
    const work = arabicText(this.scene, 0, y + mark.height - 4, q.working, { fontSize: "25px", color: "#f0cb7a", wordWrap: { width: w - 70, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    const why = arabicText(this.scene, 0, y + mark.height + work.height + 10, q.why, { fontSize: "25px", color: "#dcebe2", wordWrap: { width: w - 70, useAdvancedWrap: true }, lineSpacing: 4 }).setOrigin(0.5, 0);
    panel.add([mark, work, why]);
    const by = y + mark.height + work.height + why.height + 50;
    panel.add(
      makeButton(this.scene, 0, by, "العب", () => {
        this.panel?.destroy();
        this.panel = undefined;
        done();
      }, { width: 220, height: 70, kind: "play", tone: "sun" }).container,
    );
    this.frame(bg, w, by + 50);
    const m = panel.getWorldTransformMatrix();
    if (ok) {
      flare(this.scene, m.tx, m.ty + y, 0x9be07a, 0.9);
      rise(this.scene, m.tx, m.ty + y, [0x9be07a, 0xfff1d6], 14);
    } else this.scene.cameras.main.shake(140, 0.003);
  }

  // ------------------------------------------------------------------ the hand's end

  summary(onAgain: () => void, onHome: () => void): void {
    this.panel?.destroy();
    this.helper?.destroy();
    const change = finishSkillHand(this.progress, this.skill.id, this.right, this.asked);
    saveProgress(this.progress);
    const sk = skillOf(this.progress, this.skill.id);
    const rate = this.asked ? Math.round((this.right / this.asked) * 100) : 0;
    const next = sk.mastered
      ? `أتقنت «${this.skill.name}»! جرّب مهارة ثانية من القائمة.`
      : change > 0
        ? `انتقلت للمرحلة ${sk.stage}: ${sk.stage === 2 ? "المساعد يصير لمحة كل أكلتين" : "المساعد يختفي"}.`
        : change < 0
          ? `رجعت للمرحلة ${sk.stage}: المساعد يرجع يساعدك.`
          : this.asked < 2
            ? "الأسئلة كانت قليلة هاليد — ما تنحسب."
            : `المرحلة ${sk.stage}: يدين ورا بعض بـ 80٪ وتنتقل${sk.streak ? ` (باقي ${2 - sk.streak})` : ""}.`;
    this.card("خلصت اليد", [`${this.right} من ${this.asked} صح (${rate}٪)`, next], undefined, undefined, [
      { label: "يد ثانية", onClick: onAgain },
      { label: "رجوع", onClick: onHome },
    ]);
  }

  // ------------------------------------------------------------------ panels

  private frame(bg: Phaser.GameObjects.Graphics, w: number, h: number): void {
    bg.clear();
    bg.fillStyle(0x0d2229, 0.97);
    bg.fillRoundedRect(-w / 2, -30, w, h + 30, 24);
    bg.lineStyle(3, 0xf0cb7a, 1);
    bg.strokeRoundedRect(-w / 2, -30, w, h + 30, 24);
  }

  /** A card over the table: a title, lines, and one button (or two). */
  private card(title: string, lines: string[], button?: string, onClick?: () => void, two?: Array<{ label: string; onClick: () => void }>): void {
    this.panel?.destroy();
    const w = WIDTH - 110;
    const top = TABLE_RECT.top + 70;
    const panel = this.scene.add.container(CENTER_X, top).setDepth(70);
    this.panel = panel;
    const shade = this.scene.add.rectangle(0, HEIGHT / 2 - top, WIDTH * 2, HEIGHT * 2, 0x000000, 0.5).setInteractive();
    const bg = this.scene.add.graphics();
    panel.add([shade, bg]);
    const head = arabicText(this.scene, 0, 0, title, { fontSize: "36px", color: "#f0cb7a" }).setOrigin(0.5, 0);
    const body = arabicText(this.scene, 0, head.height + 24, lines.join("\n"), { fontSize: "26px", lineSpacing: 12, align: "right", wordWrap: { width: w - 80, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    panel.add([head, body]);
    const by = head.height + body.height + 80;
    if (two) {
      two.forEach((b, i) => panel.add(makeButton(this.scene, (i === 0 ? 1 : -1) * 130, by, b.label, b.onClick, { width: 230, height: 76, kind: "play", tone: i === 0 ? "sun" : "pass" }).container));
    } else if (button && onClick) {
      panel.add(
        makeButton(this.scene, 0, by, button, () => {
          this.panel?.destroy();
          this.panel = undefined;
          onClick();
        }, { width: 240, height: 76, kind: "play", tone: "sun" }).container,
      );
    }
    this.frame(bg, w, by + 60);
  }
}
