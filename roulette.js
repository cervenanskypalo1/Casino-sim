(() => {
  "use strict";

  const Engine = window.RouletteEngine;

  function formatCredits(n) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const el = {
    chipAmount: document.getElementById("chip-amount"),
    grid: document.getElementById("roulette-grid"),
    selectionInfo: document.getElementById("selection-info"),
    placeSelection: document.getElementById("place-selection"),
    clearSelection: document.getElementById("clear-selection"),
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
  };

  let bets = []; // { type, numbers?, group?, amount }
  let selectedNumbers = [];

  function currentChip() {
    return Math.max(0.1, parseFloat(el.chipAmount.value) || 1);
  }

  // ---------- Table grid ----------
  function buildGrid() {
    el.grid.innerHTML = "";

    const zero = document.createElement("div");
    zero.className = "roul-cell roul-green roul-zero";
    zero.textContent = "0";
    zero.style.gridColumn = "1";
    zero.style.gridRow = "1 / span 3";
    zero.dataset.number = "0";
    el.grid.appendChild(zero);

    for (let n = 1; n <= 36; n++) {
      const cell = document.createElement("div");
      const color = Engine.colorOf(n);
      cell.className = `roul-cell roul-${color}`;
      cell.textContent = String(n);
      cell.style.gridColumn = String(Engine.gridCol(n) + 1);
      cell.style.gridRow = String(Engine.gridRow(n) + 1);
      cell.dataset.number = String(n);
      el.grid.appendChild(cell);
    }

    // "2 to 1" column boxes — row 1 (top) = group 3, row 2 (mid) = group 2, row 3 (bottom) = group 1
    [[1, 3], [2, 2], [3, 1]].forEach(([row, group]) => {
      const box = document.createElement("div");
      box.className = "roul-cell roul-outside";
      box.textContent = "2:1";
      box.style.gridColumn = "14";
      box.style.gridRow = String(row);
      box.dataset.outside = "column";
      box.dataset.group = String(group);
      el.grid.appendChild(box);
    });

    // Dozens
    [[1, "2-5", "1st 12"], [2, "6-9", "2nd 12"], [3, "10-13", "3rd 12"]].forEach(([group, span, label]) => {
      const [from, to] = span.split("-");
      const box = document.createElement("div");
      box.className = "roul-cell roul-outside";
      box.textContent = label;
      box.style.gridColumn = `${from} / ${to}`;
      box.style.gridRow = "4";
      box.dataset.outside = "dozen";
      box.dataset.group = String(group);
      el.grid.appendChild(box);
    });

    // Even-money row: Low, Even, Red, Black, Odd, High
    const evenMoney = [
      { type: "low", label: "1-18", cols: "2 / 4" },
      { type: "even", label: "EVEN", cols: "4 / 6" },
      { type: "red", label: "RED", cols: "6 / 8", color: "roul-red" },
      { type: "black", label: "BLACK", cols: "8 / 10", color: "roul-black" },
      { type: "odd", label: "ODD", cols: "10 / 12" },
      { type: "high", label: "19-36", cols: "12 / 14" },
    ];
    evenMoney.forEach(spec => {
      const box = document.createElement("div");
      box.className = `roul-cell roul-outside ${spec.color || ""}`;
      box.textContent = spec.label;
      box.style.gridColumn = spec.cols;
      box.style.gridRow = "5";
      box.dataset.outside = spec.type;
      el.grid.appendChild(box);
    });

    el.grid.addEventListener("click", (e) => {
      const cell = e.target.closest("[data-number], [data-outside]");
      if (!cell) return;
      if (cell.dataset.number !== undefined) {
        toggleNumber(parseInt(cell.dataset.number, 10));
      } else {
        const group = cell.dataset.group ? parseInt(cell.dataset.group, 10) : undefined;
        placeBet(cell.dataset.outside, group !== undefined ? { group } : {}, currentChip());
      }
    });
  }

  function renderGridSelection() {
    el.grid.querySelectorAll(".roul-cell").forEach(c => c.classList.remove("selected"));
    selectedNumbers.forEach(n => {
      const cell = el.grid.querySelector(`[data-number="${n}"]`);
      if (cell) cell.classList.add("selected");
    });
  }

  function toggleNumber(n) {
    const idx = selectedNumbers.indexOf(n);
    if (idx >= 0) selectedNumbers.splice(idx, 1);
    else selectedNumbers.push(n);
    renderGridSelection();
    updateSelectionInfo();
  }

  function updateSelectionInfo() {
    if (selectedNumbers.length === 0) {
      el.selectionInfo.textContent = "Click numbers on the table to build a Straight / Split / Street / Corner / Six Line bet.";
      el.placeSelection.disabled = true;
      return;
    }
    const type = Engine.classifySelection(selectedNumbers);
    const sorted = selectedNumbers.slice().sort((a, b) => a - b);
    if (!type) {
      el.selectionInfo.textContent = `Selected ${sorted.join(", ")} — not a valid bet grouping (numbers must be adjacent: 2 for a split, a full row of 3 for a street, a 2x2 block of 4 for a corner, two adjacent rows of 6 for a six line).`;
      el.placeSelection.disabled = true;
      return;
    }
    const ratio = Engine.BET_PAYOUT_RATIO[type];
    el.selectionInfo.textContent = `${Engine.BET_LABELS[type]} on ${sorted.join("-")} — pays ${ratio}:1. Click Place Bet to confirm, or keep clicking numbers to change the selection.`;
    el.placeSelection.disabled = false;
  }

  // ---------- Bets ----------
  function placeBet(type, params, amount) {
    const bet = { type, amount, ...params };
    const key = Engine.betKey(bet);
    const existing = bets.find(b => Engine.betKey(b) === key);
    if (existing) existing.amount += amount;
    else bets.push(bet);
    renderBetsList();
    refreshRTP();
  }

  function removeBet(index) {
    bets.splice(index, 1);
    renderBetsList();
    refreshRTP();
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

  // ---------- Event wiring ----------
  function wireEvents() {
    document.querySelectorAll("[data-chip]").forEach(btn => {
      btn.addEventListener("click", () => { el.chipAmount.value = btn.dataset.chip; });
    });

    el.placeSelection.addEventListener("click", () => {
      const type = Engine.classifySelection(selectedNumbers);
      if (!type) return;
      placeBet(type, { numbers: [...selectedNumbers] }, currentChip());
      selectedNumbers = [];
      renderGridSelection();
      updateSelectionInfo();
    });

    el.clearSelection.addEventListener("click", () => {
      selectedNumbers = [];
      renderGridSelection();
      updateSelectionInfo();
    });

    el.betsList.addEventListener("click", (e) => {
      const btn = e.target.closest(".bet-remove");
      if (!btn) return;
      removeBet(parseInt(btn.dataset.idx, 10));
    });

    el.clearAllBets.addEventListener("click", () => {
      bets = [];
      renderBetsList();
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
