import { cardPoints, LAST_TRICK_BONUS, MODE_MULTIPLIER } from "./cards";
import type { HandResult, Mode, Suit, Team, Trick } from "./types";
import { teamOf } from "./types";

/**
 * Tallies a completed hand (8 resolved tricks) into raw and mode-scored
 * points per team. Assumes every trick has a `winner` set.
 *
 * NOTE (simplification): this does not yet apply the "declarer must out-score
 * the defense or the whole hand's points go to the defense" rule some tables
 * play. Flag if you want that added.
 */
export function scoreHand(
  tricks: Trick[],
  mode: Mode,
  trumpSuit: Suit | undefined,
  declarerTeam: Team,
): HandResult {
  const rawPoints: Record<Team, number> = { 0: 0, 1: 0 };
  const tricksWon: Record<Team, number> = { 0: 0, 1: 0 };

  tricks.forEach((trick, index) => {
    if (trick.winner === undefined) throw new Error(`Trick ${index} has no winner`);
    const winningTeam = teamOf(trick.winner);
    tricksWon[winningTeam]++;
    for (const seat of trick.order) {
      rawPoints[winningTeam] += cardPoints(trick.cards[seat]!, mode, trumpSuit);
    }
    if (index === tricks.length - 1) {
      rawPoints[winningTeam] += LAST_TRICK_BONUS;
    }
  });

  const multiplier = MODE_MULTIPLIER[mode];
  const scoredPoints: Record<Team, number> = {
    0: rawPoints[0] * multiplier,
    1: rawPoints[1] * multiplier,
  };

  return { mode, trumpSuit, declarerTeam, rawPoints, scoredPoints, tricksWon };
}
