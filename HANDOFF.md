# PROJECT HANDOFF & STATE

**Last Updated By:** Claude Code
**Current Phase:** The 10 builds are in, the live-site crash is fixed, and the computer players now think ahead (search AI). Next: playtest balance, art (JokerView), and the open design items.

## 1. What We Just Did
- **Search AI (`src/ai/mcts.ts`, `searchCard`) now plays the computer seats in the game** (`searchAI: true`, set by `TableScene`; tests keep the plain rule AI unless they ask). For each legal card it tries 40 guesses at the hidden hands, plays each out with the rule-based `decideCard` in every seat, and scores with the real `scoreHand`; best average game-point margin wins. Guesses respect what the table showed: voids, "couldn't trump" / "couldn't overtrump", the ground card's taker, projects laid down (`inferConstraints`, `sampleWorld`). The player's AI rules stay hard rules (no Ace fed to a winning partner or thrown away bar a برقية; a partner's برقية / المترجم ask is always answered). Measured on the same mirrored deals vs the rule AI: +3.75 game points per hand at 20 guesses, +4.71 at 60 (the old random-rollout MCTS was −0.48). About 27 ms per move on a phone-speed CPU, capped at 150 ms. `tests/mcts.test.ts` covers: never touching the real round, guesses fitting the table, the player's rules, and beating the rule AI.
- **Live-site crash fixed.** The red "تعذّر تشغيل اللعبة" screen came from `cloneRound` in `src/ai/mcts.ts`: it copied each trick but shared its `order` array, so every simulated card was pushed into the REAL trick. The next `legalMovesFor` then read a seat with no card and threw `Cannot read properties of undefined (reading 'suit')`. The copy is fixed and `tests/mcts.test.ts` guards it (it fails on the old code with that exact error).
- **The first MCTS (Gemini's) was retired:** its random play-outs ignored the player's AI rules (برقية, keeping Aces, answering أشكل — `.claude/skills/baloot-rules/SKILL.md` §9) and the المترجم joker, and it tied the rule AI at best. The search AI above replaced it; `decideCard` is still its play-out policy and the fallback. `GameController.step()` is synchronous; `TableScene.driveAI` awaits it harmlessly.
- **Tests are back in the gates:** `tsconfig.json` includes `tests` again, and the deploy workflow runs `npm test` before building. Removing them is how the crash reached the live site.
- **أشكل fix:** a hokum on an Ace ground card (4-1) only blocks flipping it to sun; أشكل over it stays open to the dealer and the dealer's left.
- **All 10 builds are in the game** as full packages (Payoff / Supply / Forge / Reward) — `.claude/skills/bloot-roguelike-design/SKILL.md` PART 4–6 is the source of truth. 55 jokers; four new families (الصغار، التهريب، الكبوت، الدبل). `docs/jokers.md` is generated: `npx vite-node scripts/gen-jokers-doc.ts`.
- **Table UI:** joker row (tap to read, pulses when it pays), one-by-one bonus count-up, hand sort button + sideways drag, سوا button, memory line, skip on joker picks.
- **Art (from Gemini):** theme is "Clean, Vector-style Royal Palace / Mystic Desert" — Midnight Velvet `0x2a1a3a`, Dark Royal `0x1c102a`, Gold `0xd4af37`. Table and map now use it. Joker art: `public/assets/jokers/smuggler.jpg`, `executioner.jpg`.

## 2. Current Blockers / Open Questions
- **Balance:** ثورة الصغار is the strongest Payoff (≈ +6.7 base points per hand on its own; measured table in the design bible PART 5).
- **Reading the bidding was built and measured, and is off:** `readBidding` in `searchCard` replays the auction and the دبل with each guessed deal (the bidding AI as the model, over several possible first-five hands) and checks the discard signals, then keeps the believable guesses. The real deal outweighs 71% of random guesses, and first-trick high-card placement improves 36% → 39%, but on 800 mirrored hands vs the plain search it gained +0.16 ± 0.73 game points per hand at 40 guesses (+0.57 ± 0.71 at 20) while thinking ~50% longer. Re-measure if human bidding turns out to differ from the AI's; a stronger rollout policy is the more promising lever.

## 3. Next Steps (Where to pick up)
- Playtest on a phone; tune numbers in `baseOptions` (`src/roguelike/jokers.ts`) and regenerate `docs/jokers.md`.
- Build `JokerView.ts` to show the joker art (row above the table, shop cards).
- Open design items: explicit scoring pipeline with reorderable multipliers, boss/elite rule modifiers, a branching map.
- Before pushing: `npm test` and `npm run build` must pass — CI blocks the deploy otherwise.

---
*Note to AI Agent: Please update this file with your progress, edited files, and the next step before you finish your turn so the other model can seamlessly take over. Save it as UTF-8.*
