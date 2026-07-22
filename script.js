(() => {
  "use strict";

  // ---------- Config ----------
  const REEL_COUNT = 4;
  const ROW_COUNT = 3;
  const TILE_HEIGHT = 116;
  const STRIP_FILLER = 22; // random tiles above the final 3, per reel
  const STARTING_BALANCE = 1000;

  // Paytable values are "per-line pay units": a winning line pays
  // (payUnits / LINES.length) x the TOTAL bet. Shipped ("medium") tuning
  // lands around 95% RTP / ~40% hit frequency, in line with typical
  // medium-volatility online slots (94-97% RTP, 25-40% hit frequency for
  // this style of "many ways" game). All of this is now editable live from
  // Developer Mode — see the RTP/volatility math section below.
  const WILD_ID = "wild";
  const DEFAULT_SYMBOLS = [
    { id: "cherry",  emoji: "🍒", weight: 20, name: "Cherry",  pay3: 11,  pay4: 58 },
    { id: "lemon",   emoji: "🍋", weight: 18, name: "Lemon",   pay3: 11,  pay4: 58 },
    { id: "grape",   emoji: "🍇", weight: 16, name: "Grape",   pay3: 17,  pay4: 86 },
    { id: "bell",    emoji: "🔔", weight: 14, name: "Bell",    pay3: 29,  pay4: 144 },
    { id: "star",    emoji: "⭐", weight: 12, name: "Star",    pay3: 46,  pay4: 230 },
    { id: "clover",  emoji: "🍀", weight: 10, name: "Clover",  pay3: 58,  pay4: 346 },
    { id: "diamond", emoji: "💎", weight: 6,  name: "Diamond", pay3: 86,  pay4: 576 },
    { id: "seven",   emoji: "7️⃣", weight: 3,  name: "Seven",   pay3: 144, pay4: 1152 },
    { id: "wild",    emoji: "🃏", weight: 1,  name: "Wild",    pay3: 288, pay4: 2880 },
  ];

  // Alternate PAR-sheet-style profiles for Developer Mode's volatility presets.
  // Real slot designers separate two knobs: symbol *rarity spread* (weight)
  // and *payout spread* (pay3/pay4) — hit frequency comes mostly from how
  // dominant the commonest symbol is, payout variance comes from how wide
  // the gap is between the cheapest and priciest symbol. Each preset dials
  // both knobs, then applyTargetRTP() rescales payouts so RTP stays pinned
  // to whatever the user has set, isolating volatility as the only variable
  // that changed. Low = one dominant cheap symbol (chains often, pays little).
  // High/Extreme = flatter weights (no symbol dominates, so hits get rarer)
  // with a much wider payout gap (rare hits pay disproportionately more).
  const VOLATILITY_PRESETS = {
    low: [
      { id: "cherry",  emoji: "🍒", weight: 30,   name: "Cherry",  pay3: 6,  pay4: 16 },
      { id: "lemon",   emoji: "🍋", weight: 22,   name: "Lemon",   pay3: 7,  pay4: 18 },
      { id: "grape",   emoji: "🍇", weight: 16,   name: "Grape",   pay3: 10, pay4: 26 },
      { id: "bell",    emoji: "🔔", weight: 12,   name: "Bell",    pay3: 15, pay4: 40 },
      { id: "star",    emoji: "⭐", weight: 9,    name: "Star",    pay3: 22, pay4: 60 },
      { id: "clover",  emoji: "🍀", weight: 6,    name: "Clover",  pay3: 32, pay4: 90 },
      { id: "diamond", emoji: "💎", weight: 3,    name: "Diamond", pay3: 46, pay4: 130 },
      { id: "seven",   emoji: "7️⃣", weight: 1.5,  name: "Seven",   pay3: 70, pay4: 200 },
      { id: "wild",    emoji: "🃏", weight: 0.5,  name: "Wild",    pay3: 110, pay4: 320 },
    ],
    medium: DEFAULT_SYMBOLS,
    high: [
      { id: "cherry",  emoji: "🍒", weight: 15, name: "Cherry",  pay3: 7,   pay4: 20 },
      { id: "lemon",   emoji: "🍋", weight: 14, name: "Lemon",   pay3: 7,   pay4: 20 },
      { id: "grape",   emoji: "🍇", weight: 13, name: "Grape",   pay3: 12,  pay4: 36 },
      { id: "bell",    emoji: "🔔", weight: 12, name: "Bell",    pay3: 20,  pay4: 64 },
      { id: "star",    emoji: "⭐", weight: 11, name: "Star",    pay3: 34,  pay4: 120 },
      { id: "clover",  emoji: "🍀", weight: 10, name: "Clover",  pay3: 54,  pay4: 200 },
      { id: "diamond", emoji: "💎", weight: 9,  name: "Diamond", pay3: 90,  pay4: 360 },
      { id: "seven",   emoji: "7️⃣", weight: 5,  name: "Seven",   pay3: 160, pay4: 720 },
      { id: "wild",    emoji: "🃏", weight: 1,  name: "Wild",    pay3: 420, pay4: 4200 },
    ],
    extreme: [
      { id: "cherry",  emoji: "🍒", weight: 14,  name: "Cherry",  pay3: 6,   pay4: 16 },
      { id: "lemon",   emoji: "🍋", weight: 13,  name: "Lemon",   pay3: 6,   pay4: 16 },
      { id: "grape",   emoji: "🍇", weight: 12,  name: "Grape",   pay3: 11,  pay4: 30 },
      { id: "bell",    emoji: "🔔", weight: 11,  name: "Bell",    pay3: 19,  pay4: 55 },
      { id: "star",    emoji: "⭐", weight: 10,  name: "Star",    pay3: 34,  pay4: 110 },
      { id: "clover",  emoji: "🍀", weight: 9,   name: "Clover",  pay3: 58,  pay4: 200 },
      { id: "diamond", emoji: "💎", weight: 8,   name: "Diamond", pay3: 110, pay4: 420 },
      { id: "seven",   emoji: "7️⃣", weight: 3,   name: "Seven",   pay3: 260, pay4: 1100 },
      { id: "wild",    emoji: "🃏", weight: 0.4, name: "Wild",    pay3: 900, pay4: 20000 },
    ],
  };

  function cloneSymbols(list) { return list.map(s => ({ ...s })); }

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

  // Exact theoretical RTP (no simulation needed) for this "many ways" game.
  // Every one of the 4 reels x 3 rows is drawn independently from the same
  // weighted distribution, so by linearity of expectation the RTP of the
  // whole 81-line game equals the expected payout of a single 4-symbol line,
  // in payUnits. Derivation: a line of 4 iid symbols reaches a run of length
  // 4 with base b when all 4 land on {b, wild} minus the all-wild case; it
  // reaches a run of exactly 3 when the first 3 land on {b, wild} (not all
  // wild) and the 4th is neither b nor wild (breaking the run).
  function computeTheoreticalRTP(symbols) {
    const totalWeight = symbols.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight <= 0) return 0;
    const probs = Object.fromEntries(symbols.map(s => [s.id, s.weight / totalWeight]));
    const pWild = probs[WILD_ID] || 0;
    const wildSym = symbols.find(s => s.id === WILD_ID);
    let lineEV = 0;
    for (const s of symbols) {
      if (s.id === WILD_ID) continue;
      const p = probs[s.id];
      const p4 = Math.pow(p + pWild, 4) - Math.pow(pWild, 4);
      const p3 = (Math.pow(p + pWild, 3) - Math.pow(pWild, 3)) * (1 - p - pWild);
      lineEV += p4 * s.pay4 + p3 * s.pay3;
    }
    if (wildSym) lineEV += Math.pow(pWild, 4) * wildSym.pay4; // all-4-wild case
    return lineEV; // fraction, e.g. 0.95 = 95% RTP
  }

  // Rescales every payout proportionally so theoretical RTP hits `targetPercent`
  // exactly, without changing the relative shape (volatility profile) at all.
  function applyTargetRTP(targetPercent) {
    const current = computeTheoreticalRTP(SYMBOLS);
    if (current <= 0) return;
    const factor = (targetPercent / 100) / current;
    SYMBOLS.forEach(s => { s.pay3 *= factor; s.pay4 *= factor; });
    recalcDerived();
  }

  let targetRTP = Math.round(computeTheoreticalRTP(DEFAULT_SYMBOLS) * 1000) / 10;

  // ---------- Sound engine (synthesized via Web Audio API, no asset files) ----------
  const SoundEngine = (() => {
    let ctx = null;
    let masterGain = null;
    let noiseBuffer = null;
    let muted = false;
    try { muted = localStorage.getItem("goldenReelsMuted") === "1"; } catch (e) { /* ignore */ }

    function ensureCtx() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 0.35;
      masterGain.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return ctx;
    }

    function resume() {
      const c = ensureCtx();
      if (c && c.state === "suspended") c.resume();
    }

    function setMuted(v) {
      muted = v;
      try { localStorage.setItem("goldenReelsMuted", v ? "1" : "0"); } catch (e) { /* ignore */ }
      if (masterGain) masterGain.gain.setTargetAtTime(v ? 0 : 0.35, ctx.currentTime, 0.05);
    }

    function isMuted() { return muted; }

    function tone(freq, t0, dur, type, peakGain, sweepTo) {
      const c = ensureCtx();
      if (!c) return;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(masterGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function noiseBurst(t0, dur, filterFreq, peakGain) {
      const c = ensureCtx();
      if (!c) return;
      const src = c.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = c.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = filterFreq;
      filter.Q.value = 1.1;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(gain).connect(masterGain);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    }

    function spinStart() {
      const c = ensureCtx();
      if (!c) return;
      tone(220, c.currentTime, 0.18, "sawtooth", 0.12, 340);
    }

    function reelTick() {
      const c = ensureCtx();
      if (!c) return;
      noiseBurst(c.currentTime, 0.045, 2400, 0.16);
    }

    function reelLand() {
      const c = ensureCtx();
      if (!c) return;
      const t0 = c.currentTime;
      noiseBurst(t0, 0.09, 700, 0.28);
      tone(120, t0, 0.12, "triangle", 0.15);
    }

    const WIN_SCALES = {
      win:     [523.25, 659.25, 783.99],
      big:     [523.25, 659.25, 783.99, 987.77, 1174.66],
      mega:    [392.00, 523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98],
      jackpot: [261.63, 392.00, 523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98, 2093.00],
    };

    function winChime(tier) {
      const c = ensureCtx();
      if (!c) return;
      const notes = WIN_SCALES[tier] || WIN_SCALES.win;
      const step = tier === "jackpot" ? 0.085 : tier === "mega" ? 0.1 : 0.11;
      notes.forEach((freq, i) => {
        const t0 = c.currentTime + i * step;
        tone(freq, t0, 0.28, "triangle", 0.22);
        if (tier === "mega" || tier === "jackpot") tone(freq * 2, t0, 0.22, "sine", 0.08);
      });
    }

    function coinBling() {
      const c = ensureCtx();
      if (!c) return;
      const t0 = c.currentTime + Math.random() * 0.05;
      tone(1800 + Math.random() * 500, t0, 0.14, "sine", 0.14);
      tone(2600 + Math.random() * 500, t0 + 0.03, 0.12, "sine", 0.1);
    }

    return { resume, setMuted, isMuted, spinStart, reelTick, reelLand, winChime, coinBling };
  })();

  const BET_STEPS = [0.10, 0.20, 0.50, 1.00, 2.00, 5.00, 10.00, 20.00, 25.00, 50.00, 75.00, 100.00];
  const DEFAULT_BET = 1.00;

  // Win tiers, as a ratio of total win / total bet.
  const TIERS = {
    win:     { threshold: 0,  label: "WIN!",       confetti: 50 },
    big:     { threshold: 5,  label: "BIG WIN!",   confetti: 90 },
    mega:    { threshold: 15, label: "MEGA WIN!",  confetti: 160 },
    jackpot: { threshold: 40, label: "JACKPOT!!!", confetti: 260 },
  };

  const SECRET_CODE = "zolca";

  // ---------- 81 lines: every combination of row-picks across 4 reels ----------
  const LINES = [];
  for (let a = 0; a < ROW_COUNT; a++)
    for (let b = 0; b < ROW_COUNT; b++)
      for (let c = 0; c < ROW_COUNT; c++)
        for (let d = 0; d < ROW_COUNT; d++)
          LINES.push([a, b, c, d]);
  // LINES.length === 81

  // ---------- State ----------
  let balance = STARTING_BALANCE;
  let betAmount = DEFAULT_BET;
  let spinning = false;
  let autoplayRemaining = 0;
  let autoplayStopRequested = false;
  let currentGrid = []; // currentGrid[reelIndex][rowIndex] = symbol id
  let secretJackpotArmed = false;
  let secretBuffer = "";

  // ---------- DOM ----------
  const el = {
    balance: document.getElementById("balance"),
    resetBalance: document.getElementById("reset-balance"),
    reels: document.getElementById("reels"),
    machine: document.querySelector(".machine"),
    winBanner: document.getElementById("win-banner"),
    winBannerTitle: document.getElementById("win-banner-title"),
    winBannerAmount: document.getElementById("win-banner-amount"),
    lastWin: document.getElementById("last-win"),
    lastWinMult: document.getElementById("last-win-mult"),
    linesList: document.getElementById("lines-list"),
    betAmount: document.getElementById("bet-amount"),
    betUp: document.getElementById("bet-up"),
    betDown: document.getElementById("bet-down"),
    maxBet: document.getElementById("max-bet"),
    spinBtn: document.getElementById("spin-btn"),
    spinBtnLabel: document.getElementById("spin-btn-label"),
    autoplayCount: document.getElementById("autoplay-count"),
    autoplayStop: document.getElementById("autoplay-stop"),
    openPaytable: document.getElementById("open-paytable"),
    closePaytable: document.getElementById("close-paytable"),
    paytableBackdrop: document.getElementById("paytable-backdrop"),
    paytableGrid: document.getElementById("paytable-grid"),
    confettiCanvas: document.getElementById("confetti-canvas"),
    jackpotOverlay: document.getElementById("jackpot-overlay"),
    jackpotText: document.getElementById("jackpot-text"),
    coinRain: document.getElementById("coin-rain"),
    secretHint: document.getElementById("secret-hint"),
    muteToggle: document.getElementById("mute-toggle"),
    rtpDisplay: document.getElementById("rtp-display"),
    paytableMath: document.getElementById("paytable-math"),
    openDevmode: document.getElementById("open-devmode"),
    closeDevmode: document.getElementById("close-devmode"),
    devBackdrop: document.getElementById("dev-backdrop"),
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

  // ---------- Helpers ----------
  function formatCredits(n) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function weightedRandomSymbol() {
    let r = Math.random() * TOTAL_WEIGHT;
    for (const s of SYMBOLS) {
      r -= s.weight;
      if (r <= 0) return s.id;
    }
    return SYMBOLS[0].id;
  }

  function updateBalanceDisplay() {
    el.balance.textContent = formatCredits(balance);
  }

  function updateBetDisplay() {
    el.betAmount.textContent = betAmount.toFixed(2);
  }

  function saveBalance() {
    try { localStorage.setItem("goldenReelsBalance", String(balance)); } catch (e) { /* ignore */ }
  }

  function loadBalance() {
    try {
      const saved = localStorage.getItem("goldenReelsBalance");
      if (saved !== null && !Number.isNaN(parseFloat(saved))) balance = parseFloat(saved);
    } catch (e) { /* ignore */ }
  }

  // ---------- Build reels DOM ----------
  const reelStripEls = [];

  function buildReelsDom() {
    el.reels.innerHTML = "";
    for (let i = 0; i < REEL_COUNT; i++) {
      const reelEl = document.createElement("div");
      reelEl.className = "reel";
      const stripEl = document.createElement("div");
      stripEl.className = "reel-strip";
      reelEl.appendChild(stripEl);
      el.reels.appendChild(reelEl);
      reelStripEls.push(stripEl);
    }
    // initial static fill
    const initialGrid = [];
    for (let i = 0; i < REEL_COUNT; i++) {
      const rowSymbols = [];
      for (let r = 0; r < ROW_COUNT; r++) rowSymbols.push(weightedRandomSymbol());
      initialGrid.push(rowSymbols);
      renderStripStatic(reelStripEls[i], rowSymbols);
    }
    currentGrid = initialGrid;
  }

  function renderStripStatic(stripEl, rowSymbols) {
    stripEl.style.transition = "none";
    stripEl.style.transform = "translateY(0)";
    stripEl.innerHTML = "";
    rowSymbols.forEach(symId => stripEl.appendChild(makeTile(symId)));
  }

  function makeTile(symId) {
    const tile = document.createElement("div");
    tile.className = "symbol-tile";
    tile.dataset.symbol = symId;
    tile.textContent = SYMBOL_BY_ID[symId].emoji;
    return tile;
  }

  // ---------- Spin animation for one reel ----------
  function spinReel(reelIndex, finalSymbols, delayMs, durationMs) {
    return new Promise(resolve => {
      const stripEl = reelStripEls[reelIndex];
      const fillerSymbols = [];
      for (let i = 0; i < STRIP_FILLER; i++) fillerSymbols.push(weightedRandomSymbol());
      const fullStrip = fillerSymbols.concat(finalSymbols);

      stripEl.style.transition = "none";
      stripEl.style.transform = "translateY(0)";
      stripEl.innerHTML = "";
      fullStrip.forEach(symId => stripEl.appendChild(makeTile(symId)));

      const travelDistance = (fullStrip.length - ROW_COUNT) * TILE_HEIGHT;

      // force reflow so the transition kicks in after we set the start position
      void stripEl.offsetHeight;

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        stripEl.removeEventListener("transitionend", onEnd);
        // snap to the exact final position in case the transition was cut short
        // (e.g. a throttled/backgrounded tab never fires transitionend)
        stripEl.style.transition = "none";
        stripEl.style.transform = `translateY(-${travelDistance}px)`;
        SoundEngine.reelLand();
        resolve();
      };
      const onEnd = (evt) => {
        if (evt.propertyName !== "transform") return;
        finish();
      };

      setTimeout(() => {
        stripEl.style.transition = `transform ${durationMs}ms cubic-bezier(0.16, 0.86, 0.35, 1)`;
        stripEl.style.transform = `translateY(-${travelDistance}px)`;
        stripEl.addEventListener("transitionend", onEnd);
        // safety net: never let a spin hang forever if transitionend doesn't fire
        setTimeout(finish, durationMs + 300);
      }, delayMs);
    });
  }

  // ---------- Win evaluation ----------
  function evaluateWins(grid, totalBet) {
    const wins = [];
    let totalWin = 0;
    const winningCells = new Set(); // "reelIndex,rowIndex"
    const betPerLine = totalBet / LINES.length;

    LINES.forEach((line, lineIndex) => {
      const lineSymbols = line.map((row, reelIndex) => grid[reelIndex][row]);
      let baseSymbol = null;
      let count = 0;
      for (let i = 0; i < lineSymbols.length; i++) {
        const sym = lineSymbols[i];
        if (sym === WILD_ID) { count++; continue; }
        if (baseSymbol === null) { baseSymbol = sym; count++; }
        else if (sym === baseSymbol) { count++; }
        else break;
      }
      if (baseSymbol === null && count > 0) baseSymbol = WILD_ID; // all wilds so far
      if (count >= 3 && baseSymbol) {
        const symDef = SYMBOL_BY_ID[baseSymbol];
        const payUnits = count === 4 ? symDef.pay4 : symDef.pay3;
        const amount = payUnits * betPerLine;
        totalWin += amount;
        wins.push({ lineIndex, symbol: baseSymbol, count, amount });
        for (let i = 0; i < count; i++) winningCells.add(`${i},${line[i]}`);
      }
    });

    return { wins, totalWin, winningCells };
  }

  function renderWinningCells(winningCells) {
    reelStripEls.forEach((stripEl, reelIndex) => {
      const tiles = stripEl.querySelectorAll(".symbol-tile");
      const finalTiles = Array.from(tiles).slice(-ROW_COUNT);
      finalTiles.forEach((tile, rowIndex) => {
        if (winningCells.has(`${reelIndex},${rowIndex}`)) tile.classList.add("win");
        else tile.classList.remove("win");
      });
    });
  }

  function clearWinningCells() {
    reelStripEls.forEach(stripEl => {
      stripEl.querySelectorAll(".symbol-tile.win").forEach(t => t.classList.remove("win"));
    });
  }

  function renderLinesList(wins) {
    el.linesList.innerHTML = "";
    if (wins.length === 0) {
      const li = document.createElement("li");
      li.className = "lines-list-empty";
      li.textContent = "No win this spin";
      el.linesList.appendChild(li);
      return;
    }
    wins
      .slice()
      .sort((a, b) => b.amount - a.amount)
      .forEach(w => {
        const li = document.createElement("li");
        const symDef = SYMBOL_BY_ID[w.symbol];
        li.innerHTML = `<span>${symDef.emoji} ${symDef.name} ×${w.count} <span style="color:var(--text-dim)">(line ${w.lineIndex + 1})</span></span><span class="amt">${formatCredits(w.amount)}</span>`;
        el.linesList.appendChild(li);
      });
  }

  // ---------- Number counting (odometer-style win/balance scroll-up) ----------
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Driven by setTimeout + wall-clock elapsed time rather than
  // requestAnimationFrame: rAF is fully paused by the browser on a hidden or
  // backgrounded tab, which would strand this promise forever (and with it,
  // the disabled Spin button). setTimeout keeps ticking — just throttled —
  // so this always completes within `duration` of real time regardless.
  function animateValue(from, to, duration, onUpdate) {
    return new Promise(resolve => {
      const start = Date.now();
      function tick() {
        const t = Math.min(1, (Date.now() - start) / duration);
        onUpdate(from + (to - from) * easeOutCubic(t));
        if (t < 1) setTimeout(tick, 16);
        else resolve();
      }
      tick();
    });
  }

  // How long the win/balance counters take to scroll up to their final value, per tier.
  const COUNT_DURATION = { win: 900, big: 1500, mega: 2200, jackpot: 3400 };

  // ---------- Celebration: tiered banner + confetti + shake + jackpot overlay ----------
  function pickTier(totalWin, totalBet, forced) {
    if (forced) return "jackpot";
    const ratio = totalBet > 0 ? totalWin / totalBet : 0;
    if (ratio >= TIERS.jackpot.threshold) return "jackpot";
    if (ratio >= TIERS.mega.threshold) return "mega";
    if (ratio >= TIERS.big.threshold) return "big";
    return "win";
  }

  function shakeMachine(tier) {
    el.machine.classList.remove("shake", "shake-hard");
    void el.machine.offsetWidth;
    if (tier === "mega" || tier === "jackpot") el.machine.classList.add("shake-hard");
    else if (tier === "big") el.machine.classList.add("shake");
  }

  // Counts the win amount, the multiplier badge, the side-panel Win value, and
  // the balance all up together so a jackpot really feels like it's climbing.
  async function celebrateWin(tier, totalWin, totalBet, balanceStart, balanceEnd) {
    const cfg = TIERS[tier];
    const duration = COUNT_DURATION[tier];

    el.winBannerTitle.textContent = cfg.label;
    el.winBanner.className = "win-banner show tier-" + tier;
    shakeMachine(tier);
    burstConfetti(cfg.confetti, tier);
    SoundEngine.winChime(tier);
    if (tier === "jackpot") triggerJackpotOverlay();

    const countPromise = animateValue(0, totalWin, duration, (v) => {
      const ratio = totalBet > 0 ? v / totalBet : 0;
      el.winBannerAmount.textContent = `+${formatCredits(v)}  (${ratio.toFixed(2)}×)`;
      el.lastWin.firstChild.textContent = formatCredits(v) + " ";
      el.lastWinMult.textContent = `(${ratio.toFixed(2)}×)`;
      el.balance.textContent = formatCredits(balanceStart + v);
    });
    // keep balance display pinned to the true value in case of rounding drift
    await countPromise;
    el.balance.textContent = formatCredits(balanceEnd);

    const holdMs = tier === "jackpot" ? 900 : tier === "mega" ? 500 : 300;
    await wait(holdMs);
    el.winBanner.classList.remove("show");
  }

  // ---------- Confetti (canvas particle system) ----------
  const confettiCtx = el.confettiCanvas.getContext("2d");
  let confettiParticles = [];
  let confettiRafId = null;
  const CONFETTI_COLORS = ["#f4c95d", "#ffe9a8", "#ff5aa8", "#66d9ff", "#8affc1", "#ff9f4a"];

  function resizeConfettiCanvas() {
    const rect = el.machine.getBoundingClientRect();
    el.confettiCanvas.width = rect.width;
    el.confettiCanvas.height = rect.height;
  }

  function burstConfetti(count, tier) {
    resizeConfettiCanvas();
    const w = el.confettiCanvas.width;
    const spread = tier === "jackpot" || tier === "mega";
    for (let i = 0; i < count; i++) {
      confettiParticles.push({
        x: spread ? Math.random() * w : w / 2 + (Math.random() - 0.5) * 120,
        y: spread ? -10 - Math.random() * 60 : el.confettiCanvas.height * 0.35,
        vx: (Math.random() - 0.5) * (spread ? 6 : 4),
        vy: spread ? Math.random() * 2 : -4 - Math.random() * 3,
        gravity: 0.15 + Math.random() * 0.08,
        size: 6 + Math.random() * 7,
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        life: 0,
        maxLife: 90 + Math.random() * 60,
      });
    }
    if (!confettiRafId) confettiRafId = requestAnimationFrame(animateConfetti);
  }

  function animateConfetti() {
    confettiCtx.clearRect(0, 0, el.confettiCanvas.width, el.confettiCanvas.height);
    confettiParticles = confettiParticles.filter(p => p.life < p.maxLife && p.y < el.confettiCanvas.height + 30);
    for (const p of confettiParticles) {
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vr;
      p.life++;
      const fade = p.life > p.maxLife - 20 ? Math.max(0, (p.maxLife - p.life) / 20) : 1;
      confettiCtx.save();
      confettiCtx.globalAlpha = fade;
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rotation);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      confettiCtx.restore();
    }
    if (confettiParticles.length > 0) {
      confettiRafId = requestAnimationFrame(animateConfetti);
    } else {
      confettiRafId = null;
      confettiCtx.clearRect(0, 0, el.confettiCanvas.width, el.confettiCanvas.height);
    }
  }

  // ---------- Jackpot full-screen overlay ----------
  function triggerJackpotOverlay() {
    el.jackpotOverlay.classList.add("show");
    spawnCoinRain(36);
    for (let i = 0; i < 10; i++) {
      setTimeout(() => SoundEngine.coinBling(), i * 220 + Math.random() * 100);
    }
    setTimeout(() => {
      el.jackpotOverlay.classList.remove("show");
      el.coinRain.innerHTML = "";
    }, 4200);
  }

  const COIN_EMOJI = ["🪙", "💰", "💎", "⭐"];
  function spawnCoinRain(count) {
    el.coinRain.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const span = document.createElement("span");
      span.textContent = COIN_EMOJI[(Math.random() * COIN_EMOJI.length) | 0];
      span.style.left = `${Math.random() * 100}%`;
      span.style.animationDuration = `${2 + Math.random() * 1.5}s`;
      span.style.animationDelay = `${Math.random() * 1.2}s`;
      el.coinRain.appendChild(span);
    }
  }

  // ---------- Reel reveal styles ----------
  // Normal spins: reels run together, staggered stop times.
  async function simultaneousReveal(grid) {
    const promises = [];
    for (let i = 0; i < REEL_COUNT; i++) {
      const delay = i * 180;
      const duration = 900 + i * 260;
      promises.push(spinReel(i, grid[i], delay, duration));
    }
    await Promise.all(promises);
  }

  // Jackpot spins: all four reels start scrolling together, but they don't
  // stop together — each one lands in turn, with a flash of suspense between
  // stops, building to the reveal instead of resolving all at once.
  async function sequentialReveal(grid) {
    const stopTimes = [950, 1900, 2850, 3800];
    const landings = grid.map((symbols, i) =>
      spinReel(i, symbols, 0, stopTimes[i]).then(() => {
        const reelEl = reelStripEls[i].parentElement;
        reelEl.classList.add("landed");
        setTimeout(() => reelEl.classList.remove("landed"), 420);
      })
    );
    await Promise.all(landings);
  }

  // ---------- Spin flow ----------
  async function doSpin() {
    if (spinning) return;
    const totalBet = betAmount;
    if (totalBet > balance) {
      flashInsufficientFunds();
      stopAutoplay();
      return;
    }

    const jackpotForced = secretJackpotArmed;
    secretJackpotArmed = false;

    SoundEngine.resume();
    SoundEngine.spinStart();

    spinning = true;
    setControlsEnabled(false);
    el.spinBtn.classList.add("spinning");
    clearWinningCells();
    el.linesList.innerHTML = '<li class="lines-list-empty">Spinning…</li>';
    el.winBanner.classList.remove("show");

    balance -= totalBet;
    updateBalanceDisplay();
    saveBalance();

    const newGrid = [];
    for (let i = 0; i < REEL_COUNT; i++) {
      const rowSymbols = [];
      for (let r = 0; r < ROW_COUNT; r++) {
        rowSymbols.push(jackpotForced ? WILD_ID : weightedRandomSymbol());
      }
      newGrid.push(rowSymbols);
    }

    // Evaluate the outcome up-front (before revealing) so we know whether this
    // spin earns the dramatic reel-by-reel jackpot reveal or the normal one.
    const { wins, totalWin, winningCells } = evaluateWins(newGrid, totalBet);
    const tier = totalWin > 0 ? pickTier(totalWin, totalBet, jackpotForced) : null;

    const tickInterval = setInterval(() => SoundEngine.reelTick(), 110);
    if (tier === "jackpot") await sequentialReveal(newGrid);
    else await simultaneousReveal(newGrid);
    clearInterval(tickInterval);

    currentGrid = newGrid;

    if (totalWin > 0) {
      const balanceStart = balance;
      balance += totalWin;
      saveBalance();
      renderWinningCells(winningCells);
      await celebrateWin(tier, totalWin, totalBet, balanceStart, balance);
    } else {
      el.lastWin.firstChild.textContent = "0.00 ";
      el.lastWinMult.textContent = "";
    }
    renderLinesList(wins);

    spinning = false;
    el.spinBtn.classList.remove("spinning");
    setControlsEnabled(true);

    if (autoplayRemaining > 0 && !autoplayStopRequested) {
      autoplayRemaining--;
      updateAutoplayLabel();
      if (autoplayRemaining > 0) {
        setTimeout(() => doSpin(), 500);
      } else {
        stopAutoplay();
      }
    }
  }

  function flashInsufficientFunds() {
    el.winBannerTitle.textContent = "INSUFFICIENT BALANCE";
    el.winBannerAmount.textContent = "";
    el.winBanner.className = "win-banner show";
    setTimeout(() => el.winBanner.classList.remove("show"), 1400);
  }

  function setControlsEnabled(enabled) {
    el.spinBtn.disabled = !enabled;
    el.betUp.disabled = !enabled;
    el.betDown.disabled = !enabled;
    el.maxBet.disabled = !enabled;
  }

  function updateAutoplayLabel() {
    if (autoplayRemaining > 0) {
      el.spinBtnLabel.textContent = `STOP (${autoplayRemaining})`;
      el.autoplayStop.disabled = false;
    } else {
      el.spinBtnLabel.textContent = "SPIN";
      el.autoplayStop.disabled = true;
    }
  }

  function stopAutoplay() {
    autoplayRemaining = 0;
    autoplayStopRequested = false;
    updateAutoplayLabel();
    el.autoplayCount.value = "0";
  }

  // ---------- Paytable modal ----------
  function buildPaytable() {
    el.paytableGrid.innerHTML = "";
    SYMBOLS.slice().reverse().forEach(s => {
      const row = document.createElement("div");
      row.className = "paytable-row";
      const mult3 = (s.pay3 / LINES.length).toFixed(2);
      const mult4 = (s.pay4 / LINES.length).toFixed(2);
      row.innerHTML = `
        <span class="sym">${s.emoji}</span>
        <span class="name">${s.name}${s.id === "wild" ? " (substitutes all)" : ""}</span>
        <span class="pay">${mult3}<span class="x">× ×3</span></span>
        <span class="pay">${mult4}<span class="x">× ×4</span></span>
      `;
      el.paytableGrid.appendChild(row);
    });
    refreshRTPDisplays();
  }

  // ---------- Developer Mode: RTP / volatility lab ----------
  function refreshRTPDisplays() {
    const rtp = computeTheoreticalRTP(SYMBOLS) * 100;
    const houseEdge = 100 - rtp;
    if (el.rtpDisplay) el.rtpDisplay.textContent = rtp.toFixed(2) + "%";
    if (el.paytableMath) {
      el.paytableMath.textContent = `Theoretical RTP: ${rtp.toFixed(2)}%  ·  House edge: ${houseEdge.toFixed(2)}%`;
    }
    if (el.devMathGrid) {
      el.devMathGrid.innerHTML = `
        <div class="panel-row"><span class="panel-label">Theoretical RTP</span><span class="panel-value gold">${rtp.toFixed(2)}%</span></div>
        <div class="panel-row"><span class="panel-label">House Edge</span><span class="panel-value">${houseEdge.toFixed(2)}%</span></div>
      `;
    }
  }

  function roundNum(n) { return Math.round(n * 100) / 100; }

  function buildDevSymbolTable() {
    el.devSymbolTbody.innerHTML = "";
    SYMBOLS.forEach((s, idx) => {
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
      btn.classList.toggle("active", btn.dataset.preset === currentPresetName);
    });
  }

  function saveDevConfig() {
    try {
      localStorage.setItem("goldenReelsDevConfig", JSON.stringify({ symbols: SYMBOLS, targetRTP, preset: currentPresetName }));
    } catch (e) { /* ignore */ }
  }

  function loadDevConfig() {
    try {
      const raw = localStorage.getItem("goldenReelsDevConfig");
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

  function applyPreset(name) {
    const preset = VOLATILITY_PRESETS[name];
    if (!preset) return;
    SYMBOLS = cloneSymbols(preset);
    recalcDerived();
    applyTargetRTP(targetRTP);
    currentPresetName = name;
    highlightPresetButton();
    buildDevSymbolTable();
    buildPaytable();
    saveDevConfig();
  }

  function resetDevMode() {
    SYMBOLS = cloneSymbols(DEFAULT_SYMBOLS);
    recalcDerived();
    targetRTP = Math.round(computeTheoreticalRTP(DEFAULT_SYMBOLS) * 1000) / 10;
    currentPresetName = "medium";
    try { localStorage.removeItem("goldenReelsDevConfig"); } catch (e) { /* ignore */ }
    el.targetRtpSlider.value = targetRTP;
    el.targetRtpValue.textContent = targetRTP.toFixed(1) + "%";
    highlightPresetButton();
    buildDevSymbolTable();
    buildPaytable();
  }

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
  // stable statistics like bust probability, which a single session can't tell you.
  function runSessionBatch(startingBalance, bet, maxSpins, sessionCount, onProgress, onDone) {
    const CHUNK = 20;
    let i = 0;
    const sessions = [];
    let bustedCount = 0, totalSpinsSurvived = 0, totalFinalBalance = 0, totalMaxDrawdown = 0;

    function step() {
      const end = Math.min(i + CHUNK, sessionCount);
      for (; i < end; i++) {
        const s = simulateSession(startingBalance, bet, maxSpins);
        sessions.push(s);
        if (s.busted) bustedCount++;
        totalSpinsSurvived += s.spinsPlayed;
        totalFinalBalance += s.finalBalance;
        totalMaxDrawdown += s.maxDrawdown;
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
      });
    }
    step();
  }

  function renderSessionResults(result) {
    el.sessionResults.innerHTML = `
      <div class="panel-row"><span class="panel-label">Bust Probability</span><span class="panel-value gold">${(result.bustProbability * 100).toFixed(1)}%</span></div>
      <div class="panel-row"><span class="panel-label">Avg Spins Survived</span><span class="panel-value">${result.avgSpinsSurvived.toFixed(1)}</span></div>
      <div class="panel-row"><span class="panel-label">Avg Final Balance</span><span class="panel-value">${formatCredits(result.avgFinalBalance)}</span></div>
      <div class="panel-row"><span class="panel-label">Avg Max Drawdown</span><span class="panel-value">${formatCredits(result.avgMaxDrawdown)}</span></div>
    `;
    renderSessionChart(result.sessions, result.sessions[0] ? result.sessions[0].path[0] : 0);
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
        <td>${r.avgSpinsSurvived.toFixed(1)}</td>
        <td>${formatCredits(r.avgFinalBalance)}</td>
      </tr>`).join("");
    el.betSweepResults.innerHTML = `
      <p class="dev-hint">★ = largest bet size keeping bust risk at or below 5% for this balance, at the current RTP and volatility settings.</p>
      <table class="dev-table bet-sweep-table">
        <thead><tr><th>Bet</th><th>Bust Risk</th><th>Avg Spins Survived</th><th>Avg Final Balance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ---------- Secret "zolca" easter egg ----------
  function handleSecretKeystroke(e) {
    if (e.key.length !== 1 || !/[a-z]/i.test(e.key)) return;
    secretBuffer = (secretBuffer + e.key.toLowerCase()).slice(-SECRET_CODE.length);
    if (secretBuffer === SECRET_CODE) {
      secretBuffer = "";
      secretJackpotArmed = true;
      el.secretHint.classList.add("show");
      clearTimeout(handleSecretKeystroke._t);
      handleSecretKeystroke._t = setTimeout(() => el.secretHint.classList.remove("show"), 1800);
    }
  }

  // ---------- Event wiring ----------
  function wireEvents() {
    el.spinBtn.addEventListener("click", () => {
      if (autoplayRemaining > 0) {
        stopAutoplay();
        return;
      }
      doSpin();
    });

    el.autoplayStop.addEventListener("click", () => {
      autoplayStopRequested = true;
      stopAutoplay();
    });

    el.autoplayCount.addEventListener("change", () => {
      const count = parseInt(el.autoplayCount.value, 10);
      if (count > 0) {
        autoplayRemaining = count;
        autoplayStopRequested = false;
        updateAutoplayLabel();
        if (!spinning) doSpin();
      }
    });

    el.betUp.addEventListener("click", () => {
      const idx = BET_STEPS.findIndex(v => v >= betAmount);
      const nextIdx = Math.min(BET_STEPS.length - 1, idx + 1);
      betAmount = BET_STEPS[nextIdx];
      updateBetDisplay();
    });

    el.betDown.addEventListener("click", () => {
      const idx = BET_STEPS.findIndex(v => v >= betAmount);
      const prevIdx = Math.max(0, idx - 1);
      betAmount = BET_STEPS[prevIdx];
      updateBetDisplay();
    });

    el.maxBet.addEventListener("click", () => {
      betAmount = BET_STEPS[BET_STEPS.length - 1];
      updateBetDisplay();
    });

    el.resetBalance.addEventListener("click", () => {
      balance = STARTING_BALANCE;
      updateBalanceDisplay();
      saveBalance();
    });

    el.openPaytable.addEventListener("click", () => {
      el.paytableBackdrop.classList.add("show");
    });
    el.closePaytable.addEventListener("click", () => {
      el.paytableBackdrop.classList.remove("show");
    });
    el.paytableBackdrop.addEventListener("click", (e) => {
      if (e.target === el.paytableBackdrop) el.paytableBackdrop.classList.remove("show");
    });

    el.muteToggle.addEventListener("click", () => {
      SoundEngine.resume();
      const newMuted = !SoundEngine.isMuted();
      SoundEngine.setMuted(newMuted);
      el.muteToggle.textContent = newMuted ? "🔇" : "🔊";
    });

    el.openDevmode.addEventListener("click", () => {
      el.devBackdrop.classList.add("show");
      el.sessionBalanceInput.value = balance.toFixed(2);
      el.sessionBetInput.value = betAmount.toFixed(2);
    });
    el.closeDevmode.addEventListener("click", () => {
      el.devBackdrop.classList.remove("show");
    });
    el.devBackdrop.addEventListener("click", (e) => {
      if (e.target === el.devBackdrop) el.devBackdrop.classList.remove("show");
    });

    el.presetButtons.forEach(btn => {
      btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
    });

    el.targetRtpSlider.addEventListener("input", () => {
      targetRTP = parseFloat(el.targetRtpSlider.value);
      el.targetRtpValue.textContent = targetRTP.toFixed(1) + "%";
    });
    el.applyTargetRtp.addEventListener("click", () => {
      applyTargetRTP(targetRTP);
      buildDevSymbolTable();
      buildPaytable();
      saveDevConfig();
    });

    el.devSymbolTbody.addEventListener("input", (e) => {
      const t = e.target;
      if (t.tagName !== "INPUT") return;
      const idx = parseInt(t.dataset.idx, 10);
      const field = t.dataset.field;
      const val = parseFloat(t.value);
      if (Number.isNaN(val) || val < 0) return;
      SYMBOLS[idx][field] = val;
      recalcDerived();
      refreshRTPDisplays();
      buildPaytable();
      saveDevConfig();
    });

    el.runSimulation.addEventListener("click", () => {
      const spins = parseInt(el.simSpins.value, 10);
      el.runSimulation.disabled = true;
      el.runSimulation.textContent = "Simulating… 0%";
      runSimulation(
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

    el.resetDevmode.addEventListener("click", resetDevMode);

    el.runSessionSim.addEventListener("click", () => {
      const startingBalance = Math.max(1, parseFloat(el.sessionBalanceInput.value) || 1000);
      const bet = Math.max(0.1, parseFloat(el.sessionBetInput.value) || 1);
      const maxSpins = parseInt(el.sessionSpinsSelect.value, 10);
      const sessionCount = parseInt(el.sessionCountSelect.value, 10);
      el.runSessionSim.disabled = true;
      el.runBetSweep.disabled = true;
      el.runSessionSim.textContent = "Simulating… 0%";
      runSessionBatch(
        startingBalance, bet, maxSpins, sessionCount,
        (frac) => { el.runSessionSim.textContent = `Simulating… ${Math.round(frac * 100)}%`; },
        (result) => {
          renderSessionResults(result);
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
      runBetSweep(
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

    window.addEventListener("resize", resizeConfettiCanvas);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        el.paytableBackdrop.classList.remove("show");
        el.devBackdrop.classList.remove("show");
      }
      if (e.code === "Space" && document.activeElement.tagName !== "SELECT" && document.activeElement.tagName !== "BUTTON" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        if (!spinning) doSpin();
      }
      handleSecretKeystroke(e);
    });
  }

  // ---------- Init ----------
  function init() {
    loadBalance();
    loadDevConfig();
    buildReelsDom();
    resizeConfettiCanvas();
    updateBalanceDisplay();
    updateBetDisplay();
    buildPaytable();
    buildDevSymbolTable();
    highlightPresetButton();
    el.targetRtpSlider.value = targetRTP;
    el.targetRtpValue.textContent = targetRTP.toFixed(1) + "%";
    el.muteToggle.textContent = SoundEngine.isMuted() ? "🔇" : "🔊";
    wireEvents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
