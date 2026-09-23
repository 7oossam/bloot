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

  return { mode, trumpSuit, declarerTeam, rawPoints, scoredPoints, gamePoints: toGamePoints(rawPoints, mode, declarerTeam), tricksWon };
}

/**
 * Converts a hand's raw points (card points + الأرض) to game points ("القيد"), per
 * docs/baloot-guide.md §2:
 *
 * - hokum: ÷10, a remainder of 1–5 is dropped and 6–9 rounds up;
 * - sun:   ÷5,  a remainder of 1–2 is dropped and 3–4 rounds up.
 *
 * Rounding both teams that way can over-count the hand (86/76 in hokum gives 9 + 8 = 17
 * when a hokum hand is worth 16), so the buyer is rounded by the rule and the other side
 * takes whatever is left of the hand's value.
 */
export function toGamePoints(raw: Record<Team, number>, mode: Mode, declarerTeam: Team): Record<Team, number> {
  const divisor = mode === "hokum" ? 10 : 5;
  const roundUpFrom = mode === "hokum" ? 6 : 3;
  const round = (points: number) => Math.floor(points / divisor) + (points % divisor >= roundUpFrom ? 1 : 0);

  const total = Math.round((raw[0] + raw[1]) / divisor);
  const other: Team = declarerTeam === 0 ? 1 : 0;
  const buyer = Math.min(round(raw[declarerTeam]), total);
  return { [declarerTeam]: buyer, [other]: total - buyer } as Record<Team, number>;
}
