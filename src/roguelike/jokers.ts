import type { MatchOptions } from "../game/GameController";

export type Rarity = "common" | "rare" | "legendary";

export interface ShopItemDef {
  id: string;
  /** "joker" takes one of the run's joker slots and lasts the whole run; "consumable" is used up on purchase. */
  kind: "joker" | "consumable";
  name: string;
  icon: string;
  description: string;
  cost: number;
  rarity: Rarity;
}

/** Kept for existing callers: a joker is just a shop item of kind "joker". */
export type JokerDef = ShopItemDef;

/**
 * Every joker hooks into a MatchOptions field that GameController / TableScene read, so a
 * joker is data here plus one well-tested effect there. "الأرض" is the last trick's bonus.
 */
export const JOKER_CATALOG: ShopItemDef[] = [
  {
    id: "head-start",
    kind: "joker",
    name: "بداية قوية",
    icon: "🚀",
    description: "فريقك يبدأ كل مباراة متقدم بـ 5 أبناط.",
    cost: 20,
    rarity: "common",
  },
  {
    id: "ard-gold",
    kind: "joker",
    name: "الأرض الذهبية",
    icon: "🏁",
    description: "الأرض (آخر أكلة) تسوي 20 بدل 10.",
    cost: 20,
    rarity: "common",
  },
  {
    id: "ard-giant",
    kind: "joker",
    name: "أرض العمالقة",
    icon: "🗿",
    description: "الأرض تسوي 40 بدل 10.",
    cost: 35,
    rarity: "rare",
  },
  {
    id: "hokum-master",
    kind: "joker",
    name: "سيد الحكم",
    icon: "⚔️",
    description: "إذا اشتريتوا حكم وجبتوه، +5 أبناط.",
    cost: 25,
    rarity: "common",
  },
  {
    id: "royal-sun",
    kind: "joker",
    name: "الصن الملكي",
    icon: "☀️",
    description: "إذا اشتريتوا صن، أبناطكم في اليد ×1.5.",
    cost: 35,
    rarity: "rare",
  },
  {
    id: "comeback",
    kind: "joker",
    name: "الرجعة",
    icon: "🔥",
    description: "إذا الخصم متقدم عليكم بـ 15 أو أكثر، كل يد تاخذون +4 أبناط.",
    cost: 20,
    rarity: "common",
  },
  {
    id: "golden-touch",
    kind: "joker",
    name: "اللمسة الذهبية",
    icon: "💰",
    description: "كل أكلة تاخذونها فيها إكة (A) تعطيك 3 ذهب.",
    cost: 20,
    rarity: "common",
  },
  {
    id: "spy",
    kind: "joker",
    name: "الجاسوس",
    icon: "🕵️",
    description: "تشوف ورقة من يد كل خصم.",
    cost: 25,
    rarity: "common",
  },
  {
    id: "partner-eyes",
    kind: "joker",
    name: "عين الشريك",
    icon: "👁️",
    description: "ورق شريكك مكشوف لك طول اللعب.",
    cost: 30,
    rarity: "rare",
  },
  {
    id: "lucky-jack",
    kind: "joker",
    name: "الولد المضمون",
    icon: "🃏",
    description: "دايم يجيك ولد (J) في أول خمس أوراق.",
    cost: 30,
    rarity: "rare",
  },
  {
    id: "kaboot-king",
    kind: "joker",
    name: "ملك الكبوت",
    icon: "💥",
    description: "إذا أكلتوا الثمان أكلات كلها في يد، تفوزون بالمباراة فوراً.",
    cost: 45,
    rarity: "legendary",
  },
];

export const CONSUMABLE_CATALOG: ShopItemDef[] = [
  {
    id: "extra-life",
    kind: "consumable",
    name: "قلب إضافي",
    icon: "❤️",
    description: "+1 حياة.",
    cost: 30,
    rarity: "rare",
  },
  {
    id: "shield",
    kind: "consumable",
    name: "الدرع",
    icon: "🛡️",
    description: "أول مباراة تخسرها ما تنقص من أرواحك.",
    cost: 20,
    rarity: "common",
  },
];

export function getJokerDef(id: string): ShopItemDef | undefined {
  return JOKER_CATALOG.find((j) => j.id === id) ?? CONSUMABLE_CATALOG.find((c) => c.id === id);
}

/** Folds a run's owned jokers into the MatchOptions a node's GameController is built with. */
export function matchOptionsFromJokers(jokerIds: string[]): MatchOptions {
  const options: MatchOptions = {};
  const has = (id: string) => jokerIds.includes(id);

  if (has("head-start")) options.headStart = { 0: 5 };
  // The stronger "الأرض" joker wins if both are owned.
  if (has("ard-giant")) options.lastTrickBonus = 40;
  else if (has("ard-gold")) options.lastTrickBonus = 20;
  if (has("hokum-master")) options.hokumMadeBonus = 5;
  if (has("royal-sun")) options.sunMultiplier = 1.5;
  if (has("comeback")) options.comeback = { deficit: 15, bonus: 4 };
  if (has("golden-touch")) options.goldPerAceTrick = 3;
  if (has("spy")) options.spy = true;
  if (has("partner-eyes")) options.revealPartner = true;
  if (has("lucky-jack")) options.guaranteeJack = true;
  if (has("kaboot-king")) options.kabootWinsMatch = true;
  return options;
}
