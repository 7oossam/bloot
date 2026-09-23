import type { Card, Mode, Rank, Seat, Suit, Team } from "./types";
import { nextSeat, teamOf } from "./types";

/**
 * المشاريع (projects), per docs/baloot-guide.md §1:
 *
 * - سرا:     3 cards in sequence, same suit.
 * - خمسين:   4 in sequence.
 * - مئة:     5 in sequence, or four of a kind — Aces, Kings, Queens, 10s in both modes, and
 *            Jacks in hokum only. (Four Aces in sun is أربعمئة instead.)
 * - أربعمئة: four Aces, sun only.
 * - بلوت:    trump King + Queen in hokum; scored when the second of the two is played
 *            (handled by Round, not here — it isn't compared against the other team).
 *
 * Sequences run in the natural order 7-8-9-10-J-Q-K-A whatever the contract.
 */

export type ProjectKind = "sira" | "khamsin" | "miya" | "arbaamiya";

export interface Project {
  kind: ProjectKind;
  seat: Seat;
  cards: Card[];
}

export const PROJECT_NAME_AR: Record<ProjectKind | "baloot", string> = {
  sira: "سرا",
  khamsin: "خمسين",
  miya: "مئة",
  arbaamiya: "أربعمئة",
  baloot: "بلوت",
};

/** Game points (القيد) each project is worth. Sun values are hokum's ×2 (raw ÷5, not ÷10). */
export const PROJECT_VALUE: Record<Mode, Record<ProjectKind, number>> = {
  hokum: { sira: 2, khamsin: 5, miya: 10, arbaamiya: 0 },
  sun: { sira: 4, khamsin: 10, miya: 20, arbaamiya: 40 },
};
export const BALOOT_VALUE = 2;

const SEQUENCE_ORDER: readonly Rank[] = ["7", "8", "9", "10", "J", "Q", "K", "A"];
const KIND_RANK: Record<ProjectKind, number> = { sira: 1, khamsin: 2, miya: 3, arbaamiya: 4 };

function kindFromRun(length: number): ProjectKind | undefined {
  if (length >= 5) return "miya";
  if (length === 4) return "khamsin";
  if (length === 3) return "sira";
  return undefined;
}

function fourOfAKinds(hand: Card[], mode: Mode, seat: Seat): Project[] {
  const out: Project[] = [];
  for (const rank of ["A", "K", "Q", "10", "J"] as Rank[]) {
    const cards = hand.filter((c) => c.rank === rank);
    if (cards.length < 4) continue;
    if (rank === "J" && mode !== "hokum") continue;
    const kind: ProjectKind = rank === "A" && mode === "sun" ? "arbaamiya" : "miya";
    out.push({ kind, seat, cards: cards.slice(0, 4) });
  }
  return out;
}

function sequences(hand: Card[], seat: Seat): Project[] {
  const out: Project[] = [];
  for (const suit of ["S", "H", "D", "C"] as Suit[]) {
    const idx = [...new Set(hand.filter((c) => c.suit === suit).map((c) => SEQUENCE_ORDER.indexOf(c.rank)))].sort((a, b) => a - b);
    let start = 0;
    for (let i = 1; i <= idx.length; i++) {
      if (i < idx.length && idx[i] === idx[i - 1] + 1) continue;
      const run = idx.slice(start, i);
      const kind = kindFromRun(run.length);
      if (kind) out.push({ kind, seat, cards: run.map((r) => ({ suit, rank: SEQUENCE_ORDER[r] })) });
      start = i;
    }
  }
  return out;
}

const valueOf = (projects: Project[], mode: Mode) => projects.reduce((sum, p) => sum + PROJECT_VALUE[mode][p.kind], 0);

/**
 * One seat's projects. A card can only count in one project, so when four-of-a-kind and a
 * sequence share cards, whichever reading is worth more wins.
 */
export function findProjects(hand: Card[], mode: Mode, seat: Seat): Project[] {
  const key = (c: Card) => c.suit + c.rank;
  const fours = fourOfAKinds(hand, mode, seat);
  const used = new Set(fours.flatMap((p) => p.cards.map(key)));
  const foursFirst = [...fours, ...sequences(hand.filter((c) => !used.has(key(c))), seat)];

  const seqs = sequences(hand, seat);
  const usedBySeq = new Set(seqs.flatMap((p) => p.cards.map(key)));
  const seqsFirst = [...seqs, ...fourOfAKinds(hand.filter((c) => !usedBySeq.has(key(c))), mode, seat)];

  const best = valueOf(foursFirst, mode) >= valueOf(seqsFirst, mode) ? foursFirst : seqsFirst;
  return best.filter((p) => PROJECT_VALUE[mode][p.kind] > 0);
}

/** Orders two projects: bigger kind first, then the higher top card. 0 = identical. */
function compareProjects(a: Project, b: Project): number {
  if (KIND_RANK[a.kind] !== KIND_RANK[b.kind]) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
  const top = (p: Project) => Math.max(...p.cards.map((c) => SEQUENCE_ORDER.indexOf(c.rank)));
  return top(a) - top(b);
}

export interface ProjectsOutcome {
  /** Every project each seat holds, in play order from the first leader. */
  declared: Project[];
  /** The team whose projects count — only one team scores projects in a hand. */
  winner?: Team;
  /** Game points the projects are worth to each team. */
  points: Record<Team, number>;
}

/**
 * Decides whose projects count. Only the team holding the single best project scores, and
 * then it scores all of its projects. An exact tie goes to whoever plays first (the leader
 * is the dealer's right).
 */
export function resolveProjects(hands: Record<Seat, Card[]>, mode: Mode, leader: Seat): ProjectsOutcome {
  const order: Seat[] = [leader, nextSeat(leader), nextSeat(nextSeat(leader)), nextSeat(nextSeat(nextSeat(leader)))];
  const declared = order.flatMap((seat) => findProjects(hands[seat], mode, seat));
  const points: Record<Team, number> = { 0: 0, 1: 0 };
  if (declared.length === 0) return { declared, points };

  let best = declared[0];
  for (const p of declared.slice(1)) if (compareProjects(p, best) > 0) best = p; // strict: earlier seat keeps ties
  const winner = teamOf(best.seat);
  points[winner] = valueOf(declared.filter((p) => teamOf(p.seat) === winner), mode);
  return { declared, winner, points };
}
