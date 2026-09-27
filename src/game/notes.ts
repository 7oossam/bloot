import type { HandSnapshot } from "./GameController";
import type { Seat, Suit, TrickRules } from "../engine/types";

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

/** Every note, as parts of text small enough to paste into a chat with Claude one by one. */
export function exportNotes(notes: PlayerNote[] = loadNotes()): string[] {
  const packed = notes.map((n) =>
    JSON.stringify({ at: n.at, text: n.text, about: n.about ? `${n.about.seat}.${n.about.trick} ${n.about.card}` : undefined, h: packHand(n.snapshot) }),
  );
  return inParts("ملاحظات بلوت للـ AI", packed);
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

/** Every saved hand, as parts of text small enough to paste into a chat with Claude one by one. */
export function exportGames(games: GameRecord[] = loadGames()): string[] {
  const { hands, matches } = gamesCount(games);
  return inParts(`لعب بلوت كامل للتحليل (${hands} يد في ${matches} صكة)`, games.map((g) => JSON.stringify(packHand(g))));
}

/**
 * A chat message has a size limit — a long paste got cut off mid-hand — so the text goes in
 * parts of about this many characters, each pasted as its own message.
 */
export const PART_CHARS = 12_000;

const LEGEND = "الأوراق: الشكل ثم الرتبة (HJ = ولد هاص؛ S سبيت H هاص D ديمن C شرية). المقاعد: 0 أنت، 1 يمين، 2 خويك، 3 يسار.";

function inParts(title: string, items: string[]): string[] {
  const groups: string[][] = [];
  let size = 0;
  for (const item of items) {
    if (!groups.length || (size + item.length > PART_CHARS && groups[groups.length - 1].length)) {
      groups.push([]);
      size = 0;
    }
    groups[groups.length - 1].push(item);
    size += item.length + 2;
  }
  if (!groups.length) groups.push([]);
  return groups.map((g, k) =>
    [`${title} — الجزء ${k + 1} من ${groups.length}. ${LEGEND}`, "```json", `[${g.join(",\n")}]`, "```"].join("\n"),
  );
}

/**
 * A hand in as few characters as the analysis can read back (`unpackHand`): hands and tricks as
 * card strings, and only the computer plays that weren't forced.
 */
export interface PackedHand {
  m?: string;
  d: number;
  g: string;
  b: string;
  /** mode + trump suit : declarer (+ "a" for أشكل), e.g. "hokumS:2" or "sun:3a". */
  c?: string;
  x?: number;
  /** Each seat's cards as play began, "|" between seats. */
  s: string;
  /** Each trick's plays in order ("1:C7 2:CQ …"), "|" between tricks. */
  t: string;
  cur?: string;
  sc: string;
  p?: string;
  r?: string;
  tr?: TrickRules;
  /** "seat.trick card kind [h:habit] [scores] {rules}" for each computer play that had a choice. */
  a: string[];
}

export function packHand(h: Omit<HandSnapshot, "hands" | "initialHands" | "currentTrick"> & { match?: string; currentTrick?: string[] }): PackedHand {
  const c = h.contract;
  return {
    m: h.match,
    d: h.dealer,
    g: h.groundCard,
    b: h.bids.join(" "),
    c: c ? `${c.mode}${c.trumpSuit ?? ""}:${c.declarer}${c.ashkal ? "a" : ""}` : undefined,
    x: h.doubleLevel && h.doubleLevel > 1 ? h.doubleLevel : undefined,
    s: ([0, 1, 2, 3] as const).map((k) => h.startHands[k].join(" ")).join("|"),
    t: h.tricks.map((t) => t.cards.join(" ")).join("|"),
    cur: h.currentTrick?.length ? h.currentTrick.join(" ") : undefined,
    sc: `${h.matchScore[0]}-${h.matchScore[1]}`,
    p: h.partner,
    r: h.rival,
    tr: h.trickRules,
    a: h.plays
      .filter((p) => p.kind !== "only")
      .map(
        (p) =>
          `${p.seat}.${p.trick} ${p.card} ${p.kind}` +
          (p.habit && p.habit !== p.card ? ` h:${p.habit}` : "") +
          (p.scores?.length ? ` [${p.scores.slice(0, 3).join(",")}]` : "") +
          (p.rules?.length ? ` {${p.rules.join("؛")}}` : ""),
      ),
  };
}

/** The other way: a packed hand back into the shape the analysis replays. */
export function unpackHand(p: PackedHand): GameRecord & { currentTrick: string[] } {
  const [modeTrump, who] = (p.c ?? "").split(":");
  const mode = modeTrump?.startsWith("hokum") ? "hokum" : "sun";
  const cards = (x: string) => (x ? x.split(" ") : []);
  const seats = p.s.split("|");
  return {
    match: p.m ?? "",
    dealer: p.d as Seat,
    groundCard: p.g,
    bids: cards(p.b),
    contract: p.c
      ? { mode, trumpSuit: mode === "hokum" ? (modeTrump.slice(5) as Suit) : undefined, declarer: Number(who[0]) as Seat, ashkal: who.endsWith("a") }
      : undefined,
    doubleLevel: p.x ?? 1,
    startHands: { 0: cards(seats[0]), 1: cards(seats[1]), 2: cards(seats[2]), 3: cards(seats[3]) },
    tricks: p.t ? p.t.split("|").map((t) => ({ leader: Number(t[0]) as Seat, cards: cards(t) })) : [],
    currentTrick: cards(p.cur ?? ""),
    matchScore: { 0: Number(p.sc.split("-")[0]), 1: Number(p.sc.split("-")[1]) },
    partner: p.p,
    rival: p.r,
    trickRules: p.tr,
    plays: p.a.map((line) => {
      const m = line.match(/^(\d)\.(\d+) (\S+) (\S+)(?: h:(\S+))?(?: \[([^\]]*)\])?(?: \{(.*)\})?$/);
      if (!m) return { seat: 0 as Seat, trick: 0, card: "", kind: line };
      return {
        seat: Number(m[1]) as Seat,
        trick: Number(m[2]),
        card: m[3],
        kind: m[4],
        habit: m[5] ?? m[3],
        scores: m[6] ? m[6].split(",") : undefined,
        rules: m[7] ? m[7].split("؛") : undefined,
      };
    }),
  };
}

/**
 * Everything for Claude in one file — the notes and every saved hand — to save or share from
 * the phone instead of copying (the phone's clipboard cut long text off). Each part is its own
 * ```json block; scripts/analyze-match.ts reads them all.
 */
export function exportFile(notes: PlayerNote[] = loadNotes(), games: GameRecord[] = loadGames()): { name: string; text: string } {
  const { hands, matches } = gamesCount(games);
  const packedNotes = notes.map((n) => ({ at: n.at, text: n.text, about: n.about ? `${n.about.seat}.${n.about.trick} ${n.about.card}` : undefined, h: packHand(n.snapshot) }));
  const text = [
    `بلوت — ملف للتحليل: ${notes.length} ملاحظة، ${hands} يد في ${matches} صكة. ${LEGEND}`,
    "",
    "الملاحظات:",
    "```json",
    `[${packedNotes.map((n) => JSON.stringify(n)).join(",\n")}]`,
    "```",
    "",
    "كل اللعب:",
    "```json",
    `[${games.map((g) => JSON.stringify(packHand(g))).join(",\n")}]`,
    "```",
    "",
  ].join("\n");
  const day = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  return { name: `bloot-${day}.txt`, text };
}
