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
  /** A line shown instead of the price (an عهد has none, but it grows). */
  note?: string;
  /** Only offered to this character (src/roguelike/characters.ts), as الراوي's third choice. */
  character?: string;
}

export const BLESSINGS: BlessingDef[] = [
  { id: "wave", name: "بدري", icon: "sunrise", gift: "تبدأ كل صكّة قدام المرهونين بـ 10" },
  { id: "heart", name: "ساعة زيادة", icon: "candle-light", gift: "ساعة زيادة من الليل" },
  { id: "treasure", name: "صرّة الراوي", icon: "swap-bag", gift: "100 ريال", price: "الدكّان يعرض تحفة أقل" },
  { id: "crown", name: "تحفة جدّك", icon: "amphora", gift: "تحفة أسطورية", price: "هدف كل صكّة يزيد 10" },
  { id: "projects", name: "البنّاي", icon: "brick-wall", gift: "مشاريعكم تنحسب ×2", price: "ما تقدرون تشترون صن" },
  { id: "catch", name: "الرزق", icon: "wheat", gift: "ريالات الصكّات ×1.5", price: "الجوايز بعد المباراة خيارين بدل ثلاث" },
  { id: "school", name: "عدّة المجموعة", icon: "toolbox", gift: "ثلاث تحف عادية من مجموعة وحدة", price: "أول مرهون يبدأ قدامك بـ 20" },
  // الراوي's third offer depends on who you are: an عهد, earned by playing the character's way.
  { id: "hara-vow", name: "عهد الحارة", icon: "scroll-quill", gift: "فز بصكّة فيها 3 أكلات لكم بسبعة أو ثمانية: تجيك تحفة حارة", note: "مرة وحدة في الليلة", character: "hara" },
  { id: "spade-vow", name: "عهد البحّار", icon: "scroll-quill", gift: "فز بصكّة فيها 5 أكلات لكم بالسبيت: تجيك تحفة سبيت", note: "مرة وحدة في الليلة", character: "spade" },
];

/** A vow: which of the match's counts it watches, how many the first time, and how many more each time after. */
export const VOWS: Record<string, { stat: "lowTricks" | "spadeTricks"; need: number; step: number; label: string }> = {
  "hara-vow": { stat: "lowTricks", need: 3, step: 2, label: "أكلات بالصغار" },
  "spade-vow": { stat: "spadeTricks", need: 5, step: 3, label: "أكلات بالسبيت" },
};

export function getBlessing(id: string | undefined): BlessingDef | undefined {
  return BLESSINGS.find((b) => b.id === id);
}

/**
 * Three to choose from: one free, and two with a price — or, once you've picked a character, one
 * free, one priced, and the character's own.
 */
export function rollBlessings(rand: () => number, character?: string): string[] {
  const general = BLESSINGS.filter((b) => !b.character);
  const free = general.filter((b) => !b.price);
  const priced = general.filter((b) => b.price).sort(() => rand() - 0.5);
  const own = BLESSINGS.find((b) => b.character !== undefined && b.character === character);
  return [free[Math.floor(rand() * free.length)].id, priced[0].id, own ? own.id : priced[1].id];
}

/** Match targets go up by this with تاج الحوت. */
export const CROWN_TARGET = 10;
/** موجة البداية's head start. */
export const WAVE_HEAD_START = 10;
/** كنز الحوت's gold. */
export const TREASURE_GOLD = 100;
/** سرب الجوكرات: your first opponents start this far ahead. */
export const SCHOOL_PENALTY = 20;
