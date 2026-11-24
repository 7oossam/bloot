/**
 * The drill's memory of you, kept on this device: how sure you are of each kind of question
 * (a Leitner box, 1–5) and the level you play at. The methods are the tried ones:
 * - retrieval: you recall the answer, the cards are face down — no looking it up;
 * - spaced, adaptive practice: a kind you miss drops to box 1 and comes up more often, a kind
 *   you keep getting right climbs and comes up less (Leitner);
 * - difficulty that follows you (a staircase, as in n-back training): two good hands in a row
 *   (≥ 80%) and the questions come further apart; a bad one (< 50%) and they come closer.
 */
import type { DrillType } from "./questions";

/** A skill's place on its ladder: stage 1 (the counter in view) → 3 (in your head), then mastered. */
export interface SkillProgress {
  stage: number;
  /** Good hands in a row at this stage. */
  streak: number;
  mastered: boolean;
}

export interface DrillProgress {
  /** The skills, one at a time (deliberate practice): عدّ الحكم first. */
  skills?: Partial<Record<string, SkillProgress>>;
  level: number;
  boxes: Partial<Record<DrillType, number>>;
  /** Good hands in a row at this level. */
  streak: number;
  hands: number;
  best: number;
}

const KEY = "bloot.drill";
export const MAX_LEVEL = 5;

export function loadProgress(): DrillProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { level: 1, boxes: {}, streak: 0, hands: 0, best: 0, ...JSON.parse(raw) };
  } catch {
    /* no storage: start fresh */
  }
  return { level: 1, boxes: {}, streak: 0, hands: 0, best: 0 };
}

export function saveProgress(p: DrillProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: progress lasts the session */
  }
}

/** Low boxes come up more: box 1 weighs 5, box 5 weighs 1. */
export function weightOf(p: DrillProgress, type: DrillType): number {
  return 6 - (p.boxes[type] ?? 1);
}

export function recordAnswer(p: DrillProgress, type: DrillType, right: boolean): void {
  const box = p.boxes[type] ?? 1;
  p.boxes[type] = right ? Math.min(5, box + 1) : 1;
}

/** After how many tricks the drill stops to ask, and how many questions each stop, by level. */
export function stopsFor(level: number): { after: number[]; perStop: number } {
  switch (level) {
    case 1:
      return { after: [1, 2, 3, 4, 5, 6, 7], perStop: 1 };
    case 2:
      return { after: [2, 3, 4, 5, 6, 7], perStop: 1 };
    case 3:
      return { after: [2, 4, 6, 7], perStop: 1 };
    case 4:
      return { after: [3, 5, 7], perStop: 2 };
    default:
      return { after: [4, 7], perStop: 3 };
  }
}

/** The kinds a level asks: reading discards comes in once the counting is steady. */
export function typesFor(level: number): DrillType[] {
  if (level <= 1) return ["count", "gone", "void"];
  if (level === 2) return ["count", "gone", "void", "top"];
  return ["count", "gone", "void", "top", "signal", "weak"];
}

/** A finished hand: moves the level up or down. Returns the change (−1, 0, +1). */
export function finishHand(p: DrillProgress, right: number, asked: number): number {
  p.hands++;
  if (!asked) return 0;
  const rate = right / asked;
  p.best = Math.max(p.best, Math.round(rate * 100));
  if (rate >= 0.8) {
    p.streak++;
    if (p.streak >= 2 && p.level < MAX_LEVEL) {
      p.level++;
      p.streak = 0;
      return 1;
    }
    return 0;
  }
  p.streak = 0;
  if (rate < 0.5 && p.level > 1) {
    p.level--;
    return -1;
  }
  return 0;
}

// ------------------------------------------------------------------ skills, one at a time

/**
 * The research that fits card tracking is about skill, not facts: experts don't hold more in
 * their heads, they track in chunks (Chase & Simon on chess; bridge players count a suit at a
 * time), learned one sub-skill at a time with feedback (Ericsson's deliberate practice), with
 * a support that fades as the skill takes over (scaffolding). So each skill has three stages:
 * 1 the counter is in view, 2 it shows for a glance every other trick, 3 it's gone.
 */
export const STAGES = 3;

export function skillOf(p: DrillProgress, id: string): SkillProgress {
  p.skills ??= {};
  return (p.skills[id] ??= { stage: 1, streak: 0, mastered: false });
}

/** A finished hand of a skill: two good ones in a row (≥ 80%) move a stage on; a bad one (< 50%) back. */
export function finishSkillHand(p: DrillProgress, id: string, right: number, asked: number): -1 | 0 | 1 {
  const sk = skillOf(p, id);
  p.hands++;
  if (asked < 2) return 0;
  const rate = right / asked;
  p.best = Math.max(p.best, Math.round(rate * 100));
  if (rate >= 0.8) {
    sk.streak++;
    if (sk.streak >= 2) {
      sk.streak = 0;
      if (sk.stage < STAGES) sk.stage++;
      else sk.mastered = true;
      return 1;
    }
    return 0;
  }
  sk.streak = 0;
  if (rate < 0.5 && sk.stage > 1) {
    sk.stage--;
    return -1;
  }
  return 0;
}
