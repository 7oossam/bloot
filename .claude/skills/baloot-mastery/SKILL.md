---
name: baloot-mastery
description: "Comprehensive knowledge base of Baloot mechanics, scoring, bidding, projects, and Tahreeb."
---

# Baloot Mastery & Game Mechanics

This document serves as the absolute source of truth for Baloot logic, synthesizing rules from official documentation and professional tutorials.

## 1. Game Flow & Bidding (Meshytar)
- **Deck**: 32 cards (7, 8, 9, 10, J, Q, K, A in 4 suits).
- **Tricks**: 8 tricks per round.
- **Bidding Phase 1**: Bidding on the ground card's suit (Sun or Hokum).
- **Bidding Phase 2**: Bidding on any of the other 3 suits (Sun or Hokum).
- **Ashkal (أشكل)**: A bid available ONLY to Player 3 (the dealer's partner). It passes the bid to the dealer (Player 1) to play **Sun**. It signals: "I have Sun cards but don't like the ground card, take it."

## 2. Card Hierarchy & Values
| Rank | Sun Points | Hokum (Trump) Points |
|------|------------|----------------------|
| **J** | 2 | **20** |
| **9** | 0 | **14** |
| **A** | 11 | 11 |
| **10** | 10 | 10 |
| **K** | 4 | 4 |
| **Q** | 3 | 3 |
| **8** | 0 | 0 |
| **7** | 0 | 0 |

*(Note: In Hokum, non-trump suits follow the Sun hierarchy and points).*

## 3. Scoring & Rounding
- **Sun Base Score**: 130 + 10 (Last Trick) = 140. 
  - Divide by 10 and multiply by 2 = **26 Points**.
  - **Rounding**: 1-4 rounds DOWN, 5-9 rounds UP (e.g., 75 = 80 = 8 x 2 = 16 points).
- **Hokum Base Score**: 152 + 10 (Last Trick) = 162.
  - Divide by 10 = **16 Points**.
  - **Rounding**: 1-5 rounds DOWN, 6-9 rounds UP (e.g., 75 = 70 = 7 points).
- **Khasara (Loss)**: The buying team must score more than half the points (e.g., 81+ in Hokum, 66+ in Sun). If they fail, the opposing team takes ALL the points.
- **Kaboot (كبوت)**: Winning all 8 tricks. Sun = 44 points. Hokum = 25 points.

## 4. Doubling (Gahwa / Gaid)
Doubling multiplies the score, assuming the buying team loses. If the buying team wins, they get the doubled score.
- **Dabal (دبل)**: x2 (Sun: 52, Hokum: 32).
- **Thri (ثري)**: x3 (Sun: 78, Hokum: 48).
- **Four (فور)**: x4 (Sun: 104, Hokum: 64).
- **Gahwa (قهوة)**: Instant win (Match over, 152 points).
- *Sun Double Rule*: Allowed if the doubling team has 100+ points and the buying team has <100 points.

## 5. Projects (Mashareea - مشاريع)
Projects are declared in the first trick and revealed in the second trick. Only the team with the largest project scores their projects.
1. **Sira (سرا)**: 3 consecutive cards in a suit. (20 pts / 2 in score)
2. **Khamsin (خمسين)**: 4 consecutive cards. (50 pts / 5 in score)
3. **Miya (مية)**: 5 consecutive cards OR 4-of-a-kind of (10, J, Q, K, A). (100 pts / 10 in score)
4. **Arbaamiya (أربعمية)**: 4 Aces in **Sun only**. (400 pts / 40 in score)
5. **Baloot (بلوت)**: King & Queen of the Trump suit. Declared during play, always scores (20 pts / 2 in score) unless hidden inside a sequence project.

## 6. Tahreeb (التهريب - Signaling/Discarding)
Tahreeb is the advanced strategy of discarding a specific card when you cannot follow the led suit, signaling your partner.
- **Brother Suit (أخو اللون)**: Discarding a Red suit (e.g., Diamond) means "I want the other Red suit" (Hearts). Discarding a Black suit means "I want the other Black suit".
- **Double Discard**: Discarding two different suits of the *same color* means "I want the opposite color".
- **Bottom-to-Top (من تحت لفوق)**: Discarding a 7 then an 8 of the same suit means "I WANT this suit".
- **Top-to-Bottom (من فوق لتحت)**: Discarding a 10 then a 7 of the same suit means "I DO NOT want this suit".
- **Ace Discard**: "Stop playing this suit" or "Give me the lead."

## 7. Sawa (سوا)
If a player knows they are guaranteed to win all remaining tricks based on the cards left in their hand, they can declare "Sawa" and lay their cards down to speed up the game.

# ?? CRITICAL SYSTEM RULE: THE "SHARED DECK" LAW ??
**NEVER EVER refer to "Your Deck" or "The Player's Deck".**
Baloot does NOT have individual player decks. There is exactly ONE shared 32-card deck in the center of the table. 
1. **The Deal:** All 32 cards are distributed evenly (8 cards per player) across the 4 players (You, Partner, Opponent 1, Opponent 2).
2. **The Symmetry Problem:** If a card is permanently modified, added, or removed, it affects the ENTIRE game. If a 7 is upgraded to an Ace, the opponents have a 50% chance to draw that overpowered Ace in the next round.
3. **No Deleting:** You cannot delete a card. Baloot strictly requires 8 tricks (4 players x 8 cards = 32 cards). Deleting a card breaks the game loop.
4. **Agent Mandate:** Any future game design ideas MUST account for the fact that the deck is shared. If you propose "Deck Modification", you must explicitly explain how the player avoids handing an advantage to the AI.
