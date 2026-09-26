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
