# Firebird 81 — Unofficial Demo

A browser-based, no-build slot machine demo modeled on the real certified "Firebird 81" cabinet (Pravidlá hry č. 2024/2354, Technický skúšobný ústav Piešťany, a.s., valid from 02.12.2024). Built with vanilla HTML, CSS, and JavaScript — no dependencies, no build step, no server required.

**This is an unofficial fan-made demo, not affiliated with or endorsed by the makers of the certified cabinet.** It's built from the game's publicly filed rules for entertainment and educational use only. Credits have no monetary value and cannot be redeemed for cash or prizes.

## Playing it

Just open `index.html` in a browser. There's nothing to install or build.

## What's here

- **4 reels × 3 rows, 81 "criss-cross" lines** — 3-of-a-kind pays across 27 ways, 4-of-a-kind across 81 ways, matched consecutively from the leftmost reel.
- **The certified paytable**, verbatim: Cherries, Lemon, Orange, Plum, Grape, Watermelon, Bell, Seven.
- **Multiplying Wild** — substitutes any symbol but has no payout of its own; instead it multiplies whatever win it takes part in (×2 / ×4 / ×8 for 1 / 2 / 3 wilds in the line).
- **200× max-win cap per spin** and **€0.02–€1,000 stake limits**, both from the certified rules.
- **Autoplay**, a **Riziko-style win banner** with tiered celebrations (Win / Big / Mega / Jackpot), confetti, and a full-screen jackpot overlay.
- **Sound** — spin whoosh, reel ticks and landing thunks, tiered win chimes, and jackpot coin sounds, all synthesized live via the Web Audio API (no audio files). Mute toggle included.
- **Developer Mode** (🛠 button, top bar) — a full RTP/volatility lab:
  - Exact theoretical RTP and house edge, computed in closed form (not simulated) and verified against brute-force enumeration.
  - Four volatility presets (Low/Medium/High/Extreme) that vary only reel-weight shape — the certified paytable is identical across every preset.
  - A **Target RTP** slider bounded to the certified **82.12%–97.98%** range. Since the paytable can't be altered, this solves for reel weights instead — the same lever real multi-RTP-certified cabinets use to offer several RTP tiers off one certified prize table.
  - An advanced per-symbol table (weight, pay×3, pay×4) for manual experimentation.
  - A spin simulator (1,000–500,000 spins, chunked so it never freezes the tab) reporting measured RTP, hit frequency, volatility index (σ), biggest win, and a win-size histogram.
  - A bankroll session simulator: real starting balance + real bet size + N spins, reporting bust probability, max drawdown, and a balance-over-time fan chart.
  - A best-bet-size sweep that finds the largest bet keeping bust risk ≤5% for a given balance.
  - A secret keyboard code (`zolca`) forces the next spin to a big, capped jackpot — handy for testing celebration states without grinding for one.

## Files

- `index.html` — markup
- `style.css` — all styling
- `script.js` — game logic, sound engine, and the Developer Mode RTP lab (single IIFE, no build step)

## Not implemented

The certified rules also describe a "Riziko" card double-or-nothing gamble feature (guess red/black to double a win, up to the certified limits). That's a separate, sizable feature not included here.
