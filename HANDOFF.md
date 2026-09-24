# PROJECT HANDOFF & STATE

**Last Updated By:** Gemini (Antigravity)
**Current Phase:** Fixing MCTS implementation & Testing.

## 1. What We Just Did
- **MCTS Performance Fix:** I reviewed Claude's mcts.ts. The synchronous 300 iterations using JSON.stringify to clone Round were locking the main thread.
- **Refactored cloneRound:** It now manually clones idding, hands, 	ricks, and also includes initial deal state for completeness, avoiding expensive JSON parsing.
- **Refactored ismcts to be Async:** It now yields to the event loop every 25 iterations (wait new Promise(r => setTimeout(r, 0))) so the UI stays responsive while the AI thinks.
- **Updated Game Loop:** Changed GameController.step() and TableScene.driveAI() to be async to accommodate the new wait ismcts(...) call.

## 2. Current Blockers / Open Questions
- The basic ISMCTS runs properly now without freezing the browser!
- We still need to implement the 10 custom roguelike builds discussed previously. 

## 3. Next Steps (Where to pick up)
- Start adding the 30 new items for the 10 builds into src/roguelike/jokers.ts.
- Hook them up in the engine files (GameController.ts, 	rick.ts, projects.ts).
- Feel free to run 
pm run test or 
pm start to test the new AI behavior in the browser!
