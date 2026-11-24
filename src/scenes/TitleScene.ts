import Phaser from "phaser";
import { HOME_ART, addAmbience, addCameraGrade, paintBackdrop } from "./fx";
import { CENTER_X, HEIGHT, WIDTH } from "./layout";
import { HEAD_FONT } from "./theme";
import { arabicText, makeButton, preloadUi } from "./ui";
import { storySeen } from "./StoryScene";
import { loadProgress, skillOf, STAGES } from "../drill/progress";
import { CSS, inkText, paperPanel } from "./theme";

const LOGO = "ui-logo";

/**
 * The home screen: the diwaniya on a far dune at sunset (public/assets/bg/home.webp), the game's
 * logo (public/assets/ui/logo.webp: a gold sun and key behind «المعزّب», «ليلة الأربعين» under a
 * gold rule), and the way in.
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super("title");
  }

  preload(): void {
    preloadUi(this);
    if (!this.textures.exists(LOGO)) this.load.image(LOGO, "assets/ui/logo.webp");
  }

  create(): void {
    if (this.textures.exists(HOME_ART)) {
      this.add.image(WIDTH / 2, HEIGHT / 2, HOME_ART).setDisplaySize(WIDTH, HEIGHT);
      // The dunes run dark at the foot of the art: a soft lift keeps the button's gold readable.
      const g = this.add.graphics();
      g.fillGradientStyle(0x2a1208, 0x2a1208, 0x2a1208, 0x2a1208, 0, 0, 0.55, 0.55);
      g.fillRect(0, HEIGHT - 460, WIDTH, 460);
    } else {
      paintBackdrop(this);
    }
    addAmbience(this);
    addCameraGrade(this);

    if (this.textures.exists(LOGO)) {
      const logo = this.add.image(CENTER_X, 250, LOGO);
      logo.setScale((WIDTH * 0.98) / logo.width).setAlpha(0);
      this.tweens.add({ targets: logo, alpha: 1, y: 240, duration: 700, ease: "Cubic.Out" });
    }

    // The first time in, the story and how the night works come before the map.
    makeButton(this, CENTER_X, HEIGHT - 290, "ادخل الديوانية", () => (storySeen() ? this.scene.start("map") : this.scene.start("story", { next: "map" })), { width: 500, height: 116, plate: "burgundy" });
    arabicText(this, CENTER_X, HEIGHT - 190, "الأبواب مفتوحة حتى الفجر", { fontFamily: HEAD_FONT, fontSize: "30px", color: "#f2e3c2" });
    // تمرين الذاكرة: plain Baloot with questions between tricks — practice, not the night.
    makeButton(this, CENTER_X, HEIGHT - 410, "تمرين الذاكرة", () => this.drillMenu(), { width: 400, height: 96, plate: "teal" });
    const story = arabicText(this, CENTER_X, HEIGHT - 120, "القصة وكيف تمشي الليلة", { fontSize: "28px", color: "#ffd98a" });
    story.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.scene.start("story", { next: "title" }));
    // game-icons.net asks for credit (CC BY 3.0).
    this.add.text(CENTER_X, HEIGHT - 44, "Icons: game-icons.net (CC BY 3.0)", { fontFamily: "Tajawal, Arial", fontSize: "22px", color: "#c9b48c" }).setOrigin(0.5).setAlpha(0.8);
  }

  /** تمرين الذاكرة: one skill at a time (عدّ الحكم first), or the mixed quiz. */
  private drillMenu(): void {
    const p = loadProgress();
    const sk = skillOf(p, "trump");
    const shade = this.add.rectangle(CENTER_X, HEIGHT / 2, WIDTH, HEIGHT, 0x000000, 0.6).setInteractive().setDepth(30);
    const panel = this.add.container(CENTER_X, HEIGHT / 2).setDepth(31);
    panel.add(paperPanel(this, WIDTH - 100, 760));
    panel.add(inkText(this, 0, -300, "تمرين الذاكرة", { fontSize: "44px", color: CSS.crimson }));
    panel.add(inkText(this, 0, -235, "مهارة وحدة كل مرة، بطريقة واضحة، والمساعدة تختفي شوي شوي", { fontSize: "24px", color: CSS.inkSoft, wordWrap: { width: WIDTH - 200 } }));
    const close = () => {
      shade.destroy();
      panel.destroy();
    };
    shade.on("pointerdown", close);
    const go = (data: Record<string, unknown>) => this.scene.start("table", { nodeType: "match", matchTarget: 999, modifiers: {}, drill: true, ...data });
    panel.add(makeButton(this, 0, -120, sk.mastered ? "١. عدّ الحكم ✓" : `١. عدّ الحكم · المرحلة ${sk.stage} من ${STAGES}`, () => go({ drillSkill: "trump" }), { width: WIDTH - 200, height: 96, plate: "teal" }).container);
    panel.add(inkText(this, 0, -45, "تتعلم تعدّ الحكم الباقي وتستخدمه في قرارك", { fontSize: "23px", color: CSS.inkSoft }));
    panel.add(makeButton(this, 0, 50, "٢. الإكك والعشرات · قريباً", () => {}, { width: WIDTH - 200, height: 86, plate: "paper", disabled: true }).container);
    panel.add(makeButton(this, 0, 160, "اختبار شامل (أسئلة مخلوطة)", () => go({}), { width: WIDTH - 200, height: 86, plate: "navy" }).container);
    panel.add(makeButton(this, 0, 290, "رجوع", close, { width: 260, height: 76, plate: "paper" }).container);
  }
}
