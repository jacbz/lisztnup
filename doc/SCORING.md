# Scoring

## Timeline

Timeline scoring should reward four behaviours:

- Place cards correctly.
- Prefer precise placements in tight chronological gaps.
- Reward close calls near boundary cards.
- Keep missed attempts useful early, but reduce consolation in long games.

### Correct Placements

- Turn score combines base points, difficulty, mastery, speed, and streak:
  $$\text{Score}_{\text{turn}} = \left(1000 + D + M\right) \times \text{Sp} \times \text{Str}$$
- Difficulty $D$ uses an effective gap that compresses wide slots when placement is close to the nearest boundary card:
  $$D = 2310 \times \frac{10}{\text{EffectiveGap} + 10}$$
  - $\text{EffectiveGap}$ uses total slot gap $G$, nearest boundary-card distance $d_{\min}$, and tuning constant $C = 100$:
    $$\text{EffectiveGap} = G \times \frac{2d_{\min} + C}{G + C}$$
- Mastery $M$ rewards accuracy with one-mistake grace:
  $$M = 500 \times \text{min}\left(1, \frac{C}{\text{max}\left(C, A - 1\right)}\right)^2$$
- Speed $\text{Sp}$ uses seconds taken $s$:
  $$\text{Sp} = 1 + 0.25 \times \left(\frac{\text{max}\left(0, 20 - s\right)}{19}\right)^2$$
- Completion bonus rewards reaching target cards $T$ in fewer attempts $A$:
  $$\text{Completion} = \left(\frac{T}{A}\right)^2 \times \left(T \times 750\right)$$

### Streaks

- Streak multiplier $\text{Str}$ depends on current streak count $S$:
  $$
  \text{Str}(S)=
  \begin{cases}
  1.00,& S\le 1\\
  1.10,& S=2\\
  1.35,& S=3\\
  1.55,& S=4\\
  1.75,& S=5\\
  2.00,& S\ge 6
  \end{cases}
  $$
- Wrong placements decay streak count $S$:
  $$S_{\text{next}} = \text{max}\left(0, \text{min}\left(\frac{S}{2}, S - 3\right)\right)$$

### Consolation

- Misses can still score consolation:
  $$\text{Consolation} = \text{max}\left(1, \text{round}\left(75 \times \text{gapF} \times \text{edgeF}\right)\right) \times \text{timeMult}$$
- Gap factor rewards narrow correct slots using total gap $G$:
  $$\text{gapF} = \text{max}\left(0, \frac{150 - G}{150}\right)$$
- Edge factor rewards closeness to the correct-slot boundary $d_{\text{edge}}$:
  $$\text{edgeF} = \text{max}\left(0, \frac{50 - d_{\text{edge}}}{50}\right)$$
- Time multiplier stays at 1 through $3T$ attempts, then fades to 0 at $4T$:
  $$\text{timeMult} = \text{max}\left(0, \text{min}\left(1, \frac{4T - A}{T}\right)\right)$$
