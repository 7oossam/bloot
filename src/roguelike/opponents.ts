/**
 * The opponents a run's matches are played against (the design bible, PART 7).
 *
 * Like a Balatro boss blind, each one bends a rule of the game against you: your first Ace is
 * worth nothing, they double everything you buy, your projects don't count… Each rule hits one
 * way of playing, so the jokers you've gathered make some fights harder and others easier —
 * the link between enemies and items is what they attack, not a counter you have to own.
 * The map doesn't say who's where: you find out when you walk in.
 */
export interface RivalOptions {
  /** Your team can't lead a trick with an Ace or a 10 while holding anything else. */
  noAceLead?: boolean;
  /** Any hand your team buys and loses counts double for them. */
  lossDoubled?: boolean;
  /** They see how the hand would go and double exactly the contracts you'd lose (sun too, at any score). */
  doubleKnown?: boolean;
  /** Your team's projects don't count (بلوت still does). */
  cancelProjects?: boolean;
  /** الأرض (the last-trick bonus) is theirs whoever takes the last trick. */
  groundTheirs?: boolean;
  /** One of them is dealt the Jack and 9 of the ground card's suit: buy sun, or they buy hokum. */
  hokumHands?: boolean;
  /** Your team's trump Jack drops below the trump 9 ("bottom": below every trump). */
  weakJack?: boolean | "bottom";
  /** They start the match this far ahead. */
  headStart?: number;
  /** Your strongest joker sits this match out (applied when the match is set up). */
  disableJoker?: boolean;
}

export type OpponentTier = "match" | "elite" | "boss";

export interface OpponentDef {
  id: string;
  name: string;
  icon: string;
  tier: OpponentTier;
  /** What they do, as the player reads it. */
  rule: string;
  /** The way of playing it hurts (and so, which jokers feel it) — shown under the rule. */
  hits: string;
  rules: RivalOptions;
}

/**
 * Measured with the rule-based AI in your seat (1500 hands; −0.8 a hand with no rule): a match
 * costs you about 3 points a hand, an elite about 4.5, a boss about 6. Doubling your contracts
 * was tried and dropped: a buyer who usually makes it only gains from a دبل.
 */
export const OPPONENTS: OpponentDef[] = [
  // ---- matches
  {
    id: "ace-guards",
    name: "حرّاس الإكك",
    icon: "🅰️",
    tier: "match",
    rule: "ما تقدرون تبدون أكلة بإكة ولا عشرة (إلا إذا ما عندكم غيرها)",
    hits: "يتعب بناء الإكك: إكتك لازم تاكل وهي تغطي، مو وهي تفتح",
    rules: { noAceLead: true },
  },
  {
    id: "project-erasers",
    name: "ماسحين المشاريع",
    icon: "🧽",
    tier: "match",
    rule: "مشاريعكم ما تنحسب (البلوت ينحسب)",
    hits: "يتعب بناء المشاريع",
    rules: { cancelProjects: true },
  },
  {
    id: "ground-takers",
    name: "أهل الأرض",
    icon: "🏁",
    tier: "match",
    rule: "عشرة الأرض لهم دائماً، أياً كان اللي أخذ آخر أكلة",
    hits: "يتعب بناء الأرض",
    rules: { groundTheirs: true },
  },
  {
    id: "jack-snatchers",
    name: "خاطفين الولد",
    icon: "🪝",
    tier: "match",
    rule: "ولد الحكم حقكم صار أضعف ورقة حكم (أبناطه تنحسب)",
    hits: "يتعب بناء الولد",
    rules: { weakJack: "bottom" },
  },
  {
    id: "knowers",
    name: "العارفين",
    icon: "🧿",
    tier: "match",
    rule: "يعرفون متى بتخسر: يدبلون على كل يد تشترونها وأنتم خسرانين (حتى الصن)",
    hits: "لا تشتري إلا وأنت ضامن — والحكم المقفول يحميك منهم",
    rules: { doubleKnown: true },
  },
  // ---- elites
  {
    id: "hokum-folk",
    name: "أهل الحكم",
    icon: "♦️",
    tier: "elite",
    rule: "اللي على يمينك دايم معه الولد والتسعة من شكل ورقة الأرض: إذا ما شريت صن بيشترون حكم",
    hits: "لازم تعرف متى تشتري صن",
    rules: { hokumHands: true },
  },
  {
    id: "doublers",
    name: "المدبّلين",
    icon: "✖️",
    tier: "elite",
    rule: "أي يد تشترونها وتخسرونها تنحسب لهم دبل",
    hits: "لا تشتري إلا وأنت ضامن",
    rules: { lossDoubled: true },
  },
  // ---- bosses
  {
    id: "abu-qahwa",
    name: "أبو قهوة",
    icon: "☕",
    tier: "boss",
    rule: "أي يد تشترونها وتخسرونها تنحسب لهم دبل، وما تقدرون تبدون بإكة ولا عشرة",
    hits: "الشراء لازم يكون مضمون",
    rules: { lossDoubled: true, noAceLead: true },
  },
  {
    id: "front-runners",
    name: "السبّاقين",
    icon: "🏃",
    tier: "boss",
    rule: "يبدؤون المباراة قدامكم بـ 40",
    hits: "لازم تجيب نقاط بسرعة",
    rules: { headStart: 40 },
  },
  {
    id: "disabler",
    name: "المعطّل",
    icon: "🔒",
    tier: "boss",
    rule: "يعطّل أقوى جوكر عندك طول المباراة، وعشرة الأرض لهم دائماً",
    hits: "لا تعتمد على جوكر واحد",
    rules: { disableJoker: true, groundTheirs: true },
  },
];

export function getOpponent(id: string | undefined): OpponentDef | undefined {
  return OPPONENTS.find((o) => o.id === id);
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
