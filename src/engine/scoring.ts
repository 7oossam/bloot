import { cardPoints, LAST_TRICK_BONUS, MODE_MULTIPLIER } from "./cards";
import type { HandResult, HandSheet, Mode, Seat, SheetProject, Suit, Team, Trick } from "./types";
import { teamOf } from "./types";
import { BALOOT_RAW, BALOOT_VALUE, PROJECT_NAME_AR, PROJECT_RAW, PROJECT_VALUE, type ProjectsOutcome } from "./projects";

/** What a كبوت (all eight tricks) is worth instead of the hand's usual 16/26 (7-7). */
export const KABOOT_VALUE: Record<Mode, number> = { hokum: 25, sun: 44 };

/** The projects side of a hand, as Round knows it once play is over. */
export interface HandExtras {
  projects?: ProjectsOutcome;
  /** The seat whose بلوت counts this hand, if any. */
  baloot?: Seat;
}

/**
 * Tallies a completed hand (8 resolved tricks) into the النشرة and game points, per the
 * official regulation (docs/baloot-guide.md, "اللائحة"):
 *
 * - Each side's أبناط = its card points + الأرض (the last trick) + its projects' raw value.
 * - If the other side's أبناط beat the buyer's, the buyer lost ("خسرانة", البند 4): the other
 *   side takes the whole hand and every project. بلوت always stays with whoever held it.
 * - Otherwise the non-buyer's card points are rounded (4-10/4-11) and the buyer gets the rest
 *   of the hand's value; each side then adds its own projects.
 * - An exact tie ("متعادلة") gives each side its own points (the regulation only names the tie
 *   for doubled hands — see the guide's note).
 * - A كبوت is worth 25 in hokum and 44 in sun, and its side takes every project.
 *
 * `lastTrickBonus` defaults to 10 but a joker can change it.
 */
export function scoreHand(
  tricks: Trick[],
  mode: Mode,
  trumpSuit: Suit | undefined,
  declarerTeam: Team,
  lastTrickBonus: number = LAST_TRICK_BONUS,
  extras: HandExtras = {},
): HandResult {
  const cards: Record<Team, number> = { 0: 0, 1: 0 };
  const ground: Record<Team, number> = { 0: 0, 1: 0 };
  const tricksWon: Record<Team, number> = { 0: 0, 1: 0 };

  tricks.forEach((trick, index) => {
    if (trick.winner === undefined) throw new Error(`Trick ${index} has no winner`);
    const winningTeam = teamOf(trick.winner);
    tricksWon[winningTeam]++;
    for (const seat of trick.order) cards[winningTeam] += cardPoints(trick.cards[seat]!, mode, trumpSuit);
    if (index === tricks.length - 1) ground[winningTeam] += lastTrickBonus;
  });
  const rawPoints: Record<Team, number> = { 0: cards[0] + ground[0], 1: cards[1] + ground[1] };

  // Projects: only the team with the best project scores them (resolveProjects); بلوت is apart.
  const projects: Record<Team, SheetProject[]> = { 0: [], 1: [] };
  const projectGame: Record<Team, number> = { 0: 0, 1: 0 };
  const outcome = extras.projects;
  if (outcome?.winner !== undefined) {
    for (const p of outcome.declared.filter((d) => teamOf(d.seat) === outcome.winner)) {
      projects[outcome.winner].push({ name: PROJECT_NAME_AR[p.kind], raw: PROJECT_RAW[p.kind], seat: p.seat });
      projectGame[outcome.winner] += PROJECT_VALUE[mode][p.kind];
    }
  }
  const balootTeam = extras.baloot !== undefined ? teamOf(extras.baloot) : undefined;
  if (balootTeam !== undefined) projects[balootTeam].push({ name: PROJECT_NAME_AR.baloot, raw: BALOOT_RAW, seat: extras.baloot! });

  const projectRaw = (t: Team) => projects[t].reduce((sum, p) => sum + p.raw, 0);
  const abnat: Record<Team, number> = { 0: rawPoints[0] + projectRaw(0), 1: rawPoints[1] + projectRaw(1) };

  const other: Team = declarerTeam === 0 ? 1 : 0;
  const handValue = handWorth(rawPoints[0] + rawPoints[1], mode);
  const result: Record<Team, number> = { 0: 0, 1: 0 };
  const projectPoints: Record<Team, number> = { 0: 0, 1: 0 };
  const allProjects = projectGame[0] + projectGame[1];
  let buyer: HandSheet["outcome"];
  let kaboot: Team | undefined;

  const kabootTeam = ([0, 1] as Team[]).find((t) => tricksWon[t] === tricks.length && tricks.length === 8);
  if (kabootTeam !== undefined) {
    kaboot = kabootTeam;
    buyer = kabootTeam === declarerTeam ? "won" : "lost";
    // A joker that changes الأرض still shifts the كبوت by the same amount.
    result[kabootTeam] = KABOOT_VALUE[mode] + handValue - handWorth(mode === "hokum" ? 162 : 130, mode);
    projectPoints[kabootTeam] = allProjects;
  } else if (abnat[other] > abnat[declarerTeam]) {
    buyer = "lost";
    result[other] = handValue;
    projectPoints[other] = allProjects;
  } else {
    buyer = abnat[other] === abnat[declarerTeam] ? "tie" : "won";
    result[other] = Math.min(roundNonBuyer(rawPoints[other], mode), handValue);
    result[declarerTeam] = handValue - result[other];
    projectPoints[0] = projectGame[0];
    projectPoints[1] = projectGame[1];
  }
  if (balootTeam !== undefined) projectPoints[balootTeam] += BALOOT_VALUE;

  const gamePoints: Record<Team, number> = { 0: result[0] + projectPoints[0], 1: result[1] + projectPoints[1] };
  const multiplier = MODE_MULTIPLIER[mode];
  const sheet: HandSheet = { cards, ground, projects, abnat, result: gamePoints, outcome: buyer, kaboot };

  return {
    mode,
    trumpSuit,
    declarerTeam,
    rawPoints,
    scoredPoints: { 0: rawPoints[0] * multiplier, 1: rawPoints[1] * multiplier },
    gamePoints,
    tricksWon,
    projectPoints,
    baloot: extras.baloot,
    sheet,
  };
}

/**
 * The non-buyer's card points as game points (4-10, 4-11): hokum ÷10 where a remainder of
 * 1–5 drops and 6–9 rounds up; sun ÷10 where 5 and up rounds up, then ×2.
 */
export function roundNonBuyer(raw: number, mode: Mode): number {
  const tens = Math.floor(raw / 10);
  const rest = raw % 10;
  return mode === "hokum" ? tens + (rest >= 6 ? 1 : 0) : (tens + (rest >= 5 ? 1 : 0)) * 2;
}

/** A hand's game-point value from its raw total: 162 → 16 in hokum, 130 → 26 in sun. */
function handWorth(totalRaw: number, mode: Mode): number {
  const tens = Math.round(totalRaw / 10);
  return mode === "hokum" ? tens : tens * 2;
}

/**
 * Game points for a hand without projects: the non-buyer is rounded by the rule and the
 * buyer takes the rest of the hand's value (or all of it goes to the non-buyer if the
 * buyer lost). Kept for callers that only have raw card points.
 */
export function toGamePoints(raw: Record<Team, number>, mode: Mode, declarerTeam: Team): Record<Team, number> {
  const other: Team = declarerTeam === 0 ? 1 : 0;
  const total = handWorth(raw[0] + raw[1], mode);
  if (raw[other] > raw[declarerTeam]) return { [declarerTeam]: 0, [other]: total } as Record<Team, number>;
  const theirs = Math.min(roundNonBuyer(raw[other], mode), total);
  return { [declarerTeam]: total - theirs, [other]: theirs } as Record<Team, number>;
}
