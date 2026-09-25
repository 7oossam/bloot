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
  hasFreeSlot(): boolean;
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
    icon: "☕",
    text: "المعزّب يصب لك قهوة ويسولف معك عن أيام أول",
    options: [
      {
        label: "اشرب فنجالين (+1 حياة)",
        apply: (run) => {
          if (run.addLife()) return "ارتحت: +1 حياة ❤️";
          run.addGold(15);
          return "أرواحك كاملة، فعطاك 15 ذهب بداله";
        },
      },
      { label: "هز الفنجال وامش (+20 ذهب)", apply: (run) => (run.addGold(20), "+20 ذهب 💰") },
    ],
  },
  {
    id: "bet",
    name: "الرهان",
    icon: "🎲",
    text: "واحد بالديوانية يتحداك: رهان على ورقة، يا تكسب يا تخسر",
    options: [
      {
        label: `راهن بـ ${BET} ذهب (يا ${BET_WIN} يا صفر)`,
        blocked: (run) => (run.gold() < BET ? "ذهبك ما يكفي" : undefined),
        apply: (run, rand) => {
          run.addGold(-BET);
          if (rand() < 0.5) {
            run.addGold(BET_WIN);
            return `كسبت! +${BET_WIN} ذهب 🎉`;
          }
          return `خسرت الرهان: −${BET} ذهب`;
        },
      },
      { label: "ما أراهن", apply: () => "تركته وجلست تتقهوى" },
    ],
  },
  {
    id: "elder",
    name: "الشايب الخبير",
    icon: "👴",
    text: "شايب لعب بلوت أربعين سنة، يبي يعلمك شي",
    options: [
      {
        label: "علّمني (ترقية جوكر عشوائي عندك)",
        blocked: (run) => (run.canUpgrade() ? undefined : "ما عندك جوكر يترقى"),
        apply: (run) => `ترقى: ${run.upgradeRandomJoker()} ⬆️`,
      },
      { label: "عطني نصيحة للمباراة الجاية (+10 تبدأ فيها)", apply: (run) => (run.boostNext(10), "تبدأ المباراة الجاية قدامهم بـ 10 ⚡") },
    ],
  },
  {
    id: "stall",
    name: "البسطة",
    icon: "🧺",
    text: "واحد فارش بسطة جوكرات مستعملة، ويشتري بعد",
    options: [
      {
        label: `اشترِ جوكر نادر عشوائي بـ ${STALL_PRICE} ذهب`,
        blocked: (run) => (run.gold() < STALL_PRICE ? "ذهبك ما يكفي" : run.hasFreeSlot() ? undefined : "الخانات مليانة"),
        apply: (run) => {
          const name = run.grantRandomJoker("rare");
          if (!name) return "ما لقى شي يبيعك إياه";
          run.addGold(-STALL_PRICE);
          return `اشتريت ${name}`;
        },
      },
      {
        label: "بع له أرخص جوكر عندك بضعف سعره",
        blocked: (run) => (run.cheapestJoker() ? undefined : "ما عندك جوكر"),
        apply: (run) => {
          const sold = run.sellCheapest(2)!;
          return `بعت ${sold.name} بـ ${sold.gold} ذهب`;
        },
      },
      { label: "امش", apply: () => "مشيت" },
    ],
  },
  {
    id: "cursed",
    name: "الورق الملعون",
    icon: "🃏",
    text: "لقيت ورق قديم في زاوية الديوانية، يقولون ملعون",
    options: [
      {
        label: "خذه (جوكر أسطوري، والخصم الجاي يبدأ قدامك بـ 20)",
        blocked: (run) => (run.hasFreeSlot() ? undefined : "الخانات مليانة"),
        apply: (run) => {
          const name = run.grantRandomJoker("legendary");
          if (!name) return "الورق اختفى";
          run.penalizeNext(20);
          return `أخذت ${name}… والخصم الجاي يبدأ بـ 20`;
        },
      },
      { label: "خله مكانه", apply: () => "تركته، واللعنة معه" },
    ],
  },
  {
    id: "guest",
    name: "الضيف الثقيل",
    icon: "🫖",
    text: "ضيف ثقيل جلس جنبك ويبي يسولف طول الليل",
    options: [
      {
        label: `عزّمه على العشا (−${GUEST_PRICE} ذهب، +1 درع)`,
        blocked: (run) => (run.gold() < GUEST_PRICE ? "ذهبك ما يكفي" : undefined),
        apply: (run) => (run.addGold(-GUEST_PRICE), run.addShield(), "انبسط وعطاك درع 🛡️"),
      },
      { label: "اعتذر منه", apply: (run) => (run.penalizeNext(10), "زعل وراح يشجع خصومك: يبدؤون المباراة الجاية بـ 10") },
    ],
  },
];

export function getEvent(id: string | undefined): EventDef | undefined {
  return EVENTS.find((e) => e.id === id);
}
