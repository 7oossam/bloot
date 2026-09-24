import type { MatchOptions } from "../game/GameController";
import type { Suit } from "../engine/types";

export type Rarity = "common" | "rare" | "legendary";

/** Synergy families. Owning several jokers of one family switches on a set bonus. */
export type Tag = "ولد" | "حكم" | "أرض" | "مشروع" | "حلة" | "سبيت" | "عين" | "سرقة" | "دفاع";

export interface ShopItemDef {
  id: string;
  /**
   * "joker" takes a slot and lasts the run; "consumable" is used up on purchase; "upgrade"
   * improves the run itself (slots, shelf, rerolls, pay) and can be bought up to its levels.
   */
  kind: "joker" | "consumable" | "upgrade";
  name: string;
  icon: string;
  /** One line per level; `levels[0]` is what it does when first bought. */
  levels: string[];
  cost: number;
  /** Upgrades only: the price of each level in turn. */
  costs?: number[];
  rarity: Rarity;
  tags: Tag[];
}

/** Kept for existing callers: a joker is just a shop item of kind "joker". */
export type JokerDef = ShopItemDef;

const joker = (d: Omit<ShopItemDef, "kind">): ShopItemDef => ({ kind: "joker", ...d });

/**
 * The jokers are built around ways of playing, not flat bonuses: each family has a
 * rule-breaker (it changes what the game allows), play-style jokers (they pay for playing a
 * certain way, so you change how you play), and boosters for that style. Committing to a
 * family's third tier hands you its rule-breaker for free.
 *
 * Prices are tuned to the node rewards (20 / 25 / 35 gold for matches, 50 for the elite).
 */
export const JOKER_CATALOG: ShopItemDef[] = [
  joker({
    id: "phantom-card",
    name: "Phantom Card",
    icon: "dY'Z",
    levels: ["3-card Sira counts as 4. 3-of-a-kind counts as 4-of-a-kind (Miya 400)."],
    cost: 35,
    rarity: "legendary",
    tags: []
  }),
  joker({
    id: "trash-beats-ace",
    name: "Underdog",
    icon: "dY~U",
    levels: ["7s and 8s have a hidden +50 strength boost, beating Aces in their tier!"],
    cost: 25,
    rarity: "rare",
    tags: []
  }),
  // ---- الولد: Jacks, and stealing with them
  joker({
    id: "lucky-jack",
    name: "الولد المضمون",
    icon: "🃏",
    levels: ["دايم يجيك ولد في أول خمس أوراق.", "دايم يجيك ولدين."],
    cost: 24,
    rarity: "rare",
    tags: ["ولد"],
  }),
  joker({
    id: "forged-jack",
    name: "الولد المزوّر",
    icon: "🎭",
    levels: [
      "إذا اشتريت حكم: اختر ورقة من يدك تتحول لولد الحكم — حتى لو عندك الولد.",
      "وتحوّل ورقة ثانية لتسعة الحكم.",
      "ويشتغل كمان إذا شريكك اشترى الحكم.",
    ],
    cost: 32,
    rarity: "rare",
    tags: ["حكم", "ولد"],
  }),
  joker({
    id: "jack-hunt",
    name: "صيد الولد",
    icon: "🪝",
    levels: [
      "كل ما أكلت بولد الحكم: بدّل ورقة من يدك بورقة عشوائية من خصم.",
      "الورقة اللي تسحبها تكون حكم إذا عنده.",
      "ويشتغل كمان إذا أكلت بتسعة الحكم.",
    ],
    cost: 28,
    rarity: "rare",
    tags: ["ولد", "سرقة"],
  }),
  joker({
    id: "burn",
    name: "الحرقة",
    icon: "🧨",
    levels: [
      "كل ما أكلتوا بولد الحكم: أقوى ورقة حكم عند خصم تحترق وتصير سبعة.",
      "تحترق عند الخصمين الاثنين.",
    ],
    cost: 30,
    rarity: "rare",
    tags: ["حكم", "سرقة"],
  }),
  joker({
    id: "jack-collector",
    name: "جامع الأولاد",
    icon: "🎖️",
    levels: ["كل أكلة تاخذونها بولد = +2 بنط.", "+3 لكل أكلة بولد.", "+5 لكل أكلة بولد."],
    cost: 12,
    rarity: "common",
    tags: ["ولد"],
  }),

  // ---- الأرض: play the whole hand for the last trick
  joker({
    id: "ground-lord",
    name: "سيد الأرض",
    icon: "🏁",
    levels: ["إذا أكلتوا الأرض (آخر أكلة) = الجولة كلها لكم، حتى لو الخصم أكثر أبناط."],
    cost: 40,
    rarity: "legendary",
    tags: ["أرض"],
  }),
  joker({
    id: "ducker",
    name: "المخلّي",
    icon: "🙈",
    levels: [
      "كل مرة الأكلة للخصم وتقدر تاكلها وتخليها = +2 بنط.",
      "+3 لكل تخلية.",
      "+5 لكل تخلية.",
    ],
    cost: 12,
    rarity: "common",
    tags: ["أرض"],
  }),
  joker({
    id: "last-card",
    name: "الورقة الأخيرة",
    icon: "🎯",
    levels: ["ورقتك في الأرض (آخر أكلة) تصير أكبر ورقة في شكلها."],
    cost: 24,
    rarity: "rare",
    tags: ["أرض"],
  }),
  joker({
    id: "ard-gold",
    name: "الأرض الذهبية",
    icon: "🏆",
    levels: ["الأرض تسوي 20 بدل 10.", "الأرض تسوي 30.", "الأرض تسوي 40."],
    cost: 10,
    rarity: "common",
    tags: ["أرض"],
  }),

  // ---- الحكم: bend who may buy what, and how
  joker({
    id: "bare-hokum",
    name: "الحكم الأعزل",
    icon: "🥷",
    levels: [
      "تشتري حكم وما عندك ولده ولا تسعته، وتنجح = نتيجتكم ×2.",
      "×2.5.",
      "×3.",
    ],
    cost: 22,
    rarity: "rare",
    tags: ["حكم"],
  }),
  joker({
    id: "free-hokum",
    name: "الحكم الحر",
    icon: "🎨",
    levels: ["تقدر تشتري حكم بأي نوع — حتى في الدورة الأولى بغير نوع الأرض."],
    cost: 26,
    rarity: "rare",
    tags: ["حكم"],
  }),
  joker({
    id: "locked-hokum",
    name: "الحكم المقفول",
    icon: "🔒",
    levels: ["حكمكم محد ياخذه صن، ومحد يقدر يدبل عليكم."],
    cost: 14,
    rarity: "common",
    tags: ["حكم", "دفاع"],
  }),
  joker({
    id: "cutter",
    name: "القطّاع",
    icon: "✂️",
    levels: ["في الحكم: كل أكلة تاخذونها بالقطع = +2 بنط.", "+3 لكل قطعة.", "+5 لكل قطعة."],
    cost: 12,
    rarity: "common",
    tags: ["حكم"],
  }),

  // ---- المشاريع: projects that shouldn't count, counting
  joker({
    id: "short-sira",
    name: "نص سرا",
    icon: "🧩",
    levels: ["ورقتين متسلسلة من نفس الشكل = سرا لك."],
    cost: 30,
    rarity: "rare",
    tags: ["مشروع"],
  }),
  joker({
    id: "sira-maker",
    name: "صانع السرا",
    icon: "📐",
    levels: ["كل سرا تسجلونها = +4 بنط و2 ذهب.", "+6 بنط و4 ذهب.", "+9 بنط و6 ذهب."],
    cost: 12,
    rarity: "common",
    tags: ["مشروع"],
  }),
  joker({
    id: "low-fours",
    name: "الأربع الصغار",
    icon: "🎲",
    levels: ["أربع سبعات أو ثمانيات أو تسعات عندك = مئة."],
    cost: 10,
    rarity: "common",
    tags: ["مشروع"],
  }),
  joker({
    id: "project-engineer",
    name: "مهندس المشاريع",
    icon: "🏗️",
    levels: ["مشاريعكم ×2.", "مشاريعكم ×2.5.", "مشاريعكم ×3."],
    cost: 26,
    rarity: "rare",
    tags: ["مشروع"],
  }),
  joker({
    id: "loud-voice",
    name: "الصوت العالي",
    icon: "📢",
    levels: ["مشاريعكم تنحسب دايم — حتى لو مشروع الخصم أكبر."],
    cost: 22,
    rarity: "rare",
    tags: ["مشروع", "دفاع"],
  }),

  // ---- الحلة: who leads, and what leading buys you
  joker({
    id: "first-lead",
    name: "صاحب الحلة",
    icon: "👑",
    levels: ["أنت دايم اللي تحل (تبدأ أول أكلة) — مهما كان الموزع."],
    cost: 28,
    rarity: "rare",
    tags: ["حلة"],
  }),
  joker({
    id: "first-strike",
    name: "الضربة الأولى",
    icon: "⚡",
    levels: ["إذا أكلتوا أول أكلة = +4 بنط.", "+6 بنط.", "+9 بنط."],
    cost: 10,
    rarity: "common",
    tags: ["حلة"],
  }),
  joker({
    id: "oracle",
    name: "العرّاف",
    icon: "🔮",
    levels: ["وقت الشراء تشوف الورقتين اللي بتجيك لو اشتريت."],
    cost: 20,
    rarity: "rare",
    tags: ["حلة", "عين"],
  }),
  joker({
    id: "akka-king",
    name: "ملك الآكه",
    icon: "📣",
    levels: ["كل أكلة تاخذونها بورقة قلتوا عليها آكه = +3 بنط.", "+5 بنط.", "+7 بنط."],
    cost: 12,
    rarity: "common",
    tags: ["حلة"],
  }),

  // ---- السبيت: one suit that plays by your rules
  joker({
    id: "spade-king",
    name: "ملك السبيت",
    icon: "♠️",
    levels: ["السبيت اللي في يدك يعتبر حكم — حتى لو اللعب صن (بس الحكم الحقيقي أقوى منه)."],
    cost: 42,
    rarity: "legendary",
    tags: ["سبيت"],
  }),
  joker({
    id: "spade-thief",
    name: "سارق السبيت",
    icon: "🦊",
    levels: [
      "أول كل جولة: بدّل ورقة من يدك بورقة سبيت من خصم.",
      "تاخذ أكبر سبيت عنده.",
      "مرتين كل جولة.",
    ],
    cost: 26,
    rarity: "rare",
    tags: ["سبيت", "سرقة"],
  }),
  joker({
    id: "spade-always",
    name: "سبيت دايم",
    icon: "🗡️",
    levels: ["تقدر تشتري حكم سبيت في أي دورة، مهما كانت ورقة الأرض."],
    cost: 12,
    rarity: "common",
    tags: ["سبيت"],
  }),
  joker({
    id: "spade-treasure",
    name: "كنز السبيت",
    icon: "💎",
    levels: ["كل أكلة تاخذونها بسبيت = +2 بنط.", "+3 بنط.", "+5 بنط."],
    cost: 10,
    rarity: "common",
    tags: ["سبيت"],
  }),

  // ---- العين: see what you shouldn't
  joker({
    id: "spy",
    name: "الجاسوس",
    icon: "🕵️",
    levels: ["تشوف ورقة من يد كل خصم.", "تشوف ورقتين من كل خصم.", "تشوف ثلاث أوراق من كل خصم."],
    cost: 14,
    rarity: "common",
    tags: ["عين"],
  }),
  joker({
    id: "partner-eyes",
    name: "عين الشريك",
    icon: "👁️",
    levels: ["ورق شريكك مكشوف لك."],
    cost: 22,
    rarity: "rare",
    tags: ["عين"],
  }),

  // ---- الدفاع: win on their buys and their doubles
  joker({
    id: "trap",
    name: "الفخ",
    icon: "🪤",
    levels: ["إذا الخصم اشترى وطلعت خسرانة: +6 أبناط لكم.", "+10 أبناط.", "+15 بنط."],
    cost: 14,
    rarity: "common",
    tags: ["دفاع"],
  }),
  joker({
    id: "qahwaji",
    name: "القهوجي",
    icon: "☕",
    levels: ["تكسبون يد مدبّلة: نتيجتكم +50٪.", "+100٪."],
    cost: 26,
    rarity: "rare",
    tags: ["دفاع"],
  }),

  // ---- build-makers and the rest
  joker({
    id: "kaboot-king",
    name: "ملك الكبوت",
    icon: "💥",
    levels: ["إذا أكلتوا الثمان أكلات في يد، تفوزون بالمباراة فوراً."],
    cost: 40,
    rarity: "legendary",
    tags: [],
  }),
  joker({
    id: "wild",
    name: "الوايلد",
    icon: "🌈",
    levels: ["يُحسب من كل عائلة عندك فيها جوكر — يقرّبك من كل تآزر."],
    cost: 24,
    rarity: "rare",
    tags: [],
  }),
  joker({
    id: "chief",
    name: "شيخ القبيلة",
    icon: "🧔",
    levels: ["كل يد تكسبونها: +1 بنط لكل جوكر في أكبر عائلة عندك.", "+2 لكل جوكر في أكبر عائلة."],
    cost: 26,
    rarity: "rare",
    tags: [],
  }),
  joker({
    id: "maestro",
    name: "المايسترو",
    icon: "🎼",
    levels: ["كل يد تكسبونها: +2 بنط لكل تآزر مفعّل عندك.", "+3 لكل تآزر مفعّل."],
    cost: 36,
    rarity: "legendary",
    tags: [],
  }),
  joker({
    id: "copycat",
    name: "النسخة",
    icon: "📜",
    levels: ["تنسخ مفعول الجوكر اللي على يمينها في صفّك — ترتيبك يفرق."],
    cost: 38,
    rarity: "legendary",
    tags: [],
  }),
  joker({
    id: "treasury",
    name: "الخزنة",
    icon: "🏦",
    levels: ["كل متجر: فايدة 1 ذهب لكل 10 معك (حد 5).", "حد الفايدة 8.", "حد الفايدة 12."],
    cost: 12,
    rarity: "common",
    tags: [],
  }),
];

export const CONSUMABLE_CATALOG: ShopItemDef[] = [
  { id: "extra-life", kind: "consumable", name: "قلب إضافي", icon: "❤️", levels: ["+1 حياة."], cost: 22, rarity: "rare", tags: [] },
  {
    id: "shield",
    kind: "consumable",
    name: "الدرع",
    icon: "🛡️",
    levels: ["أول مباراة تخسرها ما تنقص من أرواحك."],
    cost: 12,
    rarity: "common",
    tags: [],
  },
  {
    id: "boost",
    kind: "consumable",
    name: "دفعة",
    icon: "⚡",
    levels: ["المباراة الجاية تبدأونها متقدمين بـ 10 أبناط."],
    cost: 8,
    rarity: "common",
    tags: [],
  },
  {
    id: "upgrade-ticket",
    kind: "consumable",
    name: "تذكرة ترقية",
    icon: "🎟️",
    levels: ["يرقّي جوكر عشوائي عندك مستوى واحد ببلاش."],
    cost: 16,
    rarity: "rare",
    tags: [],
  },
];

/** Run upgrades — what used to be bought with glory in الديوانية, now bought with gold. */
export const UPGRADE_CATALOG: ShopItemDef[] = [
  {
    id: "joker-slot",
    kind: "upgrade",
    name: "جيب زيادة",
    icon: "🎒",
    levels: ["+1 خانة جوكر.", "+1 خانة ثانية."],
    cost: 30,
    costs: [30, 45],
    rarity: "rare",
    tags: [],
  },
  {
    id: "shop-slot",
    kind: "upgrade",
    name: "بسطة أكبر",
    icon: "🛒",
    levels: ["المتجر يعرض جوكر زيادة."],
    cost: 20,
    costs: [20],
    rarity: "common",
    tags: [],
  },
  {
    id: "cheap-reroll",
    kind: "upgrade",
    name: "بياع صاحبك",
    icon: "🎲",
    levels: ["تغيير البضاعة يبدأ بـ 1 ذهب ويزيد 1 بس."],
    cost: 12,
    costs: [12],
    rarity: "common",
    tags: [],
  },
  {
    id: "salary",
    kind: "upgrade",
    name: "الراتب",
    icon: "💼",
    levels: ["+4 ذهب مع كل مباراة تفوزها.", "+8 ذهب مع كل فوز."],
    cost: 15,
    costs: [15, 25],
    rarity: "common",
    tags: [],
  },
  {
    id: "vip",
    kind: "upgrade",
    name: "زبون مميز",
    icon: "🏷️",
    levels: ["خصم 15٪ على كل شي في المتجر."],
    cost: 22,
    costs: [22],
    rarity: "rare",
    tags: [],
  },
];

export function getJokerDef(id: string): ShopItemDef | undefined {
  return (
    JOKER_CATALOG.find((j) => j.id === id) ??
    CONSUMABLE_CATALOG.find((c) => c.id === id) ??
    UPGRADE_CATALOG.find((u) => u.id === id)
  );
}

export function maxLevel(def: ShopItemDef): number {
  return def.levels.length;
}

/** Price to take an owned joker from `level` to `level + 1` — cheaper than a new joker at first. */
export function upgradeCost(def: ShopItemDef, level: number): number {
  return Math.round(def.cost * (level === 1 ? 0.75 : 1.1));
}

/** What selling an owned joker gives back: half of what it's worth at its level. */
export function sellPrice(def: ShopItemDef, level: number): number {
  let paid = def.cost;
  for (let l = 1; l < level; l++) paid += upgradeCost(def, l);
  return Math.max(1, Math.floor(paid / 2));
}

// ------------------------------------------------------------------ synergies

export interface SynergyTier {
  count: number;
  text: string;
}

/** Set bonuses per tag, switched on by how many distinct jokers of that tag you own. */
export const SYNERGIES: Record<Tag, SynergyTier[]> = {
  ولد: [
    { count: 2, text: "كل أكلة بولد +1 بنط" },
    { count: 3, text: "كل أكلة بولد +2، ويجيك ولد مضمون" },
  ],
  حكم: [
    { count: 2, text: "حكمكم الناجح +4 أبناط" },
    { count: 3, text: "كسر قانون: تشترون حكم بأي نوع في أي دورة" },
  ],
  أرض: [
    { count: 2, text: "الأرض +10" },
    { count: 3, text: "كسر قانون: ورقتك في الأرض أكبر ورقة في شكلها" },
  ],
  مشروع: [
    { count: 2, text: "كل يد تسجلون فيها مشروع +3 أبناط" },
    { count: 3, text: "كسر قانون: السرا بورقتين" },
  ],
  حلة: [
    { count: 2, text: "أول أكلة لكم +3 أبناط" },
    { count: 3, text: "كسر قانون: أنت دايم اللي تحل" },
  ],
  سبيت: [
    { count: 2, text: "كل أكلة بسبيت +1 بنط" },
    { count: 3, text: "كسر قانون: السبيت اللي في يدك حكم" },
  ],
  عين: [{ count: 2, text: "الجاسوس يكشف ورقة زيادة (أو ورقة لو ما عندك جاسوس)" }],
  سرقة: [{ count: 2, text: "الصيد والحرقة يشتغلون كمان لما شريكك ياكل بالولد" }],
  دفاع: [
    { count: 2, text: "خسرانة الخصم +4 أبناط لكم" },
    { count: 3, text: "كسر قانون: محد يقدر يدبل عليكم" },
  ],
};

/** Each tag you hold, how many jokers carry it, and the highest tier that's switched on. */
export function activeSynergies(jokerIds: string[]): Array<{ tag: Tag; count: number; tier?: SynergyTier; next?: SynergyTier }> {
  const counts = new Map<Tag, number>();
  for (const id of jokerIds) for (const tag of getJokerDef(id)?.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  // الوايلد joins every family you've already started.
  if (jokerIds.includes("wild")) for (const [tag, n] of counts) counts.set(tag, n + 1);
  return [...counts.entries()].map(([tag, count]) => {
    const tiers = SYNERGIES[tag];
    const tier = [...tiers].reverse().find((t) => count >= t.count);
    const next = tiers.find((t) => count < t.count);
    return { tag, count, tier, next };
  });
}

function tierOf(jokerIds: string[], tag: Tag): number {
  const s = activeSynergies(jokerIds).find((x) => x.tag === tag);
  if (!s?.tier) return 0;
  return SYNERGIES[tag].indexOf(s.tier) + 1;
}

// ------------------------------------------------------------------ effects

/**
 * Folds a run's jokers (with their levels) and active synergies into the MatchOptions a
 * node's GameController is built with.
 */
export interface RunContext {
  /** Run-long joker counters (الحصالة's growth). */
  counters?: Record<string, number>;
  /** Gold held when the match starts (الصراف counts it). */
  gold?: number;
}

export function matchOptionsFromJokers(jokerIds: string[], levels: Record<string, number> = {}, ctx: RunContext = {}): MatchOptions {
  const own = baseOptions(jokerIds, levels, ctx);
  // النسخة copies the joker on its right in your row — the one bought just before it.
  const at = jokerIds.indexOf("copycat");
  const target = at > 0 ? jokerIds[at - 1] : undefined;
  if (!target || target === "copycat") return own;
  const copied = baseOptions([target], levels, ctx);
  return mergeOptions(own, copied);
}

/** Numbers add (a multiplier adds its excess over 1), flags OR, nested objects merge the same way. */
const MULTIPLIERS = new Set(["sunMultiplier", "projectMultiplier", "gamblerMultiplier"]);
function mergeOptions(a: MatchOptions, b: MatchOptions): MatchOptions {
  const out: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const mine = out[key];
    if (mine === undefined) out[key] = value;
    else if (typeof value === "number" && typeof mine === "number") out[key] = MULTIPLIERS.has(key) ? mine + value - 1 : mine + value;
    else if (typeof value === "boolean") out[key] = !!mine || value;
    else if (Array.isArray(value) && Array.isArray(mine)) out[key] = [...mine, ...value];
    else if (value && typeof value === "object" && mine && typeof mine === "object") {
      const merged: Record<string, unknown> = { ...(mine as object) };
      for (const [k, v] of Object.entries(value as object)) {
        const m = merged[k];
        merged[k] = typeof v === "number" && typeof m === "number" ? m + v : typeof v === "boolean" ? !!m || v : (m ?? v);
      }
      out[key] = merged;
    }
  }
  return out as MatchOptions;
}

function baseOptions(jokerIds: string[], levels: Record<string, number>, _ctx: RunContext): MatchOptions {
  const o: MatchOptions = {};
  if (lv("phantom-card")) o.phantomProjects = true;
  if (lv("trash-beats-ace")) o.trashBeatsAce = true;
  const lv = (id: string) => (jokerIds.includes(id) ? (levels[id] ?? 1) : 0);
  const pick = <T>(id: string, values: T[]): T | undefined => (lv(id) ? values[Math.min(lv(id), values.length) - 1] : undefined);
  const tier = (tag: Tag) => tierOf(jokerIds, tag);

  // ---- الولد
  const jackTier = tier("ولد");
  const jacks = Math.max(pick("lucky-jack", [1, 2]) ?? 0, jackTier >= 2 ? 1 : 0);
  if (jacks) o.guaranteedJacks = jacks;
  const jackTrick = (pick("jack-collector", [2, 3, 5]) ?? 0) + (jackTier >= 2 ? 2 : jackTier >= 1 ? 1 : 0);
  if (jackTrick) o.jackTrickBonus = jackTrick;
  const forged = lv("forged-jack");
  if (forged) o.forgedJack = { nine: forged >= 2, partnerToo: forged >= 3 };
  const theftTier = tier("سرقة");
  const hunt = lv("jack-hunt");
  if (hunt) o.jackHunt = { preferTrump: hunt >= 2, nineToo: hunt >= 3, partnerToo: theftTier >= 1 };
  const burn = lv("burn");
  if (burn) o.burn = { bothOpponents: burn >= 2, partnerToo: theftTier >= 1 };

  // ---- الأرض
  const groundTier = tier("أرض");
  const ard = (pick("ard-gold", [20, 30, 40]) ?? 10) + (groundTier >= 1 ? 10 : 0);
  if (ard !== 10) o.lastTrickBonus = ard;
  if (lv("ground-lord")) o.groundWins = true;
  const duck = pick("ducker", [2, 3, 5]);
  if (duck) o.duckBonus = duck;
  if (lv("last-card") || groundTier >= 2) o.lastCardTop = true;

  // ---- الحكم
  const hokumTier = tier("حكم");
  if (hokumTier >= 1) o.hokumSynergyBonus = 4;
  const bare = pick("bare-hokum", [2, 2.5, 3]);
  if (bare) o.bareHokumMultiplier = bare;
  const suits = new Set<Suit>();
  if (lv("free-hokum") || hokumTier >= 2) for (const x of ["S", "H", "D", "C"] as Suit[]) suits.add(x);
  if (lv("spade-always")) suits.add("S");
  if (suits.size) o.extraHokumSuits = [...suits];
  if (lv("locked-hokum")) {
    o.lockedHokum = true;
    o.noDoubleAgainst = true;
  }
  const cut = pick("cutter", [2, 3, 5]);
  if (cut) o.ruffBonus = cut;

  // ---- المشاريع
  const projectTier = tier("مشروع");
  if (lv("short-sira") || projectTier >= 2) o.shortSira = true;
  const sira = pick("sira-maker", [
    { points: 4, gold: 2 },
    { points: 6, gold: 4 },
    { points: 9, gold: 6 },
  ]);
  if (sira) o.siraBonus = sira;
  if (lv("low-fours")) o.lowFours = true;
  const projects = pick("project-engineer", [2, 2.5, 3]);
  if (projects) o.projectMultiplier = projects;
  if (lv("loud-voice")) o.projectsAlwaysCount = true;
  if (projectTier >= 1) o.projectSynergyBonus = 3;

  // ---- الحلة
  const leadTier = tier("حلة");
  if (lv("first-lead") || leadTier >= 2) o.alwaysLead = true;
  const strike = (pick("first-strike", [4, 6, 9]) ?? 0) + (leadTier >= 1 ? 3 : 0);
  if (strike) o.firstTrickBonus = strike;
  if (lv("oracle")) o.oracle = true;
  const akka = pick("akka-king", [3, 5, 7]);
  if (akka) o.akkaTrickBonus = akka;

  // ---- السبيت
  const spadeTier = tier("سبيت");
  if (lv("spade-king") || spadeTier >= 2) o.personalTrump = "S";
  const thief = lv("spade-thief");
  if (thief) o.spadeThief = { best: thief >= 2, twice: thief >= 3 };
  const treasure = (pick("spade-treasure", [2, 3, 5]) ?? 0) + (spadeTier >= 1 ? 1 : 0);
  if (treasure) o.suitTrickBonus = { suit: "S", points: treasure };

  // ---- العين
  const eyeTier = tier("عين");
  const spy = (pick("spy", [1, 2, 3]) ?? 0) + (eyeTier >= 1 ? 1 : 0);
  if (spy) o.spyCards = spy;
  if (lv("partner-eyes")) o.revealPartner = true;

  // ---- الدفاع
  const defenseTier = tier("دفاع");
  const trap = (pick("trap", [6, 10, 15]) ?? 0) + (defenseTier >= 1 ? 4 : 0);
  if (trap) o.rivalLossBonus = trap;
  const qahwa = pick("qahwaji", [0.5, 1]);
  if (qahwa) o.doubleWinBonus = qahwa;
  if (defenseTier >= 2) o.noDoubleAgainst = true;

  // ---- the rest
  if (lv("kaboot-king")) o.kabootWinsMatch = true;
  const winBonuses: Array<{ label: string; points: number }> = [];
  const chief = pick("chief", [1, 2]);
  if (chief) {
    const biggest = Math.max(0, ...activeSynergies(jokerIds).map((x) => x.count));
    if (biggest) winBonuses.push({ label: "شيخ القبيلة", points: chief * biggest });
  }
  const maestro = pick("maestro", [2, 3]);
  if (maestro) {
    const tiers = activeSynergies(jokerIds).reduce((n, x) => n + (x.tier ? SYNERGIES[x.tag].indexOf(x.tier) + 1 : 0), 0);
    if (tiers) winBonuses.push({ label: "المايسترو", points: maestro * tiers });
  }
  if (winBonuses.length) o.winBonuses = winBonuses;
  return o;
}


