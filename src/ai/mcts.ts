
import type { Card, Seat } from "../engine/types";
import { teamOf } from "../engine/types";
import { Round } from "../engine/round";


class Node {
  move: Card | null;
  parent: Node | null;
  children: Node[];
  visits: number;
  wins: number;
  playerIdx: Seat;

  constructor(move: Card | null = null, parent: Node | null = null, playerIdx: Seat) {
    this.move = move;
    this.parent = parent;
    this.children = [];
    this.visits = 0;
    this.wins = 0;
    this.playerIdx = playerIdx;
  }

  add_child(move: Card, playerIdx: Seat): Node {
    const child = new Node(move, this, playerIdx);
    this.children.push(child);
    return child;
  }
}

// Helper to fully clone a Round instance so we can simulate without mutating the real game.
function cloneRound(r: Round): Round {
  const c = new Round(r.dealer, Math.random, (r as any).options || {});
  // Copy the initial property explicitly if needed by other components
  (c as any).initial = { ...r.initial };
  
  c.phase = r.phase;
  c.bidding = { ...r.bidding };
  c.hands = [
    [...r.hands[0]],
    [...r.hands[1]],
    [...r.hands[2]],
    [...r.hands[3]]
  ] as Record<Seat, Card[]>;
  c.tricks = r.tricks.map(t => ({ ...t, cards: { ...t.cards } }));
  c.currentTrick = r.currentTrick ? { ...r.currentTrick, cards: { ...r.currentTrick.cards } } : undefined;
  c.projects = r.projects ? { ...r.projects } : undefined;
  c.balootHolder = r.balootHolder;
  c.balootDeclared = r.balootDeclared;
  (c as any).balootInSequence = (r as any).balootInSequence;
  (c as any).balootPlayed = (r as any).balootPlayed;
  c.doubling = r.doubling ? { ...r.doubling } : undefined;
  
  return c;
}

// ISMCTS core function
export async function ismcts(realRound: Round, rootPlayer: Seat, iterations: number = 300): Promise<Card> {
  const rootNode = new Node(null, null, rootPlayer);

  for (let i = 0; i < iterations; i++) {
    // Yield every 25 iterations to prevent blocking the UI
    if (i % 25 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
    
    // 1. Clone & Determinize
    const simRound = cloneRound(realRound);
    
    // Gather unknown cards and distribute them randomly
    const knownCards: string[] = [];
    // We know our own hand
    simRound.hands[rootPlayer].forEach(c => knownCards.push(c.suit + c.rank));
    
    // We know table cards
    if (simRound.currentTrick) {
      Object.values(simRound.currentTrick.cards).forEach(c => {
        if (c) knownCards.push(c.suit + c.rank);
      });
    }

    // We know past tricks
    simRound.tricks.forEach(t => {
      Object.values(t.cards).forEach(c => {
         if (c) knownCards.push(c.suit + c.rank);
      });
    });

    const DECK_RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"] as const;
    const DECK_SUITS = ["S", "H", "D", "C"] as const;
    const allCards = DECK_SUITS.flatMap(suit => DECK_RANKS.map(rank => ({ suit, rank })));
    const availableCards = allCards.filter(c => !knownCards.includes(c.suit + c.rank));
    
    // Shuffle available cards
    availableCards.sort(() => Math.random() - 0.5);

    // Deal to other players based on how many cards they should have
    for (let s = 0; s < 4; s++) {
      if (s === rootPlayer) continue;
      const expectedSize = realRound.hands[s as Seat].length;
      simRound.hands[s as Seat] = availableCards.splice(0, expectedSize);
    }

    let node = rootNode;
    
    // 2. Selection & Expansion
    while (simRound.phase === "playing") {
      const turnSeat = simRound.turnSeat!;
      const validMoves = simRound.legalMovesFor(turnSeat);
      
      const validMoveStrs = validMoves.map(c => c.suit + c.rank);
      const triedMoves = node.children.map(c => c.move!.suit + c.move!.rank);
      const untried = validMoves.filter(m => !triedMoves.includes(m.suit + m.rank));

      if (untried.length > 0) {
        // Expand
        const move = untried[Math.floor(Math.random() * untried.length)];
        simRound.playCard(turnSeat, move);
        node = node.add_child(move, turnSeat);
        break; // Now simulate the rest
      }

      // UCT Selection
      const validChildren = node.children.filter(c => validMoveStrs.includes(c.move!.suit + c.move!.rank));
      if (validChildren.length === 0) break;

      let bestScore = -Infinity;
      let bestChild = validChildren[0];
      for (const child of validChildren) {
        const exploit = child.wins / child.visits;
        const explore = Math.sqrt(Math.log(node.visits) / child.visits);
        const score = exploit + 1.414 * explore;
        if (score > bestScore) {
          bestScore = score;
          bestChild = child;
        }
      }
      
      node = bestChild;
      simRound.playCard(turnSeat, node.move!);
    }

    // 3. Simulation
    while (simRound.phase === "playing") {
      const turnSeat = simRound.turnSeat!;
      const validMoves = simRound.legalMovesFor(turnSeat);
      const move = validMoves[Math.floor(Math.random() * validMoves.length)];
      simRound.playCard(turnSeat, move);
    }

    // 4. Backpropagation
    // Evaluate if rootPlayer's team won
    let didWin = false;
    if (simRound.result) {
       const myScore = simRound.result.scoredPoints[teamOf(rootPlayer)];
       const enemyScore = simRound.result.scoredPoints[teamOf((rootPlayer + 1) as Seat)];
       didWin = myScore > enemyScore;
    }

    let backNode: Node | null = node;
    while (backNode !== null) {
      backNode.visits++;
      // If backNode.parent represents a state where our team made a move
      if (backNode.parent && teamOf(backNode.parent.playerIdx) === teamOf(rootPlayer)) {
        if (didWin) backNode.wins++;
      } else if (backNode.parent) {
        // Enemy made this move
        if (!didWin) backNode.wins++;
      }
      backNode = backNode.parent;
    }
  }

  // Pick the most visited child
  let mostVisits = -1;
  let bestMove: Card | null = null;
  for (const child of rootNode.children) {
    if (child.visits > mostVisits) {
      mostVisits = child.visits;
      bestMove = child.move;
    }
  }

  // Fallback to random if something went wrong
  if (!bestMove) {
    const valid = realRound.legalMovesFor(rootPlayer);
    bestMove = valid[0];
  }

  return bestMove;
}
