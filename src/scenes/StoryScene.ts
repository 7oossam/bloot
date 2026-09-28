import Phaser from "phaser";
import { addAmbience } from "./fx";
import { CENTER_X, HEIGHT, WIDTH } from "./layout";
import { CSS, HEAD_FONT, goldRule, inkText, paintParchment } from "./theme";
import { INK, UI_ICON, addIcon } from "./icons";
import { makeButton, preloadUi } from "./ui";
import { STARTING_LIVES } from "../roguelike/types";

/** Set once the player has read (or skipped) the opening, so it isn't shown every night. */
const SEEN_KEY = "bloot.storySeen";

export function storySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode: it just shows again next time */
  }
}

/** The opening, a page at a time (docs/theme.md §1). */
const STORY: Array<{ title: string; icon: string; text: string }> = [
  {
    title: "ليلة الأربعين",
    icon: "sunrise",
    text: "كل أربعين سنة، في ليلة وحدة بس، تنفتح في المدينة ديوانيات ما يشوفها أحد في النهار. أبوابها تطلع في جدران تعرفها طول عمرك، وورا كل باب ضو.\n\nفي آخر الطريق، ورا باب ما له باب، يجلس المعزّب. ما خسر صكّة من يوم وصل أول ورق لأيدي الناس.",
  },
  {
    title: "المرهونين",
    icon: "key",
    text: "اللي يجلس مع المعزّب يلعب على نفسه. واللي يخسر يصير مرهون عنده: يبقى في الديوانيات يستقبل الضيوف لين يغلبه أحد ويفك رهنه.\n\nكل مرهون له شرط، والضيف ما يرد شرط معزّبه.",
  },
  {
    title: "جدّك",
    icon: "coffee-cup",
    text: "جدّك دخل ليلة الأربعين الماضية وما رجع. أهل الحي نسوا اسمه، وأنت الوحيد اللي تتذكره.\n\nالليلة الأبواب انفتحت، وتحت فنجاله المقلوب لقيت ورقة:\n«الشايب ما مات، الشايب قاعد يلعب».",
  },
];

/** How the night works — the run, not Baloot. */
const HOW: Array<{ icon: string; title: string; text: string }> = [
  { icon: UI_ICON.lives, title: "ساعات الليل", text: `تبدأ بـ ${STARTING_LIVES} ساعات. كل صكّة تخسرها تاخذ ساعة، وإذا خلصت ساعاتك طلع الفجر وخسرت الليلة.` },
  { icon: "key", title: "ثلاث خرائط", text: "في آخر كل خريطة زعيم. تغلبه تاخذ مفتاح وتروح للي بعدها — وثلاث مفاتيح تفك جدّك." },
  { icon: "wax-seal", title: "الوسوم", text: "كل صكّة تفوزها تعطيك وسم تحطه على ورقة. يبقى عليها طول الليل، ويشتغل إذا جات في يدك." },
  { icon: UI_ICON.gift, title: "التحف والنحس", text: "المجلس الكبير والزعيم والدكّان يعطونك تحف تغيّر قوانين اللعب لصالحك. والنحس عكسها: يضرك لين تفكّه." },
  { icon: "rolling-dices", title: "السوالف", text: "ناس تقابلهم في الطريق: بعضهم خير، وبعضهم بلاء، وأغلبهم يبي شي — ريال، أو ساعة، أو نحس يلحقك." },
  { icon: "slingshot", title: "شخصيتك", text: "تختارها أول الليلة، وهي قانونك الخاص من أول يد." },
];

/**
 * The opening story and a short "how the night works", shown before the first night (and from
 * the home screen's «القصة» button). `next` is the scene to go to after.
 */
export class StoryScene extends Phaser.Scene {
  private page = 0;
  private next = "map";
  private layer?: Phaser.GameObjects.Container;

  constructor() {
    super("story");
  }

  init(data: { next?: string; page?: number }): void {
    this.next = data?.next ?? "map";
    this.page = data?.page ?? 0;
  }

  preload(): void {
    preloadUi(this);
  }

  create(): void {
    paintParchment(this, { compass: false });
    addAmbience(this);
    this.show();
  }

  private finish(): void {
    markSeen();
    this.scene.start(this.next);
  }

  private show(): void {
    this.layer?.destroy();
    const layer = this.add.container(0, 0);
    this.layer = layer;
    const last = STORY.length;
    if (this.page < last) this.storyPage(layer, STORY[this.page]);
    else this.howPage(layer);

    // Dots: where you are.
    const dots = this.add.graphics();
    const total = last + 1;
    for (let i = 0; i < total; i++) {
      dots.fillStyle(i === this.page ? 0x9e1b26 : 0xc9973e, i === this.page ? 1 : 0.5);
      dots.fillCircle(CENTER_X + (i - (total - 1) / 2) * 34, HEIGHT - 250, i === this.page ? 9 : 7);
    }
    layer.add(dots);

    const final = this.page >= last;
    layer.add(
      makeButton(this, CENTER_X, HEIGHT - 150, final ? "ابدأ الليلة" : "التالي", () => {
        if (final) return this.finish();
        this.page++;
        this.show();
      }, { width: 420, height: 100, plate: final ? "burgundy" : "navy" }).container,
    );
    if (!final) {
      const skip = inkText(this, WIDTH - 110, 90, "تخطّي", { fontSize: "30px", color: CSS.inkSoft });
      skip.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.finish());
      layer.add(skip);
    }
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 350 });
  }

  private storyPage(layer: Phaser.GameObjects.Container, p: { title: string; icon: string; text: string }): void {
    layer.add(addIcon(this, CENTER_X, 330, p.icon, 150, INK).setAlpha(0.9));
    layer.add(inkText(this, CENTER_X, 500, p.title, { fontFamily: HEAD_FONT, fontSize: "58px", color: CSS.crimson }));
    layer.add(goldRule(this, CENTER_X, 560, 360));
    layer.add(
      inkText(this, CENTER_X, 620, p.text, { fontSize: "33px", lineSpacing: 16, wordWrap: { width: WIDTH - 150 } }).setOrigin(0.5, 0),
    );
  }

  private howPage(layer: Phaser.GameObjects.Container): void {
    layer.add(inkText(this, CENTER_X, 140, "كيف تمشي الليلة", { fontFamily: HEAD_FONT, fontSize: "54px", color: CSS.crimson }));
    layer.add(goldRule(this, CENTER_X, 200, 360));
    const rowH = 210;
    HOW.forEach((row, i) => {
      const y = 330 + i * rowH;
      layer.add(addIcon(this, WIDTH - 130, y, row.icon, 80, INK));
      const x = WIDTH - 200;
      layer.add(inkText(this, x, y - 52, row.title, { fontSize: "34px", color: CSS.crimson }).setOrigin(1, 0.5));
      layer.add(inkText(this, x, y - 22, row.text, { fontSize: "27px", align: "right", wordWrap: { width: WIDTH - 290 } }).setOrigin(1, 0));
    });
  }
}
