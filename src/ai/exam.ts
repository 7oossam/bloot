import { cardId, rankStrength } from "../engine/cards";
import { resolveProjects } from "../engine/projects";
import { Round } from "../engine/round";
import { resolveTrick } from "../engine/trick";
import { RANKS, SUITS, teamOf, type Bid, type BiddingResult, type Card, type Mode, type Seat, type Suit, type Trick } from "../engine/types";
import { mulberry32 } from "../engine/rng";
import { RANK_NAME_AR, SUIT_NAME_AR } from "../scenes/cardArt";
import { decideCard, type PlayContext } from "./play-ai";
import { inferConstraints, sampleWorld, searchVerdict } from "./mcts";
import { TRAINED_WEIGHTS, cardFeatures, scoreFeatures } from "./policy";

/**
 * The AI exam: Baloot situations a strong player would ask about ("your partner led the بنت هاص
 * and you took it — what do you lead back?"), set up on a real table and put to the three AIs:
 * the rule-based AI (which says which rule it used), the self-play trained network, and the
 * search AI (which tries every card against many possible deals). scripts/ai-exam.ts writes
 * the answers to docs/ai-exam.md so a player can judge them.
 *
 * You are always seat 0; your partner is seat 2; seat 1 plays after you, seat 3 before you.
 */

const C = (s: string): Card => ({ suit: s.slice(-1) as Suit, rank: s.slice(0, -1) as Card["rank"] });
export const cardName = (c: Card) => `${RANK_NAME_AR[c.rank]} ${SUIT_NAME_AR[c.suit]}`;

export interface ExamPosition {
  mode: Mode;
  trumpSuit?: Suit;
  declarer: Seat;
  /** The face-up card; whoever bought (the declarer) took it, unless it's been played since. */
  ground: Card;
  /** Finished tricks, each as the cards in play order starting with its leader. */
  tricks: Array<{ leader: Seat; cards: Card[] }>;
  /** Your cards now. */
  hand: Card[];
  /** The auction as it went (legal from the dealer's right). Guessed deals must explain it. */
  bids?: Bid[];
}

export interface ExamQuestion {
  id: string;
  /** The question as the player asked it. */
  question: string;
  /** The player's own answer, shown beside the AIs'. */
  answer?: string;
  /** How the question was read into a table position. */
  assumptions: string[];
  /** A fixed position, or a generator of positions that fit the question (hands left open). */
  position: ExamPosition | ((rand: () => number) => ExamPosition | undefined);
  /** Names the kind of answer (e.g. "رجّع هاص") so many hands can be summarised. */
  classify: (card: Card, pos: ExamPosition) => string;
}

/** A Round sitting at this position, with the hidden hands filled in to fit it. */
export function buildRound(pos: ExamPosition, rand: () => number): Round | undefined {
  const firstLeader = pos.tricks[0]?.leader ?? (0 as Seat);
  const dealer = ((firstLeader + 3) % 4) as Seat;
  const r = new Round(dealer, rand);
  const result: BiddingResult = { mode: pos.mode, trumpSuit: pos.trumpSuit, declarer: pos.declarer, declarerTeam: teamOf(pos.declarer), history: [] };
  r.bidding = { ...r.bidding, groundCard: pos.ground, result, history: pos.bids ?? [] };
  (r.initial.stock as Card[])[0] = pos.ground;
  r.phase = "playing";
  r.tricks = [];
  const played: Record<Seat, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const t of pos.tricks) {
    const trick: Trick = { leader: t.leader, cards: {}, order: [] };
    t.cards.forEach((card, i) => {
      const seat = ((t.leader + i) % 4) as Seat;
      trick.cards[seat] = card;
      trick.order.push(seat);
      played[seat].push(card);
    });
    if (t.cards.length === 4) {
      trick.winner = resolveTrick(trick, pos.mode, pos.trumpSuit);
      r.tricks.push(trick);
    } else r.currentTrick = trick;
  }
  const leader = r.tricks.length ? r.tricks[r.tricks.length - 1].winner! : firstLeader;
  if (!r.currentTrick) r.currentTrick = { leader, cards: {}, order: [] };
  // Placeholder hands of the right sizes; sampleWorld fills them to fit the table.
  const sizes = (s: Seat) => 8 - played[s].length - (r.currentTrick!.order.includes(s) ? 0 : 0);
  r.hands = { 0: [...pos.hand], 1: new Array(sizes(1)), 2: new Array(sizes(2)), 3: new Array(sizes(3)) } as Record<Seat, Card[]>;
  if (pos.hand.length !== sizes(0)) throw new Error(`hand has ${pos.hand.length} cards, expected ${sizes(0)}`);
  const world = sampleWorld(r, 0, inferConstraints(r, 0), rand);
  if (!world) return undefined;
  r.hands = world;
  const full: Record<Seat, Card[]> = { 0: [...world[0], ...played[0]], 1: [...world[1], ...played[1]], 2: [...world[2], ...played[2]], 3: [...world[3], ...played[3]] };
  r.projects = resolveProjects(full, pos.mode, firstLeader);
  if (r.turnSeat !== 0) throw new Error("the question must be about your turn");
  return r;
}

export interface ExamAnswer {
  card: Card;
  why: string;
}

export interface ExamResult {
  rule: ExamAnswer;
  trained: ExamAnswer;
  search: ExamAnswer & { margins: Array<{ card: Card; margin: number }> };
}

/** Puts one built position to the three AIs. */
export function askAll(r: Round, worlds: number, rand: () => number): ExamResult {
  const res = r.bidding.result!;
  const hand = r.hands[0];
  const trick = r.currentTrick!;
  const explain: string[] = [];
  const ctx: PlayContext = { tricks: r.tricks, declarer: res.declarer, closed: r.closed, explain };
  const ruleCard = decideCard(hand, trick, res.mode, res.trumpSuit, 0, ctx);
  const legal = r.legalMovesFor(0);
  const feats = cardFeatures(legal, hand, trick, res.mode, res.trumpSuit, 0, { tricks: r.tricks, declarer: res.declarer, closed: r.closed });
  const scores = feats.map((f) => scoreFeatures(TRAINED_WEIGHTS, f));
  const top = Math.max(...scores);
  const z = scores.reduce((a, s) => a + Math.exp(s - top), 0);
  const probs = legal.map((card, i) => ({ card, p: Math.exp(scores[i] - top) / z })).sort((a, b) => b.p - a.p);
  const verdict = searchVerdict(r, 0, { worlds, rand, ctx: { tricks: r.tricks, declarer: res.declarer, closed: r.closed } });
  const margins = verdict.scores
    ? [...verdict.scores].map(([id, margin]) => ({ card: legal.find((c) => cardId(c) === id)!, margin })).sort((a, b) => b.margin - a.margin)
    : [];
  const searchWhy = margins.length
    ? `جرّب كل ورقة على ${worlds} توزيعة محتملة لورق الباقين ولعب اليد لآخرها: ` +
      margins.slice(0, 4).map((m) => `${cardName(m.card)} ${m.margin >= 0 ? "+" : ""}${m.margin.toFixed(1)}`).join("، ") +
      " (متوسط فرق النقاط لفريقنا)."
    : "القرار محسوم بقواعدك (برقية/طلب خوي/ورقة وحدة) — ما احتاج بحث.";
  return {
    rule: { card: ruleCard, why: explain[explain.length - 1] ?? "" },
    trained: { card: probs[0].card, why: `الشبكة المدرّبة تعطيها ${Math.round(probs[0].p * 100)}٪` + (probs[1] ? `، وبعدها ${cardName(probs[1].card)} ${Math.round(probs[1].p * 100)}٪.` : ".") },
    search: { card: verdict.choice, why: searchWhy, margins },
  };
}

// ------------------------------------------------------------------ the questions

const ALL = SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
/** `n` random cards not in `taken`, optionally forced to include some. */
function dealRest(rand: () => number, taken: Card[], n: number, mustHave: (hand: Card[]) => boolean = () => true): Card[] | undefined {
  const free = ALL.filter((c) => !taken.some((t) => cardId(t) === cardId(c)));
  for (let attempt = 0; attempt < 200; attempt++) {
    const pick = [...free].sort(() => rand() - 0.5).slice(0, n);
    if (mustHave(pick)) return pick;
  }
  return undefined;
}

export const EXAM: ExamQuestion[] = [
  {
    id: "q1",
    question: "إذا خويك حل بنت هاص وانت أكلت، وش تحل له؟",
    answer: "ترجع له هاص بأكبر ورقة عندك: الحلة معناها غالباً إنه يبي هذا النوع. (أحياناً يحل الواحد الشي اللي ما يبيه لأن باقي يده قوية، يخلّصه ويضمن الباقي.)",
    assumptions: [
      "صن (السؤال ما حدد نوع اللعب)، والمشتري خويك.",
      "الأكلة الأولى: خويك حل بنت هاص، اللي قبلك نزّل ثمانية هاص، أنت أكلت بالإكة، واللي بعدك نزّل تسعة هاص.",
      "باقي ورقك (٧ أوراق) عشوائي وفيه هاص — نعرض كم مرة يختار كل نوع جواب، ومع أمثلة.",
    ],
    position: (rand) => {
      const t1 = [C("QH"), C("8H"), C("AH"), C("9H")]; // partner (2) leads, 3, you (0), 1
      const ground = C("KD");
      const hand = dealRest(rand, [...t1, ground], 7, (h) => h.some((c) => c.suit === "H"));
      if (!hand) return undefined;
      return { mode: "sun", declarer: 2, ground, tricks: [{ leader: 2, cards: t1 }], hand };
    },
    classify: (card, pos) => {
      if (card.suit !== "H") return "لون ثاني";
      const hearts = pos.hand.filter((c) => c.suit === "H");
      return hearts.every((c) => rankStrength(c, "sun") <= rankStrength(card, "sun")) ? "✔ رجّع هاص بأكبر ورقة" : "رجّع هاص بورقة صغيرة";
    },
  },
  ...(["me", "partner", "them"] as const).map((who): ExamQuestion => {
    const seat: Seat = who === "me" ? 0 : who === "partner" ? 2 : 1;
    const hand = ["AS", "KS", "QS", "10H", "QH", "7H", "AD", "8C"].map(C);
    const ground = who === "me" ? C("8C") : C("JC");
    return {
      id: `q2-${who}`,
      question: `الحلة عندك وورقك إكة شايب بنت سبيت، عشرة بنت سبعة هاص، إكة ديمن — وش تحل؟ (${who === "me" ? "أنت اللي شريت صن" : who === "partner" ? "خويك شرا صن" : "الخصم شرا صن"})`,
      answer:
        who === "me"
          ? "أنت المشتري: خسارتها ونجاحها مسؤوليتك — العب قوتك (السبيت: عندك سرا للإكة، ولو طاحت العشرة تاكل السبيت كله). فيه ناس يفضلون يطلعون برا اللعب."
          : who === "partner"
            ? "خويك المشتري: تاكل اللي عندك وترجع له — بس انتبه: لو لعبت الإكتين خلصت قوتك (شف التحليل العميق)."
            : "الخصم المشتري: تحاول تخسّرها. عندك ثلاث أنواع قوية (السبيت، إكة الديمن، عشرة الهاص)، فالمشتري أكيد عنده إما إكة الهاص والشرية، أو إكة الشرية وسرد بعدها.",
      assumptions: [
        "يدك في السؤال ٧ أوراق؛ أضفت ثمانية شرية كثامنة (التحليل العميق يجرب غيرها).",
        who === "me" ? "صن، أنت اشتريت وعندك الحلة." : who === "partner" ? "صن، خويك اشترى (ورقة الأرض ولد شرية عنده) والحلة عندك." : "صن، اللي بعدك اشترى (ورقة الأرض ولد شرية عنده) والحلة عندك.",
      ],
      position: { mode: "sun", declarer: seat, ground, tricks: [], hand },
      classify: (card) => cardName(card),
    };
  }),
  {
    id: "q3",
    question: "إذا خويك حكم هاص والحلة عندك، وش تلعب؟",
    answer: "تلعب هاص أول شي، وأكبر شي عندك.",
    assumptions: [
      "حكم هاص في الدورة الأولى، المشتري خويك، وورقة الأرض (هاص) صارت عنده.",
      "أنت أول من يلعب. يدك عشوائية وفيها هاص — نعرض كم مرة يختار كل نوع جواب، ومع أمثلة.",
    ],
    position: (rand) => {
      const ground = C("10H");
      const hand = dealRest(rand, [ground], 8, (h) => h.some((c) => c.suit === "H"));
      if (!hand) return undefined;
      return { mode: "hokum", trumpSuit: "H", declarer: 2, ground, tricks: [], hand };
    },
    classify: (card, pos) => {
      if (card.suit !== "H") return card.rank === "A" ? "إكة من لون ثاني" : "ورقة من لون ثاني";
      const trumps = pos.hand.filter((c) => c.suit === "H");
      return trumps.every((c) => rankStrength(c, "hokum", "H") <= rankStrength(card, "hokum", "H")) ? "✔ حكم بأكبر ورقة" : "حكم بورقة صغيرة";
    },
  },
  {
    id: "q4",
    question: "إذا خويك هرّب لك بنت هاص، بعدين سبعة ديمن، بعدين تسعة ديمن — وش ترجع له؟",
    answer: "ترجع له أسود، لأنه عطاك نوعين أحمر. بس برضه يعتمد على اللي شرا والخصم وش قاعدين يرمون.",
    assumptions: [
      "صن، والمشتري خويك. \"بنت خاص\" قرأتها بنت هاص.",
      "ثلاث أكلات شرية وخويك فاضي منها: هرّب بنت هاص، ثم سبعة ديمن، ثم تسعة ديمن. أنت أكلت الثالثة بعشرة الشرية وصار اللعب عندك.",
      "باقي ورقك (٥ أوراق) عشوائي، وفيه سبيت (أسود) وأحمر عشان يكون فيه اختيار.",
    ],
    position: (rand) => {
      const t1 = [C("AC"), C("QH"), C("7C"), C("8C")]; // 1 leads, partner discards, 3, you
      const t2 = [C("KC"), C("7D"), C("JC"), C("QC")];
      const t3first = [C("9C"), C("9D")];
      const seat3 = dealRest(rand, [...t1, ...t2, ...t3first, C("10C")], 1, (h) => h[0].suit !== "C");
      if (!seat3) return undefined;
      const t3 = [...t3first, seat3[0], C("10C")];
      const ground = C("KS");
      const hand = dealRest(rand, [...t1, ...t2, ...t3, ground], 5, (h) => h.some((c) => c.suit === "S") && h.some((c) => c.suit === "H" || c.suit === "D") && !h.some((c) => c.suit === "C"));
      if (!hand) return undefined;
      return {
        mode: "sun",
        declarer: 2,
        ground,
        tricks: [
          { leader: 1, cards: t1 },
          { leader: 1, cards: t2 },
          { leader: 1, cards: t3 },
        ],
        hand,
      };
    },
    classify: (card) => (card.suit === "S" || card.suit === "C" ? "✔ رجّع له أسود" : card.suit === "D" ? "رجّع ديمن" : "رجّع هاص"),
  },
];

export interface ExamReport {
  question: ExamQuestion;
  /** For a fixed position: the one result. */
  single?: { pos: ExamPosition; result: ExamResult };
  /** For open hands: how often each kind of answer came up, per AI, and a few worked examples. */
  spread?: { hands: number; counts: Record<"rule" | "trained" | "search", Record<string, number>>; examples: Array<{ pos: ExamPosition; result: ExamResult }> };
}

export function runExam(q: ExamQuestion, opts: { hands?: number; worlds?: number; seed?: number } = {}): ExamReport {
  const rand = mulberry32(opts.seed ?? 11);
  const worlds = opts.worlds ?? 60;
  if (typeof q.position !== "function") {
    const r = buildRound(q.position, rand)!;
    return { question: q, single: { pos: q.position, result: askAll(r, worlds, rand) } };
  }
  const counts = { rule: {}, trained: {}, search: {} } as Record<"rule" | "trained" | "search", Record<string, number>>;
  const examples: Array<{ pos: ExamPosition; result: ExamResult }> = [];
  let hands = 0;
  for (let i = 0; hands < (opts.hands ?? 200) && i < 5000; i++) {
    const pos = q.position(rand);
    if (!pos) continue;
    const r = buildRound(pos, rand);
    if (!r) continue;
    const result = askAll(r, worlds, rand);
    for (const who of ["rule", "trained", "search"] as const) {
      const kind = q.classify(result[who].card, pos);
      counts[who][kind] = (counts[who][kind] ?? 0) + 1;
    }
    if (examples.length < 3) examples.push({ pos, result });
    hands++;
  }
  return { question: q, spread: { hands, counts, examples } };
}
