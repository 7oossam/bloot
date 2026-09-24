# PROJECT HANDOFF & STATE

**Last Updated By:** Claude Code
**Current Phase:** The 10 builds are implemented and tested. Next: playtest balance, then the design improvements still open (see §3).

## 1. What We Just Did
- **All 10 builds are in the game** as full packages (Payoff / Supply / Forge / Reward), per `.claude/skills/bloot-roguelike-design/SKILL.md` PART 4–5. That file is the source of truth for what each build does and why.
- **17 new jokers** in `src/roguelike/jokers.ts` (55 total), and four new families with tier 2/3 synergies: الصغار، التهريب، الكبوت، الدبل. `docs/jokers.md` is generated from the catalog: `npx vite-node scripts/gen-jokers-doc.ts`.
- **Underdog** (now "ثورة الصغار") only boosts your team's 7s/8s, and only outside the trump suit (Shared Deck Law + balance).
- **Engine / controller:** deal-time supply from the shared deck (`src/engine/round.ts`: `giveCards`, `completeRun`), free sun double, Forge actions (`lower`, `dye`, `partner`) with a skip, per-trick tallies, السوا claim + auto-play, and a `joker:fired` event (`src/game/GameController.ts`). The partner AI answers your signals with المترجم (`src/ai/play-ai.ts`: `partnerAsks`).
- **Table UI** (`src/scenes/TableScene.ts`): joker row (tap to read, pulses when it pays), one-by-one bonus count-up in the hand summary, hand sort button + sideways drag to reorder, سوا button, memory line, skip button on joker picks.
- **Tests:** `tests/packages.test.ts` covers every new joker; 154 tests pass.

## 2. Current Blockers / Open Questions
- **Balance:** ثورة الصغار is the strongest Payoff (≈ +6.7 base points per hand on its own; see the bible's measured table). Watch it in playtests.
- The "30 new jokers" in the earlier plan were narrowed to 17 by reusing existing jokers as package pieces; each family has at least 3.

## 3. Next Steps (Where to pick up)
- Playtest on a phone; tune numbers in `baseOptions` (`src/roguelike/jokers.ts`) and re-run `npx vite-node scripts/gen-jokers-doc.ts`.
- Open design items from the recommendations: explicit scoring pipeline with reorderable multipliers (flat first, then × in row order), boss/elite rule modifiers, a branching map.

---
*Note to AI Agent: Please update this file with your progress, edited files, and the next step before you finish your turn so the other model can seamlessly take over.*
