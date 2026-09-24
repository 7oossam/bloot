// Run with: npx vite-node sim.ts
import { RANKS as ranks, SUITS as suits, type Card } from './src/engine/types';

function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const N = 1000;
let results = {
    garbageDisposal: 0,
    rainbowArchitect: 0,
    cowardGambit: 0,
    martyr: 0,
    ashkal: 0,
    doubleJeopardy: 0,
    blindSawa: 0,
    sardRunner: 0,
    weakHokum: 0,
    smuggler: 0
};

for (let i = 0; i < N; i++) {
    let deck: Card[] = [];
    for(let suit of suits) {
        for(let rank of ranks) {
            deck.push({suit, rank});
        }
    }
    deck = shuffle(deck);
    let p1 = deck.slice(0, 8);
    let p2 = deck.slice(8, 16);
    let o1 = deck.slice(16, 24);
    let o2 = deck.slice(24, 32);
    
    // Garbage Disposal (Chance to draw an 8)
    if (p1.some(c => c.rank === '8')) results.garbageDisposal++;
    
    // Rainbow Architect (3 sequential ranks of any suit)
    let p1Ranks = p1.map(c => ranks.indexOf(c.rank)).sort((a,b)=>a-b);
    let hasRainbow = false;
    for (let j=0; j<p1Ranks.length-2; j++) {
        if (p1Ranks[j+1] === p1Ranks[j]+1 && p1Ranks[j+2] === p1Ranks[j]+2) hasRainbow = true;
    }
    if (hasRainbow) results.rainbowArchitect++;
    
    // Coward's Gambit (Having a low card while partner has A/10 in Sun)
    if (p1.some(c => c.rank === '7' || c.rank === '8') && p2.some(c => c.rank === 'A' || c.rank === '10')) results.cowardGambit++;
    
    // Martyr (P1 has 9 of a suit, Opps have J of same suit)
    let hasMartyr = false;
    for(let s of suits) {
        if (p1.some(c => c.rank === '9' && c.suit === s) && (o1.some(c => c.rank === 'J' && c.suit === s) || o2.some(c => c.rank === 'J' && c.suit === s))) {
            hasMartyr = true;
        }
    }
    if (hasMartyr) results.martyr++;
    
    // Ashkal (P1 has weak hand, passes to P2 who has Sun cards - A/10s)
    let p2SunPower = p2.filter(c => c.rank === 'A' || c.rank === '10').length;
    if (p2SunPower >= 3) results.ashkal++;
    
    // Blind Sawa (P1 has top 3 cards of any suit)
    let hasSawa = false;
    for(let s of suits) {
        if (p1.filter(c => c.suit === s && (c.rank === 'A' || c.rank === '10' || c.rank === 'K')).length >= 3) hasSawa = true;
    }
    if (hasSawa) results.blindSawa++;
    
    // Weak Hokum (P1 has no J or 9 of a suit but has A and 10)
    let hasWeakHokum = false;
    for(let s of suits) {
        if (!p1.some(c=>c.suit===s && (c.rank==='J'||c.rank==='9')) && p1.some(c=>c.suit===s && c.rank==='A')) hasWeakHokum = true;
    }
    if (hasWeakHokum) results.weakHokum++;
    
    // Smuggler (P2 has no cards of a suit, allowing them to discard/Tahreeb)
    let missingSuit = suits.some(s => !p2.some(c => c.suit === s));
    if (missingSuit) results.smuggler++;
    
    // Double Jeopardy & Sard Runner are behavioral/UI based, assume 100% chance they can trigger if player decides to.
    results.doubleJeopardy++;
    results.sardRunner++;
}

console.log("SIMULATION RESULTS (1000 RUNS):");
for (const [k, v] of Object.entries(results)) {
    console.log(k + ": " + ((v/N)*100).toFixed(1) + "% chance to trigger per hand");
}
