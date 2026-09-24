import random

def simulate_hands(num_runs=1000):
    deck = []
    suits = ['H', 'D', 'S', 'C']
    ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A']
    for s in suits:
        for r in ranks:
            deck.append(r + s)
            
    build_triggers = {
        'trash_beats_boss': 0, # Drew an 8
        'weak_hokum': 0,       # Bought without Jack/9
        'ashkal_10s': 0,       # Partner has two 10s
        'sira_rainbow': 0,     # Has 3 consecutive cards of mixed suits
        'martyr_9': 0,         # Drew 9 of trump, opponent drew Jack
    }
    
    for _ in range(num_runs):
        random.shuffle(deck)
        player_hand = deck[:8]
        partner_hand = deck[8:16]
        opp1_hand = deck[16:24]
        opp2_hand = deck[24:32]
        
        # Build 1: Trash
        if any('8' in card for card in player_hand):
            build_triggers['trash_beats_boss'] += 1
            
        # Build 2: Weak Hokum (Assume trump is 'H')
        if 'JH' not in player_hand and '9H' not in player_hand:
            build_triggers['weak_hokum'] += 1
            
        # Build 3: Ashkal 10s
        tens_in_partner = sum(1 for card in partner_hand if '10' in card)
        if tens_in_partner >= 2:
            build_triggers['ashkal_10s'] += 1
            
        # Build 4: Rainbow Sira (Any 3 consecutive ranks)
        rank_indices = sorted([ranks.index(c[:-1]) for c in player_hand])
        has_run = False
        for i in range(len(rank_indices)-2):
            if rank_indices[i+2] - rank_indices[i] == 2 and len(set(rank_indices[i:i+3])) == 3:
                has_run = True
        if has_run:
            build_triggers['sira_rainbow'] += 1
            
        # Build 5: Martyr
        if '9H' in player_hand and ('JH' in opp1_hand or 'JH' in opp2_hand):
            build_triggers['martyr_9'] += 1

    for k, v in build_triggers.items():
        print(f"{k}: {(v/num_runs)*100}% trigger rate")

simulate_hands()
