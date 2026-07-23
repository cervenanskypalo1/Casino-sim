# Casino— Unofficial Demo

A browser-based, no-build slot machine demo modeled on the real certified "Firebird 81" cabinet (Pravidlá hry č. 2024/2354, Technický skúšobný ústav Piešťany, a.s., valid from 02.12.2024). Built with vanilla HTML, CSS, and JavaScript — no dependencies, no build step, no server required.

**This is an unofficial fan-made demo, not affiliated with or endorsed by the makers of the certified cabinet.** It's built from the game's publicly filed rules for entertainment and educational use only. Credits have no monetary value and cannot be redeemed for cash or prizes.

## Playing it

Open `index.html` in a browser to play the slot. Open `lab.html` for the slot's RTP Lab, or `roulette.html` for the Roulette Lab. There's nothing to install or build. (`file://` works, but the slot and its RTP Lab only stay in sync with each other over `localStorage` when served from the same http(s) origin — e.g. via GitHub Pages or any static file server — since browsers isolate storage per-origin more strictly for local files.)

## What's here

- **4 reels × 3 rows, 81 "criss-cross" lines** — 3-of-a-kind pays across 27 ways, 4-of-a-kind across 81 ways, matched consecutively from the leftmost reel.
- **The certified paytable**, verbatim: Cherries, Lemon, Orange, Plum, Grape, Watermelon, Bell, Seven.
- **Multiplying Wild** — substitutes any symbol but has no payout of its own; instead it multiplies whatever win it takes part in (×2 / ×4 / ×8 for 1 / 2 / 3 wilds in the line).
- **200× max-win cap per spin** and **€0.02–€1,000 stake limits**, both from the certified rules.
- **Autoplay**, a **Riziko-style win banner** with tiered celebrations (Win / Big / Mega / Jackpot), confetti, and a full-screen jackpot overlay.
- **Sound** — spin whoosh, reel ticks and landing thunks, tiered win chimes, and jackpot coin sounds, all synthesized live via the Web Audio API (no audio files). Mute toggle included.
- **A secret keyboard code** forces the next spin to a big, capped jackpot — handy for testing celebration states without grinding for one.

### RTP Lab (`lab.html`) — a standalone sub-site

Linked from the "🛠 RTP Lab" button in the main game (opens in a new tab), sharing the same math engine and `localStorage`-persisted config, so a change made in the lab applies to real spins in the game next time it's loaded:

- Exact theoretical RTP and house edge, computed in closed form (not simulated) and verified against brute-force enumeration.
- Four volatility presets (Low/Medium/High/Extreme) that vary only reel-weight shape — the certified paytable is identical across every preset.
- A **Target RTP** slider bounded to the certified **82.12%–97.98%** range. Since the paytable can't be altered, this solves for reel weights instead — the same lever real multi-RTP-certified cabinets use to offer several RTP tiers off one certified prize table.
- An advanced per-symbol table (weight, pay×3, pay×4) for manual experimentation.
- A **spin simulator** (1,000–500,000 spins, chunked so it never freezes the tab) reporting measured RTP, hit frequency, volatility index (σ), biggest win, and a win-size histogram.
- A **bankroll session simulator**: real starting balance + real bet size + N spins, reporting bust probability, **P(session RTP ≥ 100%)** (the odds a session ends with the player ahead), **best session** (the single highest final balance across all simulated sessions), max drawdown, and a balance-over-time fan chart.
- A **best-bet-size sweep** across every standard stake, showing bust risk and P(RTP ≥ 100%) per bet size and flagging the largest bet that keeps bust risk ≤5% for a given balance.

### Roulette Lab (`roulette.html`) — a second standalone sub-site

European roulette (single zero, 37 pockets). Unlike the slot, the wheel has **no configurable weights** — `spinWheel()` is a genuinely uniform, unweighted draw over all 37 pockets every time, exactly like a physical wheel. The entire house edge comes from payout odds, not a rigged RNG:

- **Full betting table with a real casino-style hotspot overlay**: click a number for Straight, or click one of ~105 small dots positioned exactly on the edges/corners between numbers to place Split, Street, Corner, or Six Line bets in a single click (hover a dot to preview what it places) — plus one-click outside bets (Column, Dozen, Red, Black, Odd, Even, 1-18, 19-36). Every placed bet shows as a gold chip badge right on the table (click a chip to remove it), alongside a full text list.
- **Live theoretical RTP**, computed from whatever bet mix you've placed. Every standard bet's expected return per unit staked is identical (36/37 ≈ 97.30%), so any mix always computes to the same value — a nice built-in correctness check on the payout math itself.
- A **spin simulator** and a **bankroll session simulator** (bust probability, P(session RTP ≥ 100%), best session, max drawdown, balance-over-time fan chart) — same structure as the slot's, but playing your current bet spread every spin instead of a fixed paytable.
- An **optimal bet amount sweep**: scales your entire current bet spread by 0.1×–100× and re-runs the session simulation at each scale, flagging the largest that keeps bust risk ≤5% — the multi-bet-portfolio equivalent of the slot's best-bet-size sweep.
- A **bet-type risk profile comparison**: every bet category (Straight → Split → Street → Corner → Six Line → 12-Number → Even Money) has *identical* 97.30% theoretical RTP — that's inherent to a fair wheel, not a strategy. This isn't a search for a "better" bet; it compares volatility instead, at equal stake — fewer numbers covered means rarer, bigger wins and higher bust risk for the same expected value.

## Files

- `index.html` / `script.js` — the playable slot (markup + reel/UI/sound logic)
- `lab.html` / `lab.js` — the slot's standalone RTP Lab sub-site
- `engine.js` — shared, DOM-independent slot engine: certified symbols/paytable, exact RTP math, win evaluation, and every slot simulation. Single source of truth used by both the slot and its lab.
- `roulette.html` / `roulette.js` — the standalone Roulette Lab sub-site
- `roulette-engine.js` — shared, DOM-independent roulette engine: wheel, table geometry/adjacency rules, payouts, and simulations
- `style.css` — all styling, shared by every page

## Not implemented

The certified rules also describe a "Riziko" card double-or-nothing gamble feature (guess red/black to double a win, up to the certified limits). That's a separate, sizable feature not included here.
