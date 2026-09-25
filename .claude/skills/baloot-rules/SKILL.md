---
name: baloot-rules
description: >
  The authoritative Baloot rules and tactics reference for this game (the player's own
  guide, "Baloot AI Blueprint"). Use before changing anything about Baloot rules, scoring,
  bidding, projects (سرا، خمسين، مئة، أربعمئة، بلوت), أشكل, legal moves (القطع، الترقيع، آكه),
  the AI's buying or card-play decisions, or Arabic card/suit terminology — and whenever
  the player reports that the game plays Baloot "wrong".
---

# Baloot rules for this project

The full guide is `docs/baloot-guide.md` — a faithful Markdown conversion of the player's
PDF, with our own clarifications marked **ملاحظة التنفيذ**. Read the section you need
before touching the matching code; the table at the end of the guide maps each section to
its file.

The player later sent the **official regulation** (اللائحة العامة) and an app's النشرة
screenshot, summarised with implementation status in `docs/baloot-regulation.md`. **Where
the two disagree, the regulation wins** — scoring, أشكل, the buyer-loses rule, four Jacks.

Ground rules when working on the game:

1. **The regulation, then the guide, win over general Baloot knowledge.** Regional rules vary; the player has
   told us which ones they play. Where the guide is silent, keep the current behaviour and
   say so rather than inventing a rule.
2. **Terminology is the player's:** هاص ♥، ديمن ♦، سبيت ♠، شرية ♣؛ إكة، شايب، بنت، ولد؛
   الأرض = the last trick (not كوت)؛ القيد = game points (abnat)؛ آكه (not أكي).
3. **Known correction:** the guide says sun totals 140 raw; it is 130 (120 + 10), which is
   what makes its own 26 come out. Don't "fix" the code back to 140.
4. **Scoring is in one place** (`scoreHand` in `src/engine/scoring.ts`), per the regulation:
   the NON-buyer is counted (hokum ÷10 dropping 1–5, raising 6–9; sun ÷10 raising 5+, then
   ×2) and the buyer takes the rest; if the non-buyer's أبناط (cards + الأرض + raw projects)
   beat the buyer's, the buyer lost (خسرانة) and the hand + all projects go to the other
   side (بلوت stays with its holder); كبوت = 25 hokum / 44 sun. Don't reintroduce "sun ÷5".
5. **أشكل** is for the dealer and the dealer's left only — on their own turn in either round
   (the player's call, over the regulation's 8-1), or over the other team's hokum unless
   they already said ولا in round 2. The caller buys sun; the partner takes the ground card.
   A hokum on an **Ace** ground card (4-1) blocks only the flip to **sun** (except the dealer's
   right) — أشكل over it stays open to the usual callers.
6. **الدبل** (`src/engine/doubling.ts`): after the full deal, before the first card. Hokum:
   دبل (open/مقفل) → ثري → فور (open/مقفل) → قهوة (wins the match); sun: دبل only, and only
   by a side ≤100 against a side >100 (scaled to the target). The last raiser is judged as
   the buyer, a tie goes against them, and the winner takes the hand × level plus all
   projects (×2 only at دبل). مقفل = no trump lead while holding anything else.
7. **Trumping:** a void player must trump, and must overtrump an opponent's trump if able —
   but if they can't beat it they may play anything. No obligation to trump a partner's trick.
8. **Words:** pass is بس in round 1 and ولا in round 2 — never جلي.
9. **برقية and keeping strength (the player's rules for the AI):** never feed an Ace to a
   partner who's winning, except as a برقية — an Ace thrown on the partner's trick that means
   "come back to me in this suit", sent only when every card left is a sure winner. Keep
   Aces and sure winners in hand as entries; don't throw them away. Read a partner's برقية
   and lead that suit back.
10. **التهريب (docs/baloot-guide.md §4, from the player's video — it wins over older notes):**
   a discarded suit is NOT wanted and asks for its brother (هرّب ديمن = يبي هاص); two suits of
   one colour, or the led suit's brother, ask for the other colour; climbing in one suit
   (7→8→بنت) asks for that suit and overrides the rest. Answer with your BIGGEST card of the
   asked suit. Also: lead your project's suit first, return to the suit the partner opened
   with, give your 10 to the partner's opening Ace, never leave a 10 bare, lead the 10 (or 9)
   of trumps for a partner who bought hokum. Logic lives in `src/ai/beliefs.ts` (reading)
   and `chooseDiscard`/`chooseLead` in `src/ai/play-ai.ts` (sending/answering).
11. Any rules change needs an engine test in `tests/engine.test.ts`, and a touch-driven
   Playwright check at 359×685 (the player's phone) before pushing.
