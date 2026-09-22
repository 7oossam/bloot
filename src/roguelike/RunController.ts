import { generateMap } from "./mapgen";
import { getJokerDef, JOKER_CATALOG } from "./jokers";
import { MAX_JOKERS, type MapNode, type RunState } from "./types";

/**
 * Owns the meta-run state (map position, lives, gold, jokers) across nodes.
 * A single shared instance — MapScene and TableScene both import it directly
 * rather than passing the whole state through Phaser scene data.
 */
class RunController {
  private state: RunState = generateMap(Date.now());

  startNewRun(seed: number = Date.now()): void {
    this.state = generateMap(seed);
  }

  getState(): Readonly<RunState> {
    return this.state;
  }

  /** The node the player can currently walk into, or undefined if the run is over / finished. */
  getAvailableNode(): MapNode | undefined {
    if (this.state.over) return undefined;
    const nextIndex = this.state.currentIndex + 1;
    return this.state.nodes[nextIndex];
  }

  enterNode(nodeId: string): void {
    const node = this.getAvailableNode();
    if (!node || node.id !== nodeId) {
      throw new Error(`Node ${nodeId} is not the next available node`);
    }
    this.state.currentIndex++;
  }

  /** Called once a match/elite/boss node's GameController match finishes. */
  resolveMatchNode(won: boolean): void {
    const node = this.state.nodes[this.state.currentIndex];
    this.state.cleared[this.state.currentIndex] = true;

    if (won) {
      this.state.gold += node.reward;
      if (node.type === "boss") {
        this.state.over = true;
        this.state.won = true;
      }
    } else {
      this.state.lives--;
      if (this.state.lives <= 0) {
        this.state.over = true;
        this.state.won = false;
      }
    }
  }

  /** Called once the player is done shopping at the current (shop) node. */
  leaveShopNode(): void {
    this.state.cleared[this.state.currentIndex] = true;
  }

  canAfford(jokerId: string): boolean {
    const def = getJokerDef(jokerId);
    if (!def) return false;
    if (this.state.jokerIds.includes(jokerId)) return false;
    if (this.state.jokerIds.length >= MAX_JOKERS) return false;
    return this.state.gold >= def.cost;
  }

  buyJoker(jokerId: string): void {
    if (!this.canAfford(jokerId)) throw new Error(`Cannot afford or already own joker ${jokerId}`);
    const def = getJokerDef(jokerId)!;
    this.state.gold -= def.cost;
    this.state.jokerIds.push(jokerId);
  }

  shopOffering(): string[] {
    // Simple first pass: offer every joker the run doesn't already have.
    return JOKER_CATALOG.map((j) => j.id).filter((id) => !this.state.jokerIds.includes(id));
  }
}

export const runController = new RunController();
