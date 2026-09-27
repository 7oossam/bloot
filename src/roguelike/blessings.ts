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
  { id: "wave", name: "بدري", icon: "sunrise", gift: "تبدأ كل صكّة قدام المرهونين بـ 10" },
  { id: "heart", name: "ساعة زيادة", icon: "candle-light", gift: "ساعة زيادة من الليل" },
  { id: "treasure", name: "صرّة الراوي", icon: "swap-bag", gift: "100 ريال", price: "الدكّان يعرض تحفة أقل" },
  { id: "crown", name: "تحفة جدّك", icon: "amphora", gift: "تحفة أسطورية", price: "هدف كل صكّة يزيد 10" },
  { id: "projects", name: "البنّاي", icon: "brick-wall", gift: "مشاريعكم تنحسب ×2", price: "ما تقدرون تشترون صن" },
  { id: "catch", name: "الرزق", icon: "wheat", gift: "ريالات الصكّات ×1.5", price: "الجوايز بعد المباراة خيارين بدل ثلاث" },
  { id: "school", name: "عدّة المجموعة", icon: "toolbox", gift: "ثلاث تحف عادية من مجموعة وحدة", price: "أول مرهون يبدأ قدامك بـ 20" },
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
