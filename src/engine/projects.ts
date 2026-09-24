import type { Card, Mode, Rank, Seat, Suit, Team } from "./types";
import { nextSeat, teamOf } from "./types";

/**
 * المشاريع (projects), per docs/baloot-guide.md §1 and the official regulation (البند 5–6):
 *
 * - سرا:     3 cards in sequence, same suit.
 * - خمسين:   4 in sequence.
 * - مئة:     5 in sequence, or four of a kind of anything but 7/8/9 — Aces, Kings, Queens,
 *            Jacks, 10s. (Four Aces in sun is أربعمئة instead.)
 * - أربعمئة: four Aces, sun only — the biggest sun project (5-1).
 * - بلوت:    trump King + Queen in hokum; scored when the second of the two is played
 *            (handled by Round, not here — it isn't compared against the other team).
 *
 * Sequences run in the natural order 7-8-9-10-J-Q-K-A whatever the contract.
 * Between two مئة, a sequence beats four of a kind (5-2); four of a kind rank A > K > Q > J > 10
 * (5-3); a full tie goes to the seat nearer the dealer's right (5-7).
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

/**
 * Raw points (أبناط) each project adds to its team's count — what the النشرة shows, and what
 * decides whether the buyer lost (البند 4). بلوت is 20 raw too.
 */
export const PROJECT_RAW: Record<ProjectKind, number> = { sira: 20, khamsin: 50, miya: 100, arbaamiya: 200 };
export const BALOOT_RAW = 20;

/** Game points (القيد) each project is worth (البند 6): raw ÷10 in hokum, ×2 on top in sun. */
export const PROJECT_VALUE: Record<Mode, Record<ProjectKind, number>> = {
  hokum: { sira: 2, khamsin: 5, miya: 10, arbaamiya: 0 },
  sun: { sira: 4, khamsin: 10, miya: 20, arbaamiya: 40 },
};
/** بلوت is 2 in hokum and is never doubled (5-4). */
export const BALOOT_VALUE = 2;

export const SEQUENCE_ORDER: readonly Rank[] = ["7", "8", "9", "10", "J", "Q", "K", "A"];
const KIND_RANK: Record<ProjectKind, number> = { sira: 1, khamsin: 2, miya: 3, arbaamiya: 4 };

/** Joker rules that bend what counts as a project for one seat. */
export interface ProjectRules {
  /** نص سرا: two cards in sequence already make a سرا. */
  shortSira?: boolean;
  /** الأربع الصغار: four 7s, 8s or 9s count as مئة. */
  lowFours?: boolean;
  /** 3-card Sira = 4-card Sira (Khamsin). 4-card Sira = Miya. 3-of-a-kind = 4-of-a-kind (Miya). */
  phantomProjects?: boolean;
}

function kindFromRun(length: number, rules: ProjectRules = {}): ProjectKind | undefined {
  if (length >= 5 || (length === 4 && rules.phantomProjects)) return "miya";
  if (length === 4 || (length === 3 && rules.phantomProjects)) return "khamsin";
  if (length === 3 || (length === 2 && rules.shortSira)) return "sira";
  return undefined;
}

function fourOfAKinds(hand: Card[], mode: Mode, seat: Seat, rules: ProjectRules = {}): Project[] {
  const out: Project[] = [];
  const ranks: Rank[] = ["A", "K", "Q", "10", "J", ...(rules.lowFours ? (["9", "8", "7"] as Rank[]) : [])];
  for (const rank of ranks) {
    const cards = hand.filter((c) => c.rank === rank);
    if (cards.length < (rules.phantomProjects ? 3 : 4)) continue;
    const kind: ProjectKind = rank === "A" && mode === "sun" ? "arbaamiya" : "miya";
    out.push({ kind, seat, cards: cards.slice(0, rules.phantomProjects ? 3 : 4) });
  }
  return out;
}

function sequences(hand: Card[], seat: Seat, rules: ProjectRules = {}): Project[] {
  const out: Project[] = [];
  for (const suit of ["S", "H", "D", "C"] as Suit[]) {
    const idx = [...new Set(hand.filter((c) => c.suit === suit).map((c) => SEQUENCE_ORDER.indexOf(c.rank)))].sort((a, b) => a - b);
    let start = 0;
    for (let i = 1; i <= idx.length; i++) {
      if (i < idx.length && idx[i] === idx[i - 1] + 1) continue;
      const run = idx.slice(start, i);
      const kind = kindFromRun(run.length, rules);
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
export function findProjects(hand: Card[], mode: Mode, seat: Seat, rules: ProjectRules = {}): Project[] {
  const key = (c: Card) => c.suit + c.rank;
  const fours = fourOfAKinds(hand, mode, seat, rules);
  const used = new Set(fours.flatMap((p) => p.cards.map(key)));
  const foursFirst = [...fours, ...sequences(hand.filter((c) => !used.has(key(c))), seat, rules)];

  const seqs = sequences(hand, seat, rules);
  const usedBySeq = new Set(seqs.flatMap((p) => p.cards.map(key)));
  const seqsFirst = [...seqs, ...fourOfAKinds(hand.filter((c) => !usedBySeq.has(key(c))), mode, seat, rules)];

  const best = valueOf(foursFirst, mode) >= valueOf(seqsFirst, mode) ? foursFirst : seqsFirst;
  return best.filter((p) => PROJECT_VALUE[mode][p.kind] > 0);
}

const isFourOfAKind = (p: Project) => p.cards.length === 4 && p.cards.every((c) => c.rank === p.cards[0].rank);

/**
 * Orders two projects: bigger kind first; between two مئة a sequence beats four of a kind
 * (5-2); then the higher top card — which also gives A > K > Q > J > 10 for four of a kind
 * (5-3). 0 = identical.
 */
export function compareProjects(a: Project, b: Project): number {
  if (KIND_RANK[a.kind] !== KIND_RANK[b.kind]) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (a.kind === "miya" && isFourOfAKind(a) !== isFourOfAKind(b)) return isFourOfAKind(a) ? -1 : 1;
  const top = (p: Project) => Math.max(...p.cards.map((c) => SEQUENCE_ORDER.indexOf(c.rank)));
  return top(a) - top(b);
}

/** True when a seat's projects include four Kings or four Queens — then بلوت isn't called (5-8). */
export function hasFourKingsOrQueens(projects: Project[]): boolean {
  return projects.some((p) => isFourOfAKind(p) && (p.cards[0].rank === "K" || p.cards[0].rank === "Q"));
}

/** True when one of these projects is a sequence holding both `suit`'s King and Queen (5-6). */
export function sequenceHoldsKQ(projects: Project[], suit: Suit): boolean {
  return projects.some(
    (p) => !isFourOfAKind(p) && p.cards[0].suit === suit && p.cards.some((c) => c.rank === "K") && p.cards.some((c) => c.rank === "Q"),
  );
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
export function resolveProjects(
  hands: Record<Seat, Card[]>,
  mode: Mode,
  leader: Seat,
  rules: Partial<Record<Seat, ProjectRules>> = {},
): ProjectsOutcome {
  const order: Seat[] = [leader, nextSeat(leader), nextSeat(nextSeat(leader)), nextSeat(nextSeat(nextSeat(leader)))];
  const declared = order.flatMap((seat) => findProjects(hands[seat], mode, seat, rules[seat]));
  const points: Record<Team, number> = { 0: 0, 1: 0 };
  if (declared.length === 0) return { declared, points };

  let best = declared[0];
  for (const p of declared.slice(1)) if (compareProjects(p, best) > 0) best = p; // strict: earlier seat keeps ties
  const winner = teamOf(best.seat);
  points[winner] = valueOf(declared.filter((p) => teamOf(p.seat) === winner), mode);
  return { declared, winner, points };
}





