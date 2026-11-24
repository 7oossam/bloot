/**
 * تمرين الذاكرة's skills, one at a time (deliberate practice — see progress.ts for the research).
 * Each one has the same shape:
 * - a METHOD, taught before anything is asked: a way to track it in chunks, not a list to hold;
 * - a HELPER under the table that tracks it for you, fading by stage (in view → a glance → gone);
 * - QUESTIONS at your turn, at the moment the thing decides your card (you lead, you could cut,
 *   your 10 is about to go), or right after it changed — and each answer says why it matters.
 */
import { teamOf, SUITS, type Card, type Seat, type Suit, type Trick } from "../engine/types";
import { readDiscards } from "../ai/beliefs";
import { offSuits, outThere, SEAT_AR, SUIT_AR, SUIT_SIGN, type DrillAnswer, type DrillTable } from "./questions";
import { countLine, decisionPoint, trumpCount, whyItMatters } from "./trumpCount";

export type SkillId = "trump" | "aces" | "voids" | "signals";

export interface SkillQuestion {
  prompt: string;
  answer: DrillAnswer;
  /** The working shown with the answer (a sum, the trick it happened in). */
  working: string;
  /** Why it matters for the card you're about to play. */
  why: string;
}

/** What the coach tells a skill at your turn. */
export interface TurnContext {
  t: DrillTable;
  trick: Trick;
  hand: Card[];
  /** Your legal cards now. */
  legal: Card[];
  /** Tricks since the last question. */
  quiet: number;
}

export interface Skill {
  id: SkillId;
  name: string;
  /** One line on the list. */
  blurb: string;
  /** عدّ الحكم needs a hokum hand. */
  hokumOnly?: boolean;
  /** The method, as numbered lines. */
  method(t: DrillTable): { title: string; lines: string[] };
  /** The helper's two lines: the headline and the working. */
  helper(t: DrillTable): { main: string; sub: string };
  /** A question for this turn, or none. */
  onTurn(c: TurnContext): SkillQuestion | undefined;
}

const sign = (s: Suit) => SUIT_SIGN[s];
const suitName = (s: Suit) => `${sign(s)} ${SUIT_AR[s]}`;
const fallen = (t: DrillTable) => t.tricks.flatMap((tr, i) => tr.order.map((seat) => ({ card: tr.cards[seat]!, seat, trick: i + 1 })));
const isTrump = (t: DrillTable, s: Suit) => t.mode === "hokum" && s === t.trumpSuit;

// ------------------------------------------------------------------ ١. عدّ الحكم

function trumpSkill(): Skill {
  let lastAsked = -1;
  return {
    id: "trump",
    name: "عدّ الحكم",
    blurb: "تعدّ الحكم الباقي وتستخدمه في قرارك",
    hokumOnly: true,
    method: (t) => ({
      title: `الحكم ${suitName(t.trumpSuit!)} — الطريقة`,
      lines: ["١. عدّ الحكم اللي في يدك الحين.", "٢. اللي برّا يدك = 8 ناقص حكمك.", "٣. كل ما نزل حكم من غيرك، نقّص واحد. (حكمك أنت لا تنقّصه — هو محسوب.)"],
    }),
    helper: (t) => {
      const c = trumpCount(t);
      return { main: `الحكم برّا يدك: ${c.out}`, sub: countLine(c) };
    },
    onTurn: ({ t, trick, hand, quiet }) => {
      const out = trumpCount(t).out;
      const fell = lastAsked >= 0 && out !== lastAsked;
      const point = decisionPoint(trick, hand, t.trumpSuit!) ?? (fell || quiet >= 2 ? "follow" : undefined);
      if (!point) return undefined;
      lastAsked = out;
      const when = point === "lead" ? "قبل ما تبدأ" : point === "cut" ? "قبل ما تقطع" : "قبل ما تلعب";
      return { prompt: `${when}: كم حكم باقي برّا يدك؟`, answer: { kind: "number", value: out }, working: countLine(trumpCount(t)), why: whyItMatters(point, t) };
    },
  };
}

// ------------------------------------------------------------------ ٢. الإكك والعشرات

/** The Aces and 10s of a suit still out there (not fallen, not yours). */
function bigOut(t: DrillTable, s: Suit): Card[] {
  return outThere(t, s).filter((c) => c.rank === "A" || c.rank === "10");
}

function acesSkill(): Skill {
  let lastAsked = -1;
  const suits = (t: DrillTable) => SUITS.filter((s) => !isTrump(t, s));
  const acesOut = (t: DrillTable) => suits(t).filter((s) => outThere(t, s).some((c) => c.rank === "A")).length;
  return {
    id: "aces",
    name: "الإكك والعشرات",
    blurb: "تتابع الإكك والعشرات: متى عشرتك صارت أكبر ورقة",
    method: (t) => ({
      title: "الإكك والعشرات — الطريقة",
      lines: [
        "١. أول ما تنكشف يدك: وش عندك من الإكك والعشرات؟",
        "٢. اللي مو عندك برّا — احفظها شكل شكل: «سبيت: الإكة برّا».",
        "٣. كل ما نزلت إكة أو عشرة، اشطبها من راسك.",
        "٤. إذا راحت إكة الشكل، عشرته صارت أكبر ورقة فيه — تاكل.",
        ...(t.mode === "hokum" ? ["(شكل الحكم ترتيبه غير، فنتركه لعدّ الحكم.)"] : []),
      ],
    }),
    helper: (t) => {
      const parts = suits(t).map((s) => {
        const out = bigOut(t, s);
        return `${sign(s)} ${out.length ? out.map((c) => (c.rank === "A" ? "إكة" : "عشرة")).join(" ") : "—"}`;
      });
      return { main: "الإكك والعشرات برّا يدك", sub: parts.join("   ") };
    },
    onTurn: ({ t, legal, quiet }) => {
      // Your 10 is about to go out: is its Ace still around?
      const ten = legal.find((c) => c.rank === "10" && !isTrump(t, c.suit) && !legal.some((x) => x.suit === c.suit && x.rank === "A") && !t.hand.some((x) => x.suit === c.suit && x.rank === "A"));
      if (ten) {
        const aceOut = outThere(t, ten.suit).some((c) => c.rank === "A");
        const f = fallen(t).find((x) => x.card.suit === ten.suit && x.card.rank === "A");
        return {
          prompt: `معك عشرة ${SUIT_AR[ten.suit]}. إكة ${SUIT_AR[ten.suit]} نزلت؟`,
          answer: { kind: "yesno", value: !aceOut },
          working: f ? `نزلت في الأكلة ${f.trick}، لعبها ${SEAT_AR[f.seat]}.` : "ما نزلت — عند واحد من الثلاثة.",
          why: aceOut ? "الإكة برّا: لو لعبت العشرة ممكن تاكلها الإكة وتروح 10 أبناط. خلها لين تطيح الإكة." : `الإكة راحت: عشرتك الحين أكبر ${SUIT_AR[ten.suit]} باقي — العبها وتاكل.`,
        };
      }
      // Otherwise, after an Ace fell (or a quiet while): how many are still out?
      const n = acesOut(t);
      if (!((lastAsked >= 0 && n !== lastAsked) || quiet >= 2)) return undefined;
      lastAsked = n;
      const gone = fallen(t).filter((x) => x.card.rank === "A" && !isTrump(t, x.card.suit));
      return {
        prompt: `كم إكة باقية برّا يدك${t.mode === "hokum" ? " (غير الحكم)" : ""}؟`,
        answer: { kind: "number", value: n },
        working: `نزلت: ${gone.length ? gone.map((x) => suitName(x.card.suit)).join("، ") : "ولا وحدة"}. ومعك ${t.hand.filter((c) => c.rank === "A" && !isTrump(t, c.suit)).length}.`,
        why: "كل إكة برّا تهدد عشرة. لما تخلص إكة شكل، عشرته تصير الكبيرة.",
      };
    },
  };
}

// ------------------------------------------------------------------ ٣. مين فضى

/** Each other seat's voids so far. */
function voidsOf(t: DrillTable): Record<Seat, Suit[]> {
  const v: Record<Seat, Suit[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const o of offSuits(t)) if (!v[o.seat].includes(o.led)) v[o.seat].push(o.led);
  return v;
}

function voidsSkill(): Skill {
  let seenOffs = 0;
  return {
    id: "voids",
    name: "مين فضى",
    blurb: "تتذكر مين فاضي من وش، قبل ما تبدأ بشكل",
    method: () => ({
      title: "مين فضى — الطريقة",
      lines: [
        "١. كل ما انلعب شكل، شوف مين ما لعب منه.",
        "٢. اللي ما لعب منه فاضي منه لآخر اليد.",
        "٣. احفظها جملة قصيرة: «يسار فاضي هاص».",
        "٤. قبل ما تبدأ بشكل: مين فاضي منه؟ في الحكم يقطعه، وفي الصن يرمي عليه.",
      ],
    }),
    helper: (t) => {
      const v = voidsOf(t);
      const parts = ([1, 2, 3] as Seat[]).map((s) => `${SEAT_AR[s]}: ${v[s].length ? v[s].map(sign).join(" ") : "—"}`);
      return { main: "الفضاوة", sub: parts.join("   ") };
    },
    onTurn: ({ t, trick, hand, quiet }) => {
      const v = voidsOf(t);
      const offs = offSuits(t).filter((o) => o.seat !== 0);
      const voidSeats = (s: Suit) => ([1, 2, 3] as Seat[]).filter((seat) => v[seat].includes(s));
      // Leading: before you pick a suit, who's void in one you hold?
      if (trick.order.length === 0) {
        const mine = [...new Set(hand.map((c) => c.suit))];
        const s = mine.find((x) => voidSeats(x).length > 0) ?? mine.find((x) => t.tricks.some((tr) => tr.cards[tr.order[0]]!.suit === x));
        if (s && (voidSeats(s).length || quiet >= 1)) {
          seenOffs = offs.length;
          const seats = voidSeats(s);
          const opp = seats.filter((x) => teamOf(x) !== 0);
          const why = !seats.length
            ? `محد فاضي من ${SUIT_AR[s]} للحين — تقدر تبدأ فيه وما أحد يقطعه.`
            : opp.length
              ? `${opp.map((x) => SEAT_AR[x]).join(" و")} فاضي من ${SUIT_AR[s]}: ${t.mode === "hokum" ? "لو بديت فيه يقطعه بحكم." : "ما يقدر ياكل فيه — بس يرمي عليه."}`
              : `خويّك فاضي من ${SUIT_AR[s]}: ${t.mode === "hokum" ? "يقدر يقطع لك." : "بيرمي لك تهريب."}`;
          return {
            prompt: `قبل ما تبدأ: مين فاضي من ${SUIT_AR[s]}؟`,
            answer: { kind: "seats", value: seats },
            working: seats.length ? seats.map((x) => `${SEAT_AR[x]} ما لعب ${SUIT_AR[s]} في الأكلة ${offs.find((o) => o.seat === x && o.led === s)!.trick}`).join("، ") + "." : `كل ما انلعب ${SUIT_AR[s]} الكل لعب منه.`,
            why,
          };
        }
      }
      // Someone just showed out: who was it?
      if (offs.length > seenOffs) {
        const last = offs[offs.length - 1];
        seenOffs = offs.length;
        const seats = ([1, 2, 3] as Seat[]).filter((x) => offs.some((o) => o.trick === last.trick && o.seat === x));
        return {
          prompt: `في الأكلة ${last.trick} انلعب ${SUIT_AR[last.led]}. مين ما لعب منه؟`,
          answer: { kind: "seats", value: seats },
          working: `${seats.map((x) => SEAT_AR[x]).join(" و")} رمى غيره — يعني فاضي من ${SUIT_AR[last.led]}.`,
          why: "احفظها الحين، قبل ما تحتاجها: هذا اللاعب ما بيلعب هالشكل لين تخلص اليد.",
        };
      }
      return undefined;
    },
  };
}

// ------------------------------------------------------------------ ٤. التهريب

function signalsSkill(): Skill {
  let seenOffs = 0;
  return {
    id: "signals",
    name: "التهريب",
    blurb: "تقرأ الرمية: تهريب لخويه، ولا ورقة ضعيفة؟",
    method: () => ({
      title: "التهريب — الطريقة",
      lines: [
        "أول سؤال: الأكلة كانت لمين لما رمى؟",
        "١. خويّه ماكل = تهريب: يقول لخويه وش يبي. هرّب شكل = يبي أخوه من نفس اللون (هرّب ديمن = يبي هاص). وإذا كبّر في نفس الشكل (سبعة ثم ثمانية) يطلبه هو.",
        "٢. خصمه ماكل = ورقة ضعيفة ما يحتاجها. ما يطلب شي.",
        "٣. لما تبدأ، تذكّر وش طلب خويّك وابدأ له فيه.",
      ],
    }),
    helper: (t) => {
      const offs = offSuits(t).filter((o) => o.seat !== 0 && (o.read === "signal" || o.read === "weak"));
      const parts = ([1, 2, 3] as Seat[]).map((s) => {
        const mine = offs.filter((o) => o.seat === s);
        if (!mine.length) return `${SEAT_AR[s]}: —`;
        const wants = readDiscards(mine.filter((o) => o.read === "signal").map((o) => ({ card: o.card, led: o.led }))).wants.filter((x) => !isTrump(t, x));
        const weak = [...new Set(mine.filter((o) => o.read === "weak").map((o) => o.card.suit))];
        return `${SEAT_AR[s]}: ${wants.length ? `يبي ${sign(wants[0])}` : ""}${wants.length && weak.length ? "، " : ""}${weak.length ? `ما يحتاج ${weak.map(sign).join("")}` : ""}`;
      });
      return { main: "وش قالوا برمياتهم", sub: parts.join("   ") };
    },
    onTurn: ({ t, trick }) => {
      const offs = offSuits(t).filter((o) => o.seat !== 0 && (o.read === "signal" || o.read === "weak"));
      // A new discard: which kind was it?
      if (offs.length > seenOffs) {
        const o = offs[offs.length - 1];
        seenOffs = offs.length;
        const options = ["تهريب لخويه", "ورقة ضعيفة ما يحتاجها"];
        const signal = o.read === "signal";
        const prior = offs.filter((x) => x.seat === o.seat && x.read === "signal" && x.trick <= o.trick);
        const wants = readDiscards(prior.map((x) => ({ card: x.card, led: x.led }))).wants.filter((x) => !isTrump(t, x));
        return {
          prompt: `في الأكلة ${o.trick} ${SEAT_AR[o.seat]} ما عنده ${SUIT_AR[o.led]} ورمى ${SUIT_AR[o.card.suit]}. وش هي؟`,
          answer: { kind: "choice", options, value: signal ? 0 : 1 },
          working: signal ? `الأكلة كانت لخويه، فهي تهريب${wants.length ? `: يبي ${suitName(wants[0])}` : ""}.` : "الأكلة كانت لخصمه، فهي مو تهريب — ورقة ما يحتاجها.",
          why: signal ? "تهريب الخصم يقول لك وش بيلعب خويه — وتهريب خويّك يقول لك وش تبدأ له." : `ورقة ضعيفة: ${SEAT_AR[o.seat]} ما عنده شي يبيه في ${SUIT_AR[o.card.suit]}.`,
        };
      }
      // Leading, and your partner has asked for something: what?
      if (trick.order.length === 0) {
        const mine = offs.filter((x) => x.seat === 2 && x.read === "signal");
        const wants = readDiscards(mine.map((x) => ({ card: x.card, led: x.led }))).wants.filter((x) => !isTrump(t, x));
        if (wants.length) {
          return {
            prompt: "قبل ما تبدأ: خويّك وش طلب منك؟",
            answer: { kind: "suit", value: wants[0] },
            working: `خويّك هرّب ${mine.map((x) => suitName(x.card.suit)).join(" ثم ")} وأنتم ماكلين — يبي ${suitName(wants[0])}.`,
            why: `ابدأ له بـ${SUIT_AR[wants[0]]} إذا عندك — هذا اللي يبيه.`,
          };
        }
      }
      return undefined;
    },
  };
}

// ------------------------------------------------------------------ the list

export const SKILL_IDS: SkillId[] = ["trump", "aces", "voids", "signals"];

/** A fresh skill (each keeps a little state through the hand). */
export function makeSkill(id: SkillId): Skill {
  return { trump: trumpSkill, aces: acesSkill, voids: voidsSkill, signals: signalsSkill }[id]();
}

/** The names and lines for the menu, without making a skill. */
export const SKILL_INFO: Record<SkillId, { name: string; blurb: string }> = Object.fromEntries(
  SKILL_IDS.map((id) => {
    const s = makeSkill(id);
    return [id, { name: s.name, blurb: s.blurb }];
  }),
) as Record<SkillId, { name: string; blurb: string }>;

