# PROJECT HANDOFF & STATE

**Last Updated By:** Gemini (Antigravity)
**Current Phase:** Implementing 10 Synergistic Roguelike Builds into the Baloot Engine.

## 1. What We Just Did
- **Game Design Deep Dive:** We analyzed 15+ hours of game design videos (Balatro, Slay the Spire) and merged them with core Baloot mechanics (Tahreeb, Meshytar, Mashareea).
- **Knowledge Base Created:** We created `.claude/skills/bloot-roguelike-design/SKILL.md` and `.claude/skills/baloot-mastery/SKILL.md` to act as the absolute source of truth for the game rules and design philosophies.
- **The "Shared Deck Law":** We established a critical rule that there is NO "Player Deck". There is only one shared 32-card deck. Any deck modification (stamping/forging) must be asymmetrical via the player's personal Jokers.
- **Brainstorming:** We designed 10 highly synergistic builds (e.g., "The Garbage Disposal" which buffs 7s/8s, "The Executioner" which weaponizes the Sawa button, "The Smuggler" which exploits Tahreeb). We simulated the probabilities of these triggers in Python to ensure they are mathematically viable.

## 2. Current Blockers / Open Questions
- None. We have the designs, we just need to write the code.

## 3. Next Steps (Where to pick up)
- We need to start implementing the 10 builds into the actual TypeScript engine.
- Begin by adding the necessary state trackers to `src/game/GameController.ts` (e.g., tracking if a Tahreeb occurred, tracking if a 7/8 won a trick).
- Add the 30 new Joker items to the `JOKER_CATALOG` in `src/roguelike/jokers.ts` and map their logic.
- Hook up the engine modifiers in `src/engine/trick.ts` and `src/engine/projects.ts` (e.g., allowing blind Sawa, flipping the Gaid hierarchy, etc.).

---
*Note to AI Agent: Please update this file with your progress, edited files, and the next step before you finish your turn so the other model can seamlessly take over.*
