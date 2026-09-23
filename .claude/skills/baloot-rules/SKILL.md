---
name: baloot-rules
description: >
  The authoritative Baloot rules and tactics reference for this game (the player's own
  guide, "Baloot AI Blueprint"). Use before changing anything about Baloot rules, scoring,
  bidding, projects (سرا، خمسين، مئة، أربعمئة، بلوت), أشكل, legal moves (القطع، الترقيع، أكي),
  the AI's buying or card-play decisions, or Arabic card/suit terminology — and whenever
  the player reports that the game plays Baloot "wrong".
---

# Baloot rules for this project

The full guide is `docs/baloot-guide.md` — a faithful Markdown conversion of the player's
PDF, with our own clarifications marked **ملاحظة التنفيذ**. Read the section you need
before touching the matching code; the table at the end of the guide maps each section to
its file.

Ground rules when working on the game:

1. **The guide wins over general Baloot knowledge.** Regional rules vary; the player has
   told us which ones they play. Where the guide is silent, keep the current behaviour and
   say so rather than inventing a rule.
2. **Terminology is the player's:** هاص ♥، ديمن ♦، سبيت ♠، شرية ♣؛ إكة، شايب، بنت، ولد؛
   الأرض = the last trick (not كوت)؛ القيد = game points (abnat).
3. **Known correction:** the guide says sun totals 140 raw; it is 130 (120 + 10), which is
   what makes its own 26 come out. Don't "fix" the code back to 140.
4. **Scoring conversions are in one place** (`toGamePoints` in `src/engine/scoring.ts`):
   hokum ÷10 dropping 1–5 and raising 6–9; sun ÷5 dropping 1–2 and raising 3–4; the buyer
   is rounded by the rule and the other side takes the rest of the hand's value.
5. Any rules change needs an engine test in `tests/engine.test.ts`, and a touch-driven
   Playwright check at 359×685 (the player's phone) before pushing.
