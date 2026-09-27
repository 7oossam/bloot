/**
 * الديوانية: a map node with a short scene and a choice (the design bible, PART 7). Some
 * choices are safe, some are a gamble, some cost you now for something later.
 */

/** What an event may do to the run — RunController implements it. */
export interface EventRun {
  gold(): number;
  addGold(amount: number): void;
  /** +1 life, or false if you're already at the most. */
  addLife(): boolean;
  addShield(): void;
  /** Start the next match this far ahead. */
  boostNext(points: number): void;
  /** The opponents start the next match this far ahead. */
  penalizeNext(points: number): void;
  /** A random joker of this rarity you don't own; its name, or undefined if none could be given. */
  grantRandomJoker(rarity: "rare" | "legendary"): string | undefined;
  canUpgrade(): boolean;
  /** Levels up a random joker you own; its name. */
  upgradeRandomJoker(): string | undefined;
  /** Your cheapest joker to sell, for this many times its price; its name and the gold. */
  cheapestJoker(): { name: string; value: number } | undefined;
  sellCheapest(times: number): { name: string; gold: number } | undefined;
}

export interface EventOption {
  label: string;
  /** Why it can't be picked right now, if it can't. */
  blocked?: (run: EventRun) => string | undefined;
  /** Does it; returns what happened, for the player to read. */
  apply: (run: EventRun, rand: () => number) => string;
}

export interface EventDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  options: EventOption[];
}

const BET = 20;
const BET_WIN = 45;
const STALL_PRICE = 30;
const GUEST_PRICE = 15;

export const EVENTS: EventDef[] = [
  {
    id: "coffee",
    name: "فنجال المعزّب",
    icon: "coffee-cup",
    text: "المعزّب يصب لك قهوة ويسولف معك عن أيام أول",
    options: [
      {
        label: "اشرب فنجالين (+1 ساعة)",
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
    name: "رهان الزقاق",
    icon: "rolling-dices",
    text: "واحد بالزقاق يتحداك: رهان على ورقة، يا تكسب يا تخسر",
    options: [
      {
        label: `راهن بـ ${BET} ريال (يا ${BET_WIN} يا صفر)`,
        blocked: (run) => (run.gold() < BET ? "ريالاتك ما تكفي" : undefined),
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
    id: "elder",
    name: "شايب على الدكّة",
    icon: "prayer-beads",
    text: "شايب لعب بلوت أربعين سنة، يبي يعلمك شي",
    options: [
      {
        label: "علّمني (ترقية تحفة عشوائية عندك)",
        blocked: (run) => (run.canUpgrade() ? undefined : "ما عندك تحفة تترقى"),
        apply: (run) => `ترقّت: ${run.upgradeRandomJoker()}`,
      },
      { label: "عطني نصيحة للمباراة الجاية (+10 تبدأ فيها)", apply: (run) => (run.boostNext(10), "تبدأ الصكّة الجاية قدامهم بـ 10") },
    ],
  },
  {
    id: "stall",
    name: "بسطة آخر الليل",
    icon: "basket",
    text: "واحد فارش بسطة تحف مستعملة، ويشتري بعد",
    options: [
      {
        label: `اشترِ تحفة نادرة عشوائية بـ ${STALL_PRICE} ريال`,
        blocked: (run) => (run.gold() < STALL_PRICE ? "ريالاتك ما تكفي" : undefined),
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
    id: "cursed",
    name: "الورق الملعون",
    icon: "card-random",
    text: "لقيت ورق قديم في زاوية الزقاق، يقولون ملعون",
    options: [
      {
        label: "خذه (تحفة أسطورية، والمرهون الجاي يبدأ قدامك بـ 20)",
        apply: (run) => {
          const name = run.grantRandomJoker("legendary");
          if (!name) return "الورق اختفى";
          run.penalizeNext(20);
          return `أخذت ${name}… والمرهون الجاي يبدأ بـ 20`;
        },
      },
      { label: "خله مكانه", apply: () => "تركته، واللعنة معه" },
    ],
  },
  {
    id: "guest",
    name: "الضيف الثقيل",
    icon: "hot-meal",
    text: "ضيف ثقيل جلس جنبك ويبي يسولف طول الليل",
    options: [
      {
        label: `عزّمه على العشا (−${GUEST_PRICE} ريال، +1 درع)`,
        blocked: (run) => (run.gold() < GUEST_PRICE ? "ريالاتك ما تكفي" : undefined),
        apply: (run) => (run.addGold(-GUEST_PRICE), run.addShield(), "انبسط وعطاك درع"),
      },
      { label: "اعتذر منه", apply: (run) => (run.penalizeNext(10), "زعل وراح يشجع المرهونين: يبدؤون الصكّة الجاية بـ 10") },
    ],
  },
];

export function getEvent(id: string | undefined): EventDef | undefined {
  return EVENTS.find((e) => e.id === id);
}
