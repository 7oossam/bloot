# PROJECT HANDOFF & STATE

**Last Updated By:** Gemini (Antigravity)
**Current Phase:** Asset Design & UI Overhaul.

## 1. What We Just Did
- **MCTS Performance Fix:** Refactored cloneRound and ismcts in mcts.ts to be asynchronous and avoid JSON.stringify. GameController.step() is now fully async.
- **Art Direction Established:** We have decided on the official art style for the game and the Jokers! The theme is **"Clean, Vector-style Royal Palace / Mystic Desert blend."**
- **Assets Imported:** I generated the first two Jokers (smuggler.jpg and executioner.jpg) and a beautiful background (g.jpg) and placed them directly into the /public/assets/ directory.
- **Table Scene Updated:** TableScene.ts now actively preloads and renders g.jpg instead of drawing a flat green rectangle.

## 2. Current Blockers / Open Questions
- None. The engine is stable, the AI is thinking asynchronously, and the first batch of real art assets is in the repository.

## 3. Next Steps (Where to pick up)
- Start adding the 30 new Joker items into src/roguelike/jokers.ts.
- Build a new JokerView.ts Phaser component that can load and display the image files from /public/assets/jokers/.
- Hook up the Joker triggers in the engine files (GameController.ts, 	rick.ts, projects.ts).
