/**
 * Analyses a صكة (or a batch of notes) the player copied from «ليش؟»: replays every hand with
 * all cards face up and measures each computer play against the best card (src/ai/solver.ts).
 *
 *   npx vite-node scripts/analyze-match.ts <file with the pasted text> [minLoss=5]
 *
 * Prints, per hand, every play that cost its team `minLoss` raw points or more, with what the
 * AI was thinking at the time (its kind, its habit, its top scores) — the starting point for
 * deciding what to fix.
 */
import { readFileSync } from "node:fs";
import { reviewHand } from "../src/ai/solver";
import type { Card, Seat, Suit, Trick } from "../src/engine/types";
import type { HandSnapshot } from "../src/game/GameController";

const SEAT = ["أنت", "يمين", "خويك", "يسار"];
const card = (id: string): Card => ({ suit: id[0] as Suit, rank: id.slice(1) as Card["rank"] });
const name = (c: Card) => c.suit + c.rank;

const raw = readFileSync(process.argv[2], "utf8");
const json = raw.includes("```json") ? raw.slice(raw.indexOf("```json") + 7, raw.lastIndexOf("```")) : raw;
const data = JSON.parse(json);
const hands: HandSnapshot[] = Array.isArray(data) ? data.map((n: { snapshot: HandSnapshot }) => n.snapshot) : data.hands ?? [data];
const minLoss = Number(process.argv[3] ?? 5);

hands.forEach((h, i) => {
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
  const reviews = reviewHand(start, tricks, mode, trumpSuit, [1, 2, 3]);
  const lost = reviews.filter((r) => r.lost >= minLoss);
  console.log(`\n=== اليد ${i + 1}: ${mode === "sun" ? "صن" : `حكم ${trumpSuit}`} — المشتري ${SEAT[declarer]} — ${tricks.length} أكلات (${Date.now() - started}ms)`);
  for (const r of lost) {
    const why = h.plays.find((p) => p.seat === r.seat && p.trick === r.trick);
    console.log(
      `  الأكلة ${r.trick} — ${SEAT[r.seat]}: لعب ${name(r.played)}، الأفضل ${name(r.best)} (خسر ${r.lost} بنط)` +
        (why ? `  [${why.kind}${why.habit ? `، العادة ${why.habit}` : ""}${why.scores ? `، ${why.scores.slice(0, 3).join(" ")}` : ""}${why.rules?.length ? `، قواعد: ${why.rules.join("؛ ")}` : ""}]` : ""),
    );
  }
  const bySeat = [1, 2, 3].map((s) => `${SEAT[s]} ${reviews.filter((r) => r.seat === s).reduce((n, r) => n + r.lost, 0)}`);
  console.log(`  مجموع الأبناط الضايعة: ${bySeat.join("، ")}`);
});
