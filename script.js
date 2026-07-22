(() => {
  "use strict";

  // ---------- Config ----------
  const REEL_COUNT = 4;
  const ROW_COUNT = 3;
  const TILE_HEIGHT = 116;
  const STRIP_FILLER = 22; // random tiles above the final 3, per reel
  const STARTING_BALANCE = 1000;

  // Paytable values are "per-line pay units": a winning line pays
  // (payUnits / LINES.length) x the TOTAL bet. Tuned via simulation
  // (see project notes) to land around 95% RTP / ~40% hit frequency,
  // in line with typical medium-volatility online slots (94-97% RTP,
  // 25-40% hit frequency for this style of "many ways" game).
  const SYMBOLS = [
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
  const WILD_ID = "wild";
  const SYMBOL_BY_ID = Object.fromEntries(SYMBOLS.map(s => [s.id, s]));
  const TOTAL_WEIGHT = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

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

    if (tier === "jackpot") await sequentialReveal(newGrid);
    else await simultaneousReveal(newGrid);

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
    window.addEventListener("resize", resizeConfettiCanvas);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") el.paytableBackdrop.classList.remove("show");
      if (e.code === "Space" && document.activeElement.tagName !== "SELECT" && document.activeElement.tagName !== "BUTTON") {
        e.preventDefault();
        if (!spinning) doSpin();
      }
      handleSecretKeystroke(e);
    });
  }

  // ---------- Init ----------
  function init() {
    loadBalance();
    buildReelsDom();
    resizeConfettiCanvas();
    updateBalanceDisplay();
    updateBetDisplay();
    buildPaytable();
    wireEvents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
