/**
 * How many hands a match to a target takes (the AI in every seat), to set the map's targets.
 * Run: npx vite-node scripts/pace-sim.ts
 */
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { decideDouble } from "../src/ai/doubling-ai";
import { GameController, HUMAN_SEAT } from "../src/game/GameController";
import { mulberry32 } from "../src/engine/rng";

function play(target: number, seed: number): number {
  const c = new GameController(mulberry32(seed), { matchTarget: target });
  let hands = 0;
  c.on("hand:complete", () => hands++);
  c.startMatch();
  for (let i = 0; i < 20000; i++) {
    const st = c.step();
    if (st === "match-complete") break;
    if (st !== "waiting-human") continue;
    const r = c.getRound();
    if (c.getPendingAction()) { c.skipPlayerAction(); continue; }
    if (r.phase === "bidding") c.submitPlayerBid(decideBid(HUMAN_SEAT, r.hands[HUMAN_SEAT], r.bidding));
    else if (r.phase === "doubling") c.submitPlayerDouble(decideDouble(HUMAN_SEAT, r.hands[HUMAN_SEAT], r.doubling!, r.bidding.result!.trumpSuit));
    else c.submitPlayerCard(decideCard(r.hands[HUMAN_SEAT], r.currentTrick!, r.bidding.result!.mode, r.bidding.result!.trumpSuit, HUMAN_SEAT, { tricks: r.tricks, closed: r.closed }));
  }
  return hands;
}

for (const target of [21, 31, 41, 51, 61, 81, 101, 131]) {
  const runs = Array.from({ length: 60 }, (_, i) => play(target, i + 1));
  const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
  console.log(`target ${target}: ${avg.toFixed(1)} hands on average (min ${Math.min(...runs)}, max ${Math.max(...runs)})`);
}
