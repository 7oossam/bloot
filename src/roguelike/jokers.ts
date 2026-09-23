import type { MatchOptions } from "../game/GameController";

export type Rarity = "common" | "rare" | "legendary";

/** Synergy families. Owning several jokers of one family switches on a set bonus. */
export type Tag = "حكم" | "صن" | "ولد" | "ذهب" | "عين" | "سرقة";

export interface ShopItemDef {
  id: string;
  /** "joker" takes a slot and lasts the run; "consumable" is used up on purchase. */
  kind: "joker" | "consumable";
  name: string;
  icon: string;
  /** One line per level; `levels[0]` is what the joker does when first bought. */
  levels: string[];
  cost: number;
  rarity: Rarity;
  tags: Tag[];
  /** Glory it costs to unlock in الديوانية before it can show up in shops; 0 = available from the start. */
  unlockCost: number;
}

/** Kept for existing callers: a joker is just a shop item of kind "joker". */
export type JokerDef = ShopItemDef;

export const JOKER_CATALOG: ShopItemDef[] = [
  {
    id: "head-start",
    kind: "joker",
    name: "بداية قوية",
    icon: "🚀",
    levels: ["تبدأ كل مباراة متقدم بـ 5 أبناط.", "تبدأ متقدم بـ 8 أبناط.", "تبدأ متقدم بـ 12 بنط."],
    cost: 20,
    rarity: "common",
    tags: [],
    unlockCost: 0,
  },
  {
    id: "ard-gold",
    kind: "joker",
    name: "الأرض الذهبية",
    icon: "🏁",
    levels: ["الأرض (آخر أكلة) تسوي 20 بدل 10.", "الأرض تسوي 30.", "الأرض تسوي 40."],
    cost: 20,
    rarity: "common",
    tags: [],
    unlockCost: 0,
  },
  {
    id: "hokum-master",
    kind: "joker",
    name: "سيد الحكم",
    icon: "⚔️",
    levels: ["حكمك الناجح +5 أبناط.", "حكمك الناجح +10.", "حكمك الناجح +15."],
    cost: 25,
    rarity: "common",
    tags: ["حكم"],
    unlockCost: 0,
  },
  {
    id: "royal-sun",
    kind: "joker",
    name: "الصن الملكي",
    icon: "☀️",
    levels: ["صنّكم: أبناطكم ×1.5.", "صنّكم ×1.75.", "صنّكم ×2."],
    cost: 35,
    rarity: "rare",
    tags: ["صن"],
    unlockCost: 0,
  },
  {
    id: "comeback",
    kind: "joker",
    name: "الرجعة",
    icon: "🔥",
    levels: ["إذا الخصم متقدم بـ 15+، كل يد تاخذون +4.", "+6 وأنتم متأخرين.", "+8 وأنتم متأخرين."],
    cost: 20,
    rarity: "common",
    tags: [],
    unlockCost: 0,
  },
  {
    id: "golden-touch",
    kind: "joker",
    name: "اللمسة الذهبية",
    icon: "💰",
    levels: ["كل أكلة لكم فيها إكة = 3 ذهب.", "5 ذهب لكل إكة.", "8 ذهب لكل إكة."],
    cost: 20,
    rarity: "common",
    tags: ["ذهب"],
    unlockCost: 0,
  },
  {
    id: "spy",
    kind: "joker",
    name: "الجاسوس",
    icon: "🕵️",
    levels: ["تشوف ورقة من يد كل خصم.", "تشوف ورقتين من كل خصم.", "تشوف ثلاث أوراق من كل خصم."],
    cost: 25,
    rarity: "common",
    tags: ["عين"],
    unlockCost: 0,
  },
  {
    id: "partner-eyes",
    kind: "joker",
    name: "عين الشريك",
    icon: "👁️",
    levels: ["ورق شريكك مكشوف لك."],
    cost: 30,
    rarity: "rare",
    tags: ["عين"],
    unlockCost: 0,
  },
  {
    id: "lucky-jack",
    kind: "joker",
    name: "الولد المضمون",
    icon: "🃏",
    levels: ["دايم يجيك ولد في أول خمس أوراق.", "دايم يجيك ولدين."],
    cost: 30,
    rarity: "rare",
    tags: ["ولد"],
    unlockCost: 0,
  },
  {
    id: "forged-jack",
    kind: "joker",
    name: "الولد المزوّر",
    icon: "🎭",
    levels: [
      "إذا اشتريت حكم: اختر ورقة من يدك تتحول لولد الحكم — حتى لو عندك الولد.",
      "وتحوّل ورقة ثانية لتسعة الحكم.",
      "ويشتغل كمان إذا شريكك اشترى الحكم.",
    ],
    cost: 40,
    rarity: "rare",
    tags: ["حكم", "ولد"],
    unlockCost: 15,
  },
  {
    id: "jack-hunt",
    kind: "joker",
    name: "صيد الولد",
    icon: "🪝",
    levels: [
      "كل ما أكلت بولد الحكم: بدّل ورقة من يدك بورقة عشوائية من خصم.",
      "الورقة اللي تسحبها تكون حكم إذا عنده.",
      "ويشتغل كمان إذا أكلت بتسعة الحكم.",
    ],
    cost: 35,
    rarity: "rare",
    tags: ["ولد", "سرقة"],
    unlockCost: 15,
  },
  {
    id: "burn",
    kind: "joker",
    name: "الحرقة",
    icon: "🧨",
    levels: [
      "كل ما أكلتوا بولد الحكم: أقوى ورقة حكم عند خصم تحترق وتصير سبعة.",
      "تحترق عند الخصمين الاثنين.",
    ],
    cost: 35,
    rarity: "rare",
    tags: ["حكم", "سرقة"],
    unlockCost: 20,
  },
  {
    id: "jack-collector",
    kind: "joker",
    name: "جامع الأولاد",
    icon: "🎖️",
    levels: ["كل أكلة تاخذونها بولد = +1 بنط.", "+2 لكل أكلة بولد.", "+3 لكل أكلة بولد."],
    cost: 25,
    rarity: "common",
    tags: ["ولد"],
    unlockCost: 10,
  },
  {
    id: "sun-aces",
    kind: "joker",
    name: "إكك الصن",
    icon: "🌞",
    levels: ["في الصن، كل أكلة لكم فيها إكة = +1 بنط.", "+2 لكل إكة في الصن."],
    cost: 25,
    rarity: "common",
    tags: ["صن"],
    unlockCost: 10,
  },
  {
    id: "treasury",
    kind: "joker",
    name: "الخزنة",
    icon: "🏦",
    levels: ["كل متجر: فايدة 1 ذهب لكل 10 معك (حد 5).", "حد الفايدة 8.", "حد الفايدة 12."],
    cost: 20,
    rarity: "common",
    tags: ["ذهب"],
    unlockCost: 10,
  },
  {
    id: "kaboot-king",
    kind: "joker",
    name: "ملك الكبوت",
    icon: "💥",
    levels: ["إذا أكلتوا الثمان أكلات في يد، تفوزون بالمباراة فوراً."],
    cost: 45,
    rarity: "legendary",
    tags: [],
    unlockCost: 25,
  },
];

export const CONSUMABLE_CATALOG: ShopItemDef[] = [
  {
    id: "extra-life",
    kind: "consumable",
    name: "قلب إضافي",
    icon: "❤️",
    levels: ["+1 حياة."],
    cost: 30,
    rarity: "rare",
    tags: [],
    unlockCost: 0,
  },
  {
    id: "shield",
    kind: "consumable",
    name: "الدرع",
    icon: "🛡️",
    levels: ["أول مباراة تخسرها ما تنقص من أرواحك."],
    cost: 20,
    rarity: "common",
    tags: [],
    unlockCost: 0,
  },
];

export function getJokerDef(id: string): ShopItemDef | undefined {
  return JOKER_CATALOG.find((j) => j.id === id) ?? CONSUMABLE_CATALOG.find((c) => c.id === id);
}

export function maxLevel(def: ShopItemDef): number {
  return def.levels.length;
}

/** Price to take an owned joker from `level` to `level + 1`. */
export function upgradeCost(def: ShopItemDef, level: number): number {
  return Math.round(def.cost * (level === 1 ? 1 : 1.5));
}

// ------------------------------------------------------------------ synergies

export interface SynergyTier {
  count: number;
  text: string;
}

/** Set bonuses per tag, switched on by how many distinct jokers of that tag you own. */
export const SYNERGIES: Record<Tag, SynergyTier[]> = {
  حكم: [
    { count: 2, text: "حكمكم الناجح +3 أبناط" },
    { count: 3, text: "حكمكم مقفول: محد يقدر ياخذه صن، و+6 بدل +3" },
  ],
  صن: [{ count: 2, text: "كل صن تشترونه +3 أبناط" }],
  ولد: [
    { count: 2, text: "كل أكلة بولد +1 بنط" },
    { count: 3, text: "كل أكلة بولد +2، ويجيك ولد مضمون" },
  ],
  ذهب: [{ count: 2, text: "خصم ٢٠٪ على أسعار المتجر" }],
  عين: [{ count: 2, text: "الجاسوس يكشف ورقة زيادة (أو ورقة لو ما عندك جاسوس)" }],
  سرقة: [{ count: 2, text: "الصيد والحرقة يشتغلون كمان لما شريكك ياكل بالولد" }],
};

/** Each tag you hold, how many jokers carry it, and the highest tier that's switched on. */
export function activeSynergies(jokerIds: string[]): Array<{ tag: Tag; count: number; tier?: SynergyTier; next?: SynergyTier }> {
  const counts = new Map<Tag, number>();
  for (const id of jokerIds) for (const tag of getJokerDef(id)?.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
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

/** Shop price multiplier from the ذهب synergy. */
export function shopDiscount(jokerIds: string[]): number {
  return tierOf(jokerIds, "ذهب") >= 1 ? 0.8 : 1;
}

// ------------------------------------------------------------------ effects

/**
 * Folds a run's jokers (with their levels) and active synergies into the MatchOptions a
 * node's GameController is built with.
 */
export function matchOptionsFromJokers(jokerIds: string[], levels: Record<string, number> = {}): MatchOptions {
  const o: MatchOptions = {};
  const lv = (id: string) => (jokerIds.includes(id) ? (levels[id] ?? 1) : 0);
  const pick = <T>(id: string, values: T[]): T | undefined => (lv(id) ? values[Math.min(lv(id), values.length) - 1] : undefined);

  const head = pick("head-start", [5, 8, 12]);
  if (head) o.headStart = { 0: head };
  const ard = pick("ard-gold", [20, 30, 40]);
  if (ard) o.lastTrickBonus = ard;

  const hokumMade = pick("hokum-master", [5, 10, 15]);
  if (hokumMade) o.hokumMadeBonus = hokumMade;
  const hokumTier = tierOf(jokerIds, "حكم");
  if (hokumTier >= 2) {
    o.hokumSynergyBonus = 6;
    o.lockedHokum = true;
  } else if (hokumTier >= 1) o.hokumSynergyBonus = 3;

  const sunMult = pick("royal-sun", [1.5, 1.75, 2]);
  if (sunMult) o.sunMultiplier = sunMult;
  if (tierOf(jokerIds, "صن") >= 1) o.sunBuyBonus = 3;
  const sunAce = pick("sun-aces", [1, 2]);
  if (sunAce) o.sunAceBonus = sunAce;

  const comeback = pick("comeback", [4, 6, 8]);
  if (comeback) o.comeback = { deficit: 15, bonus: comeback };

  const gold = pick("golden-touch", [3, 5, 8]);
  if (gold) o.goldPerAceTrick = gold;

  const eyeTier = tierOf(jokerIds, "عين");
  const spy = (pick("spy", [1, 2, 3]) ?? 0) + (eyeTier >= 1 ? 1 : 0);
  if (spy) o.spyCards = spy;
  if (lv("partner-eyes")) o.revealPartner = true;

  const jackTier = tierOf(jokerIds, "ولد");
  const jacks = Math.max(pick("lucky-jack", [1, 2]) ?? 0, jackTier >= 2 ? 1 : 0);
  if (jacks) o.guaranteedJacks = jacks;
  const jackTrick = (pick("jack-collector", [1, 2, 3]) ?? 0) + (jackTier >= 2 ? 2 : jackTier >= 1 ? 1 : 0);
  if (jackTrick) o.jackTrickBonus = jackTrick;

  const forged = lv("forged-jack");
  if (forged) o.forgedJack = { nine: forged >= 2, partnerToo: forged >= 3 };

  const theftTier = tierOf(jokerIds, "سرقة");
  const hunt = lv("jack-hunt");
  if (hunt) o.jackHunt = { preferTrump: hunt >= 2, nineToo: hunt >= 3, partnerToo: theftTier >= 1 };
  const burn = lv("burn");
  if (burn) o.burn = { bothOpponents: burn >= 2, partnerToo: theftTier >= 1 };

  if (lv("kaboot-king")) o.kabootWinsMatch = true;
  return o;
}
