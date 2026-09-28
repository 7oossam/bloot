// Measures a joker loop against plain play, deal for deal: npx vite-node scripts/loop-sim.ts [hands]
import { GameController, HUMAN_SEAT, type MatchOptions } from "../src/game/GameController";
import { mulberry32 } from "../src/engine/rng";
import { decideBid, decideCard } from "../src/ai";
import { decideDouble } from "../src/ai/doubling-ai";
import { rankStrength } from "../src/engine/cards";
import type { Card } from "../src/engine/types";

const HANDS = Number(process.argv[2] ?? 400);
const kit: MatchOptions = { ruffSwap: 2, seal: { bothOpponents: false, partnerToo: false }, extraHokumSuits: ["S", "H", "D", "C"], ...(process.env.WORD === "1" ? { firstBidder: true, lockedHokum: true } : {}) };

/** القطّاع's pick: give away a lone side card (it makes a void, so the next cut comes), else the weakest side card. */
function giveAway(hand: Card[], trump?: string): Card {
  const side = hand.filter((c) => c.suit !== trump);
  if (side.length === 0) return hand[0];
  const count = (s: string) => side.filter((c) => c.suit === s).length;
  return [...side].sort((a, b) => count(a.suit) - count(b.suit) || rankStrength(a, "sun") - rankStrength(b, "sun"))[0];
}

function run(seed: number, opts: MatchOptions) {
  const c = new GameController(mulberry32(seed), { matchTarget: 9999, searchAI: process.env.SEARCH === "1", ...opts });
  let links = 0, maxChain = 0, hokumOurs = false;
  c.on("loop:chain", (e) => { links++; maxChain = Math.max(maxChain, e.count); byLabel[e.label] = (byLabel[e.label] ?? 0) + 1; });
  let out: { us: number; them: number; kaboot: boolean } | undefined;
  c.on("bidding:resolved", (e) => (hokumOurs = e.mode === "hokum" && e.declarer % 2 === 0));
  c.on("hand:complete", (e) => (out = { us: e.gained[0], them: e.gained[1], kaboot: e.kaboot }));
  c.startMatch();
  for (let i = 0; i < 400 && !out; i++) {
    const st = c.step();
    if (st !== "waiting-human") continue;
    const r = c.getRound();
    const action = c.getPendingAction();
    if (action && r.phase === "playing") { c.submitPlayerAction(giveAway(r.hands[HUMAN_SEAT], r.bidding.result?.trumpSuit)); continue; }
    if (r.phase === "bidding") c.submitPlayerBid(decideBid(HUMAN_SEAT, r.hands[HUMAN_SEAT], r.bidding));
    else if (r.phase === "doubling") c.submitPlayerDouble(decideDouble(HUMAN_SEAT, r.hands[HUMAN_SEAT], r.doubling!, r.bidding.result!.trumpSuit));
    else if (r.phase === "playing") { const res = r.bidding.result!; c.submitPlayerCard(decideCard(r.hands[HUMAN_SEAT], r.currentTrick!, res.mode, res.trumpSuit, HUMAN_SEAT, { tricks: r.tricks, declarer: res.declarer, closed: r.closed })); }
  }
  return { ...out!, links, maxChain, hokumOurs };
}

const byLabel: Record<string, number> = {};
let diff = 0, diff2 = 0, kb0 = 0, kb1 = 0, fired = 0, links = 0;
const chains: Record<number, number> = {};
for (let s = 1; s <= HANDS; s++) {
  const a = run(s, {}), b = run(s, kit);
  const d = (b.us - b.them) - (a.us - a.them);
  diff += d; diff2 += d * d;
  if (a.kaboot) kb0++;
  if (b.kaboot) kb1++;
  if (b.links) fired++;
  links += b.links;
  chains[b.maxChain] = (chains[b.maxChain] ?? 0) + 1;
}
const mean = diff / HANDS, sd = Math.sqrt(diff2 / HANDS - mean * mean);
console.log(`hands ${HANDS}: margin +${mean.toFixed(2)} a hand (±${(1.96 * sd / Math.sqrt(HANDS)).toFixed(2)})`);
console.log(`loop fired in ${(100 * fired / HANDS).toFixed(0)}% of hands, ${(links / Math.max(1, fired)).toFixed(1)} links when it did`);
console.log(`longest chain per hand:`, chains);
console.log("links by joker:", byLabel);
console.log(`كبوت لنا: ${kb0} → ${kb1}`);
