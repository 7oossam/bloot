/**
 * Self-play data for the learned card policy (src/ai/policy.ts).
 *
 * The search AI plays every seat. At each decision with a real choice it records every legal
 * card's features and a soft target: the search's average margins turned into probabilities
 * (softmax at `--temp` game points). Cards the player's rules forbid get probability 0, so the
 * policy learns those rules too.
 *
 *   npx vite-node scripts/selfplay.ts -- --hands 1500 --seed 1 --worlds 30 --out data.jsonl [--policy weights.json]
 *
 * With --policy, the search plays its guesses out with that trained policy instead of the
 * rule-based AI — the next round of the self-play loop.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { decideBid } from "../src/ai/bidding-ai";
import { decideDouble } from "../src/ai/doubling-ai";
import { searchVerdict, type PlayoutPolicy } from "../src/ai/mcts";
import { cardFeatures, makePolicy, type PolicyWeights } from "../src/ai/policy";
import { cardId } from "../src/engine/cards";
import { Round } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import type { Seat } from "../src/engine/types";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const hands = Number(arg("hands", "200"));
const seed0 = Number(arg("seed", "1"));
const worlds = Number(arg("worlds", "30"));
const temp = Number(arg("temp", "2"));
const out = arg("out", "selfplay.jsonl");
const policyPath = arg("policy", "");
const playout: PlayoutPolicy | undefined = policyPath ? makePolicy(JSON.parse(readFileSync(policyPath, "utf8")) as PolicyWeights) : undefined;

writeFileSync(out, "");
let played = 0, decisions = 0;
const started = Date.now();
for (let seed = seed0; played < hands; seed++) {
  const rand = mulberry32(seed);
  const r = new Round((seed % 4) as Seat, rand);
  for (let i = 0; i < 20 && r.phase === "bidding"; i++) r.bid(decideBid(r.bidding.turnSeat, r.hands[r.bidding.turnSeat], r.bidding));
  if (r.phase !== "playing" && r.phase !== "doubling") continue;
  while (r.phase === "doubling") {
    const d = r.doubling!;
    r.double(decideDouble(d.turnSeat, r.hands[d.turnSeat], d, r.bidding.result!.trumpSuit));
  }
  const res = r.bidding.result!;
  const lines: string[] = [];
  while (r.phase === "playing") {
    const seat = r.turnSeat!;
    const legal = r.legalMovesFor(seat);
    const ctx = {
      tricks: r.tricks,
      declarer: res.declarer,
      ashkalSuits: seat === res.ashkal?.groundTo ? res.ashkal.signalSuits : undefined,
      closed: r.closed,
    };
    const verdict = searchVerdict(r, seat, { worlds, rand, ctx, playout });
    if (legal.length > 1) {
      let target: number[];
      if (verdict.scores) {
        const s = legal.map((c) => verdict.scores!.get(cardId(c)));
        const top = Math.max(...s.map((x) => (x === undefined ? -Infinity : x)));
        const e = s.map((x) => (x === undefined ? 0 : Math.exp((x - top) / temp)));
        const z = e.reduce((a, b) => a + b, 0);
        target = e.map((x) => x / z);
      } else {
        target = legal.map((c) => (cardId(c) === cardId(verdict.choice) ? 1 : 0));
      }
      const f = cardFeatures(legal, r.hands[seat], r.currentTrick!, res.mode, res.trumpSuit, seat, ctx);
      lines.push(JSON.stringify({ f: f.map((row) => row.map((x) => Math.round(x * 1000) / 1000)), t: target.map((x) => Math.round(x * 1000) / 1000) }));
      decisions++;
    }
    r.playCard(seat, verdict.choice);
  }
  appendFileSync(out, lines.length ? lines.join("\n") + "\n" : "");
  played++;
  if (played % 100 === 0) console.log(`${played}/${hands} hands, ${decisions} decisions, ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
console.log(`done: ${played} hands, ${decisions} decisions → ${out}`);
