import Phaser from "phaser";
import type { Mode } from "../engine/types";
import { ensureFxTextures, flare, rise, screenFlash } from "./fx";
import { arabicText } from "./ui";

/** Numbers and signs read left to right: Arabic text is RTL and would print "+2" as "2+". */
function plainText(scene: Phaser.Scene, x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
  return arabicText(scene, x, y, text, style).setRTL(false);
}

/**
 * عدّاد اليد: the hand's score, live, between the joker row and the table. The hand's worth is
 * the target — 26 in sun, 16 in hokum, and it grows as projects are laid down — and the two
 * sides fill a brass track towards it from either end, لنا from the right and لهم from the
 * left, with the half-way mark (the line a side must pass to take the hand) in the middle.
 *
 * Every trick the table won pops its points over the table, which fly into the side's
 * medallion; every joker that pays sends a chip down from its icon. Everything runs through
 * one queue, so a trick's points land before the jokers it set off, one after another, like a
 * chain reaction (Balatro's count-up, on a Baloot scoreboard).
 *
 * Units are game points (القيد): card points ÷5 in sun and ÷10 in hokum, so 130 → 26 and
 * 162 → 16. The live numbers round; the final ones come from the real score sheet.
 */
export type Side = "us" | "them";

const TRACK_W = 560;
const TRACK_Y = 14;
const TRACK_H = 20;
const MED_X = 338;
const MED_R = 40;
const CAPTION_Y = -22;

const TEAM = {
  us: { main: 0xe3a33b, light: 0xffd98a, text: "#ffd98a", label: "لنا" },
  them: { main: 0x2e9c9a, light: 0x8fd6cb, text: "#aee8df", label: "لهم" },
} as const;

/** How the hand ends up, for the last line of the caption. */
export interface MeterFinish {
  us: number;
  them: number;
  /** What the jokers added (or took) on top of the sheet, for our side. */
  bonus: number;
  word?: string;
}

export class HandMeter {
  private readonly root: Phaser.GameObjects.Container;
  private readonly fills: Phaser.GameObjects.Graphics;
  private readonly caption: Phaser.GameObjects.Text;
  private readonly halfText: Phaser.GameObjects.Text;
  private readonly numbers: Record<Side, Phaser.GameObjects.Text>;
  private readonly medals: Record<Side, Phaser.GameObjects.Container>;
  private readonly edgeGlow: Record<Side, Phaser.GameObjects.Image>;
  private readonly crown: Phaser.GameObjects.Text;
  private readonly bonusBadge: Phaser.GameObjects.Container;
  private readonly bonusText: Phaser.GameObjects.Text;
  private seal?: Phaser.GameObjects.Container;

  private modeLabel = "";
  private basePie = 0;
  private pie = 0;
  private exact: Record<Side, number> = { us: 0, them: 0 };
  private shown: Record<Side, number> = { us: 0, them: 0 };
  private bonus = 0;
  private buyer?: Side;
  private tricks: Record<Side, number> = { us: 0, them: 0 };
  private decided?: Side;
  private tag = "";
  private divisor = 5;

  private queue: Array<() => number> = [];
  private busy = false;
  /** Bumped on every reset, so animations still in flight from the last hand drop their result. */
  private gen = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
  ) {
    ensureFxTextures(scene);
    this.root = scene.add.container(x, y).setDepth(22);

    // The plaque: a dark lacquered strip with a thin gold line, so the meter reads over the sky.
    const plaque = scene.add.graphics();
    plaque.fillStyle(0x0d2229, 0.55);
    plaque.fillRoundedRect(-404, -46, 808, 86, 28);
    plaque.lineStyle(2, 0xe3a33b, 0.45);
    plaque.strokeRoundedRect(-404, -46, 808, 86, 28);
    this.root.add(plaque);

    // The track: a wooden groove with a brass rim, and the half-way star in the middle.
    const track = scene.add.graphics();
    track.fillStyle(0x40241a, 1);
    track.fillRoundedRect(-TRACK_W / 2 - 6, TRACK_Y - TRACK_H / 2 - 6, TRACK_W + 12, TRACK_H + 12, 16);
    track.fillStyle(0x0a1c21, 1);
    track.fillRoundedRect(-TRACK_W / 2, TRACK_Y - TRACK_H / 2, TRACK_W, TRACK_H, 10);
    track.lineStyle(2, 0xe3a33b, 0.9);
    track.strokeRoundedRect(-TRACK_W / 2 - 6, TRACK_Y - TRACK_H / 2 - 6, TRACK_W + 12, TRACK_H + 12, 16);
    this.root.add(track);

    this.fills = scene.add.graphics();
    this.root.add(this.fills);
    this.edgeGlow = {
      us: scene.add.image(0, TRACK_Y, "fx-dot").setTint(TEAM.us.light).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0),
      them: scene.add.image(0, TRACK_Y, "fx-dot").setTint(TEAM.them.light).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0),
    };
    this.root.add([this.edgeGlow.us, this.edgeGlow.them]);
    for (const glow of Object.values(this.edgeGlow)) {
      scene.tweens.add({ targets: glow, scale: 1.2, duration: 700, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    }

    // The half-way mark: a cream star on the track with the number a side has to pass.
    const notch = scene.add.graphics();
    notch.fillStyle(0x2a160f, 0.5);
    notch.fillPoints(starPoints(0, TRACK_Y + 2, 21), true);
    notch.fillStyle(0xf3e9d6, 1);
    notch.fillPoints(starPoints(0, TRACK_Y, 21), true);
    notch.lineStyle(2, 0xe3a33b, 1);
    notch.strokePoints(starPoints(0, TRACK_Y, 21), true);
    this.root.add(notch);
    this.halfText = arabicText(scene, 0, TRACK_Y + 1, "", { fontSize: "17px", color: "#3a2620", fontStyle: "bold", shadow: { offsetX: 0, offsetY: 0, color: "rgba(0,0,0,0)", blur: 0 } });
    this.root.add(this.halfText);

    this.root.add(arabicText(scene, TRACK_W / 2 - 22, CAPTION_Y + 4, TEAM.us.label, { fontSize: "19px", color: TEAM.us.text, fontStyle: "bold" }));
    this.root.add(arabicText(scene, -TRACK_W / 2 + 22, CAPTION_Y + 4, TEAM.them.label, { fontSize: "19px", color: TEAM.them.text, fontStyle: "bold" }));

    this.caption = arabicText(scene, 0, CAPTION_Y, "", { fontSize: "22px", color: "#fff1d6", fontStyle: "bold" });
    this.root.add(this.caption);

    this.numbers = { us: this.numberText(), them: this.numberText() };
    this.medals = { us: this.medal("us", MED_X), them: this.medal("them", -MED_X) };

    this.crown = scene.add.text(0, -MED_R - 6, "👑", { fontSize: "26px" }).setOrigin(0.5).setAngle(-14).setVisible(false);
    this.root.add(this.crown);

    const badgeBg = scene.add.graphics();
    badgeBg.fillStyle(0xffd98a, 1);
    badgeBg.fillRoundedRect(-34, -15, 68, 30, 15);
    badgeBg.lineStyle(2, 0x3a2620, 0.8);
    badgeBg.strokeRoundedRect(-34, -15, 68, 30, 15);
    this.bonusText = plainText(scene, 0, 0, "", { fontSize: "19px", color: "#3a2620", fontStyle: "bold", shadow: { offsetX: 0, offsetY: 0, color: "rgba(0,0,0,0)", blur: 0 } });
    this.bonusBadge = scene.add.container(MED_X - 46, MED_R - 2, [badgeBg, this.bonusText]).setVisible(false);
    this.root.add(this.bonusBadge);

    this.idle("");
  }

  /** Where a side's medallion sits on the screen (the points fly there). */
  medalPoint(side: Side): { x: number; y: number } {
    return { x: this.x + (side === "us" ? MED_X : -MED_X), y: this.y };
  }

  /** Between hands and during the bidding: an empty track and a line about the deal. */
  idle(caption: string): void {
    this.reset();
    this.modeLabel = caption;
    this.basePie = 0;
    this.pie = 0;
    this.caption.setText(caption);
    this.halfText.setText("");
    this.redraw();
  }

  /** Play starts: the hand's worth becomes the target. `ground` is الأرض's card points. */
  start(opts: { mode: Mode; label: string; buyer: Side; ground: number }): void {
    this.reset();
    this.divisor = opts.mode === "sun" ? 5 : 10;
    this.modeLabel = opts.label;
    this.basePie = Math.round(((opts.mode === "sun" ? 120 : 152) + opts.ground) / this.divisor);
    this.pie = this.basePie;
    this.buyer = opts.buyer;
    this.crown.setVisible(true).setX(opts.buyer === "us" ? MED_X - 26 : -MED_X + 26);
    this.scene.tweens.add({ targets: this.crown, scale: { from: 0, to: 1 }, duration: 380, ease: "Back.Out" });
    this.refreshCaption();
    this.redraw();
    this.flashTrack();
  }

  /** دبل / ثري / فور / قهوة: a wax seal stamped beside the caption. */
  setDouble(level: number, label: string): void {
    this.seal?.destroy();
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x9e2b25, 1);
    bg.fillPoints(starPoints(0, 0, 30), true);
    bg.lineStyle(2, 0xffd98a, 1);
    bg.strokePoints(starPoints(0, 0, 30), true);
    const t = plainText(this.scene, 0, 0, level >= 5 ? "☕" : `×${level}`, { fontSize: "22px", color: "#fff1d6", fontStyle: "bold" });
    const x = Math.min(this.caption.width / 2 + 58, TRACK_W / 2 - 80);
    this.seal = this.scene.add.container(-x, CAPTION_Y + 2, [bg, t]);
    this.root.add(this.seal);
    this.seal.setScale(2.4).setAlpha(0);
    this.scene.tweens.add({
      targets: this.seal,
      scale: 1,
      alpha: 1,
      angle: -12,
      duration: 260,
      ease: "Cubic.In",
      onComplete: () => {
        this.scene.cameras.main.shake(140, 0.003);
        flare(this.scene, this.x - x, this.y + CAPTION_Y, 0xff8a6a, 0.8);
      },
    });
    void label;
  }

  /** A trick taken: its points pop over the table and fly into the side's medallion. */
  addTrick(side: Side, raw: number, from: { x: number; y: number }, ground?: { side: Side; raw: number }): void {
    const gen = this.gen;
    this.push(() => {
      if (gen !== this.gen) return 0;
      this.tricks[side]++;
      const d = this.fly(side, raw / this.divisor, from, "");
      if (ground && ground.raw > 0) {
        this.scene.time.delayedCall(420, () => {
          if (gen === this.gen) this.fly(ground.side, ground.raw / this.divisor, { x: from.x, y: from.y + 90 }, "الأرض");
        });
      }
      this.kabootWatch();
      return d + (ground ? 380 : 0);
    });
  }

  /** Projects laid down (or بلوت called): the target grows and the side takes it. */
  addProject(side: Side, value: number, label: string, from: { x: number; y: number }): void {
    const gen = this.gen;
    this.push(() => {
      if (gen !== this.gen) return 0;
      this.pie += value;
      this.refreshCaption();
      this.chip(from, this.medalPoint(side), `${label} \u200E+${value}`, TEAM[side].main, () => {
        this.exact[side] += value;
        this.land(side);
      });
      return 700;
    });
  }

  /** A joker paid out: a chip with its icon drops from the joker into our medallion. */
  addJoker(icon: string, amount: number, from: { x: number; y: number }): void {
    const gen = this.gen;
    this.push(() => {
      if (gen !== this.gen) return 0;
      const bad = amount < 0;
      this.chip(from, this.medalPoint("us"), `${icon} ${bad ? "−" : "+"}${Math.abs(amount)}`, bad ? 0xc2453a : 0xffd98a, () => {
        this.bonus += amount;
        this.showBonus();
        flare(this.scene, this.x + MED_X, this.y, bad ? 0xff7a7a : 0xffe6b0, 0.7);
      });
      return 460;
    });
  }

  /** The hand is over: the numbers settle on what the score sheet says. */
  finish(f: MeterFinish): void {
    const gen = this.gen;
    this.push(() => {
      if (gen !== this.gen) return 0;
      this.exact = { us: f.us, them: f.them };
      this.pie = Math.max(this.pie, f.us + f.them, 1);
      this.bonus = f.bonus;
      this.tag = f.word ?? "";
      this.refreshCaption();
      this.showBonus();
      this.land("us");
      this.land("them");
      return 600;
    });
  }

  // ------------------------------------------------------------------ inner workings

  private reset(): void {
    this.gen++;
    this.queue = [];
    this.busy = false;
    this.exact = { us: 0, them: 0 };
    this.shown = { us: 0, them: 0 };
    this.bonus = 0;
    this.buyer = undefined;
    this.tricks = { us: 0, them: 0 };
    this.decided = undefined;
    this.tag = "";
    this.crown.setVisible(false);
    this.bonusBadge.setVisible(false);
    this.seal?.destroy();
    this.seal = undefined;
    for (const side of ["us", "them"] as Side[]) this.numbers[side].setText("0");
  }

  private push(step: () => number): void {
    this.queue.push(step);
    if (!this.busy) this.next();
  }

  private next(): void {
    const step = this.queue.shift();
    if (!step) {
      this.busy = false;
      return;
    }
    this.busy = true;
    const gen = this.gen;
    const ms = step();
    this.scene.time.delayedCall(ms, () => {
      if (gen === this.gen) this.next();
    });
  }

  /** Pops `value` over the table and sends it flying to the side's medallion. Returns its length. */
  private fly(side: Side, value: number, from: { x: number; y: number }, label: string): number {
    const scene = this.scene;
    const gen = this.gen;
    const before = Math.round(this.exact[side]);
    const target = this.exact[side] + value;
    const shownGain = Math.round(target) - before;
    const team = TEAM[side];
    const text = label ? `${label} \u200E+${shownGain}` : `+${shownGain}`;
    const pop = (label ? arabicText : plainText)(scene, from.x, from.y, text, {
      fontSize: label ? "44px" : "64px",
      color: shownGain > 0 ? team.text : "#c9c1b0",
      fontStyle: "bold",
      stroke: "#2a160f",
      strokeThickness: 8,
    }).setDepth(80);
    pop.setScale(0.3);
    scene.tweens.add({ targets: pop, scale: 1, duration: 240, ease: "Back.Out" });
    if (shownGain <= 0 && value < 0.5) {
      // A trick of 7s and 8s: nothing to send, just say so.
      scene.tweens.add({ targets: pop, alpha: 0, y: from.y - 40, delay: 380, duration: 380, onComplete: () => pop.destroy() });
      this.exact[side] = target;
      this.shown[side] = target;
      this.redraw();
      return 420;
    }
    const to = this.medalPoint(side);
    scene.time.delayedCall(420, () => {
      scene.tweens.add({ targets: pop, alpha: 0, scale: 0.5, duration: 260, onComplete: () => pop.destroy() });
      if (gen !== this.gen) return;
      const orb = scene.add.image(from.x, from.y, "fx-dot").setTint(team.light).setBlendMode(Phaser.BlendModes.ADD).setScale(0.7).setDepth(63);
      const trail = scene.add
        .particles(0, 0, "fx-dot", {
          follow: orb,
          scale: { start: 0.35, end: 0 },
          alpha: { start: 0.7, end: 0 },
          tint: [team.light, 0xffffff],
          lifespan: 380,
          frequency: 16,
          blendMode: Phaser.BlendModes.ADD,
        })
        .setDepth(62);
      bezier(scene, orb, from, to, 460, () => {
        orb.destroy();
        trail.stop();
        scene.time.delayedCall(420, () => trail.destroy());
        if (gen !== this.gen) return;
        this.exact[side] = target;
        this.land(side);
      });
    });
    return 980;
  }

  /** A flying chip (a project or a joker's payout) from one point to another. */
  private chip(from: { x: number; y: number }, to: { x: number; y: number }, text: string, color: number, onLand: () => void): void {
    const scene = this.scene;
    const gen = this.gen;
    const t = (/[\u0600-\u06FF]/.test(text) ? arabicText : plainText)(scene, 0, 0, text, { fontSize: "24px", color: "#2a160f", fontStyle: "bold", shadow: { offsetX: 0, offsetY: 0, color: "rgba(0,0,0,0)", blur: 0 } });
    const w = t.width + 30;
    const bg = scene.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -22, w, 44, 22);
    bg.lineStyle(3, 0xfff1d6, 0.9);
    bg.strokeRoundedRect(-w / 2, -22, w, 44, 22);
    const c = scene.add.container(from.x, from.y, [bg, t]).setDepth(80).setScale(0.2);
    scene.tweens.add({ targets: c, scale: 1.15, y: from.y + 34, duration: 200, ease: "Back.Out" });
    scene.time.delayedCall(260, () => {
      bezier(scene, c, { x: c.x, y: c.y }, to, 380, () => {
        c.destroy();
        if (gen === this.gen) onLand();
      }, 0.55);
    });
  }

  /** Points arrive: the medallion punches, the number counts up and the track fills. */
  private land(side: Side): void {
    const scene = this.scene;
    const medal = this.medals[side];
    scene.tweens.killTweensOf(medal);
    medal.setScale(1);
    scene.tweens.add({ targets: medal, scale: 1.28, duration: 110, yoyo: true, ease: "Quad.Out" });
    const p = this.medalPoint(side);
    flare(scene, p.x, p.y, TEAM[side].light, 0.8);
    rise(scene, p.x, p.y, [TEAM[side].light, 0xfff1d6], 8);
    const state = { v: this.shown[side] };
    scene.tweens.add({
      targets: state,
      v: this.exact[side],
      duration: 420,
      ease: "Cubic.Out",
      onUpdate: () => {
        this.shown[side] = state.v;
        this.redraw();
      },
      onComplete: () => this.checkDecided(),
    });
  }

  private redraw(): void {
    const g = this.fills;
    g.clear();
    const pie = Math.max(this.pie, 0.0001);
    const half = TRACK_W / 2;
    const top = TRACK_Y - TRACK_H / 2;
    const uw = Math.min(1, Math.max(0, this.shown.us) / pie) * TRACK_W;
    const tw = Math.min(TRACK_W - uw, (Math.max(0, this.shown.them) / pie) * TRACK_W);
    const bar = (x: number, w: number, color: number) => {
      if (w < 1) return;
      g.fillStyle(color, 1);
      g.fillRoundedRect(x, top, w, TRACK_H, Math.min(10, w / 2));
      g.fillStyle(0xffffff, 0.3);
      g.fillRect(x + Math.min(4, w / 3), top + 3, Math.max(0, w - 8), TRACK_H * 0.28);
    };
    bar(half - uw, uw, TEAM.us.main);
    bar(-half, tw, TEAM.them.main);
    this.edgeGlow.us.setPosition(half - uw, TRACK_Y).setAlpha(uw > 1 ? 0.85 : 0);
    this.edgeGlow.them.setPosition(-half + tw, TRACK_Y).setAlpha(tw > 1 ? 0.85 : 0);
    this.numbers.us.setText(String(Math.round(this.shown.us)));
    this.numbers.them.setText(String(Math.round(this.shown.them)));
    this.halfText.setText(this.pie > 0 ? formatHalf(this.pie) : "½");
  }

  /** Once a side is past the half-way mark the hand is theirs: say so, once. */
  private checkDecided(): void {
    if (this.decided || !this.buyer || this.pie <= 0) return;
    const half = this.pie / 2;
    const side: Side | undefined = this.exact.us > half ? "us" : this.exact.them > half ? "them" : undefined;
    if (!side) return;
    this.decided = side;
    const good = side === "us";
    const word = good ? (this.buyer === "us" ? "✓ ضمنّاها!" : "🔥 خسرانة عليهم!") : this.buyer === "us" ? "💔 طاحت علينا" : "ضمنوها";
    this.tag = good ? (this.buyer === "us" ? "✓ مضمونة" : "🔥 خسرانة عليهم") : this.buyer === "us" ? "💔 خسرانة" : "لهم";
    this.refreshCaption();
    this.banner(word, good);
  }

  private kabootWatch(): void {
    const played = this.tricks.us + this.tricks.them;
    if (played >= 5 && played < 8 && (this.tricks.us === played || this.tricks.them === played)) {
      this.tag = this.tricks.us === played ? "🔥 كبوت؟" : "⚠️ كبوت عليكم؟";
      this.refreshCaption();
      this.scene.tweens.add({ targets: this.caption, scale: 1.18, duration: 160, yoyo: true, repeat: 1 });
    }
  }

  private banner(text: string, good: boolean): void {
    const scene = this.scene;
    const t = arabicText(scene, 0, 0, text, { fontSize: "40px", color: good ? "#3a2620" : "#fff1d6", fontStyle: "bold", shadow: { offsetX: 0, offsetY: 0, color: "rgba(0,0,0,0)", blur: 0 } });
    const w = t.width + 60;
    const bg = scene.add.graphics();
    bg.fillStyle(good ? 0xffd98a : 0x9e2b25, 1);
    bg.fillRoundedRect(-w / 2, -34, w, 68, 34);
    bg.lineStyle(3, 0xfff1d6, 1);
    bg.strokeRoundedRect(-w / 2, -34, w, 68, 34);
    const c = scene.add.container(this.x, this.y + 104, [bg, t]).setDepth(66).setScale(0.3).setAlpha(0);
    scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: "Back.Out" });
    scene.tweens.add({ targets: c, alpha: 0, y: c.y - 30, delay: 1700, duration: 400, onComplete: () => c.destroy() });
    if (good) {
      screenFlash(scene, 0xffe6b0, 0.25);
      const p = this.medalPoint("us");
      rise(scene, p.x, p.y, [0xffd98a, 0xfff1d6, 0xe3a33b], 26);
      rise(scene, this.x, this.y + TRACK_Y, [0xffd98a, 0xfff1d6], 20);
    } else {
      scene.cameras.main.shake(220, 0.004);
    }
  }

  private refreshCaption(): void {
    const extra = this.pie - this.basePie;
    const worth = this.basePie > 0 ? ` · ${this.basePie}${extra > 0 ? ` + ${extra} = ${this.pie}` : ""}` : "";
    this.caption.setText(`${this.modeLabel}${worth}${this.tag ? `   ${this.tag}` : ""}`);
    if (this.seal) this.seal.setX(-Math.min(this.caption.width / 2 + 58, TRACK_W / 2 - 80));
  }

  private showBonus(): void {
    if (this.bonus === 0) {
      this.bonusBadge.setVisible(false);
      return;
    }
    this.bonusText.setText(`🃏 ${this.bonus > 0 ? "+" : "−"}${Math.abs(this.bonus)}`);
    this.bonusBadge.setVisible(true);
    this.scene.tweens.killTweensOf(this.bonusBadge);
    this.bonusBadge.setScale(1);
    this.scene.tweens.add({ targets: this.bonusBadge, scale: 1.35, duration: 120, yoyo: true, ease: "Quad.Out" });
  }

  private flashTrack(): void {
    const glow = this.scene.add.image(this.x, this.y + TRACK_Y, "fx-ray").setAngle(90).setScale(0.35, 0.4).setTint(0xffd98a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(23);
    this.scene.tweens.add({ targets: glow, alpha: { from: 0.8, to: 0 }, duration: 700, ease: "Quad.Out", onComplete: () => glow.destroy() });
  }

  private numberText(): Phaser.GameObjects.Text {
    return arabicText(this.scene, 0, 2, "0", { fontSize: "34px", color: "#fff1d6", fontStyle: "bold" });
  }

  /** An eight-pointed zellige star in the side's colour, with the number in its heart. */
  private medal(side: Side, x: number): Phaser.GameObjects.Container {
    const g = this.scene.add.graphics();
    const team = TEAM[side];
    g.fillStyle(0x2a160f, 0.6);
    g.fillPoints(starPoints(0, 4, MED_R), true);
    g.fillStyle(team.main, 1);
    g.fillPoints(starPoints(0, 0, MED_R), true);
    g.lineStyle(2, 0xfff1d6, 0.8);
    g.strokePoints(starPoints(0, 0, MED_R), true);
    g.fillStyle(0x14303b, 1);
    g.fillCircle(0, 0, MED_R * 0.66);
    g.lineStyle(2, team.light, 1);
    g.strokeCircle(0, 0, MED_R * 0.66);
    const c = this.scene.add.container(x, 0, [g, this.numbers[side]]);
    this.root.add(c);
    return c;
  }
}

function formatHalf(pie: number): string {
  const half = pie / 2;
  return Number.isInteger(half) ? String(half) : half.toFixed(1);
}

/** The points of an eight-pointed star around (cx, cy). */
function starPoints(cx: number, cy: number, r: number): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.74;
    pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
  }
  return pts;
}

/** Moves `target` along a curve that bows upward, speeding up as it goes (it's being pulled in). */
function bezier(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Image | Phaser.GameObjects.Container,
  from: { x: number; y: number },
  to: { x: number; y: number },
  duration: number,
  onComplete: () => void,
  endScale?: number,
): void {
  const cx = (from.x + to.x) / 2 + (to.x > from.x ? -1 : 1) * 120;
  const cy = Math.min(from.y, to.y) - 60;
  const s0 = target.scaleX;
  const state = { t: 0 };
  scene.tweens.add({
    targets: state,
    t: 1,
    duration,
    ease: "Cubic.In",
    onUpdate: () => {
      if (!target.active) return;
      const t = state.t;
      const u = 1 - t;
      target.x = u * u * from.x + 2 * u * t * cx + t * t * to.x;
      target.y = u * u * from.y + 2 * u * t * cy + t * t * to.y;
      if (endScale !== undefined) target.setScale(s0 + (endScale - s0) * t);
    },
    onComplete,
  });
}
