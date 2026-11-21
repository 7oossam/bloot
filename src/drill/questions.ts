/**
 * تمرين الذاكرة: the questions the drill asks between tricks, built from the round itself, so
 * every answer is certain — what's gone, what's left, who's void, what a discard said.
 *
 * التهريب is read two ways (the player's rule):
 * - thrown on a trick the thrower's PARTNER is winning, a discard is a message: it asks for a
 *   suit (هرّب ديمن = يبي هاص, a climb asks for its own suit — `readDiscards`);
 * - thrown on a trick the OPPONENTS are winning, it's a weak card the thrower didn't need: it
 *   says nothing is wanted, only that the thrower has no use for that suit.
 */
import { cardId, cardPoints, isTrumpCard, rankStrength } from "../engine/cards";
import { currentWinner } from "../engine/trick";
import { RANKS, SUITS, teamOf, type Card, type Mode, type Rank, type Seat, type Suit, type Trick } from "../engine/types";
import { readDiscards, type Discard } from "../ai/beliefs";

export type DrillType = "count" | "gone" | "top" | "void" | "signal" | "weak";

export const DRILL_TYPE_AR: Record<DrillType, string> = {
  count: "العدّ",
  gone: "نزلت ولا لا",
  top: "أكبر ورقة باقية",
  void: "مين فضى",
  signal: "التهريب لخويه",
  weak: "الورق الضعيف",
};

export type DrillAnswer =
  | { kind: "number"; value: number }
  | { kind: "seats"; value: Seat[] }
  | { kind: "suit"; value: Suit | "none" }
  | { kind: "yesno"; value: boolean }
  | { kind: "rank"; suit: Suit; value: Rank | "none" };

export interface DrillQuestion {
  type: DrillType;
  text: string;
  answer: DrillAnswer;
  /** Where the answer came from, shown after you answer. */
  evidence: string;
}

/** What the drill needs from the hand in play. */
export interface DrillTable {
  /** Finished tricks, in order. */
  tricks: Trick[];
  /** Your cards right now. */
  hand: Card[];
  mode: Mode;
  trumpSuit?: Suit;
}

export const SUIT_AR: Record<Suit, string> = { S: "سبيت", H: "هاص", D: "ديمن", C: "شرية" };
export const SUIT_SIGN: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const RANK_AR: Record<Rank, string> = { "7": "سبعة", "8": "ثمانية", "9": "تسعة", "10": "عشرة", J: "ولد", Q: "بنت", K: "شايب", A: "إكة" };
export const SEAT_AR: Record<Seat, string> = { 0: "أنت", 1: "يمين", 2: "خويّك", 3: "يسار" };
const BROTHER: Record<Suit, Suit> = { H: "D", D: "H", S: "C", C: "S" };

const cardAr = (c: Card) => `${RANK_AR[c.rank]} ${SUIT_AR[c.suit]}`;

/** Every card that fell, with the trick it fell in (1-based) and who played it. */
function fallen(t: DrillTable): Array<{ card: Card; trick: number; seat: Seat }> {
  return t.tricks.flatMap((tr, i) => tr.order.map((seat) => ({ card: tr.cards[seat]!, trick: i + 1, seat })));
}

/** A seat that didn't follow: a ruff, a message to its partner, or a weak card thrown away. */
interface OffSuit {
  seat: Seat;
  card: Card;
  led: Suit;
  trick: number;
  /** A 10 or an Ace fed to the partner's trick is support (or a برقية), not a request. */
  read: "ruff" | "signal" | "support" | "weak";
}

function offSuits(t: DrillTable): OffSuit[] {
  const out: OffSuit[] = [];
  t.tricks.forEach((tr, i) => {
    const led = tr.cards[tr.order[0]]!.suit;
    tr.order.forEach((seat, k) => {
      const card = tr.cards[seat]!;
      if (k === 0 || card.suit === led) return;
      if (t.mode === "hokum" && card.suit === t.trumpSuit) return void out.push({ seat, card, led, trick: i + 1, read: "ruff" });
      const before: Trick = { leader: tr.leader, order: tr.order.slice(0, k), cards: tr.cards, rules: tr.rules };
      const winner = currentWinner(before, t.mode, t.trumpSuit);
      const partners = teamOf(winner) === teamOf(seat);
      out.push({ seat, card, led, trick: i + 1, read: !partners ? "weak" : cardPoints(card, "sun") >= 10 ? "support" : "signal" });
    });
  });
  return out;
}

/** The cards of a suit nobody has played and you don't hold — what's still out there. */
export function outThere(t: DrillTable, suit: Suit): Card[] {
  const gone = new Set([...fallen(t).map((f) => f.card), ...t.hand].map(cardId));
  return RANKS.map((rank) => ({ suit, rank })).filter((c) => !gone.has(cardId(c)));
}

/** Strongest first, by the hand's mode (the trump order for the trump suit). */
function byStrength(cards: Card[], t: DrillTable): Card[] {
  return [...cards].sort((a, b) => rankStrength(b, t.mode, t.trumpSuit) - rankStrength(a, t.mode, t.trumpSuit));
}

/** Every question the table can answer right now, of the given type (may be none). */
export function questionsOfType(type: DrillType, t: DrillTable): DrillQuestion[] {
  const all = fallen(t);
  const inHand = new Set(t.hand.map(cardId));
  const played = (suit: Suit) => all.filter((f) => f.card.suit === suit);
  switch (type) {
    case "count":
      return SUITS.filter((s) => played(s).length > 0).map((s) => {
        const left = outThere(t, s).length;
        const mine = t.hand.filter((c) => c.suit === s);
        const trump = t.mode === "hokum" && s === t.trumpSuit ? " (الحكم)" : "";
        return {
          type,
          text: `كم ورقة ${SUIT_AR[s]}${trump} باقية عند الثلاثة (غير اللي في يدك)؟`,
          answer: { kind: "number", value: left },
          evidence: `نزل ${played(s).length}: ${played(s).map((f) => RANK_AR[f.card.rank]).join("، ")}. وفي يدك ${mine.length}. من 8 يبقى ${left}.`,
        };
      });
    case "gone": {
      const big = (c: Card) => c.rank === "A" || c.rank === "10" || (isTrumpCard(c, t.mode, t.trumpSuit) && (c.rank === "J" || c.rank === "9"));
      const candidates = SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })))
        .filter((c) => big(c) && !inHand.has(cardId(c)))
        // Only suits that have been played, or the question is a coin toss.
        .filter((c) => played(c.suit).length > 0);
      return candidates.map((c) => {
        const f = all.find((x) => cardId(x.card) === cardId(c));
        return {
          type,
          text: `${cardAr(c)} نزلت؟`,
          answer: { kind: "yesno", value: !!f },
          evidence: f ? `نزلت في الأكلة ${f.trick}، لعبها ${SEAT_AR[f.seat]}.` : `ما نزلت للحين — عند واحد من الثلاثة.`,
        };
      });
    }
    case "top":
      return SUITS.filter((s) => played(s).length > 0).map((s) => {
        const out = byStrength(outThere(t, s), t);
        return {
          type,
          text: `وش أكبر ${SUIT_AR[s]} باقية برا يدك؟`,
          answer: { kind: "rank", suit: s, value: out[0]?.rank ?? "none" },
          evidence: out.length ? `الباقي برا يدك: ${out.map((c) => RANK_AR[c.rank]).join("، ")}.` : `ما بقى ولا ورقة ${SUIT_AR[s]} برا يدك.`,
        };
      });
    case "void": {
      const offs = offSuits(t);
      // Suits someone has been seen to fail in, or that were led at least twice.
      const led = (s: Suit) => t.tricks.filter((tr) => tr.cards[tr.order[0]]!.suit === s).length;
      return SUITS.filter((s) => offs.some((o) => o.led === s) || led(s) >= 2).map((s) => {
        const seats = ([1, 2, 3] as Seat[]).filter((seat) => offs.some((o) => o.seat === seat && o.led === s));
        const why = seats.map((seat) => {
          const o = offs.find((x) => x.seat === seat && x.led === s)!;
          return `الأكلة ${o.trick}: ${SEAT_AR[seat]} ما لعب ${SUIT_AR[s]}`;
        });
        return {
          type,
          text: `مين فضى من ${SUIT_AR[s]}؟ (اختر كل اللي فضوا، أو «محد»)`,
          answer: { kind: "seats", value: seats },
          evidence: seats.length ? `${why.join("، ")}.` : `كل ما انلعب ${SUIT_AR[s]}، الكل لعب منه.`,
        };
      });
    }
    case "signal": {
      // The latest message each other seat sent its partner, read with everything it sent before.
      const offs = offSuits(t).filter((o) => o.read === "signal" && o.seat !== 0);
      const seats = [...new Set(offs.map((o) => o.seat))];
      return seats.flatMap((seat) => {
        const mine: Discard[] = offs.filter((o) => o.seat === seat).map((o) => ({ card: o.card, led: o.led }));
        const wants = readDiscards(mine).wants.filter((s) => !(t.mode === "hokum" && s === t.trumpSuit));
        if (!wants.length) return [];
        const last = offs.filter((o) => o.seat === seat).at(-1)!;
        const how =
          mine.length > 1 && wants[0] === last.card.suit
            ? `هرّب ${SUIT_AR[last.card.suit]} وهو يكبّر فيه — يطلبه نفسه`
            : `هرّب ${cardAr(last.card)} — يبي ${SUIT_AR[wants[0]]}${BROTHER[last.card.suit] === wants[0] ? " (أخو الشكل)" : ""}`;
        return [
          {
            type,
            text: `${SEAT_AR[seat]} هرّب لخويه (كان ماكل). وش يطلب منه؟`,
            answer: { kind: "suit", value: wants[0] } as DrillAnswer,
            evidence: `الأكلة ${last.trick}: خويه ماكل و${SEAT_AR[seat]} ${how}.`,
          },
        ];
      });
    }
    case "weak": {
      // Thrown on the other side's trick: nothing asked, a suit it has no use for.
      const offs = offSuits(t).filter((o) => o.read === "weak" && o.seat !== 0);
      return offs.slice(-3).map((o) => ({
        type,
        text: `في الأكلة ${o.trick} ${SEAT_AR[o.seat]} فضى من ${SUIT_AR[o.led]} والأكلة لخصمه. من أي شكل رمى ورقة ما يحتاجها؟`,
        answer: { kind: "suit", value: o.card.suit } as DrillAnswer,
        evidence: `رمى ${cardAr(o.card)}: الأكلة مو لخويه، فهذا مو تهريب — ورقة ضعيفة ما يحتاجها في ${SUIT_AR[o.card.suit]}.`,
      }));
    }
  }
}

export function isCorrect(answer: DrillAnswer, given: DrillAnswer): boolean {
  if (answer.kind !== given.kind) return false;
  if (answer.kind === "seats") {
    const a = [...answer.value].sort().join();
    const b = [...(given as { value: Seat[] }).value].sort().join();
    return a === b;
  }
  return answer.value === (given as { value: unknown }).value;
}

/** The answer in words, for the feedback line. */
export function answerText(a: DrillAnswer): string {
  switch (a.kind) {
    case "number":
      return String(a.value);
    case "seats":
      return a.value.length ? a.value.map((s) => SEAT_AR[s]).join(" و") : "محد";
    case "suit":
      return a.value === "none" ? "ولا شي" : `${SUIT_SIGN[a.value]} ${SUIT_AR[a.value]}`;
    case "yesno":
      return a.value ? "نزلت" : "ما نزلت";
    case "rank":
      return a.value === "none" ? "ولا ورقة" : `${RANK_AR[a.value]} ${SUIT_AR[a.suit]}`;
  }
}

/**
 * Picks `n` questions of different types, weighted toward the types you get wrong (their
 * Leitner box is low), and never the same type twice in a stop (mixing — interleaving — keeps
 * each answer a fresh recall).
 */
export function pickQuestions(t: DrillTable, n: number, weightOf: (type: DrillType) => number, rand: () => number, allowed?: DrillType[]): DrillQuestion[] {
  const types = (allowed ?? (Object.keys(DRILL_TYPE_AR) as DrillType[])).map((type) => ({ type, pool: questionsOfType(type, t) })).filter((x) => x.pool.length);
  const out: DrillQuestion[] = [];
  while (out.length < n && types.length) {
    const total = types.reduce((s, x) => s + weightOf(x.type), 0);
    let roll = rand() * total;
    const i = Math.max(0, types.findIndex((x) => (roll -= weightOf(x.type)) < 0));
    const { pool } = types.splice(i, 1)[0];
    out.push(pool[Math.floor(rand() * pool.length)]);
  }
  return out;
}
