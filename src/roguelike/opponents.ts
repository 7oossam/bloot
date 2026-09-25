import type { Seat, Suit } from "../engine/types";
import type { Tag } from "./jokers";

/**
 * The opponents a run's matches are played against (the design bible, PART 7).
 *
 * Every pair wields a power from the joker catalog — the same rule you could buy — so the
 * items and the enemies are one system:
 * - their `family` is the joker family their power comes from;
 * - owning any joker of that family weakens them (you know the trick): their rule is only on
 *   every other hand. It never becomes impossible without one, just easier with one;
 * - beating them tilts your rewards to that family, and after an elite or a boss their
 *   `signature` joker is always one of the three on offer.
 */
export interface RivalOptions {
  /** These seats' cards of `suit` act as trumps (ملك السبيت) — in sun hands only, with `sunOnly`. */
  trump?: { suit: Suit; seats: Seat[]; sunOnly?: boolean };
  /** These seats' projects count one size up (الورقة الشبح)… */
  projectSeats?: Seat[];
  /** …or only get the smaller boost: two in a row make a سرا (نص سرا). */
  projectShort?: boolean;
  /** These seats' cards in the last trick count as the top of their suit (الورقة الأخيرة). */
  lastCardSeats?: Seat[];
  /** These seats' 7s and 8s outside the trump suit beat the Ace (ثورة الصغار)… */
  lowSeats?: Seat[];
  /** …in sun hands only. */
  lowSunOnly?: boolean;
  /** They buy sun on hands a careful player would pass. */
  sunEager?: boolean;
  /** A sun hand they buy and make counts this many times for them. */
  sunMultiplier?: number;
  /** Any hand they buy and make counts this many times for them. */
  buyMultiplier?: number;
  /** Taking الأرض (the last trick) takes the whole hand for them (سيد الأرض). */
  groundWins?: boolean;
  /** …but only on a hand they bought. */
  groundWinsOnlyBought?: boolean;
  /** Their search AI knows these seats' hands instead of guessing them (الجاسوس). */
  peek?: Seat[];
  /** Their projects are worth this many times their points (مهندس المشاريع). */
  projectMultiplier?: number;
  /** Points to them for every trick they take with a card of `suit` (كنز السبيت). */
  suitTrick?: { suit: Suit; points: number };
  /** Weakened: the rule is only on every other hand (the first hand of a match it's on). */
  alternate?: boolean;
}

export type OpponentTier = "match" | "elite" | "boss";

export interface OpponentDef {
  id: string;
  name: string;
  icon: string;
  tier: OpponentTier;
  /** The joker family their power comes from: owning one weakens them. */
  family: Tag;
  /** The joker they drop after an elite/boss, and whose power they use. */
  signature: string;
  /** What they do, as the player reads it. */
  rule: string;
  /** Their options; `weak` = you own a joker of their family, so the rule is only on every other hand. */
  rules(weak: boolean): RivalOptions;
}

/** The opponents sit at seats 1 and 3; "one of them" is the one on your right, who plays after you. */
const ONE: Seat[] = [1];

/**
 * Each rule's strength was measured with the rule-based AI in your seat (sim, 1500 hands):
 * a match costs you about 3 points a hand at full strength, an elite about 5, a boss about 6;
 * weakened (only every other hand) takes roughly half of that away. No opponent needs its
 * counter to be beaten.
 */
export const OPPONENTS: OpponentDef[] = [
  // ---- matches
  {
    id: "spade-lords",
    name: "ملوك السبيت",
    icon: "♠️",
    tier: "match",
    family: "سبيت",
    signature: "spade-treasure",
    rule: "كل أكلة ياخذونها بورقة سبيت: +3 لهم",
    rules: (weak) => ({ suitTrick: { suit: "S", points: 3 }, alternate: weak }),
  },
  {
    id: "sharks",
    name: "الحرّيفة",
    icon: "📜",
    tier: "match",
    family: "مشروع",
    signature: "project-engineer",
    rule: "مشاريعهم تنحسب ×2",
    rules: (weak) => ({ projectMultiplier: 2, alternate: weak }),
  },
  {
    id: "ground-keepers",
    name: "حرّاس الأرض",
    icon: "🏁",
    tier: "match",
    family: "أرض",
    signature: "last-card",
    rule: "ورقة اللي على يمينك في آخر أكلة أكبر ورقة في شكلها",
    rules: (weak) => ({ lastCardSeats: ONE, alternate: weak }),
  },
  {
    id: "sun-folk",
    name: "أهل الصن",
    icon: "☀️",
    tier: "match",
    family: "دفاع",
    signature: "breaker",
    rule: "يشترون صن بسهولة، وكل صن يشترونه ويكسبونه ×1.75 لهم",
    rules: (weak) => ({ sunEager: true, sunMultiplier: 1.75, alternate: weak }),
  },
  // ---- elites
  {
    id: "little-rebels",
    name: "ثوار الصغار",
    icon: "7️⃣",
    tier: "elite",
    family: "صغار",
    signature: "trash-beats-ace",
    rule: "في الصن: سبعات وثمانيات اللي على يمينك تاكل الإكة",
    rules: (weak) => ({ lowSeats: ONE, lowSunOnly: true, alternate: weak }),
  },
  {
    id: "watchers",
    name: "العيون",
    icon: "👁️",
    tier: "elite",
    family: "عين",
    signature: "spy",
    rule: "يلعبون وهم شايفين ورقك وورق خويك",
    rules: (weak) => ({ peek: [0, 2], alternate: weak }),
  },
  // ---- bosses
  {
    id: "abu-qahwa",
    name: "أبو قهوة",
    icon: "☕",
    tier: "boss",
    family: "دبل",
    signature: "qahwaji",
    rule: "كل يد يشترونها ويكسبونها ×1.7 لهم",
    rules: (weak) => ({ buyMultiplier: 1.7, alternate: weak }),
  },
  {
    id: "sheikh-alard",
    name: "شيخ الأرض",
    icon: "🏜️",
    tier: "boss",
    family: "أرض",
    signature: "ground-lord",
    rule: "في يد يشترونها: اللي ياخذ الأرض منهم ياخذ اليد كلها",
    rules: (weak) => ({ groundWins: true, groundWinsOnlyBought: true, alternate: weak }),
  },
  {
    id: "spade-sultan",
    name: "سلطان السبيت",
    icon: "🗡️",
    tier: "boss",
    family: "سبيت",
    signature: "spade-king",
    rule: "في الصن: سبيت اللي على يمينك يقطع مثل الحكم",
    rules: (weak) => ({ trump: { suit: "S", seats: ONE, sunOnly: true }, alternate: weak }),
  },
];

/** What's left of a rule once you own a joker of its family. */
export function weakRuleText(def: OpponentDef): string {
  return `${def.rule} — بس يد ويد: جوكرك يعطّله كل يد ثانية`;
}

export function getOpponent(id: string | undefined): OpponentDef | undefined {
  return OPPONENTS.find((o) => o.id === id);
}

/** Owning any joker of their family weakens them. */
export function isWeakened(def: OpponentDef, jokerFamilies: Iterable<Tag>): boolean {
  for (const tag of jokerFamilies) if (tag === def.family) return true;
  return false;
}

/** One opponent per fight node, no repeats within a run where the pool allows. */
export function pickOpponents(tiers: OpponentTier[], rand: () => number): string[] {
  const used = new Set<string>();
  return tiers.map((tier) => {
    const pool = OPPONENTS.filter((o) => o.tier === tier);
    const fresh = pool.filter((o) => !used.has(o.id));
    const from = fresh.length > 0 ? fresh : pool;
    const pick = from[Math.floor(rand() * from.length)];
    used.add(pick.id);
    return pick.id;
  });
}
