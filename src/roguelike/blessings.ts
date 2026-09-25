/**
 * بركات الحوت: at the start of the map the whale offers three blessings — one free, two
 * stronger ones with a price. They're not jokers: they hold for the whole run, never show up in
 * a shop, and can't be sold. (The player's taste: no blessing that costs a life, and no shop
 * discount.)
 */
export interface BlessingDef {
  id: string;
  name: string;
  icon: string;
  /** What it gives. */
  gift: string;
  /** What it costs, if anything. */
  price?: string;
}

export const BLESSINGS: BlessingDef[] = [
  { id: "wave", name: "موجة البداية", icon: "🌊", gift: "تبدأ كل مباراة قدام خصومك بـ 10" },
  { id: "heart", name: "قلب الحوت", icon: "❤️", gift: "حياة زيادة" },
  { id: "treasure", name: "كنز الحوت", icon: "💰", gift: "100 ذهب", price: "المتجر يعرض جوكر أقل" },
  { id: "crown", name: "تاج الحوت", icon: "👑", gift: "جوكر أسطوري", price: "هدف كل مباراة يزيد 10" },
  { id: "projects", name: "بحر المشاريع", icon: "📜", gift: "مشاريعكم تنحسب ×2", price: "ما تقدرون تشترون صن" },
  { id: "catch", name: "صيد وفير", icon: "🎣", gift: "ذهب المباريات ×1.5", price: "الجوايز بعد المباراة خيارين بدل ثلاث" },
  { id: "school", name: "سرب الجوكرات", icon: "🐟", gift: "ثلاث جوكرات عادية من عائلة وحدة", price: "خصمك الأول يبدأ قدامك بـ 20" },
];

export function getBlessing(id: string | undefined): BlessingDef | undefined {
  return BLESSINGS.find((b) => b.id === id);
}

/** Three to choose from: one free, two with a price. */
export function rollBlessings(rand: () => number): string[] {
  const free = BLESSINGS.filter((b) => !b.price);
  const priced = BLESSINGS.filter((b) => b.price).sort(() => rand() - 0.5);
  return [free[Math.floor(rand() * free.length)].id, priced[0].id, priced[1].id];
}

/** Match targets go up by this with تاج الحوت. */
export const CROWN_TARGET = 10;
/** موجة البداية's head start. */
export const WAVE_HEAD_START = 10;
/** كنز الحوت's gold. */
export const TREASURE_GOLD = 100;
/** سرب الجوكرات: your first opponents start this far ahead. */
export const SCHOOL_PENALTY = 20;
