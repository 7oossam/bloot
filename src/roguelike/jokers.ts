import type { MatchOptions } from "../game/GameController";

export type Rarity = "common" | "rare" | "legendary";

/** Synergy families. Owning several jokers of one family switches on a set bonus. */
export type Tag = "حكم" | "صن" | "ولد" | "ذهب" | "عين" | "سرقة" | "مشروع" | "دفاع";

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
 * Prices are tuned to the node rewards (20 / 25 / 35 gold for matches, 50 for the elite): the
 * first shop affords two commons or a rare, and a common's next level costs less than a new
 * joker, so levelling up is a real choice rather than a trap.
 */
export const JOKER_CATALOG: ShopItemDef[] = [
  joker({
    id: "head-start",
    name: "بداية قوية",
    icon: "🚀",
    levels: ["تبدأ كل مباراة متقدم بـ 5 أبناط.", "تبدأ متقدم بـ 9 أبناط.", "تبدأ متقدم بـ 14 بنط."],
    cost: 12,
    rarity: "common",
    tags: [],
  }),
  joker({
    id: "ard-gold",
    name: "الأرض الذهبية",
    icon: "🏁",
    levels: ["الأرض (آخر أكلة) تسوي 20 بدل 10.", "الأرض تسوي 30.", "الأرض تسوي 40."],
    cost: 12,
    rarity: "common",
    tags: [],
  }),
  joker({
    id: "hokum-master",
    name: "سيد الحكم",
    icon: "⚔️",
    levels: ["حكمك الناجح +5 أبناط.", "حكمك الناجح +10.", "حكمك الناجح +15."],
    cost: 14,
    rarity: "common",
    tags: ["حكم"],
  }),
  joker({
    id: "royal-sun",
    name: "الصن الملكي",
    icon: "☀️",
    levels: ["صنّكم: أبناطكم ×1.5.", "صنّكم ×1.75.", "صنّكم ×2."],
    cost: 28,
    rarity: "rare",
    tags: ["صن"],
  }),
  joker({
    id: "comeback",
    name: "الرجعة",
    icon: "🔥",
    levels: ["إذا الخصم متقدم بـ 15+، كل يد تاخذون +4.", "+7 وأنتم متأخرين.", "+10 وأنتم متأخرين."],
    cost: 12,
    rarity: "common",
    tags: ["دفاع"],
  }),
  joker({
    id: "golden-touch",
    name: "اللمسة الذهبية",
    icon: "💰",
    levels: ["كل أكلة لكم فيها إكة = 2 ذهب.", "4 ذهب لكل إكة.", "6 ذهب لكل إكة."],
    cost: 14,
    rarity: "common",
    tags: ["ذهب"],
  }),
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
    levels: ["كل أكلة تاخذونها بولد = +1 بنط.", "+2 لكل أكلة بولد.", "+3 لكل أكلة بولد."],
    cost: 14,
    rarity: "common",
    tags: ["ولد"],
  }),
  joker({
    id: "sun-aces",
    name: "إكك الصن",
    icon: "🌞",
    levels: ["في الصن، كل أكلة لكم فيها إكة = +1 بنط.", "+2 لكل إكة في الصن."],
    cost: 14,
    rarity: "common",
    tags: ["صن"],
  }),
  joker({
    id: "treasury",
    name: "الخزنة",
    icon: "🏦",
    levels: ["كل متجر: فايدة 1 ذهب لكل 10 معك (حد 5).", "حد الفايدة 8.", "حد الفايدة 12."],
    cost: 12,
    rarity: "common",
    tags: ["ذهب"],
  }),
  joker({
    id: "kaboot-king",
    name: "ملك الكبوت",
    icon: "💥",
    levels: ["إذا أكلتوا الثمان أكلات في يد، تفوزون بالمباراة فوراً."],
    cost: 40,
    rarity: "legendary",
    tags: [],
  }),
  // ---- added with the shop rework
  joker({
    id: "project-engineer",
    name: "مهندس المشاريع",
    icon: "🏗️",
    levels: ["مشاريعكم (سرا، خمسين، مئة…) ×2.", "مشاريعكم ×2.5.", "مشاريعكم ×3."],
    cost: 26,
    rarity: "rare",
    tags: ["مشروع"],
  }),
  joker({
    id: "royal-baloot",
    name: "البلوت الملكي",
    icon: "👑",
    levels: ["بلوتكم +4 أبناط و4 ذهب.", "+6 أبناط و6 ذهب.", "+9 أبناط و9 ذهب."],
    cost: 12,
    rarity: "common",
    tags: ["مشروع", "حكم"],
  }),
  joker({
    id: "ground-keeper",
    name: "حارس الأرض",
    icon: "🏰",
    levels: ["كل ما أكلتوا الأرض (آخر أكلة) = 4 ذهب.", "6 ذهب.", "9 ذهب."],
    cost: 10,
    rarity: "common",
    tags: ["ذهب"],
  }),
  joker({
    id: "trap",
    name: "الفخ",
    icon: "🪤",
    levels: ["إذا الخصم اشترى وطلعت خسرانة: +5 أبناط لكم.", "+8 أبناط.", "+12 بنط."],
    cost: 14,
    rarity: "common",
    tags: ["دفاع"],
  }),
  joker({
    id: "qahwaji",
    name: "القهوجي",
    icon: "☕",
    levels: ["تكسبون يد مدبّلة: نتيجتكم +50٪.", "+100٪ — الدبل يصير مضاعف مرتين."],
    cost: 26,
    rarity: "rare",
    tags: ["دفاع"],
  }),
  joker({
    id: "akka-gold",
    name: "ذهب الآكه",
    icon: "🪙",
    levels: ["كل آكه تقولونها = 3 ذهب.", "5 ذهب.", "7 ذهب."],
    cost: 10,
    rarity: "common",
    tags: ["ذهب", "حكم"],
  }),
  joker({
    id: "patience",
    name: "الصبر مفتاح",
    icon: "🧘",
    levels: ["كل يد تخسرونها = 3 ذهب.", "5 ذهب.", "8 ذهب."],
    cost: 10,
    rarity: "common",
    tags: ["ذهب", "دفاع"],
  }),
  joker({
    id: "golden-kaboot",
    name: "الكبوت الذهبي",
    icon: "🌟",
    levels: ["كبوتكم: +15 بنط و15 ذهب.", "+25 بنط و25 ذهب."],
    cost: 22,
    rarity: "rare",
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
  مشروع: [{ count: 2, text: "كل يد تسجلون فيها مشروع +3 أبناط" }],
  دفاع: [
    { count: 2, text: "خسرانة الخصم +4 أبناط لكم" },
    { count: 3, text: "خسرانة الخصم +8، وكل يد تخسرونها +2 ذهب" },
  ],
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

  const head = pick("head-start", [5, 9, 14]);
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

  const comeback = pick("comeback", [4, 7, 10]);
  if (comeback) o.comeback = { deficit: 15, bonus: comeback };

  const gold = pick("golden-touch", [2, 4, 6]);
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

  const projects = pick("project-engineer", [2, 2.5, 3]);
  if (projects) o.projectMultiplier = projects;
  if (tierOf(jokerIds, "مشروع") >= 1) o.projectSynergyBonus = 3;
  const baloot = pick("royal-baloot", [4, 6, 9]);
  if (baloot) o.balootBonus = { points: baloot, gold: baloot };
  const ground = pick("ground-keeper", [4, 6, 9]);
  if (ground) o.groundGold = ground;
  const defenseTier = tierOf(jokerIds, "دفاع");
  const trap = (pick("trap", [5, 8, 12]) ?? 0) + (defenseTier >= 2 ? 8 : defenseTier >= 1 ? 4 : 0);
  if (trap) o.rivalLossBonus = trap;
  const qahwa = pick("qahwaji", [0.5, 1]);
  if (qahwa) o.doubleWinBonus = qahwa;
  const akka = pick("akka-gold", [3, 5, 7]);
  if (akka) o.akkaGold = akka;
  const patience = (pick("patience", [3, 5, 8]) ?? 0) + (defenseTier >= 2 ? 2 : 0);
  if (patience) o.lossGold = patience;
  const kaboot = pick("golden-kaboot", [15, 25]);
  if (kaboot) o.kabootBonus = { points: kaboot, gold: kaboot };
  return o;
}
