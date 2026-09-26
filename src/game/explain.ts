import type { Card, Seat, Suit } from "../engine/types";
import { RANK_NAME_AR, SUIT_NAME_AR } from "../scenes/cardArt";
import type { PlayLogEntry } from "./GameController";

/**
 * «ليش؟»: why the computer played a card, in the player's words. Built from what the AI
 * recorded when it played (engine-free, so it can be tested and shown anywhere).
 */
export function cardNameAr(card: Card): string {
  return `${RANK_NAME_AR[card.rank]} ${SUIT_NAME_AR[card.suit]}`;
}

const suitsAr = (suits: Suit[]) => suits.map((s) => SUIT_NAME_AR[s]).join(" و");

function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  // Isolated left-to-right, or the sign lands on the wrong side inside Arabic text.
  return `\u2066${r > 0 ? "+" : ""}${r}\u2069`;
}

export function explainPlay(e: PlayLogEntry, who: string): string[] {
  const t = e.trace;
  const lines: string[] = [`${who} لعب ${cardNameAr(t.card)} (الأكلة ${e.trick}${e.position === 0 ? "، وهو اللي بدأ" : ""})`];
  if (e.partnerBarqiya.length > 0) lines.push(`خويه رامي برقية في ${suitsAr(e.partnerBarqiya)}`);
  else if (e.partnerAsks.length > 0) lines.push(`خويه كان طالب بتهريبه: ${suitsAr(e.partnerAsks)}`);

  switch (t.kind) {
    case "only":
      lines.push("ما كان عنده غيرها تمشي على القانون — مجبور.");
      break;
    case "sawa":
      lines.push("سوا: هذا الترتيب اللي يضمن كل الأكلات الباقية.");
      break;
    case "habit":
      lines.push("لعبها بالعادة، بدون ما يحسب الاحتمالات (هالشخصية ما تحسب).");
      break;
    case "convention":
      lines.push(e.partnerBarqiya.length > 0 ? "رد على برقية خويه: جاه في شكله على طول." : "جا خويه في الشكل اللي طلبه قبل ما ياكل أكلاته.");
      break;
    case "rules":
      lines.push("قوانين اللعب ما خلّت له غيرها.");
      break;
    case "search": {
      lines.push(`حسب ${t.worlds} احتمال لأوراق اللي ما يشوفها، ولعب كل ورقة للآخر. متوسط الفرق بالأبناط لفريقه:`);
      for (const s of (t.scores ?? []).slice(0, 4)) {
        const mark = s.card.suit === t.card.suit && s.card.rank === t.card.rank ? "  ← لعبها" : "";
        lines.push(`• ${cardNameAr(s.card)}: ${signed(s.avg)}${mark}`);
      }
      const top = t.scores?.[0];
      if (t.ruleChoice && top && (top.card.suit !== t.card.suit || top.card.rank !== t.card.rank)) {
        lines.push(`الفرق بسيط، فمشى على عادته: ${cardNameAr(t.ruleChoice)}.`);
      } else if (t.ruleChoice && (t.ruleChoice.suit !== t.card.suit || t.ruleChoice.rank !== t.card.rank)) {
        lines.push(`عادته كانت بتقول ${cardNameAr(t.ruleChoice)}، بس الحساب طلع أحسن.`);
      }
      break;
    }
  }
  for (const r of t.softRules ?? []) {
    lines.push(`نقّص ${r.points} من ${cardNameAr(r.card)}: ${r.reason} (يخالفها بس إذا الحساب يقول تستاهل).`);
  }
  if (t.ruledOut && t.ruledOut.length > 0) {
    lines.push(`ما فكّر في ${t.ruledOut.map(cardNameAr).join("، ")}${t.rules?.length ? ` — قوانينك: ${t.rules.join("؛ ")}` : ""}.`);
  }
  return lines;
}

export type SeatLabel = (seat: Seat) => string;
