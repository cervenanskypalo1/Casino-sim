(() => {
  "use strict";

  const Engine = window.Firebird81Engine;
  const { WILD_ID, BET_STEPS } = Engine;

  function formatCredits(n) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function roundNum(n) { return Math.round(n * 100) / 100; }

  const el = {
    devMathGrid: document.getElementById("dev-math-grid"),
    presetButtons: Array.from(document.querySelectorAll("#preset-buttons .preset-btn")),
    targetRtpSlider: document.getElementById("target-rtp-slider"),
    targetRtpValue: document.getElementById("target-rtp-value"),
    applyTargetRtp: document.getElementById("apply-target-rtp"),
    devSymbolTbody: document.getElementById("dev-symbol-tbody"),
    simSpins: document.getElementById("sim-spins"),
    runSimulation: document.getElementById("run-simulation"),
    simResults: document.getElementById("sim-results"),
    simHistogram: document.getElementById("sim-histogram"),
    resetDevmode: document.getElementById("reset-devmode"),
    sessionBalanceInput: document.getElementById("session-balance"),
    sessionBetInput: document.getElementById("session-bet"),
    sessionSpinsSelect: document.getElementById("session-spins"),
    sessionCountSelect: document.getElementById("session-count"),
    runSessionSim: document.getElementById("run-session-sim"),
    runBetSweep: document.getElementById("run-bet-sweep"),
    sessionResults: document.getElementById("session-results"),
    sessionChart: document.getElementById("session-chart"),
    betSweepResults: document.getElementById("bet-sweep-results"),
  };

  // ---------- Math / RTP display ----------
  function refreshRTPDisplay() {
    const rtp = Engine.computeTheoreticalRTP(Engine.getSymbols()) * 100;
    const houseEdge = 100 - rtp;
    el.devMathGrid.innerHTML = `
      <div class="panel-row"><span class="panel-label">Theoretical RTP</span><span class="panel-value gold">${rtp.toFixed(2)}%</span></div>
      <div class="panel-row"><span class="panel-label">House Edge</span><span class="panel-value">${houseEdge.toFixed(2)}%</span></div>
    `;
  }

  function buildDevSymbolTable() {
    el.devSymbolTbody.innerHTML = "";
    Engine.getSymbols().forEach((s, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="dev-sym-cell">${s.emoji} ${s.name}</td>
        <td><input type="number" min="0.1" step="0.1" value="${roundNum(s.weight)}" data-field="weight" data-idx="${idx}"></td>
        <td><input type="number" min="0" step="0.5" value="${roundNum(s.pay3)}" data-field="pay3" data-idx="${idx}"></td>
        <td><input type="number" min="0" step="0.5" value="${roundNum(s.pay4)}" data-field="pay4" data-idx="${idx}"></td>
      `;
      el.devSymbolTbody.appendChild(tr);
    });
  }

  function highlightPresetButton() {
    el.presetButtons.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.preset === Engine.getCurrentPreset());
    });
  }

  function refreshAll() {
    refreshRTPDisplay();
    buildDevSymbolTable();
    highlightPresetButton();
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

  function renderHistogram(buckets, spins) {
    const labels = ["No win", "Win", "Big", "Mega", "Jackpot"];
    const max = Math.max(...buckets, 1);
    el.simHistogram.innerHTML = buckets.map((count, i) => {
      const pct = spins > 0 ? ((count / spins) * 100).toFixed(2) : "0.00";
      const heightPct = (count / max) * 100;
      return `<div class="hist-bar-col">
        <div class="hist-bar" style="height:${heightPct}%"></div>
        <div class="hist-label">${labels[i]}</div>
        <div class="hist-pct">${pct}%</div>
      </div>`;
    }).join("");
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

  // Spaghetti-plot of sampled session paths (avoids Math.max(...bigArray),
  // which can blow the call stack on large simulations) plus a bold median path.
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

  function renderBetSweep(results) {
    const RISK_THRESHOLD = 0.05;
    let recommended = results[0];
    for (const r of results) {
      if (r.bustProbability <= RISK_THRESHOLD) recommended = r;
    }
    const rows = results.map(r => `
      <tr class="${r === recommended ? "bet-sweep-best" : ""}">
        <td>${r.bet.toFixed(2)}${r === recommended ? " ★" : ""}</td>
        <td>${(r.bustProbability * 100).toFixed(1)}%</td>
        <td>${(r.profitProbability * 100).toFixed(1)}%</td>
        <td>${r.avgSpinsSurvived.toFixed(1)}</td>
        <td>${formatCredits(r.avgFinalBalance)}</td>
      </tr>`).join("");
    el.betSweepResults.innerHTML = `
      <p class="dev-hint">★ = largest bet size keeping bust risk at or below 5% for this balance, at the current RTP and volatility settings.</p>
      <table class="dev-table bet-sweep-table">
        <thead><tr><th>Bet</th><th>Bust Risk</th><th>P(RTP ≥ 100%)</th><th>Avg Spins Survived</th><th>Avg Final Balance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ---------- Event wiring ----------
  function wireEvents() {
    el.presetButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        Engine.applyPreset(btn.dataset.preset);
        refreshAll();
      });
    });

    el.targetRtpSlider.addEventListener("input", () => {
      const v = parseFloat(el.targetRtpSlider.value);
      Engine.setTargetRTP(v);
      el.targetRtpValue.textContent = v.toFixed(1) + "%";
    });
    el.applyTargetRtp.addEventListener("click", () => {
      Engine.applyTargetRTP(parseFloat(el.targetRtpSlider.value));
      refreshAll();
    });

    el.devSymbolTbody.addEventListener("input", (e) => {
      const t = e.target;
      if (t.tagName !== "INPUT") return;
      const idx = parseInt(t.dataset.idx, 10);
      const field = t.dataset.field;
      const val = parseFloat(t.value);
      if (Number.isNaN(val) || val < 0) return;
      Engine.setSymbolField(idx, field, val);
      refreshRTPDisplay();
    });

    el.runSimulation.addEventListener("click", () => {
      const spins = parseInt(el.simSpins.value, 10);
      el.runSimulation.disabled = true;
      el.runSimulation.textContent = "Simulating… 0%";
      Engine.runSimulation(
        spins,
        (frac) => { el.runSimulation.textContent = `Simulating… ${Math.round(frac * 100)}%`; },
        (result) => {
          renderSimResults(result);
          renderHistogram(result.buckets, result.spins);
          el.runSimulation.disabled = false;
          el.runSimulation.textContent = "Run Simulation";
        }
      );
    });

    el.resetDevmode.addEventListener("click", () => {
      Engine.resetDevMode();
      el.targetRtpSlider.value = Engine.getTargetRTP();
      el.targetRtpValue.textContent = Engine.getTargetRTP().toFixed(1) + "%";
      refreshAll();
    });

    el.runSessionSim.addEventListener("click", () => {
      const startingBalance = Math.max(1, parseFloat(el.sessionBalanceInput.value) || 1000);
      const bet = Math.max(0.1, parseFloat(el.sessionBetInput.value) || 1);
      const maxSpins = parseInt(el.sessionSpinsSelect.value, 10);
      const sessionCount = parseInt(el.sessionCountSelect.value, 10);
      el.runSessionSim.disabled = true;
      el.runBetSweep.disabled = true;
      el.runSessionSim.textContent = "Simulating… 0%";
      Engine.runSessionBatch(
        startingBalance, bet, maxSpins, sessionCount,
        (frac) => { el.runSessionSim.textContent = `Simulating… ${Math.round(frac * 100)}%`; },
        (result) => {
          renderSessionResults(result, startingBalance);
          el.runSessionSim.disabled = false;
          el.runBetSweep.disabled = false;
          el.runSessionSim.textContent = "Run Session Simulation";
        }
      );
    });

    el.runBetSweep.addEventListener("click", () => {
      const startingBalance = Math.max(1, parseFloat(el.sessionBalanceInput.value) || 1000);
      const maxSpins = parseInt(el.sessionSpinsSelect.value, 10);
      const sessionCount = parseInt(el.sessionCountSelect.value, 10);
      el.runSessionSim.disabled = true;
      el.runBetSweep.disabled = true;
      el.runBetSweep.textContent = "Sweeping… 0%";
      Engine.runBetSweep(
        startingBalance, maxSpins, sessionCount,
        (frac) => { el.runBetSweep.textContent = `Sweeping… ${Math.round(frac * 100)}%`; },
        (results) => {
          renderBetSweep(results);
          el.runSessionSim.disabled = false;
          el.runBetSweep.disabled = false;
          el.runBetSweep.textContent = "Find Best Bet Size";
        }
      );
    });
  }

  // ---------- Init ----------
  function init() {
    el.targetRtpSlider.value = Engine.getTargetRTP();
    el.targetRtpValue.textContent = Engine.getTargetRTP().toFixed(1) + "%";
    refreshAll();
    wireEvents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
