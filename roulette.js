(() => {
  "use strict";

  const Engine = window.RouletteEngine;

  function formatCredits(n) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function formatChipAmount(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  }

  const el = {
    chipAmount: document.getElementById("chip-amount"),
    grid: document.getElementById("roulette-grid"),
    rtpMathGrid: document.getElementById("rtp-math-grid"),
    betsList: document.getElementById("bets-list"),
    clearAllBets: document.getElementById("clear-all-bets"),
    simSpins: document.getElementById("sim-spins"),
    runSimulation: document.getElementById("run-simulation"),
    simResults: document.getElementById("sim-results"),
    sessionBalanceInput: document.getElementById("session-balance"),
    sessionSpinsSelect: document.getElementById("session-spins"),
    sessionCountSelect: document.getElementById("session-count"),
    runSessionSim: document.getElementById("run-session-sim"),
    sessionResults: document.getElementById("session-results"),
    sessionChart: document.getElementById("session-chart"),
    runAmountSweep: document.getElementById("run-amount-sweep"),
    amountSweepResults: document.getElementById("amount-sweep-results"),
    comparisonStake: document.getElementById("comparison-stake"),
    runTypeComparison: document.getElementById("run-type-comparison"),
    typeComparisonResults: document.getElementById("type-comparison-results"),
  };

  let bets = []; // { type, numbers?, group?, amount }

  function currentChip() {
    return Math.max(0.1, parseFloat(el.chipAmount.value) || 1);
  }

  // ---------- Table layout (single source of truth for both drawing and hotspot/chip math) ----------
  const CELL_W = 44, CELL_H = 48, GAP = 3, ZERO_W = 56, OUTSIDE_W = 56;
  const DOZEN_H = 40, EVEN_H = 40;
  const HOTSPOT_SIZE = 16, CHIP_SIZE = 22;

  function colLeft(c) { return ZERO_W + GAP + (c - 1) * (CELL_W + GAP); }
  function rowTop(r) { return r * (CELL_H + GAP); }
  const GRID_BOTTOM = 3 * CELL_H + 2 * GAP;
  const OUTSIDE_X = colLeft(12) + CELL_W + GAP;
  const DOZEN_Y = GRID_BOTTOM + GAP;
  const EVEN_Y = DOZEN_Y + DOZEN_H + GAP;
  const TOTAL_WIDTH = OUTSIDE_X + OUTSIDE_W;
  const TOTAL_HEIGHT = EVEN_Y + EVEN_H;

  const DOZEN_SPECS = [[1, 1, "1st 12"], [5, 2, "2nd 12"], [9, 3, "3rd 12"]];
  const EVEN_MONEY_SPECS = [
    { type: "low", label: "1-18", startCol: 1 },
    { type: "even", label: "EVEN", startCol: 3 },
    { type: "red", label: "RED", startCol: 5, color: "roul-red" },
    { type: "black", label: "BLACK", startCol: 7, color: "roul-black" },
    { type: "odd", label: "ODD", startCol: 9 },
    { type: "high", label: "19-36", startCol: 11 },
  ];

  // betKey() -> { x, y } for every placeable spot, populated once when the
  // table is built. Single lookup used both for hotspot rendering and for
  // positioning chip badges once a bet is placed there.
  const posByKey = new Map();
  let hotspots = []; // { type, numbers, x, y }

  function place(elx, x, y, w, h) {
    elx.style.position = "absolute";
    elx.style.left = x + "px";
    elx.style.top = y + "px";
    elx.style.width = w + "px";
    elx.style.height = h + "px";
  }

  function buildGrid() {
    el.grid.innerHTML = "";
    el.grid.style.position = "relative";
    el.grid.style.width = TOTAL_WIDTH + "px";
    el.grid.style.height = TOTAL_HEIGHT + "px";
    posByKey.clear();

    // Zero
    const zero = document.createElement("div");
    zero.className = "roul-cell roul-green roul-zero";
    zero.textContent = "0";
    place(zero, 0, 0, ZERO_W, GRID_BOTTOM);
    zero.dataset.number = "0";
    el.grid.appendChild(zero);
    posByKey.set(Engine.betKey({ type: "straight", numbers: [0] }), { x: ZERO_W / 2, y: GRID_BOTTOM / 2 });

    // Numbers 1-36
    for (let n = 1; n <= 36; n++) {
      const cell = document.createElement("div");
      cell.className = `roul-cell roul-${Engine.colorOf(n)}`;
      cell.textContent = String(n);
      const x = colLeft(Engine.gridCol(n)), y = rowTop(Engine.gridRow(n));
      place(cell, x, y, CELL_W, CELL_H);
      cell.dataset.number = String(n);
      el.grid.appendChild(cell);
      posByKey.set(Engine.betKey({ type: "straight", numbers: [n] }), { x: x + CELL_W / 2, y: y + CELL_H / 2 });
    }

    // "2 to 1" column boxes — row 0 (top) = group 3, row 1 (mid) = group 2, row 2 (bottom) = group 1
    [[0, 3], [1, 2], [2, 1]].forEach(([row, group]) => {
      const box = document.createElement("div");
      box.className = "roul-cell roul-outside";
      box.textContent = "2:1";
      const y = rowTop(row);
      place(box, OUTSIDE_X, y, OUTSIDE_W, CELL_H);
      box.dataset.outside = "column";
      box.dataset.group = String(group);
      el.grid.appendChild(box);
      posByKey.set(Engine.betKey({ type: "column", group }), { x: OUTSIDE_X + OUTSIDE_W / 2, y: y + CELL_H / 2 });
    });

    // Dozens
    DOZEN_SPECS.forEach(([startCol, group, label]) => {
      const box = document.createElement("div");
      box.className = "roul-cell roul-outside";
      box.textContent = label;
      const w = 4 * CELL_W + 3 * GAP;
      place(box, colLeft(startCol), DOZEN_Y, w, DOZEN_H);
      box.dataset.outside = "dozen";
      box.dataset.group = String(group);
      el.grid.appendChild(box);
      posByKey.set(Engine.betKey({ type: "dozen", group }), { x: colLeft(startCol) + w / 2, y: DOZEN_Y + DOZEN_H / 2 });
    });

    // Even-money row
    EVEN_MONEY_SPECS.forEach(spec => {
      const box = document.createElement("div");
      box.className = `roul-cell roul-outside ${spec.color || ""}`;
      box.textContent = spec.label;
      const w = 2 * CELL_W + GAP;
      place(box, colLeft(spec.startCol), EVEN_Y, w, EVEN_H);
      box.dataset.outside = spec.type;
      el.grid.appendChild(box);
      posByKey.set(Engine.betKey({ type: spec.type }), { x: colLeft(spec.startCol) + w / 2, y: EVEN_Y + EVEN_H / 2 });
    });

    buildHotspots();
    el.grid.addEventListener("click", handleGridClick);
  }

  function addHotspot(type, numbers, x, y) {
    hotspots.push({ type, numbers, x, y });
    posByKey.set(Engine.betKey({ type, numbers }), { x, y });
  }

  function buildHotspots() {
    hotspots = [];

    // Horizontal splits (same row, adjacent columns)
    for (let r = 0; r <= 2; r++) {
      for (let c = 1; c <= 11; c++) {
        addHotspot("split", [Engine.numberAt(c, r), Engine.numberAt(c + 1, r)], colLeft(c) + CELL_W + GAP / 2, rowTop(r) + CELL_H / 2);
      }
    }
    // Vertical splits (same column, adjacent rows)
    for (let r = 0; r <= 1; r++) {
      for (let c = 1; c <= 12; c++) {
        addHotspot("split", [Engine.numberAt(c, r), Engine.numberAt(c, r + 1)], colLeft(c) + CELL_W / 2, rowTop(r) + CELL_H + GAP / 2);
      }
    }
    // Zero splits (0 with 1, 2, or 3 only)
    [[1, 2], [2, 1], [3, 0]].forEach(([n, row]) => {
      addHotspot("split", [0, n], ZERO_W + GAP / 2, rowTop(row) + CELL_H / 2);
    });
    // Streets (bottom edge of the grid, one per column)
    for (let c = 1; c <= 12; c++) {
      addHotspot("street", [Engine.numberAt(c, 0), Engine.numberAt(c, 1), Engine.numberAt(c, 2)], colLeft(c) + CELL_W / 2, GRID_BOTTOM);
    }
    // Six lines (bottom edge, between adjacent columns)
    for (let c = 1; c <= 11; c++) {
      addHotspot("sixline", [
        Engine.numberAt(c, 0), Engine.numberAt(c, 1), Engine.numberAt(c, 2),
        Engine.numberAt(c + 1, 0), Engine.numberAt(c + 1, 1), Engine.numberAt(c + 1, 2),
      ], colLeft(c) + CELL_W + GAP / 2, GRID_BOTTOM);
    }
    // Corners
    for (let r = 0; r <= 1; r++) {
      for (let c = 1; c <= 11; c++) {
        addHotspot("corner", [
          Engine.numberAt(c, r), Engine.numberAt(c, r + 1),
          Engine.numberAt(c + 1, r), Engine.numberAt(c + 1, r + 1),
        ], colLeft(c) + CELL_W + GAP / 2, rowTop(r) + CELL_H + GAP / 2);
      }
    }

    hotspots.forEach((h, idx) => {
      const dot = document.createElement("div");
      dot.className = `roul-hotspot roul-hotspot-${h.type}`;
      place(dot, h.x - HOTSPOT_SIZE / 2, h.y - HOTSPOT_SIZE / 2, HOTSPOT_SIZE, HOTSPOT_SIZE);
      dot.dataset.hotspotIdx = String(idx);
      const sorted = h.numbers.slice().sort((a, b) => a - b);
      dot.title = `${Engine.BET_LABELS[h.type]} ${sorted.join("-")} (pays ${Engine.BET_PAYOUT_RATIO[h.type]}:1)`;
      el.grid.appendChild(dot);
    });
  }

  function handleGridClick(e) {
    const chipEl = e.target.closest(".roul-chip");
    if (chipEl) {
      removeBetByKey(chipEl.dataset.betKey);
      return;
    }
    const hotspotEl = e.target.closest(".roul-hotspot");
    if (hotspotEl) {
      const h = hotspots[parseInt(hotspotEl.dataset.hotspotIdx, 10)];
      placeBet(h.type, { numbers: h.numbers }, currentChip());
      return;
    }
    const cell = e.target.closest("[data-number]");
    if (cell) {
      placeBet("straight", { numbers: [parseInt(cell.dataset.number, 10)] }, currentChip());
      return;
    }
    const outside = e.target.closest("[data-outside]");
    if (outside) {
      const group = outside.dataset.group ? parseInt(outside.dataset.group, 10) : undefined;
      placeBet(outside.dataset.outside, group !== undefined ? { group } : {}, currentChip());
    }
  }

  // ---------- Chip badges ----------
  function renderChips() {
    el.grid.querySelectorAll(".roul-chip").forEach(c => c.remove());
    bets.forEach(bet => {
      const pos = posByKey.get(Engine.betKey(bet));
      if (!pos) return;
      const chip = document.createElement("div");
      chip.className = "roul-chip";
      chip.textContent = formatChipAmount(bet.amount);
      place(chip, pos.x - CHIP_SIZE / 2, pos.y - CHIP_SIZE / 2, CHIP_SIZE, CHIP_SIZE);
      chip.dataset.betKey = Engine.betKey(bet);
      chip.title = `${Engine.betLabel(bet)} — click to remove`;
      el.grid.appendChild(chip);
    });
  }

  // ---------- Bets ----------
  function placeBet(type, params, amount) {
    const bet = { type, amount, ...params };
    const key = Engine.betKey(bet);
    const existing = bets.find(b => Engine.betKey(b) === key);
    if (existing) existing.amount += amount;
    else bets.push(bet);
    renderBetsList();
    renderChips();
    refreshRTP();
  }

  function removeBet(index) {
    bets.splice(index, 1);
    renderBetsList();
    renderChips();
    refreshRTP();
  }

  function removeBetByKey(key) {
    const idx = bets.findIndex(b => Engine.betKey(b) === key);
    if (idx >= 0) removeBet(idx);
  }

  function renderBetsList() {
    el.betsList.innerHTML = "";
    if (bets.length === 0) {
      const li = document.createElement("li");
      li.className = "lines-list-empty";
      li.textContent = "No bets placed yet";
      el.betsList.appendChild(li);
      return;
    }
    bets.forEach((bet, idx) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${Engine.betLabel(bet)} <span style="color:var(--text-dim)">(pays ${Engine.BET_PAYOUT_RATIO[bet.type]}:1)</span></span><span class="amt">${formatCredits(bet.amount)} <button class="bet-remove" data-idx="${idx}" aria-label="Remove bet">✕</button></span>`;
      el.betsList.appendChild(li);
    });
  }

  function totalStake() {
    return bets.reduce((s, b) => s + b.amount, 0);
  }

  function refreshRTP() {
    const rtp = Engine.computeTheoreticalRTP(bets) * 100;
    const houseEdge = bets.length > 0 ? 100 - rtp : 0;
    el.rtpMathGrid.innerHTML = `
      <div class="panel-row"><span class="panel-label">Total Wagered / Spin</span><span class="panel-value">${formatCredits(totalStake())}</span></div>
      <div class="panel-row"><span class="panel-label">Theoretical RTP</span><span class="panel-value gold">${bets.length > 0 ? rtp.toFixed(2) + "%" : "—"}</span></div>
      <div class="panel-row"><span class="panel-label">House Edge</span><span class="panel-value">${bets.length > 0 ? houseEdge.toFixed(2) + "%" : "—"}</span></div>
    `;
  }

  // ---------- Spin simulator ----------
  function renderSimResults(r) {
    el.simResults.innerHTML = `
      <div class="panel-row"><span class="panel-label">Spins</span><span class="panel-value">${r.spins.toLocaleString()}</span></div>
      <div class="panel-row"><span class="panel-label">Measured RTP</span><span class="panel-value gold">${(r.measuredRTP * 100).toFixed(2)}%</span></div>
      <div class="panel-row"><span class="panel-label">Hit Frequency</span><span class="panel-value">${(r.hitFrequency * 100).toFixed(1)}%</span></div>
      <div class="panel-row"><span class="panel-label">Volatility Index (σ)</span><span class="panel-value">${r.volatilityIndex.toFixed(2)}</span></div>
      <div class="panel-row"><span class="panel-label">Biggest Win</span><span class="panel-value">${r.biggestMult.toFixed(2)}×</span></div>
    `;
  }

  // ---------- Bankroll session simulator ----------
  function renderSessionResults(result, startingBalance) {
    const bestRatio = result.bestSession ? result.bestSession.finalBalance / startingBalance : 0;
    el.sessionResults.innerHTML = `
      <div class="panel-row"><span class="panel-label">Bust Probability</span><span class="panel-value gold">${(result.bustProbability * 100).toFixed(1)}%</span></div>
      <div class="panel-row"><span class="panel-label">P(Session RTP ≥ 100%)</span><span class="panel-value gold">${(result.profitProbability * 100).toFixed(1)}%</span></div>
      <div class="panel-row"><span class="panel-label">Avg Spins Survived</span><span class="panel-value">${result.avgSpinsSurvived.toFixed(1)}</span></div>
      <div class="panel-row"><span class="panel-label">Avg Final Balance</span><span class="panel-value">${formatCredits(result.avgFinalBalance)}</span></div>
      <div class="panel-row"><span class="panel-label">Avg Max Drawdown</span><span class="panel-value">${formatCredits(result.avgMaxDrawdown)}</span></div>
      <div class="panel-row"><span class="panel-label">Best Session</span><span class="panel-value">${formatCredits(result.bestSession ? result.bestSession.finalBalance : 0)} <small>(${bestRatio.toFixed(2)}×)</small></span></div>
    `;
    renderSessionChart(result.sessions, startingBalance);
  }

  function renderSessionChart(sessions, startingBalance) {
    if (!sessions.length) { el.sessionChart.innerHTML = ""; return; }
    const width = 600, height = 220;
    let maxLen = 0;
    let maxBalance = startingBalance * 1.2 || 1;
    for (const s of sessions) {
      if (s.path.length > maxLen) maxLen = s.path.length;
      for (const b of s.path) if (b > maxBalance) maxBalance = b;
    }
    function toPoints(path) {
      return path.map((bal, i) => {
        const x = (i / (maxLen - 1)) * width;
        const y = height - Math.max(0, Math.min(1, bal / maxBalance)) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
    }
    const sampleCount = Math.min(sessions.length, 60);
    const step = Math.max(1, Math.floor(sessions.length / sampleCount));
    let svg = `<line x1="0" y1="${(height - (startingBalance / maxBalance) * height).toFixed(1)}" x2="${width}" y2="${(height - (startingBalance / maxBalance) * height).toFixed(1)}" stroke="var(--panel-line)" stroke-width="1" stroke-dasharray="4 4" />`;
    for (let i = 0; i < sessions.length; i += step) {
      svg += `<polyline points="${toPoints(sessions[i].path)}" fill="none" stroke="var(--gold-dim)" stroke-width="1" opacity="0.4" />`;
    }
    const sortedByFinal = sessions.slice().sort((a, b) => a.finalBalance - b.finalBalance);
    const median = sortedByFinal[Math.floor(sortedByFinal.length / 2)];
    svg += `<polyline points="${toPoints(median.path)}" fill="none" stroke="var(--gold-bright)" stroke-width="2.5" />`;
    el.sessionChart.innerHTML = svg;
  }

  // ---------- Optimal bet amount sweep ----------
  function renderAmountSweep(results) {
    const RISK_THRESHOLD = 0.05;
    let recommended = results[0];
    for (const r of results) {
      if (r.bustProbability <= RISK_THRESHOLD) recommended = r;
    }
    const rows = results.map(r => `
      <tr class="${r === recommended ? "bet-sweep-best" : ""}">
        <td>${r.scale}×${r === recommended ? " ★" : ""}</td>
        <td>${formatCredits(r.stakePerSpin)}</td>
        <td>${(r.bustProbability * 100).toFixed(1)}%</td>
        <td>${(r.profitProbability * 100).toFixed(1)}%</td>
        <td>${formatCredits(r.avgFinalBalance)}</td>
        <td>${formatCredits(r.bestSession ? r.bestSession.finalBalance : 0)}</td>
      </tr>`).join("");
    el.amountSweepResults.innerHTML = `
      <p class="dev-hint">★ = the largest scale of your current bet spread that keeps bust risk at or below 5% for this balance.</p>
      <table class="dev-table bet-sweep-table">
        <thead><tr><th>Scale</th><th>Stake/Spin</th><th>Bust Risk</th><th>P(RTP ≥ 100%)</th><th>Avg Final Balance</th><th>Best Session</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ---------- Bet-type risk-profile comparison ----------
  function renderTypeComparison(results) {
    const rows = results.map(r => `
      <tr>
        <td>${r.label}</td>
        <td>${(r.bustProbability * 100).toFixed(1)}%</td>
        <td>${(r.profitProbability * 100).toFixed(1)}%</td>
        <td>${formatCredits(r.avgFinalBalance)}</td>
        <td>${formatCredits(r.bestSession ? r.bestSession.finalBalance : 0)}</td>
      </tr>`).join("");
    el.typeComparisonResults.innerHTML = `
      <table class="dev-table bet-sweep-table">
        <thead><tr><th>Bet Category</th><th>Bust Risk</th><th>P(RTP ≥ 100%)</th><th>Avg Final Balance</th><th>Best Session</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ---------- Event wiring ----------
  function wireEvents() {
    document.querySelectorAll("[data-chip]").forEach(btn => {
      btn.addEventListener("click", () => { el.chipAmount.value = btn.dataset.chip; });
    });

    el.betsList.addEventListener("click", (e) => {
      const btn = e.target.closest(".bet-remove");
      if (!btn) return;
      removeBet(parseInt(btn.dataset.idx, 10));
    });

    el.clearAllBets.addEventListener("click", () => {
      bets = [];
      renderBetsList();
      renderChips();
      refreshRTP();
    });

    el.runSimulation.addEventListener("click", () => {
      if (bets.length === 0) return;
      const spins = parseInt(el.simSpins.value, 10);
      el.runSimulation.disabled = true;
      el.runSimulation.textContent = "Simulating… 0%";
      Engine.runSimulation(
        bets, spins,
        (frac) => { el.runSimulation.textContent = `Simulating… ${Math.round(frac * 100)}%`; },
        (result) => {
          renderSimResults(result);
          el.runSimulation.disabled = false;
          el.runSimulation.textContent = "Run Simulation";
        }
      );
    });

    el.runSessionSim.addEventListener("click", () => {
      if (bets.length === 0) return;
      const startingBalance = Math.max(1, parseFloat(el.sessionBalanceInput.value) || 1000);
      const maxSpins = parseInt(el.sessionSpinsSelect.value, 10);
      const sessionCount = parseInt(el.sessionCountSelect.value, 10);
      el.runSessionSim.disabled = true;
      el.runSessionSim.textContent = "Simulating… 0%";
      Engine.runSessionBatch(
        bets, startingBalance, maxSpins, sessionCount,
        (frac) => { el.runSessionSim.textContent = `Simulating… ${Math.round(frac * 100)}%`; },
        (result) => {
          renderSessionResults(result, startingBalance);
          el.runSessionSim.disabled = false;
          el.runSessionSim.textContent = "Run Session Simulation";
        }
      );
    });

    el.runAmountSweep.addEventListener("click", () => {
      if (bets.length === 0) return;
      const startingBalance = Math.max(1, parseFloat(el.sessionBalanceInput.value) || 1000);
      const maxSpins = parseInt(el.sessionSpinsSelect.value, 10);
      const sessionCount = parseInt(el.sessionCountSelect.value, 10);
      el.runAmountSweep.disabled = true;
      el.runAmountSweep.textContent = "Sweeping… 0%";
      Engine.runBetAmountSweep(
        bets, startingBalance, maxSpins, sessionCount,
        (frac) => { el.runAmountSweep.textContent = `Sweeping… ${Math.round(frac * 100)}%`; },
        (results) => {
          renderAmountSweep(results);
          el.runAmountSweep.disabled = false;
          el.runAmountSweep.textContent = "Find Optimal Bet Amount";
        }
      );
    });

    el.runTypeComparison.addEventListener("click", () => {
      const startingBalance = Math.max(1, parseFloat(el.sessionBalanceInput.value) || 1000);
      const maxSpins = parseInt(el.sessionSpinsSelect.value, 10);
      const sessionCount = parseInt(el.sessionCountSelect.value, 10);
      const stakePerSpin = Math.max(0.1, parseFloat(el.comparisonStake.value) || 10);
      el.runTypeComparison.disabled = true;
      el.runTypeComparison.textContent = "Comparing… 0%";
      Engine.runBetTypeComparison(
        startingBalance, maxSpins, sessionCount, stakePerSpin,
        (frac) => { el.runTypeComparison.textContent = `Comparing… ${Math.round(frac * 100)}%`; },
        (results) => {
          renderTypeComparison(results);
          el.runTypeComparison.disabled = false;
          el.runTypeComparison.textContent = "Compare Bet Types";
        }
      );
    });
  }

  // ---------- Init ----------
  function init() {
    buildGrid();
    renderBetsList();
    refreshRTP();
    wireEvents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
