import type { HandSnapshot } from "./GameController";

/**
 * The player's notes to the AI: what they wrote, which play it's about, and the hand frozen
 * at that moment. Kept in this browser only; «انسخ» turns them into text to paste to Claude,
 * who turns each one into a fix and a test.
 */
export interface PlayerNote {
  at: string;
  text: string;
  about?: { seat: number; trick: number; card: string };
  snapshot: HandSnapshot;
}

const KEY = "bloot:notes";

export function loadNotes(): PlayerNote[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PlayerNote[]) : [];
  } catch {
    return [];
  }
}

export function saveNote(note: PlayerNote): number {
  const all = [...loadNotes(), note];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked: the note still counts for this session's copy.
  }
  return all.length;
}

export function clearNotes(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

/** Every note as one block of text to paste into a chat with Claude. */
export function exportNotes(notes: PlayerNote[] = loadNotes()): string {
  return [
    "ملاحظات بلوت للـ AI — الأوراق بصيغة الشكل ثم الرتبة (HJ = ولد هاص، S=سبيت H=هاص D=ديمن C=شرية). المقاعد: 0 أنت، 1 يمين، 2 خويك، 3 يسار.",
    "```json",
    JSON.stringify(notes, null, 1),
    "```",
  ].join("\n");
}

/**
 * Every hand you've played, across every صكة and run, kept in this browser so it can all be
 * copied in one go for Claude's analysis (scripts/analyze-match.ts). Stored lean — only what
 * the analysis reads — and the oldest hands go first when it's full.
 */
export interface GameRecord extends Omit<HandSnapshot, "hands" | "currentTrick" | "initialHands"> {
  /** Which صكة the hand belongs to (hands of one صكة share it). */
  match: string;
}

const GAMES_KEY = "bloot:games";
/** Plenty for many sessions; about 5 KB a hand, well inside the browser's storage. */
const MAX_HANDS = 400;

export function loadGames(): GameRecord[] {
  try {
    const raw = localStorage.getItem(GAMES_KEY);
    return raw ? (JSON.parse(raw) as GameRecord[]) : [];
  } catch {
    return [];
  }
}

export function recordHand(snapshot: HandSnapshot, match: string): void {
  if (typeof localStorage === "undefined") return;
  const { hands: _hands, currentTrick: _current, initialHands: _initial, plays, ...rest } = snapshot;
  const record: GameRecord = {
    match,
    ...rest,
    plays: plays.map((p) => ({ ...p, scores: p.scores?.slice(0, 3), ruledOut: p.ruledOut?.length ? p.ruledOut : undefined })),
  };
  let all = [...loadGames(), record].slice(-MAX_HANDS);
  for (let tries = 0; tries < 4; tries++) {
    try {
      localStorage.setItem(GAMES_KEY, JSON.stringify(all));
      return;
    } catch {
      // Full (or blocked): drop the older half and try again.
      if (all.length <= 1) return;
      all = all.slice(Math.floor(all.length / 2));
    }
  }
}

export function clearGames(): void {
  try {
    localStorage.removeItem(GAMES_KEY);
  } catch {
    // nothing to clear
  }
}

/** How many hands and صكات are saved. */
export function gamesCount(games: GameRecord[] = loadGames()): { hands: number; matches: number } {
  return { hands: games.length, matches: new Set(games.map((g) => g.match)).size };
}

/** Every saved hand as one block of text to paste to Claude, for the full analysis. */
export function exportGames(games: GameRecord[] = loadGames()): string {
  const { hands, matches } = gamesCount(games);
  return [
    `لعب بلوت كامل للتحليل — ${hands} يد في ${matches} صكة. الأوراق بصيغة الشكل ثم الرتبة (HJ = ولد هاص، S=سبيت H=هاص D=ديمن C=شرية). المقاعد: 0 أنت، 1 يمين، 2 خويك، 3 يسار.`,
    "```json",
    JSON.stringify({ kind: "games", hands: games }),
    "```",
  ].join("\n");
}
