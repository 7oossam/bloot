/**
 * الديوانية (on the map: طرقة): a node with a short scene and a choice. Every choice costs
 * something or risks something — no free lunches — and each event is one of a few kinds, shown
 * on its panel so you know what sort of door you're knocking on:
 *   ضيافة (rest: hours of the night back), سوق (a trade), رهان (a gamble), وسم (stamps on your
 *   cards), حكاية (a story with a price later), and your character's own.
 * Each map deals its own pool (`acts`); one ديوانية per map is your character's.
 */

import type { StampId } from "./stamps";

export type EventKind = "rest" | "trade" | "gamble" | "stamp" | "story" | "own";

/** The kinds as the panel shows them. */
export const EVENT_KINDS: Record<EventKind, { label: string; color: string }> = {
  rest: { label: "ضيافة", color: "#3e6b3a" },
  trade: { label: "سوق", color: "#8c5a1c" },
  gamble: { label: "رهان", color: "#9b1c1c" },
  stamp: { label: "وسم", color: "#1f4a4d" },
  story: { label: "حكاية", color: "#5a3a6b" },
  own: { label: "حكايتك", color: "#9b6a12" },
};

/** What an event may do to the run — RunController implements it. */
export interface EventRun {
  gold(): number;
  addGold(amount: number): void;
  /** +1 life, or false if you're already at the most. */
  addLife(): boolean;
  lives(): number;
  /** −1 life; never takes the last one. */
  loseLife(): void;
  addShield(): void;
  /** Start the next match this far ahead. */
  boostNext(points: number): void;
  /** The opponents start the next match this far ahead. */
  penalizeNext(points: number): void;
  /** A random joker of this rarity you don't own; its name, or undefined if none could be given. */
  grantRandomJoker(rarity: "rare" | "legendary"): string | undefined;
  /** One of your character's own تحف you don't have (or a level on one you do); its name. */
  grantOwnJoker(): string | undefined;
  canUpgrade(): boolean;
  /** Levels up a random joker you own; its name. */
  upgradeRandomJoker(): string | undefined;
  /** Your cheapest joker to sell, for this many times its price; its name and the gold. */
  cheapestJoker(): { name: string; value: number } | undefined;
  sellCheapest(times: number): { name: string; gold: number } | undefined;
  /** A وسم pick (like a match's spoils): `count` stamps to choose from (`first` among them), then the card. */
  offerStamps(count: number, title: string, first?: StampId): void;
  /** How many cards carry الكبّارة. */
  growCards(): number;
  /** Puts a stamp straight on a card (no pick); false if the card has it already. */
  stampCard(stamp: StampId, cardId: string): boolean;
  /** +1 star on every الكبّارة card; how many it reached. */
  growAll(): number;
}

export interface EventOption {
  label: string;
  /** Why it can't be picked right now, if it can't. */
  blocked?: (run: EventRun) => string | undefined;
  /** Does it; returns what happened, for the player to read. */
  apply: (run: EventRun, rand: () => number) => string;
}

export interface EventDef {
  /** Which maps it turns up on (0–2); all of them if unset. */
  acts?: number[];
  /** A character's own event: dealt only to that character (by the map's "own" ديوانية). */
  character?: string;
  kind: EventKind;
  id: string;
  name: string;
  icon: string;
  text: string;
  options: EventOption[];
}

/** The map's placeholder for "your character's ديوانية", resolved when you walk in. */
export const OWN_EVENT = "own";

const BET = 20;
const BET_WIN = 45;
const STALL_PRICE = 30;
const GUEST_PRICE = 15;
const TATTOO_PRICE = 15;
const HOUR_SELL = 45;
const HOUR_BUY = 35;
const MAKER_PRICE = 40;
const noGold = (price: number) => (run: EventRun) => (run.gold() < price ? "ريالاتك ما تكفي" : undefined);
const lastHour = (run: EventRun) => (run.lives() <= 1 ? "ما بقى لك إلا ساعة" : undefined);

export const EVENTS: EventDef[] = [
  // ------------------------------------------------------------------ الحارة
  {
    id: "coffee",
    kind: "rest",
    acts: [0, 1],
    name: "فنجال المعزّب",
    icon: "coffee-cup",
    text: "المعزّب يصب لك قهوة ويسولف معك عن أيام أول",
    options: [
      {
        label: "اجلس وتقهوى (+1 ساعة)",
        apply: (run) => {
          if (run.addLife()) return "ارتحت: ساعة زيادة من الليل";
          run.addGold(15);
          return "ساعات ليلك كاملة، فعطاك 15 ريال بداله";
        },
      },
      { label: "هز الفنجال وامش (+20 ريال)", apply: (run) => (run.addGold(20), "+20 ريال") },
    ],
  },
  {
    id: "bet",
    kind: "gamble",
    acts: [0, 1],
    name: "رهان الدكّة",
    icon: "rolling-dices",
    text: "واحد على الدكّة يتحداك: رهان على ورقة، يا تكسب يا تخسر",
    options: [
      {
        label: `راهن بـ ${BET} ريال (يا ${BET_WIN} يا صفر)`,
        blocked: noGold(BET),
        apply: (run, rand) => {
          run.addGold(-BET);
          if (rand() < 0.5) {
            run.addGold(BET_WIN);
            return `كسبت! +${BET_WIN} ريال`;
          }
          return `خسرت الرهان: −${BET} ريال`;
        },
      },
      { label: "ما أراهن", apply: () => "تركته وجلست تتقهوى" },
    ],
  },
  {
    id: "guest",
    kind: "story",
    acts: [0, 2],
    name: "الضيف الثقيل",
    icon: "hot-meal",
    text: "ضيف ثقيل جلس جنبك ويبي يسولف طول الليل",
    options: [
      {
        label: `عزّمه على العشا (−${GUEST_PRICE} ريال، +1 درع)`,
        blocked: noGold(GUEST_PRICE),
        apply: (run) => (run.addGold(-GUEST_PRICE), run.addShield(), "انبسط وعطاك درع"),
      },
      { label: "اعتذر منه (الخصم الجاي يبدأ بـ 5)", apply: (run) => (run.penalizeNext(5), "زعل وراح يشجع خصمك: يبدؤون الصكّة الجاية بـ 5") },
    ],
  },
  {
    id: "tattoo",
    kind: "stamp",
    acts: [0, 1, 2],
    name: "الوشّام",
    icon: "quill-ink",
    text: "رجال عنده حبر ومسامير، يوسم الورق بعلامات القبايل",
    options: [
      {
        label: `وسّم لي (−${TATTOO_PRICE} ريال، تختار من ثلاث)`,
        blocked: noGold(TATTOO_PRICE),
        apply: (run) => (run.addGold(-TATTOO_PRICE), run.offerStamps(3, "الوشّام: اختر وسم"), "طلّع لك ثلاث علامات"),
      },
      {
        label: "وسّم لي ببلاش (من اثنين، والخصم الجاي يبدأ بـ 10)",
        apply: (run) => (run.offerStamps(2, "الوشّام: اختر وسم"), run.penalizeNext(10), "وسمها لك… وراح يخبر خصمك"),
      },
      { label: "امش", apply: () => "مشيت" },
    ],
  },
  // ------------------------------------------------------------------ الأندلس
  {
    id: "elder",
    kind: "story",
    acts: [1, 2],
    name: "شايب على الدكّة",
    icon: "beard",
    text: "شايب لعب بلوت أربعين سنة، يبي يعلمك شي",
    options: [
      {
        label: "علّمني (ترقية تحفة عشوائية، وتعطيه ساعة من ليلك)",
        blocked: (run) => (run.canUpgrade() ? lastHour(run) : "ما عندك تحفة تترقى"),
        apply: (run) => (run.loseLife(), `ترقّت: ${run.upgradeRandomJoker()}`),
      },
      { label: "عطني نصيحة للصكّة الجاية (تبدأ بـ 10)", apply: (run) => (run.boostNext(10), "تبدأ الصكّة الجاية قدامهم بـ 10") },
    ],
  },
  {
    id: "stall",
    kind: "trade",
    acts: [1, 2],
    name: "بسطة آخر الليل",
    icon: "basket",
    text: "واحد فارش بسطة تحف مستعملة، ويشتري بعد",
    options: [
      {
        label: `اشترِ تحفة نادرة عشوائية بـ ${STALL_PRICE} ريال`,
        blocked: noGold(STALL_PRICE),
        apply: (run) => {
          const name = run.grantRandomJoker("rare");
          if (!name) return "ما لقى شي يبيعك إياه";
          run.addGold(-STALL_PRICE);
          return `اشتريت ${name}`;
        },
      },
      {
        label: "بع له أرخص تحفة عندك بضعف سعرها",
        blocked: (run) => (run.cheapestJoker() ? undefined : "ما عندك تحفة"),
        apply: (run) => {
          const sold = run.sellCheapest(2)!;
          return `بعت ${sold.name} بـ ${sold.gold} ريال`;
        },
      },
      { label: "امش", apply: () => "مشيت" },
    ],
  },
  {
    id: "clock",
    kind: "trade",
    acts: [1],
    name: "بيّاع الساعات",
    icon: "hourglass",
    text: "شايب يبيع ويشتري ساعات الليل، ما أحد يدري من وين جابها",
    options: [
      { label: `بعه ساعة من ليلك (+${HOUR_SELL} ريال)`, blocked: lastHour, apply: (run) => (run.loseLife(), run.addGold(HOUR_SELL), `−1 ساعة، +${HOUR_SELL} ريال`) },
      {
        label: `اشترِ ساعة (−${HOUR_BUY} ريال)`,
        blocked: noGold(HOUR_BUY),
        apply: (run) => {
          if (!run.addLife()) return "ساعاتك كاملة، ما باعك شي";
          run.addGold(-HOUR_BUY);
          return "+1 ساعة من الليل";
        },
      },
      { label: "امش", apply: () => "مشيت" },
    ],
  },
  {
    id: "farmer",
    kind: "stamp",
    acts: [1, 2],
    name: "الفلّاح",
    icon: "wheat",
    text: "فلّاح يقول: الورق مثل الزرع، يبي له سقاية",
    options: [
      {
        label: "اسقِ الكبّارة (+1 نجمة لكل ورقة عليها الكبّارة)",
        blocked: (run) => (run.growCards() === 0 ? "ما عندك ورقة عليها الكبّارة" : undefined),
        apply: (run) => `+1 نجمة على ${run.growAll()} ورقة`,
      },
      { label: "خذ منه بذرة (الكبّارة أو وسم ثاني)", apply: (run) => (run.offerStamps(2, "الفلّاح: اختر وسم", "grow"), "عطاك بذرتين تختار منهم") },
    ],
  },
  {
    id: "cursed",
    kind: "gamble",
    acts: [1, 2],
    name: "الورق الملعون",
    icon: "card-random",
    text: "لقيت ورق قديم في زاوية الزقاق، يقولون ملعون",
    options: [
      {
        label: "خذه (تحفة أسطورية، وتخسر ساعة من ليلك)",
        blocked: lastHour,
        apply: (run) => {
          const name = run.grantRandomJoker("legendary");
          if (!name) return "الورق اختفى";
          run.loseLife();
          return `أخذت ${name}… وراحت عليك ساعة`;
        },
      },
      { label: "خله مكانه", apply: () => "تركته، واللعنة معه" },
    ],
  },
  // ------------------------------------------------------------------ قصر المعزّب
  {
    id: "feast",
    kind: "rest",
    acts: [2],
    name: "سفرة القصر",
    icon: "hot-meal",
    text: "المعزّب مدّ السفرة للّاعبين قبل آخر جولة",
    options: [
      {
        label: "كل وارتاح (+2 ساعة)",
        apply: (run) => {
          const a = run.addLife();
          const b = run.addLife();
          if (a || b) return `ارتحت: +${a && b ? 2 : 1} ساعة`;
          run.addGold(25);
          return "ساعاتك كاملة، فعطاك 25 ريال بدالها";
        },
      },
      {
        label: "كل على السريع وتمرّن (ترقية تحفة)",
        blocked: (run) => (run.canUpgrade() ? undefined : "ما عندك تحفة تترقى"),
        apply: (run) => `ترقّت: ${run.upgradeRandomJoker()}`,
      },
    ],
  },
  {
    id: "honor",
    kind: "gamble",
    acts: [2],
    name: "رهان الشرف",
    icon: "rolling-dices",
    text: "كبير المجلس يراهن بنص اللي معك: يا تضاعفه يا يروح",
    options: [
      {
        label: "راهن بنص ريالاتك",
        blocked: (run) => (run.gold() < 10 ? "ريالاتك ما تكفي" : undefined),
        apply: (run, rand) => {
          const half = Math.floor(run.gold() / 2);
          if (rand() < 0.5) {
            run.addGold(half);
            return `كسبت! +${half} ريال`;
          }
          run.addGold(-half);
          return `خسرت: −${half} ريال`;
        },
      },
      { label: "ما أراهن", apply: () => "ابتسم وقال: عاقل" },
    ],
  },
  // ------------------------------------------------------------------ حكايتك (one per map)
  {
    id: "hara-kids",
    kind: "own",
    character: "hara",
    name: "عيال الحارة",
    icon: "slingshot",
    text: "عيال الحارة يلعبون بورق مقطّع، ويبونك معهم",
    options: [
      {
        label: "العب معهم (تحفة من تحف الحارة، وتروح عليك ساعة)",
        blocked: lastHour,
        apply: (run) => {
          const name = run.grantOwnJoker();
          if (!name) return "ما عندهم شي جديد يعلمونك";
          run.loseLife();
          return `تعلمت منهم: ${name}`;
        },
      },
      {
        label: "وسّم سبعة الهاص بالطُّعم (ببلاش)",
        apply: (run) => (run.stampCard("bait", "H7") ? "سبعة الهاص صارت طُعم" : "سبعة الهاص موسومة بالطُّعم من قبل"),
      },
      { label: "امش", apply: () => "مشيت" },
    ],
  },
  {
    id: "spade-maker",
    kind: "own",
    character: "spade",
    name: "صانع الورق",
    icon: "spade",
    text: "صانع الورق يعرفك: «راعي السبيت! عندي لك شي»",
    options: [
      {
        label: `وسّم إكة السبيت بالمسافرة (−${MAKER_PRICE} ريال)`,
        blocked: noGold(MAKER_PRICE),
        apply: (run) => {
          if (!run.stampCard("travel", "SA")) return "إكة السبيت مسافرة من قبل";
          run.addGold(-MAKER_PRICE);
          return "إكة السبيت بتجيك كل توزيع";
        },
      },
      {
        label: "علّمني (تحفة من تحف السبيت، وتروح عليك ساعة)",
        blocked: lastHour,
        apply: (run) => {
          const name = run.grantOwnJoker();
          if (!name) return "ما عنده شي جديد لك";
          run.loseLife();
          return `عطاك: ${name}`;
        },
      },
      { label: "امش", apply: () => "مشيت" },
    ],
  },
];

/** The events a map deals out (a fresh copy, to shuffle); character events come through OWN_EVENT. */
export function eventsForAct(act: number): EventDef[] {
  return EVENTS.filter((e) => !e.character && (!e.acts || e.acts.includes(act)));
}

/** An event by id; OWN_EVENT resolves to the character's own (or a plain one if it has none). */
export function getEvent(id: string | undefined, character?: string): EventDef | undefined {
  if (id === OWN_EVENT) return EVENTS.find((e) => e.character && e.character === character) ?? EVENTS.find((e) => e.id === "coffee");
  return EVENTS.find((e) => e.id === id);
}
