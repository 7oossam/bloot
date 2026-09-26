/**
 * Analyses what the player copied from «ليش؟» — all their saved play (many صكات), one صكة, or
 * a batch of notes: replays every hand with all cards face up and measures each computer play
 * against the best card (src/ai/solver.ts).
 *
 *   npx vite-node scripts/analyze-match.ts <file with the pasted text> [minLoss=5]
 *
 * Prints, per hand, every play that cost its team `minLoss` raw points or more, with what the
 * AI was thinking at the time (its kind, its habit, its top scores), then a summary of where
 * the points went — the starting point for deciding what to fix. A hand takes seconds to over
 * a minute, so a big batch can be split: SHARD=2/4 analyses every 4th hand starting from the
 * 2nd (run 1/4 … 4/4 side by side).
 */
import { readFileSync } from "node:fs";
import { reviewHand } from "../src/ai/solver";
import type { Card, Seat, Suit, Trick, TrickRules } from "../src/engine/types";
import type { HandSnapshot } from "../src/game/GameController";

type Hand = Omit<HandSnapshot, "hands" | "currentTrick" | "initialHands"> & { match?: string };

const SEAT = ["أنت", "يمين", "خويك", "يسار"];
const card = (id: string): Card => ({ suit: id[0] as Suit, rank: id.slice(1) as Card["rank"] });
const name = (c: Card) => c.suit + c.rank;

const raw = readFileSync(process.argv[2], "utf8");
const json = raw.includes("```json") ? raw.slice(raw.indexOf("```json") + 7, raw.lastIndexOf("```")) : raw;
const data = JSON.parse(json);
const hands: Hand[] = Array.isArray(data) ? data.map((n: { snapshot: HandSnapshot }) => n.snapshot) : data.hands ?? [data];
const minLoss = Number(process.argv[3] ?? 5);
const [shard, shards] = (process.env.SHARD ?? "1/1").split("/").map(Number);

// Number the hands within their صكة, for the labels.
const matchNo = new Map<string, number>();
const handNo: number[] = [];
const seen = new Map<string, number>();
for (const h of hands) {
  const m = h.match ?? "";
  if (!matchNo.has(m)) matchNo.set(m, matchNo.size + 1);
  seen.set(m, (seen.get(m) ?? 0) + 1);
  handNo.push(seen.get(m)!);
}

/** Older exports carry only the rival's name: the rules that bend the tricks, from it. */
function rulesFromRival(rival?: string): TrickRules | undefined {
  if (rival?.includes("خاطفين الولد")) return { rival: { weakJack: 0, jackBottom: true } };
  if (rival?.includes("حرّاس الإكك")) return { rival: { noAceLead: 0 } };
  return undefined;
}

const lostBySeat = [0, 0, 0, 0];
const byKind = new Map<string, { n: number; points: number }>();
const byRule = new Map<string, { n: number; points: number }>();
const tally = (map: Map<string, { n: number; points: number }>, key: string, points: number) => {
  const e = map.get(key) ?? { n: 0, points: 0 };
  map.set(key, { n: e.n + 1, points: e.points + points });
};
let analysed = 0;

hands.forEach((h, i) => {
  if ((i % shards) + 1 !== shard) return;
  if (!h.contract || !h.startHands) return;
  const { mode, trumpSuit, declarer } = h.contract;
  const start = Object.fromEntries(([0, 1, 2, 3] as Seat[]).map((s) => [s, h.startHands[s].map(card)])) as Record<Seat, Card[]>;
  const tricks: Trick[] = h.tricks.map((t) => {
    const trick: Trick = { leader: t.leader, cards: {}, order: [] };
    for (const e of t.cards) {
      const [s, id] = e.split(":");
      trick.cards[Number(s) as Seat] = card(id);
      trick.order.push(Number(s) as Seat);
    }
    return trick;
  });
  const started = Date.now();
  const rules = h.trickRules ?? rulesFromRival(h.rival);
  const reviews = reviewHand(start, tricks, mode, trumpSuit, [1, 2, 3], { rules });
  analysed++;
  const lost = reviews.filter((r) => r.lost >= minLoss);
  const label = matchNo.size > 1 ? `الصكة ${matchNo.get(h.match ?? "")} — اليد ${handNo[i]}` : `اليد ${i + 1}`;
  console.log(`\n=== ${label}: ${mode === "sun" ? "صن" : `حكم ${trumpSuit}`} — المشتري ${SEAT[declarer]} — ${tricks.length} أكلات (${Date.now() - started}ms)`);
  for (const r of reviews) lostBySeat[r.seat] += r.lost;
  for (const r of lost) {
    const why = h.plays.find((p) => p.seat === r.seat && p.trick === r.trick);
    tally(byKind, why?.kind ?? "?", r.lost);
    for (const rule of why?.rules ?? []) tally(byRule, rule, r.lost);
    console.log(
      `  الأكلة ${r.trick} — ${SEAT[r.seat]}: لعب ${name(r.played)}، الأفضل ${name(r.best)} (خسر ${r.lost} بنط)` +
        (why ? `  [${why.kind}${why.habit ? `، العادة ${why.habit}` : ""}${why.scores ? `، ${why.scores.slice(0, 3).join(" ")}` : ""}${why.rules?.length ? `، قواعد: ${why.rules.join("؛ ")}` : ""}]` : ""),
    );
  }
  const bySeat = [1, 2, 3].map((s) => `${SEAT[s]} ${reviews.filter((r) => r.seat === s).reduce((n, r) => n + r.lost, 0)}`);
  console.log(`  مجموع الأبناط الضايعة: ${bySeat.join("، ")}`);
});

const top = (map: Map<string, { n: number; points: number }>) =>
  [...map].sort((a, b) => b[1].points - a[1].points).slice(0, 10).map(([k, v]) => `    ${k}: ${v.n} مرة، ${v.points} بنط`).join("\n");
console.log(`\n### الملخص (${analysed} يد${shards > 1 ? `، الجزء ${shard}/${shards}` : ""})`);
console.log(`  الأبناط الضايعة: ${[1, 2, 3].map((s) => `${SEAT[s]} ${lostBySeat[s]}`).join("، ")}`);
console.log(`  حسب نوع القرار:\n${top(byKind)}`);
if (byRule.size) console.log(`  القواعد اللي كانت شغالة وقت الخسارة:\n${top(byRule)}`);
