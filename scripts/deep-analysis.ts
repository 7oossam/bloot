/**
 * Deep analysis: which decision is really best? For each question, many deals that fit the table
 * and the auction are played to the end after each candidate card or strategy, and the average
 * game-point margin is compared (see src/ai/analysis.ts). Writes docs/ai-deep-analysis.md.
 *
 *   npx vite-node scripts/deep-analysis.ts -- [--deals 300 --hands 150 --search-deals 100]
 */
import { writeFileSync } from "node:fs";
import { auction, believableDeals, deepEvaluate, type Playout } from "../src/ai/analysis";
import { buildRound, cardName, type ExamPosition } from "../src/ai/exam";
import { rankStrength } from "../src/engine/cards";
import { mulberry32 } from "../src/engine/rng";
import { RANKS, SUITS, type Card, type Seat, type Suit } from "../src/engine/types";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const DEALS = Number(arg("deals", "300"));
const HANDS = Number(arg("hands", "150"));
const PER_HAND = Number(arg("per-hand", "40"));
const SEARCH_DEALS = Number(arg("search-deals", "100"));
const only = arg("only", "");

const C = (s: string): Card => ({ suit: s.slice(-1) as Suit, rank: s.slice(0, -1) as Card["rank"] });
const ALL = SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
const fmt = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
const out: string[] = [
  "# التحليل العميق — وش أفضل قرار فعلاً؟",
  "",
  "> يتولّد بالأمر `npx vite-node scripts/deep-analysis.ts`. لكل سؤال: مئات التوزيعات اللي تناسب الطاولة **والمزايدة**",
  "> (لو الخصم اشترى صن، يده لازم تكون يد تشتري صن)، وكل ورقة/خطة تنلعب لآخر اليد، ونقارن متوسط فرق النقاط لفريقك.",
  "> **± هو هامش الخطأ**: فرق أصغر من ضعف الهامش تقريباً ما يعتبر فرق أكيد.",
  "> «لعب الباقي» = مين يكمل اليد بعد ورقتك: **القواعد** (سريع) أو **البحث** (أقوى وأبطأ).",
  "",
];

// ------------------------------------------------------------------ question 2: a fixed hand, three buyers

function q2() {
  out.push(
    "## السؤال ٢: الحلة عندك وأنت شريت صن — إكة شايب بنت سبيت، عشرة بنت سبعة هاص، إكة ديمن",
    "",
    "يدك ٧ أوراق في السؤال، فجربت ٣ احتمالات للورقة الثامنة. وكل وحدة جربتها ٣ مرات: **أنت** المشتري، **خويك** المشتري، **الخصم** (اللي بعدك) المشتري.",
    "",
  );
  const base = ["AS", "KS", "QS", "10H", "QH", "7H", "AD"];
  const eighth = ["8C", "7D", "9H"];
  const buyers: Array<{ name: string; seat: Seat }> = [
    { name: "أنت المشتري", seat: 0 },
    { name: "خويك المشتري", seat: 2 },
    { name: "الخصم المشتري", seat: 1 },
  ];
  for (const extra of eighth) {
    const hand = [...base, extra].map(C);
    out.push(`### الورقة الثامنة: ${cardName(C(extra))}`, "");
    for (const b of buyers) {
      const ground = b.seat === 0 ? C(extra) : C("JC");
      const calls: Array<{ call: "sun" | "pass" }> = b.seat === 0 ? [{ call: "sun" }] : b.seat === 1 ? [{ call: "pass" }, { call: "sun" }] : [{ call: "pass" }, { call: "pass" }, { call: "sun" }];
      const pos: ExamPosition = { mode: "sun", declarer: b.seat, ground, tricks: [], hand, bids: auction(3, ground, calls) };
      const rand = mulberry32(1000 + b.seat * 17 + eighth.indexOf(extra));
      const r = buildRound(pos, rand)!;
      const deals = believableDeals(r, 0, rand, DEALS);
      const rows = deepEvaluate(r, 0, r.legalMovesFor(0), deals, "rules", rand);
      const cols = [`| الورقة | متوسط الفرق (القواعد) | الفرق عن الأفضل |`, "|---|---|---|"];
      rows.forEach((x) => cols.push(`| ${cardName(x.card)} | ${fmt(x.mean)} ± ${x.se.toFixed(1)} | ${x.gap === 0 ? "**الأفضل**" : `${fmt(x.gap)} ± ${x.gapSe.toFixed(1)}`} |`));
      out.push(`**${b.name}** — ${deals.length} توزيعة تناسب المزايدة:`, "", ...cols, "");
      if (extra === eighth[0]) {
        const top = rows.slice(0, 4).map((x) => x.card);
        const sdeals = deals.slice(0, SEARCH_DEALS);
        const srows = deepEvaluate(r, 0, top, sdeals, "search", rand);
        out.push(
          `وبلعب **البحث** لباقي اليد (أقوى، على ${sdeals.length} توزيعة، لأفضل ٤ أوراق من فوق):`,
          "",
          "| الورقة | متوسط الفرق (البحث) | الفرق عن الأفضل |",
          "|---|---|---|",
          ...srows.map((x) => `| ${cardName(x.card)} | ${fmt(x.mean)} ± ${x.se.toFixed(1)} | ${x.gap === 0 ? "**الأفضل**" : `${fmt(x.gap)} ± ${x.gapSe.toFixed(1)}`} |`),
          "",
        );
      }
      console.log(`q2 ${extra} ${b.name}: best ${cardName(rows[0].card)}`);
    }
  }
}

// ------------------------------------------------------------------ strategy questions over random hands

interface StrategyQuestion {
  title: string;
  notes: string[];
  build: (rand: () => number) => ExamPosition | undefined;
  strategies: Array<{ name: string; pick: (hand: Card[], pos: ExamPosition) => Card | undefined }>;
}

function runStrategies(q: StrategyQuestion, seed: number, playout: Playout) {
  const rand = mulberry32(seed);
  const names = q.strategies.map((s) => s.name);
  // Paired against the first strategy: sum and sum of squares of the difference, and count.
  const stat = names.map(() => ({ sum: 0, sq: 0, n: 0, abs: 0 }));
  let hands = 0;
  for (let i = 0; hands < HANDS && i < HANDS * 20; i++) {
    const pos = q.build(rand);
    if (!pos) continue;
    const r = buildRound(pos, rand);
    if (!r) continue;
    const picks = q.strategies.map((s) => s.pick(r.hands[0], pos));
    if (!picks[0]) continue;
    const legalIds = new Set(r.legalMovesFor(0).map((c) => c.suit + c.rank));
    const cands = [...new Map(picks.filter((c): c is Card => !!c && legalIds.has(c.suit + c.rank)).map((c) => [c.suit + c.rank, c])).values()];
    const deals = believableDeals(r, 0, rand, PER_HAND);
    if (deals.length < PER_HAND / 2) continue;
    const res = deepEvaluate(r, 0, cands, deals, playout, rand);
    const score = (c: Card | undefined) => (c ? res.find((x) => x.card.suit === c.suit && x.card.rank === c.rank)?.mean : undefined);
    const ref = score(picks[0])!;
    picks.forEach((p, j) => {
      const v = score(p);
      if (v === undefined) return;
      stat[j].sum += v - ref;
      stat[j].sq += (v - ref) ** 2;
      stat[j].abs += v;
      stat[j].n++;
    });
    hands++;
  }
  out.push(
    `| الخطة | كم يد تنطبق | متوسط الفرق عن «${names[0]}» |`,
    "|---|---|---|",
    ...stat.map((s, j) => {
      const m = s.n ? s.sum / s.n : 0;
      const se = s.n > 1 ? Math.sqrt(Math.max(0, s.sq / s.n - m * m) / (s.n - 1)) : 0;
      return `| ${names[j]} | ${s.n} | ${j === 0 ? "—" : `${fmt(m)} ± ${se.toFixed(1)}`} |`;
    }),
    "",
  );
  console.log(`${q.title}: ${hands} hands`);
}

function dealRest(rand: () => number, taken: Card[], n: number, ok: (h: Card[]) => boolean): Card[] | undefined {
  const free = ALL.filter((c) => !taken.some((t) => t.suit === c.suit && t.rank === c.rank));
  for (let k = 0; k < 300; k++) {
    const h = [...free].sort(() => rand() - 0.5).slice(0, n);
    if (ok(h)) return h;
  }
  return undefined;
}
const top = (cards: Card[], mode: "sun" | "hokum", trump?: Suit) => cards.reduce((a, b) => (rankStrength(b, mode, trump) > rankStrength(a, mode, trump) ? b : a));
const low = (cards: Card[], mode: "sun" | "hokum", trump?: Suit) => cards.reduce((a, b) => (rankStrength(b, mode, trump) < rankStrength(a, mode, trump) ? b : a));
/** A card that's the highest still out in its suit, from your seat (no card left that beats it). */
function sureWinner(hand: Card[], pos: ExamPosition, notSuit?: Suit): Card | undefined {
  const gone = new Set([...hand, ...pos.tricks.flatMap((t) => t.cards)].map((c) => c.suit + c.rank));
  return hand.find(
    (c) =>
      c.suit !== notSuit &&
      (pos.mode === "sun" || c.suit !== pos.trumpSuit) &&
      ALL.filter((x) => x.suit === c.suit && !gone.has(x.suit + x.rank)).every((x) => rankStrength(x, pos.mode, pos.trumpSuit) < rankStrength(c, pos.mode, pos.trumpSuit)),
  );
}

const Q1: StrategyQuestion = {
  title: "السؤال ١: خويك حل بنت هاص وأنت أكلت — وش تحل له؟",
  notes: [
    "صن وخويك المشتري. الأكلة الأولى: خويك بنت هاص، اللي قبلك ثمانية هاص، أنت الإكة، اللي بعدك تسعة هاص. باقي يدك عشوائي وفيه هاص.",
  ],
  build: (rand) => {
    const t1 = [C("QH"), C("8H"), C("AH"), C("9H")];
    const ground = C("KD");
    const hand = dealRest(rand, [...t1, ground], 7, (h) => h.some((c) => c.suit === "H"));
    if (!hand) return undefined;
    return { mode: "sun", declarer: 2, ground, tricks: [{ leader: 2, cards: t1 }], hand, bids: auction(1, ground, [{ call: "sun" }]) };
  },
  strategies: [
    { name: "ترجع هاص بأكبر ورقة عندك", pick: (h) => top(h.filter((c) => c.suit === "H"), "sun") },
    { name: "ترجع هاص بأصغر ورقة", pick: (h) => (h.filter((c) => c.suit === "H").length > 1 ? low(h.filter((c) => c.suit === "H"), "sun") : undefined) },
    { name: "تاكل الأكيد اللي عندك أول (لون ثاني)", pick: (h, pos) => sureWinner(h, pos, "H") },
    { name: "تلعب لون ثاني بالصغير", pick: (h) => { const o = h.filter((c) => c.suit !== "H"); return o.length ? low(o, "sun") : undefined; } },
  ],
};

const Q3: StrategyQuestion = {
  title: "السؤال ٣: خويك حكم هاص والحلة عندك — وش تلعب؟",
  notes: ["حكم هاص في الدورة الأولى، خويك المشتري وأخذ ورقة الأرض. يدك عشوائية وفيها هاص."],
  build: (rand) => {
    const ground = C("10H");
    const hand = dealRest(rand, [ground], 8, (h) => h.some((c) => c.suit === "H"));
    if (!hand) return undefined;
    return { mode: "hokum", trumpSuit: "H", declarer: 2, ground, tricks: [], hand, bids: auction(3, ground, [{ call: "pass" }, { call: "pass" }, { call: "hokum", suit: "H" }]) };
  },
  strategies: [
    { name: "حكم بأكبر ورقة عندك", pick: (h) => top(h.filter((c) => c.suit === "H"), "hokum", "H") },
    { name: "حكم بأصغر ورقة", pick: (h) => (h.filter((c) => c.suit === "H").length > 1 ? low(h.filter((c) => c.suit === "H"), "hokum", "H") : undefined) },
    { name: "إكة من لون ثاني", pick: (h) => h.find((c) => c.rank === "A" && c.suit !== "H") },
    { name: "صغيرة من لون ثاني", pick: (h) => { const o = h.filter((c) => c.suit !== "H"); return o.length ? low(o, "hokum", "H") : undefined; } },
  ],
};

const Q4: StrategyQuestion = {
  title: "السؤال ٤: خويك هرّب بنت هاص، ثم سبعة ديمن، ثم تسعة ديمن — وش ترجع له؟",
  notes: ["صن وخويك المشتري. ثلاث أكلات شرية وخويك فاضي منها، وأنت أكلت الثالثة. يدك فيها أسود (سبيت) وأحمر."],
  build: (rand) => {
    const t1 = [C("AC"), C("QH"), C("7C"), C("8C")];
    const t2 = [C("KC"), C("7D"), C("JC"), C("QC")];
    const t3a = [C("9C"), C("9D")];
    const s3 = dealRest(rand, [...t1, ...t2, ...t3a, C("10C")], 1, (h) => h[0].suit !== "C");
    if (!s3) return undefined;
    const t3 = [...t3a, s3[0], C("10C")];
    const ground = C("KS");
    const hand = dealRest(rand, [...t1, ...t2, ...t3, ground], 5, (h) => h.some((c) => c.suit === "S") && h.some((c) => c.suit === "H" || c.suit === "D") && !h.some((c) => c.suit === "C"));
    if (!hand) return undefined;
    return {
      mode: "sun",
      declarer: 2,
      ground,
      tricks: [{ leader: 1, cards: t1 }, { leader: 1, cards: t2 }, { leader: 1, cards: t3 }],
      hand,
      bids: auction(0, ground, [{ call: "pass" }, { call: "sun" }]),
    };
  },
  strategies: [
    { name: "ترجع أسود (سبيت)", pick: (h) => low(h.filter((c) => c.suit === "S"), "sun") },
    { name: "ترجع ديمن", pick: (h) => { const d = h.filter((c) => c.suit === "D"); return d.length ? low(d, "sun") : undefined; } },
    { name: "ترجع هاص", pick: (h) => { const x = h.filter((c) => c.suit === "H"); return x.length ? low(x, "sun") : undefined; } },
  ],
};

const Q5 = (who: "me" | "partner" | "them"): StrategyQuestion => ({
  title: `السؤال ٥ (عام): أول حلة في الصن ويدك فيها إكك — تصرف الإكة ولا تطلع برا اللعب؟ (${who === "me" ? "أنت المشتري" : who === "partner" ? "خويك المشتري" : "الخصم المشتري"})`,
  notes: ["يد عشوائية فيها إكة واحدة على الأقل ولون بدون إكة، والحلة عندك في أول أكلة."],
  build: (rand) => {
    const seat: Seat = who === "me" ? 0 : who === "partner" ? 2 : 1;
    const ground = C(who === "me" ? "9D" : "JC");
    const hand = dealRest(rand, who === "me" ? [] : [ground], who === "me" ? 7 : 8, (h) => h.some((c) => c.rank === "A") && SUITS.some((s) => h.some((c) => c.suit === s) && !h.some((c) => c.suit === s && c.rank === "A")));
    if (!hand) return undefined;
    if (who === "me") {
      if (hand.some((c) => c.suit === ground.suit && c.rank === ground.rank)) return undefined;
      hand.push(ground);
    }
    const calls: Array<{ call: "sun" | "pass" }> = who === "me" ? [{ call: "sun" }] : who === "them" ? [{ call: "pass" }, { call: "sun" }] : [{ call: "pass" }, { call: "pass" }, { call: "sun" }];
    return { mode: "sun", declarer: seat, ground, tricks: [], hand, bids: auction(3, ground, calls) };
  },
  strategies: [
    { name: "تصرف إكة (أطول لون فيه إكة)", pick: (h) => { const aces = h.filter((c) => c.rank === "A"); return aces.length ? aces.reduce((a, b) => (h.filter((c) => c.suit === b.suit).length > h.filter((c) => c.suit === a.suit).length ? b : a)) : undefined; } },
    { name: "تطلع برا اللعب: صغيرة من لون بدون إكة", pick: (h) => { const o = h.filter((c) => !h.some((x) => x.suit === c.suit && x.rank === "A")); return o.length ? low(o, "sun") : undefined; } },
    { name: "صغيرة من لون الإكة", pick: (h) => { const o = h.filter((c) => c.rank !== "A" && h.some((x) => x.suit === c.suit && x.rank === "A")); return o.length ? low(o, "sun") : undefined; } },
  ],
});

if (!only || only === "q2") q2();
for (const [i, q] of [Q1, Q3, Q4, Q5("me"), Q5("partner"), Q5("them")].entries()) {
  if (only && only !== ["q1", "q3", "q4", "q5-me", "q5-partner", "q5-them"][i]) continue;
  out.push(`## ${q.title}`, "", ...q.notes.map((n) => `- ${n}`), "", `على ${HANDS} يد، كل يد ${PER_HAND} توزيعة، والباقي يلعبه **القواعد**:`, "");
  runStrategies(q, 50 + i, "rules");
}

writeFileSync(new URL(`../docs/ai-deep-analysis${only ? "-" + only : ""}.md`, import.meta.url), out.join("\n"));
console.log("done");
