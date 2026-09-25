import { isTrumpCard } from "../engine/cards";
import type { ProjectsOutcome } from "../engine/projects";
import { teamOf, type HandResult, type Mode, type Seat, type Suit, type Team, type Trick } from "../engine/types";

/**
 * سوالف الطاولة: what the computer players say at the table, in the words Baloot players use
 * (the player's terms video). Pure functions from a table event to lines; the scene shows them
 * as bubbles. Your own seat never talks for you — a line that would be yours goes to your
 * partner, or is dropped.
 */
export interface ChatLine {
  seat: Seat;
  text: string;
}

const HUMAN: Seat = 0;
const partnerOf = (s: Seat) => ((s + 2) % 4) as Seat;

/** Someone on this team to say it (never the human). */
function voiceOf(team: Team, prefer?: Seat): Seat {
  if (prefer !== undefined && prefer !== HUMAN && teamOf(prefer) === team) return prefer;
  return team === teamOf(HUMAN) ? 2 : prefer !== undefined && teamOf(prefer) === team ? prefer : 1;
}

/** The buyer's partner cheers the buy: فن for a sun, حكيم for a hokum. */
export function contractLines(declarer: Seat, mode: Mode): ChatLine[] {
  const partner = partnerOf(declarer);
  if (partner === HUMAN) return [];
  return [{ seat: partner, text: mode === "sun" ? "فن! 👏" : "حكيم! 👏" }];
}

/** The partner cheers the winning projects: تعيش سنين for a خمسين… and for four hundred, silence. */
export function projectLines(outcome: ProjectsOutcome): ChatLine[] {
  if (outcome.winner === undefined) return [];
  const best = outcome.declared.filter((p) => teamOf(p.seat) === outcome.winner).sort((a, b) => rank(b.kind) - rank(a.kind))[0];
  if (!best) return [];
  const cheer: Record<string, string> = { sira: "سرا! حلوة", khamsin: "تعيش سنين!", miya: "مية! تعيش", arbaamiya: "🤐 … الله يحبك" };
  const speaker = partnerOf(best.seat) === HUMAN ? voiceOf(outcome.winner, best.seat) : partnerOf(best.seat);
  if (speaker === HUMAN) return [];
  return [{ seat: speaker, text: cheer[best.kind] }];
}

function rank(kind: string): number {
  return ["sira", "khamsin", "miya", "arbaamiya"].indexOf(kind);
}

/** بالزنوبة: an opponent's Ace ruffed with a tiny trump (a 7 or an 8) — said with relish. */
export function trickLines(trick: Trick, winner: Seat, mode: Mode, trumpSuit?: Suit): ChatLine[] {
  if (mode !== "hokum") return [];
  const card = trick.cards[winner]!;
  const led = trick.cards[trick.order[0]]!;
  if (!isTrumpCard(card, mode, trumpSuit) || isTrumpCard(led, mode, trumpSuit) || (card.rank !== "7" && card.rank !== "8")) return [];
  const aceOfTheirs = trick.order.some((s) => teamOf(s) !== teamOf(winner) && trick.cards[s]!.rank === "A" && !isTrumpCard(trick.cards[s]!, mode, trumpSuit));
  if (!aceOfTheirs) return [];
  return [{ seat: voiceOf(teamOf(winner), winner), text: "بالزنوبة! 😏" }];
}

/** End of a hand: كبوت, خسرانة, and "the first one's for the clueless" from whoever lost the first hand. */
export function handLines(result: HandResult, firstHand: boolean): ChatLine[] {
  const lines: ChatLine[] = [];
  const kabootTeam = ([0, 1] as Team[]).find((t) => result.tricksWon[t] === 8);
  const sheet = result.sheet;
  if (kabootTeam !== undefined) lines.push({ seat: voiceOf(kabootTeam), text: "كبوت! 🔥" });
  else if (sheet && sheet.outcome === "lost") {
    const other: Team = sheet.judgedTeam === 0 ? 1 : 0;
    lines.push({ seat: voiceOf(other), text: "خسرانة! 😄" });
  }
  if (firstHand && sheet?.winner !== undefined && lines.length === 0) {
    const loser: Team = sheet.winner === 0 ? 1 : 0;
    lines.push({ seat: voiceOf(loser), text: "الأولى للغشمان 🙄" });
  }
  return lines;
}

/** قامت: the match is over — said by the side that took it. */
export function matchLines(winner: Team): ChatLine[] {
  return [{ seat: voiceOf(winner), text: "قامت! 🏁" }];
}
