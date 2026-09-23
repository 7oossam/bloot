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
5. **أشكل** is for the dealer and the dealer's left only, only over the other team's hokum,
   not after saying ولا in round 2; the caller buys sun and the partner takes the ground card.
6. Any rules change needs an engine test in `tests/engine.test.ts`, and a touch-driven
   Playwright check at 359×685 (the player's phone) before pushing.
