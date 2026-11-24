import Phaser from "phaser";
import type { DrillTable } from "../drill/questions";
import { SUIT_AR, SUIT_SIGN } from "../drill/questions";
import { countLine, decisionPoint, trumpCount, whyItMatters, type DecisionPoint } from "../drill/trumpCount";
import { finishSkillHand, loadProgress, saveProgress, skillOf, STAGES, type DrillProgress } from "../drill/progress";
import { CENTER_X, HEIGHT, TABLE_RECT, WIDTH } from "./layout";
import { arabicText, makeButton } from "./ui";
import { flare, rise } from "./fx";
import type { Card, Trick } from "../engine/types";

const SKILL = "trump";
/** The strip between the table and your name. */
const COUNTER_Y = TABLE_RECT.bottom + 38;

/**
 * عدّ الحكم at the table: the method first, then a counter that does the count for you and
 * fades stage by stage (in view → a glance every other trick → gone), and a question at the
 * moments the count decides your card — you lead, or you could cut.
 */
export class TrumpCoach {
  readonly progress: DrillProgress;
  asked = 0;
  right = 0;
  private panel?: Phaser.GameObjects.Container;
  private counter?: Phaser.GameObjects.Container;
  private counterText?: Phaser.GameObjects.Text;
  private sumText?: Phaser.GameObjects.Text;
  /** Tricks since the last question (so a long quiet stretch still gets one). */
  private quiet = 0;
  /** The count when last asked: a change since (one of theirs fell) is a moment to ask. */
  private lastAsked = -1;
  private askedThisTrick = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly table: () => DrillTable | undefined,
  ) {
    this.progress = loadProgress();
  }

  get stage(): number {
    return skillOf(this.progress, SKILL).stage;
  }

  get title(): string {
    return `تمرين: عدّ الحكم · المرحلة ${this.stage} من ${STAGES}`;
  }

  // ------------------------------------------------------------------ the hand's start

  /** The contract is set: the method, then the counter (at this stage's strength). */
  start(done: () => void): void {
    const t = this.table();
    if (!t?.trumpSuit) return done();
    const trump = `${SUIT_SIGN[t.trumpSuit]} ${SUIT_AR[t.trumpSuit]}`;
    const stageLine = [
      "العداد تحت الطاولة يعدّ معك طول اليد — راقبه وهو ينقص، وجاوب لما نسألك.",
      "العداد يطلع لك لمحة بعد كل أكلتين بس. الباقي في راسك.",
      "ما فيه عداد. أنت العداد.",
    ][this.stage - 1];
    this.card(
      `الحكم ${trump} — الطريقة`,
      [
        "١. عدّ الحكم اللي في يدك الحين.",
        "٢. اللي برّا يدك = 8 ناقص حكمك.",
        "٣. كل ما نزل حكم من غيرك، نقّص واحد. (حكمك أنت لا تنقّصه — هو محسوب.)",
        stageLine,
      ],
      "يلا",
      () => {
        this.buildCounter();
        done();
      },
    );
  }

  private buildCounter(): void {
    this.counter?.destroy();
    if (this.stage >= 3) return;
    const w = WIDTH - 120;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0d2229, 0.92);
    bg.fillRoundedRect(-w / 2, -32, w, 64, 18);
    bg.lineStyle(2, 0xf0cb7a, 0.9);
    bg.strokeRoundedRect(-w / 2, -32, w, 64, 18);
    // One line: the number on the right, the sum that made it on the left.
    this.counterText = arabicText(this.scene, w / 2 - 26, 0, "", { fontSize: "28px", color: "#f0cb7a" }).setOrigin(1, 0.5);
    this.sumText = arabicText(this.scene, -w / 2 + 26, 0, "", { fontSize: "22px", color: "#dcebe2" }).setOrigin(0, 0.5);
    this.counter = this.scene.add.container(CENTER_X, COUNTER_Y, [bg, this.counterText, this.sumText]).setDepth(8);
    this.refresh();
    // Stage 2: only a glance now and then.
    if (this.stage === 2) this.counter.setVisible(false);
  }

  /** The counter's numbers from the table as it stands. */
  refresh(): void {
    const t = this.table();
    if (!t?.trumpSuit || !this.counterText || !this.sumText) return;
    const c = trumpCount(t);
    const before = this.counterText.getData("out") as number | undefined;
    this.counterText.setText(`الحكم برّا يدك: ${c.out}`).setData("out", c.out);
    this.sumText.setText(countLine(c));
    // A trump of theirs fell: the number ticks down where you can see it.
    if (before !== undefined && c.out < before && this.counter?.visible) {
      this.scene.tweens.add({ targets: this.counterText, scale: 1.25, duration: 140, yoyo: true });
    }
  }

  /** After a trick: stage 2's glance every other trick. */
  afterTrick(n: number): void {
    this.quiet++;
    this.refresh();
    if (this.stage === 2 && n % 2 === 0 && this.counter) {
      this.counter.setVisible(true).setAlpha(1);
      this.scene.tweens.add({ targets: this.counter, alpha: 0, delay: 2600, duration: 400, onComplete: () => this.counter?.setVisible(false) });
    }
  }

  // ------------------------------------------------------------------ the questions

  /**
   * Your turn: if the count decides this card (you lead, or you could cut) — or nothing's been
   * asked for three tricks — ask before you play.
   */
  onYourTurn(trick: Trick, hand: Card[], trickNo: number, done: () => void): void {
    const t = this.table();
    if (!t?.trumpSuit || this.askedThisTrick === trickNo) return done();
    const out = trumpCount(t).out;
    const fell = this.lastAsked >= 0 && out !== this.lastAsked;
    const point = decisionPoint(trick, hand, t.trumpSuit) ?? (fell || this.quiet >= 2 ? "follow" : undefined);
    if (!point) return done();
    this.askedThisTrick = trickNo;
    this.quiet = 0;
    this.lastAsked = out;
    this.ask(point, done);
  }

  private ask(point: DecisionPoint, done: () => void): void {
    const t = this.table()!;
    const answer = trumpCount(t).out;
    // The counter steps aside while you answer: the number has to come from you.
    const wasVisible = this.counter?.visible ?? false;
    this.counter?.setVisible(false);
    const lead = point === "lead" ? "قبل ما تبدأ" : point === "cut" ? "قبل ما تقطع" : "قبل ما تلعب";
    this.panel?.destroy();
    const w = WIDTH - 110;
    const top = TABLE_RECT.top + 120;
    const panel = this.scene.add.container(CENTER_X, top).setDepth(60);
    this.panel = panel;
    const shade = this.scene.add.rectangle(0, HEIGHT / 2 - top, WIDTH * 2, HEIGHT * 2, 0x000000, 0.35).setInteractive();
    const bg = this.scene.add.graphics();
    panel.add([shade, bg]);
    const head = arabicText(this.scene, 0, 0, `${lead}: كم حكم باقي برّا يدك؟`, { fontSize: "30px", wordWrap: { width: w - 60 } }).setOrigin(0.5, 0);
    panel.add(head);
    const y = head.height + 50;
    const buttons: Array<{ destroy: () => void }> = [];
    const pick = (n: number) => {
      for (const b of buttons) b.destroy();
      this.feedback(n === answer, answer, point, y, w, bg, () => {
        if (wasVisible) this.counter?.setVisible(true);
        done();
      });
    };
    const row = (from: number, to: number, by: number) => {
      const n = to - from + 1;
      for (let i = 0; i < n; i++) {
        const b = makeButton(this.scene, ((n - 1) / 2 - i) * 134, by, String(from + i), () => pick(from + i), { width: 120, height: 74, kind: "play", tone: "hokum" });
        panel.add(b.container);
        buttons.push(b);
      }
    };
    row(0, 4, y);
    row(5, 8, y + 90);
    this.frame(bg, w, y + 140);
  }

  private feedback(ok: boolean, answer: number, point: DecisionPoint, y: number, w: number, bg: Phaser.GameObjects.Graphics, done: () => void): void {
    const panel = this.panel!;
    const t = this.table()!;
    this.asked++;
    if (ok) this.right++;
    const c = trumpCount(t);
    const mark = arabicText(this.scene, 0, y - 20, ok ? `صح — ${answer}` : `الجواب ${answer}`, { fontSize: "32px", color: ok ? "#9be07a" : "#ff9a8a" }).setOrigin(0.5, 0);
    const sum = arabicText(this.scene, 0, y + mark.height - 4, countLine(c), { fontSize: "26px", color: "#f0cb7a" }).setOrigin(0.5, 0);
    const why = arabicText(this.scene, 0, y + mark.height + sum.height + 10, whyItMatters(point, t), { fontSize: "25px", color: "#dcebe2", wordWrap: { width: w - 70, useAdvancedWrap: true }, lineSpacing: 4 }).setOrigin(0.5, 0);
    panel.add([mark, sum, why]);
    const by = y + mark.height + sum.height + why.height + 50;
    const go = makeButton(this.scene, 0, by, "العب", () => {
      this.panel?.destroy();
      this.panel = undefined;
      done();
    }, { width: 220, height: 70, kind: "play", tone: "sun" });
    panel.add(go.container);
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
    this.counter?.destroy();
    const change = finishSkillHand(this.progress, SKILL, this.right, this.asked);
    saveProgress(this.progress);
    const sk = skillOf(this.progress, SKILL);
    const rate = this.asked ? Math.round((this.right / this.asked) * 100) : 0;
    const next =
      sk.mastered
        ? "أتقنت عدّ الحكم! الجاي: الإكك والعشرات."
        : change > 0
          ? `انتقلت للمرحلة ${sk.stage}: ${sk.stage === 2 ? "العداد يصير لمحة كل أكلتين" : "العداد يختفي"}.`
          : change < 0
            ? `رجعت للمرحلة ${sk.stage}: العداد يرجع يساعدك.`
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
    const top = TABLE_RECT.top + 90;
    const panel = this.scene.add.container(CENTER_X, top).setDepth(70);
    this.panel = panel;
    const shade = this.scene.add.rectangle(0, HEIGHT / 2 - top, WIDTH * 2, HEIGHT * 2, 0x000000, 0.5).setInteractive();
    const bg = this.scene.add.graphics();
    panel.add([shade, bg]);
    const head = arabicText(this.scene, 0, 0, title, { fontSize: "36px", color: "#f0cb7a" }).setOrigin(0.5, 0);
    const body = arabicText(this.scene, 0, head.height + 24, lines.join("\n"), { fontSize: "27px", lineSpacing: 14, align: "right", wordWrap: { width: w - 80, useAdvancedWrap: true } }).setOrigin(0.5, 0);
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
