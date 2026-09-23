import { cardPoints, LAST_TRICK_BONUS, MODE_MULTIPLIER } from "./cards";
import type { HandResult, Mode, Suit, Team, Trick } from "./types";
import { teamOf } from "./types";

/**
 * Tallies a completed hand (8 resolved tricks) into raw and mode-scored
 * points per team. Assumes every trick has a `winner` set.
 *
 * `lastTrickBonus` defaults to the standard 10 but is overridable so a
 * roguelike joker (e.g. "الأرض الذهبية") can change it without forking
 * this function.
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
  lastTrickBonus: number = LAST_TRICK_BONUS,
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
      rawPoints[winningTeam] += lastTrickBonus;
    }
  });

  const multiplier = MODE_MULTIPLIER[mode];
  const scoredPoints: Record<Team, number> = {
    0: rawPoints[0] * multiplier,
    1: rawPoints[1] * multiplier,
  };

  return { mode, trumpSuit, declarerTeam, rawPoints, scoredPoints, gamePoints: toGamePoints(scoredPoints), tricksWon };
}

/**
 * Converts scored card points to game points ("abnat"), the unit a match target is in.
 *
 * A hand's points go down by a factor of ten, and the two teams' shares must still add up to
 * the hand's full value (16 for hokum, 26 for sun, more when a joker raises the last-trick
 * bonus). Rounding each side independently can't guarantee that — 86/76 in hokum would give
 * 9 + 8 = 17 — so each team keeps its whole tens and the leftover point goes to the larger
 * remainder. That also reproduces the table rule that a hokum 5 rounds down: 85/77 -> 8/8.
 */
export function toGamePoints(scored: Record<Team, number>): Record<Team, number> {
  const total = Math.round((scored[0] + scored[1]) / 10);
  const whole: Record<Team, number> = { 0: Math.floor(scored[0] / 10), 1: Math.floor(scored[1] / 10) };
  let leftover = total - whole[0] - whole[1];
  // Larger remainder first; on a tie, the side that took more card points.
  const byRemainder: Team[] = ([0, 1] as Team[]).sort(
    (a, b) => scored[b] % 10 - scored[a] % 10 || scored[b] - scored[a],
  );
  for (const team of byRemainder) {
    if (leftover <= 0) break;
    whole[team]++;
    leftover--;
  }
  return whole;
}
