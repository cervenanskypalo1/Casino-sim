// Firebird 81 — shared game/RTP engine.
//
// DOM-independent by design: this is the single source of truth for the
// certified game math (symbols, paytable, wild-multiplier mechanic, exact
// theoretical RTP) and for every simulation (spin simulator, bankroll
// session simulator, bet-size sweep), so the main game (index.html) and the
// standalone RTP Lab sub-site (lab.html) always compute identically and
// stay in sync via the same localStorage-persisted Developer Mode config.
window.Firebird81Engine = (() => {
  "use strict";

  // ---------- Config ----------
  const REEL_COUNT = 4;
  const ROW_COUNT = 3;
  const MAX_WIN_MULTIPLIER = 200; // certified cap: max win per spin = 200x total bet

  // Faithful to "Firebird 81" (Pravidlá hry č. 2024/2354, TSU Piešťany,
  // platnosť od 02.12.2024) — a real certified slot: 4 reels x 3 rows, 3-of-
  // a-kind pays across 27 ways / 4-of-a-kind across 81 ways, criss-cross
  // (any row on each reel, run must start on reel 1 and be unbroken).
  // A winning line pays paytable-multiplier x TOTAL bet (not divided across
  // lines); wins on every winning line are summed. Wild substitutes all
  // symbols and has no payout of its own — instead it *multiplies* whatever
  // base-symbol win it takes part in: x2 for 1 wild, x4 for 2 wilds, x8 for
  // 3 wilds in the run (an all-wild run has no base symbol and pays nothing,
  // matching the paytable's "-" entry for Wild). pay3/pay4 below are the
  // certified multipliers verbatim — never rescaled. Reel weights (rarity)
  // are NOT disclosed in the certificate (that's the operator's confidential
  // probability table), so Developer Mode tunes weights, not payouts, to
  // reach any RTP within the certified 82.12%-97.98% range.
  const WILD_ID = "wild";
  const PREMIUM_IDS = ["watermelon", "bell", "seven", "wild"];
  const SYMBOL_META = [
    { id: "cherry",     emoji: "🍒",    name: "Cherries",   pay3: 1,  pay4: 2 },
    { id: "lemon",      emoji: "🍋",    name: "Lemon",      pay3: 1,  pay4: 4 },
    { id: "orange",     emoji: "🍊",    name: "Orange",     pay3: 1,  pay4: 4 },
    { id: "plum",       emoji: "🫐",    name: "Plum",       pay3: 1,  pay4: 4 },
    { id: "grape",      emoji: "🍇",    name: "Grape",      pay3: 1,  pay4: 4 },
    { id: "watermelon", emoji: "🍉",    name: "Watermelon", pay3: 4,  pay4: 40 },
    { id: "bell",       emoji: "🔔",    name: "Bell",       pay3: 6,  pay4: 60 },
    { id: "seven",      emoji: "7️⃣",    name: "Seven",      pay3: 16, pay4: 160 },
    { id: "wild",       emoji: "🐦‍🔥", name: "Wild",       pay3: 0,  pay4: 0 },
  ];

  function makeSymbolSet(weightById) {
    return SYMBOL_META.map(m => ({ ...m, weight: weightById[m.id] }));
  }

  // Weight *shapes* (rarity ordering follows the paytable exactly, as in any
  // classic fruit machine — cheapest symbol most common, priciest rarest).
  // Developer Mode's volatility presets vary only this shape; the certified
  // paytable above is identical across every preset.
  const DEFAULT_SYMBOLS = makeSymbolSet({
    cherry: 24, lemon: 19, orange: 15, plum: 12, grape: 9,
    watermelon: 7, bell: 5, seven: 2.4, wild: 0.6,
  });

  const VOLATILITY_PRESETS = {
    low: makeSymbolSet({
      cherry: 32, lemon: 23, orange: 16, plum: 11, grape: 8,
      watermelon: 5, bell: 3, seven: 1.5, wild: 0.5,
    }),
    medium: DEFAULT_SYMBOLS,
    high: makeSymbolSet({
      cherry: 17, lemon: 16, orange: 15, plum: 14, grape: 13,
      watermelon: 11, bell: 8, seven: 4.5, wild: 1.5,
    }),
    extreme: makeSymbolSet({
      cherry: 14, lemon: 13.5, orange: 13.5, plum: 13, grape: 12,
      watermelon: 12, bell: 10, seven: 8, wild: 4,
    }),
  };

  function cloneSymbols(list) { return list.map(s => ({ ...s })); }

  function binom(n, k) {
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return r;
  }

  // Exact theoretical RTP (no simulation needed). Every one of the 4 reels x
  // 3 rows is drawn independently from the same weighted distribution, so by
  // linearity of expectation the RTP of the whole 81-line game equals the
  // expected payout of a single 4-symbol line, in bet-per-line units (a
  // winning line pays multiplier x totalBet/81, summed across up to 81
  // simultaneously-winning lines — see evaluateWins for why it's per-line,
  // not per-total-bet, despite the certified rules' plain-language wording).
  // For a base symbol of probability p and wild probability pWild, a run of
  // length L has k wilds (k = 0..L-1, k=L excluded — that's the no-base
  // all-wild case, which pays nothing) with probability
  // C(L,k) x p^(L-k) x pWild^k, and pays payL x WILD_MULT[k]. A run of
  // exactly 3 additionally requires the 4th reel to break it: prob (1-p-pWild).
  const WILD_MULT = [1, 2, 4, 8]; // multiplier for 0, 1, 2, 3 wilds in the run
  function computeTheoreticalRTP(symbols) {
    const totalWeight = symbols.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight <= 0) return 0;
    const probs = Object.fromEntries(symbols.map(s => [s.id, s.weight / totalWeight]));
    const pWild = probs[WILD_ID] || 0;
    let lineEV = 0;
    for (const s of symbols) {
      if (s.id === WILD_ID) continue;
      const p = probs[s.id];
      let term4 = 0;
      for (let k = 0; k <= 3; k++) {
        term4 += binom(4, k) * Math.pow(p, 4 - k) * Math.pow(pWild, k) * WILD_MULT[k];
      }
      let term3 = 0;
      for (let k = 0; k <= 2; k++) {
        term3 += binom(3, k) * Math.pow(p, 3 - k) * Math.pow(pWild, k) * WILD_MULT[k];
      }
      term3 *= (1 - p - pWild);
      lineEV += s.pay4 * term4 + s.pay3 * term3;
    }
    return lineEV; // fraction, e.g. 0.95 = 95% RTP — betPerLine's 1/81 already cancels the x81 lines
  }

  // Solves for a multiplier on just the "premium" symbols' weights (the
  // watermelon/bell/seven/wild tier) that makes theoretical RTP hit
  // `targetPercent`, leaving every payout untouched — this is how real
  // multi-RTP-certified cabinets work: one certified paytable, several
  // certified probability tables, one per RTP tier.
  function solvePremiumFactor(symbols, targetPercent) {
    const targetFraction = targetPercent / 100;
    function rtpAtFactor(f) {
      const trial = symbols.map(s => ({ ...s, weight: PREMIUM_IDS.includes(s.id) ? s.weight * f : s.weight }));
      return computeTheoreticalRTP(trial);
    }
    let lo = 1e-4, hi = 1e4;
    for (let i = 0; i < 60; i++) {
      const mid = Math.sqrt(lo * hi);
      if (rtpAtFactor(mid) < targetFraction) lo = mid; else hi = mid;
    }
    return Math.sqrt(lo * hi);
  }

  // ---------- Live (mutable) game math — edited by Developer Mode ----------
  let SYMBOLS = cloneSymbols(DEFAULT_SYMBOLS);
  let SYMBOL_BY_ID = {};
  let TOTAL_WEIGHT = 0;
  let currentPresetName = "medium";

  function recalcDerived() {
    SYMBOL_BY_ID = Object.fromEntries(SYMBOLS.map(s => [s.id, s]));
    TOTAL_WEIGHT = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  }
  recalcDerived();

  const RTP_MIN = 82.12, RTP_MAX = 97.98; // certified range for this game
  const DEFAULT_TARGET_RTP = 96; // a generous default within the certified range

  // Normalize the shipped default (and hence the "medium" preset) to the
  // default target RTP in place, once, at load.
  {
    const factor = solvePremiumFactor(DEFAULT_SYMBOLS, DEFAULT_TARGET_RTP);
    DEFAULT_SYMBOLS.forEach(s => { if (PREMIUM_IDS.includes(s.id)) s.weight *= factor; });
    SYMBOLS = cloneSymbols(DEFAULT_SYMBOLS);
    recalcDerived();
  }

  let targetRTP = DEFAULT_TARGET_RTP;

  function applyTargetRTP(targetPercent) {
    const factor = solvePremiumFactor(SYMBOLS, targetPercent);
    SYMBOLS.forEach(s => { if (PREMIUM_IDS.includes(s.id)) s.weight *= factor; });
    recalcDerived();
  }

  // ---------- Developer Mode persistence — shared across every page ----------
  function saveDevConfig() {
    try {
      localStorage.setItem("firebird81DevConfig", JSON.stringify({ symbols: SYMBOLS, targetRTP, preset: currentPresetName }));
    } catch (e) { /* ignore */ }
  }

  function loadDevConfig() {
    try {
      const raw = localStorage.getItem("firebird81DevConfig");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.symbols) && parsed.symbols.length === DEFAULT_SYMBOLS.length) {
        SYMBOLS = parsed.symbols.map(s => ({ ...s }));
        recalcDerived();
      }
      if (typeof parsed.targetRTP === "number") targetRTP = parsed.targetRTP;
      if (typeof parsed.preset === "string") currentPresetName = parsed.preset;
    } catch (e) { /* ignore */ }
  }
  loadDevConfig(); // apply any persisted config immediately, before any page renders

  function setSymbolField(idx, field, value) {
    SYMBOLS[idx][field] = value;
    recalcDerived();
    saveDevConfig();
  }

  function applyPreset(name) {
    const preset = VOLATILITY_PRESETS[name];
    if (!preset) return false;
    SYMBOLS = cloneSymbols(preset);
    recalcDerived();
    applyTargetRTP(targetRTP);
    currentPresetName = name;
    saveDevConfig();
    return true;
  }

  function setTargetRTP(percent) {
    targetRTP = percent;
  }

  function applyTargetRTPAndSave(percent) {
    targetRTP = percent;
    applyTargetRTP(percent);
    saveDevConfig();
  }

  function resetDevMode() {
    SYMBOLS = cloneSymbols(DEFAULT_SYMBOLS);
    recalcDerived();
    targetRTP = Math.round(computeTheoreticalRTP(DEFAULT_SYMBOLS) * 1000) / 10;
    currentPresetName = "medium";
    try { localStorage.removeItem("firebird81DevConfig"); } catch (e) { /* ignore */ }
  }

  // ---------- Certified stake limits & win tiers ----------
  // Certified stake limits: min 0.02, max 1 000.
  const BET_STEPS = [0.02, 0.05, 0.10, 0.20, 0.50, 1.00, 2.00, 5.00, 10.00, 20.00, 50.00, 100.00, 200.00, 500.00, 1000.00];
  const DEFAULT_BET = 1.00;

  // Win tiers, as a ratio of total win / total bet.
  const TIERS = {
    win:     { threshold: 0,  label: "WIN!",       confetti: 50 },
    big:     { threshold: 5,  label: "BIG WIN!",   confetti: 90 },
    mega:    { threshold: 15, label: "MEGA WIN!",  confetti: 160 },
    jackpot: { threshold: 40, label: "JACKPOT!!!", confetti: 260 },
  };

  // ---------- 81 lines: every combination of row-picks across 4 reels ----------
  const LINES = [];
  for (let a = 0; a < ROW_COUNT; a++)
    for (let b = 0; b < ROW_COUNT; b++)
      for (let c = 0; c < ROW_COUNT; c++)
        for (let d = 0; d < ROW_COUNT; d++)
          LINES.push([a, b, c, d]);
  // LINES.length === 81

  function weightedRandomSymbol() {
    let r = Math.random() * TOTAL_WEIGHT;
    for (const s of SYMBOLS) {
      r -= s.weight;
      if (r <= 0) return s.id;
    }
    return SYMBOLS[0].id;
  }

  // ---------- Win evaluation ----------
  // The certified rules describe a win as "paytable multiplier x total bet"
  // — plain-language wording for players, not a literal engine spec. Taken
  // completely literally (undivided, summed across up to 81 simultaneously
  // winning lines) RTP becomes unachievable: even modest, realistic reel
  // weights blow past 1000%+ (verified by hand and by brute force). The
  // standard, achievable convention for this "many ways" style — and what
  // every real engine of this shape actually does — is bet-per-line =
  // totalBet / 81. Wild substitutes all symbols but never establishes its
  // own win (an all-wild run has no base symbol and pays nothing); instead
  // each wild inside a winning run multiplies that run's payout (x2/x4/x8
  // for 1/2/3 wilds).
  function evaluateWins(grid, totalBet) {
    const wins = [];
    let totalWin = 0;
    const winningCells = new Set(); // "reelIndex,rowIndex"
    const betPerLine = totalBet / LINES.length;

    LINES.forEach((line, lineIndex) => {
      const lineSymbols = line.map((row, reelIndex) => grid[reelIndex][row]);
      let baseSymbol = null;
      let count = 0;
      let wildCount = 0;
      for (let i = 0; i < lineSymbols.length; i++) {
        const sym = lineSymbols[i];
        if (sym === WILD_ID) { count++; wildCount++; continue; }
        if (baseSymbol === null) { baseSymbol = sym; count++; }
        else if (sym === baseSymbol) { count++; }
        else break;
      }
      if (count >= 3 && baseSymbol) {
        const symDef = SYMBOL_BY_ID[baseSymbol];
        const payMultiplier = count === 4 ? symDef.pay4 : symDef.pay3;
        const amount = payMultiplier * WILD_MULT[wildCount] * betPerLine;
        totalWin += amount;
        wins.push({ lineIndex, symbol: baseSymbol, count, wildCount, amount });
        for (let i = 0; i < count; i++) winningCells.add(`${i},${line[i]}`);
      }
      // baseSymbol === null && count > 0 means every counted symbol was wild
      // (an all-wild run) — per the certified paytable's "-" entry for Wild,
      // that pays nothing, so it's intentionally left unscored here.
    });

    const cap = totalBet * MAX_WIN_MULTIPLIER;
    if (totalWin > cap) {
      const scale = cap / totalWin;
      wins.forEach(w => { w.amount *= scale; });
      totalWin = cap;
    }
    return { wins, totalWin, winningCells };
  }

  // ---------- Spin simulator (ratio-based; bet size doesn't affect RTP) ----------
  // Fast, unanimated bulk spins — same weightedRandomSymbol()/evaluateWins()
  // math as real spins — so measured RTP/hit-frequency/volatility can be
  // compared against the exact theoretical numbers above (law of large
  // numbers: the more spins, the closer measured tracks theoretical).
  // Runs in chunks via setTimeout so even a large spin count never freezes
  // the tab — each chunk yields back to the browser before starting the next.
  function runSimulation(spinsCount, onProgress, onDone) {
    const bet = 1;
    const CHUNK = 20000;
    let i = 0;
    let totalBet = 0, totalWon = 0, hits = 0, biggestMult = 0;
    let sumRatio = 0, sumRatioSq = 0;
    const buckets = [0, 0, 0, 0, 0]; // none, win, big, mega, jackpot

    function step() {
      const end = Math.min(i + CHUNK, spinsCount);
      for (; i < end; i++) {
        const grid = [];
        for (let r = 0; r < REEL_COUNT; r++) {
          const row = [];
          for (let c = 0; c < ROW_COUNT; c++) row.push(weightedRandomSymbol());
          grid.push(row);
        }
        const { totalWin } = evaluateWins(grid, bet);
        totalBet += bet;
        totalWon += totalWin;
        const ratio = totalWin / bet;
        sumRatio += ratio;
        sumRatioSq += ratio * ratio;
        if (totalWin > 0) {
          hits++;
          if (ratio > biggestMult) biggestMult = ratio;
          if (ratio >= TIERS.jackpot.threshold) buckets[4]++;
          else if (ratio >= TIERS.mega.threshold) buckets[3]++;
          else if (ratio >= TIERS.big.threshold) buckets[2]++;
          else buckets[1]++;
        } else {
          buckets[0]++;
        }
      }
      if (i < spinsCount) {
        onProgress(i / spinsCount);
        setTimeout(step, 0);
        return;
      }
      const mean = sumRatio / spinsCount;
      const variance = Math.max(0, sumRatioSq / spinsCount - mean * mean);
      onDone({
        spins: spinsCount,
        measuredRTP: totalBet > 0 ? totalWon / totalBet : 0,
        hitFrequency: hits / spinsCount,
        biggestMult,
        volatilityIndex: Math.sqrt(variance),
        buckets,
      });
    }
    step();
  }

  // ---------- Bankroll session simulator ----------
  // Unlike runSimulation() above (which normalizes to a 1-credit bet, since
  // RTP itself doesn't depend on bet size), this spends a *real* bet from a
  // *real* starting balance every spin, so it's where bet size actually
  // shows up: bigger bets burn through the same bankroll faster and swing
  // harder, which is exactly what "volatility" feels like at the table.
  function simulateSession(startingBalance, bet, maxSpins) {
    let balance = startingBalance;
    const path = [balance];
    let busted = false;
    let peak = balance;
    let maxDrawdown = 0;
    let spinsPlayed = 0;
    for (let i = 0; i < maxSpins; i++) {
      if (balance < bet) { busted = true; break; }
      balance -= bet;
      const grid = [];
      for (let r = 0; r < REEL_COUNT; r++) {
        const row = [];
        for (let c = 0; c < ROW_COUNT; c++) row.push(weightedRandomSymbol());
        grid.push(row);
      }
      const { totalWin } = evaluateWins(grid, bet);
      balance += totalWin;
      spinsPlayed++;
      path.push(balance);
      if (balance > peak) peak = balance;
      const drawdown = peak - balance;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      if (balance <= 0) { balance = 0; busted = true; break; }
    }
    return { path, spinsPlayed, busted, finalBalance: balance, maxDrawdown };
  }

  // Runs many independent sessions in chunks (never blocks the tab) to get
  // stable statistics like bust probability, which a single session can't
  // tell you. Also tracks the single best session (highest final balance)
  // and the probability a session ends with final balance >= starting
  // balance (i.e. that session's own RTP was >= 100% — the player left
  // ahead), both across the whole batch.
  function runSessionBatch(startingBalance, bet, maxSpins, sessionCount, onProgress, onDone) {
    const CHUNK = 20;
    let i = 0;
    const sessions = [];
    let bustedCount = 0, totalSpinsSurvived = 0, totalFinalBalance = 0, totalMaxDrawdown = 0;
    let bestSession = null;
    let profitableCount = 0;

    function step() {
      const end = Math.min(i + CHUNK, sessionCount);
      for (; i < end; i++) {
        const s = simulateSession(startingBalance, bet, maxSpins);
        sessions.push(s);
        if (s.busted) bustedCount++;
        totalSpinsSurvived += s.spinsPlayed;
        totalFinalBalance += s.finalBalance;
        totalMaxDrawdown += s.maxDrawdown;
        if (s.finalBalance >= startingBalance) profitableCount++;
        if (!bestSession || s.finalBalance > bestSession.finalBalance) bestSession = s;
      }
      if (i < sessionCount) {
        onProgress(i / sessionCount);
        setTimeout(step, 0);
        return;
      }
      onDone({
        sessions,
        bustProbability: bustedCount / sessionCount,
        avgSpinsSurvived: totalSpinsSurvived / sessionCount,
        avgFinalBalance: totalFinalBalance / sessionCount,
        avgMaxDrawdown: totalMaxDrawdown / sessionCount,
        bestSession,
        profitProbability: profitableCount / sessionCount, // P(session RTP >= 100%)
      });
    }
    step();
  }

  // Sweeps every standard bet size against the same starting balance and
  // session length, chaining chunked session batches so the whole sweep
  // never blocks the tab even though it runs many spins in total.
  function runBetSweep(startingBalance, maxSpins, sessionCount, onProgress, onDone) {
    const results = [];
    let idx = 0;
    function step() {
      const bet = BET_STEPS[idx];
      runSessionBatch(startingBalance, bet, maxSpins, sessionCount, () => {}, (agg) => {
        results.push({ bet, ...agg });
        idx++;
        onProgress(idx / BET_STEPS.length);
        if (idx < BET_STEPS.length) setTimeout(step, 0);
        else onDone(results);
      });
    }
    step();
  }

  return {
    REEL_COUNT, ROW_COUNT, WILD_ID, MAX_WIN_MULTIPLIER,
    BET_STEPS, DEFAULT_BET, TIERS, LINES,
    DEFAULT_SYMBOLS, VOLATILITY_PRESETS, RTP_MIN, RTP_MAX, DEFAULT_TARGET_RTP,
    cloneSymbols,
    computeTheoreticalRTP,
    getSymbols: () => SYMBOLS,
    getSymbolById: (id) => SYMBOL_BY_ID[id],
    setSymbolField,
    getTargetRTP: () => targetRTP,
    setTargetRTP,
    applyTargetRTP: applyTargetRTPAndSave,
    getCurrentPreset: () => currentPresetName,
    applyPreset,
    resetDevMode,
    weightedRandomSymbol,
    evaluateWins,
    runSimulation,
    simulateSession,
    runSessionBatch,
    runBetSweep,
    saveDevConfig,
    loadDevConfig,
  };
})();
