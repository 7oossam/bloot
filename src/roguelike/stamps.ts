/**
 * الوسوم: marks you put on cards of the one shared deck, like a tribe's وسم on its camels. A
 * stamp stays on its card the whole night, wherever the card is dealt — but it works only while
 * the card is in YOUR hand (the player's rule: not the opponents', not even your partner's).
 *
 * Every match you win offers three stamps; you take one and choose the card it goes on (a card
 * holds two at most). Stamps are small on their own; the build is which cards you mark and how
 * the marks meet (المسافرة brings a card to you every deal, الكبّارة grows it…).
 */
import { mulberry32 } from "../engine/rng";

export type StampId = "bounce" | "grow" | "travel" | "crescent" | "guard" | "bait" | "royal" | "diver";

export interface StampDef {
  id: StampId;
  name: string;
  icon: string;
  /** What it does, in a line. */
  text: string;
  /** How often it's offered. */
  weight: number;
}

export const STAMPS: StampDef[] = [
  { id: "bounce", name: "المرتدة", icon: "arrow-flights", text: "إذا ما أكلت، ترجع ليدك وتختار ورقة ثانية تروح بدالها في الأكلة (مرة في اليد).", weight: 10 },
  { id: "grow", name: "الكبّارة", icon: "wheat", text: "كل ما أكلت فيها تاخذ نجمة؛ بثلاث نجوم تصير أكبر ورقة في شكلها طول الليل.", weight: 9 },
  { id: "travel", name: "المسافرة", icon: "camel-head", text: "في كل توزيع تجيك أنت، في أول خمس أوراق.", weight: 9 },
  { id: "crescent", name: "الهلال", icon: "two-coins", text: "كل ما أكلت فيها: +2 ريال.", weight: 12 },
  { id: "guard", name: "الحارسة", icon: "shield", text: "في الحكم، إذا فتحت فيها محد يقدر يقطعها (في الصن ما تسوي شي).", weight: 8 },
  { id: "bait", name: "الطُّعم", icon: "wolf-trap", text: "إذا رميتها في أكلة وأكلها الخصم، لازم يفتح الأكلة الجاية من شكلها إذا عنده.", weight: 8 },
  { id: "royal", name: "الملكية", icon: "crown", text: "تنحسب لك حكم — في الصن حكم، وفي الحكم تحت الحكم الحقيقي.", weight: 6 },
  { id: "diver", name: "الغطّاسة", icon: "ghost", text: "تقدر تلعبها متى ما تبي، حتى لو عندك من الشكل المطلوب.", weight: 7 },
];

/** A card carries this many stamps at most. */
export const MAX_STAMPS_PER_CARD = 2;
/** الكبّارة: stars (tricks won with it) before it becomes the top of its suit. */
export const GROW_STARS = 3;
/** الهلال: gold per trick won with it. */
export const CRESCENT_GOLD = 2;

export function getStamp(id: string | undefined): StampDef | undefined {
  return STAMPS.find((s) => s.id === id);
}

/** Three different stamps to choose from, weighted. */
export function rollStampOffers(seed: number, count = 3): StampId[] {
  const rand = mulberry32(seed);
  const pool = [...STAMPS];
  const out: StampId[] = [];
  while (out.length < count && pool.length > 0) {
    const total = pool.reduce((n, s) => n + s.weight, 0);
    let roll = rand() * total;
    const i = pool.findIndex((s) => (roll -= s.weight) < 0);
    out.push(pool.splice(i === -1 ? pool.length - 1 : i, 1)[0].id);
  }
  return out;
}

/** Your stamps as the table uses them: card ids per stamp (a grown الكبّارة also counts as top). */
export interface StampRules {
  bounce: string[];
  grow: string[];
  travel: string[];
  crescent: string[];
  guard: string[];
  bait: string[];
  royal: string[];
  diver: string[];
  /** الكبّارة cards that have their stars: the top of their suit. */
  top: string[];
}

export function stampRules(stamps: Record<string, StampId[]>, stars: Record<string, number> = {}): StampRules {
  const rules: StampRules = { bounce: [], grow: [], travel: [], crescent: [], guard: [], bait: [], royal: [], diver: [], top: [] };
  for (const [card, ids] of Object.entries(stamps)) {
    for (const id of ids) rules[id].push(card);
    if (ids.includes("grow") && (stars[card] ?? 0) >= GROW_STARS) rules.top.push(card);
  }
  return rules;
}
