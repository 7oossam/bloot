# PROJECT HANDOFF & STATE

**Last Updated By:** Claude Code
**Current Phase:** The 10 builds are in; the live-site crash is fixed. Next: playtest balance, art (JokerView), and the open design items.

## 1. What We Just Did
- **Live-site crash fixed.** The red "تعذّر تشغيل اللعبة" screen came from `cloneRound` in `src/ai/mcts.ts`: it copied each trick but shared its `order` array, so every simulated card was pushed into the REAL trick. The next `legalMovesFor` then read a seat with no card and threw `Cannot read properties of undefined (reading 'suit')`. The copy is fixed and `tests/mcts.test.ts` guards it (it fails on the old code with that exact error).
- **Card-play AI is the rule-based `decideCard` again** (`src/ai/play-ai.ts`), not MCTS. MCTS plays random rollouts, so it ignored the player's own AI rules (برقية, keeping Aces, answering أشكل signals — see `.claude/skills/baloot-rules/SKILL.md` §9) and the المترجم joker. `mcts.ts` is kept, fixed and tested, for a future version that uses `decideCard` as its rollout policy. `GameController.step()` is synchronous again; `TableScene.driveAI` still awaits it harmlessly.
- **Tests are back in the gates:** `tsconfig.json` includes `tests` again, and the deploy workflow runs `npm test` before building. Removing them is how the crash reached the live site.
- **أشكل fix:** a hokum on an Ace ground card (4-1) only blocks flipping it to sun; أشكل over it stays open to the dealer and the dealer's left.
- **All 10 builds are in the game** as full packages (Payoff / Supply / Forge / Reward) — `.claude/skills/bloot-roguelike-design/SKILL.md` PART 4–6 is the source of truth. 55 jokers; four new families (الصغار، التهريب، الكبوت، الدبل). `docs/jokers.md` is generated: `npx vite-node scripts/gen-jokers-doc.ts`.
- **Table UI:** joker row (tap to read, pulses when it pays), one-by-one bonus count-up, hand sort button + sideways drag, سوا button, memory line, skip on joker picks.
- **Art (from Gemini):** theme is "Clean, Vector-style Royal Palace / Mystic Desert" — Midnight Velvet `0x2a1a3a`, Dark Royal `0x1c102a`, Gold `0xd4af37`. Table and map now use it. Joker art: `public/assets/jokers/smuggler.jpg`, `executioner.jpg`.

## 2. Current Blockers / Open Questions
- **Balance:** ثورة الصغار is the strongest Payoff (≈ +6.7 base points per hand on its own; measured table in the design bible PART 5).
- **MCTS:** worth reviving only with rule-based rollouts, and its backpropagation credits wins to the parent node's player instead of the player who made the move — fix that first.

## 3. Next Steps (Where to pick up)
- Playtest on a phone; tune numbers in `baseOptions` (`src/roguelike/jokers.ts`) and regenerate `docs/jokers.md`.
- Build `JokerView.ts` to show the joker art (row above the table, shop cards).
- Open design items: explicit scoring pipeline with reorderable multipliers, boss/elite rule modifiers, a branching map.
- Before pushing: `npm test` and `npm run build` must pass — CI blocks the deploy otherwise.

---
*Note to AI Agent: Please update this file with your progress, edited files, and the next step before you finish your turn so the other model can seamlessly take over. Save it as UTF-8.*
