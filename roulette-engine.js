// European Roulette — shared, DOM-independent engine.
//
// Unlike the slot's engine, this has no configurable weights: a real
// physical wheel is fair by construction, and its entire house edge comes
// from the payout odds (a straight-up bet covers 1 of 37 pockets but pays
// 35:1, not 36:1), never from a rigged wheel. spinWheel() below is a
// genuinely uniform, unweighted draw over all 37 pockets — there is no
// "Developer Mode" here on purpose.
window.RouletteEngine = (() => {
  "use strict";

  const POCKETS = 37; // European: single zero, 0-36
  const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

  function colorOf(n) {
    if (n === 0) return "green";
    return RED_NUMBERS.has(n) ? "red" : "black";
  }

  function spinWheel() {
    return Math.floor(Math.random() * POCKETS);
  }

  // ---------- Table geometry (standard European layout) ----------
  // Numbers 1-36 sit in 12 grid-columns of 3 (top-to-bottom: 3c, 3c-1, 3c-2).
  // These are purely internal position helpers for validating split/street/
  // corner/six-line adjacency — not to be confused with the "column" outside
  // bet below, which actually covers one of the three horizontal rows.
  function gridCol(n) { return Math.ceil(n / 3); }
  function gridRow(n) { // 0 = top, 1 = middle, 2 = bottom
    const m = n % 3;
    return m === 0 ? 0 : m === 2 ? 1 : 2;
  }
  function numberAt(col, row) {
    return row === 0 ? 3 * col : row === 1 ? 3 * col - 1 : 3 * col - 2;
  }

  function isValidSplit(a, b) {
    if (a === b) return false;
    if (a === 0 || b === 0) {
      const other = a === 0 ? b : a;
      return other === 1 || other === 2 || other === 3;
    }
    const ca = gridCol(a), ra = gridRow(a);
    const cb = gridCol(b), rb = gridRow(b);
    if (ca === cb && Math.abs(ra - rb) === 1) return true;
    if (ra === rb && Math.abs(ca - cb) === 1) return true;
    return false;
  }

  function isValidStreet(nums) {
    if (nums.length !== 3 || nums.includes(0)) return false;
    if (new Set(nums).size !== 3) return false;
    const sorted = [...nums].sort((a, b) => a - b);
    const c = gridCol(sorted[0]);
    const expected = [3 * c - 2, 3 * c - 1, 3 * c];
    return sorted.every((v, i) => v === expected[i]);
  }

  function isValidCorner(nums) {
    if (nums.length !== 4 || nums.includes(0)) return false;
    const set = new Set(nums);
    if (set.size !== 4) return false;
    const cols = [...new Set(nums.map(gridCol))].sort((a, b) => a - b);
    const rows = [...new Set(nums.map(gridRow))].sort((a, b) => a - b);
    if (cols.length !== 2 || cols[1] - cols[0] !== 1) return false;
    if (rows.length !== 2 || rows[1] - rows[0] !== 1) return false;
    const expected = [numberAt(cols[0], rows[0]), numberAt(cols[0], rows[1]), numberAt(cols[1], rows[0]), numberAt(cols[1], rows[1])];
    return expected.every(n => set.has(n));
  }

  function isValidSixLine(nums) {
    if (nums.length !== 6 || nums.includes(0)) return false;
    const set = new Set(nums);
    if (set.size !== 6) return false;
    const cols = [...new Set(nums.map(gridCol))].sort((a, b) => a - b);
    if (cols.length !== 2 || cols[1] - cols[0] !== 1) return false;
    const [c1, c2] = cols;
    const expected = [3 * c1 - 2, 3 * c1 - 1, 3 * c1, 3 * c2 - 2, 3 * c2 - 1, 3 * c2];
    return expected.every(n => set.has(n));
  }

  // Classifies a set of selected numbers into the bet type it would place,
  // or null if the selection isn't a valid combination of anything betable.
  function classifySelection(nums) {
    if (nums.length === 1) return "straight";
    if (nums.length === 2 && isValidSplit(nums[0], nums[1])) return "split";
    if (nums.length === 3 && isValidStreet(nums)) return "street";
    if (nums.length === 4 && isValidCorner(nums)) return "corner";
    if (nums.length === 6 && isValidSixLine(nums)) return "sixline";
    return null;
  }

  // ---------- Outside bets ----------
  function numbersInColumn(group) { // group 1, 2, or 3 — one of the three "2 to 1" rows
    const out = [];
    for (let n = 1; n <= 36; n++) if (((n - 1) % 3) + 1 === group) out.push(n);
    return out;
  }
  function numbersInDozen(dozen) { // dozen 1, 2, or 3
    const start = (dozen - 1) * 12 + 1;
    const out = [];
    for (let n = start; n < start + 12; n++) out.push(n);
    return out;
  }
  function allRedNumbers() { return [...RED_NUMBERS]; }
  function allBlackNumbers() {
    const out = [];
    for (let n = 1; n <= 36; n++) if (!RED_NUMBERS.has(n)) out.push(n);
    return out;
  }

  const BET_PAYOUT_RATIO = {
    straight: 35, split: 17, street: 11, corner: 8, sixline: 5,
    column: 2, dozen: 2,
    red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1,
  };

  const BET_LABELS = {
    straight: "Straight", split: "Split", street: "Street", corner: "Corner", sixline: "Six Line",
    column: "Column", dozen: "Dozen", red: "Red", black: "Black", odd: "Odd", even: "Even", low: "1-18", high: "19-36",
  };

  function numbersForBet(bet) {
    switch (bet.type) {
      case "straight": return [bet.numbers[0]];
      case "split": case "street": case "corner": case "sixline": return bet.numbers;
      case "column": return numbersInColumn(bet.group);
      case "dozen": return numbersInDozen(bet.group);
      case "red": return allRedNumbers();
      case "black": return allBlackNumbers();
      case "odd": { const out = []; for (let n = 1; n <= 36; n++) if (n % 2 === 1) out.push(n); return out; }
      case "even": { const out = []; for (let n = 1; n <= 36; n++) if (n % 2 === 0) out.push(n); return out; }
      case "low": { const out = []; for (let n = 1; n <= 18; n++) out.push(n); return out; }
      case "high": { const out = []; for (let n = 19; n <= 36; n++) out.push(n); return out; }
      default: return [];
    }
  }

  // Identifies a bet regardless of amount, so placing the same spot twice
  // increments one bet instead of creating a duplicate row.
  function betKey(bet) {
    switch (bet.type) {
      case "straight": return `straight:${bet.numbers[0]}`;
      case "split": case "street": case "corner": case "sixline":
        return `${bet.type}:${[...bet.numbers].sort((a, b) => a - b).join(",")}`;
      case "column": case "dozen": return `${bet.type}:${bet.group}`;
      default: return bet.type;
    }
  }

  function betLabel(bet) {
    const base = BET_LABELS[bet.type];
    switch (bet.type) {
      case "straight": return `${base} ${bet.numbers[0]}`;
      case "split": case "street": case "corner": case "sixline":
        return `${base} ${[...bet.numbers].sort((a, b) => a - b).join("-")}`;
      case "column": return `${base} ${bet.group} (${numbersInColumn(bet.group)[0]}-${numbersInColumn(bet.group)[11]}, every 3rd)`;
      case "dozen": { const nums = numbersInDozen(bet.group); return `${base} ${bet.group} (${nums[0]}-${nums[11]})`; }
      default: return base;
    }
  }

  // Every standard bet's expected return per unit staked is identical
  // (covered/37 x (ratio+1) = 36/37 for every bet type), so any mix of
  // standard bets always yields exactly 36/37 = 97.2973% RTP. Computing it
  // via this general formula (rather than hardcoding 97.30%) means any bug
  // in numbersForBet/payouts would immediately show up as a deviation.
  function computeTheoreticalRTP(bets) {
    let totalStake = 0, totalEV = 0;
    for (const bet of bets) {
      const covered = numbersForBet(bet).length;
      const ratio = BET_PAYOUT_RATIO[bet.type];
      totalEV += bet.amount * (covered / POCKETS) * (ratio + 1);
      totalStake += bet.amount;
    }
    return totalStake > 0 ? totalEV / totalStake : 0;
  }

  function evaluateSpin(bets, landedNumber) {
    let totalStake = 0, totalWin = 0;
    const results = [];
    for (const bet of bets) {
      totalStake += bet.amount;
      const won = numbersForBet(bet).includes(landedNumber);
      const amount = won ? bet.amount * (BET_PAYOUT_RATIO[bet.type] + 1) : 0;
      totalWin += amount;
      results.push({ bet, won, amount });
    }
    return { totalStake, totalWin, results };
  }

  // ---------- Spin simulator (ratio-based) ----------
  function runSimulation(bets, spinsCount, onProgress, onDone) {
    const CHUNK = 20000;
    let i = 0;
    let totalStake = 0, totalWon = 0, hits = 0, biggestMult = 0;
    let sumRatio = 0, sumRatioSq = 0;

    function step() {
      const end = Math.min(i + CHUNK, spinsCount);
      for (; i < end; i++) {
        const landed = spinWheel();
        const { totalStake: stake, totalWin } = evaluateSpin(bets, landed);
        totalStake += stake;
        totalWon += totalWin;
        const ratio = stake > 0 ? totalWin / stake : 0;
        sumRatio += ratio;
        sumRatioSq += ratio * ratio;
        if (totalWin > 0) {
          hits++;
          if (ratio > biggestMult) biggestMult = ratio;
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
        measuredRTP: totalStake > 0 ? totalWon / totalStake : 0,
        hitFrequency: hits / spinsCount,
        biggestMult,
        volatilityIndex: Math.sqrt(variance),
      });
    }
    step();
  }

  // ---------- Bankroll session simulator ----------
  // Plays the same bet spread every spin from a real starting balance, just
  // like the slot's session simulator, tracking bust probability, best
  // session (highest final balance), and P(session RTP >= 100%).
  function simulateSession(bets, startingBalance, maxSpins) {
    const stakePerSpin = bets.reduce((s, b) => s + b.amount, 0);
    let balance = startingBalance;
    const path = [balance];
    let busted = false, peak = balance, maxDrawdown = 0, spinsPlayed = 0;
    if (stakePerSpin <= 0) return { path, spinsPlayed: 0, busted: false, finalBalance: balance, maxDrawdown: 0 };
    for (let i = 0; i < maxSpins; i++) {
      if (balance < stakePerSpin) { busted = true; break; }
      const landed = spinWheel();
      const { totalStake, totalWin } = evaluateSpin(bets, landed);
      balance -= totalStake;
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

  function runSessionBatch(bets, startingBalance, maxSpins, sessionCount, onProgress, onDone) {
    const CHUNK = 20;
    let i = 0;
    const sessions = [];
    let bustedCount = 0, totalSpinsSurvived = 0, totalFinalBalance = 0, totalMaxDrawdown = 0;
    let bestSession = null, profitableCount = 0;

    function step() {
      const end = Math.min(i + CHUNK, sessionCount);
      for (; i < end; i++) {
        const s = simulateSession(bets, startingBalance, maxSpins);
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
        profitProbability: profitableCount / sessionCount,
      });
    }
    step();
  }

  return {
    POCKETS, BET_PAYOUT_RATIO, BET_LABELS,
    colorOf, spinWheel,
    gridCol, gridRow, numberAt,
    isValidSplit, isValidStreet, isValidCorner, isValidSixLine, classifySelection,
    numbersInColumn, numbersInDozen, allRedNumbers, allBlackNumbers,
    numbersForBet, betKey, betLabel, computeTheoreticalRTP, evaluateSpin,
    runSimulation, simulateSession, runSessionBatch,
  };
})();
