/* ============================================================
   小树苗医生大冒险 —— 游戏逻辑
   屏幕流转：home → map → quiz → result → map ...
   ============================================================ */

(function () {
  "use strict";

  /* ---------- 存档 ---------- */
  const SAVE_KEY = "sprout-doctor-save-v1";
  const save = loadSave();

  function loadSave() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (raw && raw.mode) return raw;
    } catch (e) { /* 损坏则重建 */ }
    return { mode: null, cleared: {}, best: {} };
    // cleared[worldId] = { stars, score }   best = 汇总
  }
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  }

  /* ---------- DOM ---------- */
  const $ = (sel) => document.querySelector(sel);
  const screens = {
    home: $("#screen-home"),
    map: $("#screen-map"),
    quiz: $("#screen-quiz"),
    result: $("#screen-result"),
  };

  const state = {
    mode: null,          // parent | kid
    worldIndex: 0,
    qIndex: 0,
    maxHearts: HEARTS_MIN,
    hearts: HEARTS_MIN,
    score: 0,
    streak: 0,
    correctCount: 0,
  };

  /* ---------- 屏幕切换 ---------- */
  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("is-active"));
    screens[name].classList.add("is-active");
    window.scrollTo(0, 0);
  }

  /* ---------- 首页：模式选择 + 视差 ---------- */
  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      save.mode = btn.dataset.mode;
      persist();
      renderMap();
      showScreen("map");
    });
  });

  // 轻量视差：滚动时远山慢移
  const parallaxEl = document.querySelector(".hero-parallax");
  window.addEventListener("scroll", () => {
    if (!screens.home.classList.contains("is-active") || !parallaxEl) return;
    parallaxEl.style.setProperty("--parallax-y", `${window.scrollY * 0.12}px`);
  }, { passive: true });

  /* ---------- 首页知识列车：开场巡行 ---------- */
  const homeTrain = $("#home-train");
  const homeSmoke = $("#home-smoke");
  let homeSmokeTimer = null;

  function runHomeTrain() {
    if (!homeTrain) return;
    clearInterval(homeSmokeTimer);
    homeTrain.classList.remove("is-running");
    void homeTrain.offsetWidth;
    homeTrain.classList.add("is-running");
    whistle(900);
    const puff = () => {
      const p = document.createElement("span");
      p.className = "smoke-puff";
      p.style.left = 4 + Math.random() * 6 + "px";
      p.style.animationDuration = 1.2 + Math.random() * 0.7 + "s";
      homeSmoke.appendChild(p);
      setTimeout(() => p.remove(), 2100);
    };
    puff();
    homeSmokeTimer = setInterval(puff, 150);
    setTimeout(() => { clearInterval(homeSmokeTimer); ding(); }, 4600);
  }
  // 首次进入 + 每隔约 40 秒再巡行一次
  setTimeout(runHomeTrain, 900);
  setInterval(() => {
    if (screens.home.classList.contains("is-active")) runHomeTrain();
  }, 40000);

  /* ---------- 火车站地图：站牌 + 小火车 ---------- */
  const track = $("#station-track");
  const viewport = $("#station-viewport");
  const train = $("#train");
  const smokeBox = $("#train-smoke");
  let stationEls = [];
  let selectedIndex = 0;
  let smokeTimer = null;

  function totalStars() {
    return Object.values(save.cleared).reduce((sum, c) => sum + (c.stars || 0), 0);
  }
  function totalScore() {
    return Object.values(save.cleared).reduce((sum, c) => sum + (c.score || 0), 0);
  }

  function renderMap(parkAt) {
    $("#map-mode-title").textContent = MODE_LABEL[save.mode] || "闯关地图";
    $("#board-stars").textContent = totalStars();
    $("#board-score").textContent = totalScore();

    track.querySelectorAll(".station").forEach((n) => n.remove());
    stationEls = [];

    WORLDS.forEach((world, i) => {
      const cleared = save.cleared[world.id];

      const st = document.createElement("button");
      st.className = "station" + (cleared ? " is-cleared" : "") + (i % 2 ? " is-high" : "");

      const starsHtml = cleared
        ? "★".repeat(cleared.stars) + `<span class="dim">${"★".repeat(3 - cleared.stars)}</span>`
        : `<span class="dim">★★★</span>`;

      st.innerHTML = `
        <span class="sign">
          <span class="sign-plate">${cleared ? "✓" : i + 1}</span>
          <span class="sign-name">${world.name}</span>
          <span class="sign-desc">${world.desc}</span>
          <span class="sign-stars">${starsHtml}</span>
        </span>
        <span class="sign-post" aria-hidden="true"></span>
      `;
      st.addEventListener("click", () => selectStation(i, true));
      track.appendChild(st);
      stationEls.push(st);
    });

    // 小火车默认停在最前面未通关的站（全部通关则停终点站）；退出关卡时停在当前站
    let park = typeof parkAt === "number" ? parkAt : WORLDS.findIndex((w) => !save.cleared[w.id]);
    if (park === -1) park = WORLDS.length - 1;
    requestAnimationFrame(() => selectStation(park, false));
  }

  function stationCenterX(i) {
    const st = stationEls[i];
    if (!st) return 0;
    return st.offsetLeft + st.offsetWidth / 2;
  }

  function selectStation(i, withWhistle) {
    if (!stationEls.length) return;
    selectedIndex = i;
    stationEls.forEach((st, j) => st.classList.toggle("is-current", j === i));

    const world = WORLDS[i];
    const cleared = save.cleared[world.id];
    $("#sp-num").textContent = `第 ${i + 1} 站 · 共 ${WORLDS.length} 站`;
    $("#sp-name").textContent = world.name;
    $("#sp-desc").textContent = world.desc;
    $("#sp-stars").innerHTML = cleared
      ? "最佳成绩 " + "★".repeat(cleared.stars) + `<span class="dim">${"★".repeat(3 - cleared.stars)}</span>`
      : `<span class="dim">尚未通关 · 等你来挑战</span>`;

    // 视口滚动到该站居中
    const x = stationCenterX(i);
    viewport.scrollTo({ left: x - viewport.clientWidth / 2, behavior: withWhistle ? "smooth" : "auto" });

    // 小火车开过去
    moveTrainTo(x, withWhistle);
  }

  function moveTrainTo(x, withSound) {
    const half = train.offsetWidth / 2;
    const dest = Math.max(10, x - half);
    const from = parseFloat(train.style.left || "10");
    const dist = Math.abs(dest - from);

    train.style.left = dest + "px";

    if (dist < 4) return; // 原地不动
    clearInterval(smokeTimer);
    if (withSound) whistle(dist);

    train.classList.add("is-moving");
    const puff = () => spawnSmoke();
    puff();
    smokeTimer = setInterval(puff, 160);
    setTimeout(() => {
      train.classList.remove("is-moving");
      clearInterval(smokeTimer);
      if (withSound) ding();
    }, Math.min(2600, 500 + dist * 1.4));
  }

  function spawnSmoke() {
    const puff = document.createElement("span");
    puff.className = "smoke-puff";
    puff.style.left = 14 + Math.random() * 8 + "px";
    puff.style.animationDuration = 1.4 + Math.random() * 0.8 + "s";
    smokeBox.appendChild(puff);
    setTimeout(() => puff.remove(), 2300);
  }

  /* 小音效：汽笛 + 到站叮（WebAudio，无外部资源） */
  let audioCtx = null;
  function ac() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }
  function tone(freqA, freqB, dur, type, vol) {
    const ctx = ac();
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freqA, ctx.currentTime);
    o.frequency.linearRampToValueAtTime(freqB, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur + 0.05);
  }
  function whistle(dist) {
    // 距离越远汽笛越长
    const dur = Math.min(0.9, 0.25 + dist / 1600);
    tone(311, 370, dur, "triangle", 0.035);
    setTimeout(() => tone(370, 311, dur, "triangle", 0.028), dur * 1000 + 60);
  }
  function ding() {
    tone(784, 784, 0.35, "sine", 0.05);
    setTimeout(() => tone(1047, 1047, 0.5, "sine", 0.045), 140);
  }

  $("#btn-station-start").addEventListener("click", () => startLevel(selectedIndex));
  window.addEventListener("resize", () => {
    if (!screens.map.classList.contains("is-active") || !stationEls.length) return;
    const x = stationCenterX(selectedIndex);
    viewport.scrollLeft = x - viewport.clientWidth / 2;
    train.style.left = Math.max(10, x - train.offsetWidth / 2) + "px";
  });

  $("#btn-back-home").addEventListener("click", () => showScreen("home"));

  /* ---------- 答题流程 ---------- */
  const questionsOf = (world) => (save.mode === "kid" ? world.kid : world.parent);

  /* ---------- 小树苗成长仪式 ---------- */
  // 六个阶段：种子 → 嫩芽 → 幼苗 → 小树苗 → 小树 → 大树
  const PLANT_STAGES = [
    { label: "小种子睡着了", svg: `
      <ellipse cx="50" cy="104" rx="30" ry="9" fill="#4A3B28"/>
      <ellipse cx="50" cy="98" rx="12" ry="8" fill="#8A6B45"/>
      <circle cx="50" cy="90" r="2.5" fill="#D8CDB2" opacity=".6"/>` },
    { label: "冒出小嫩芽", svg: `
      <ellipse cx="50" cy="104" rx="30" ry="9" fill="#4A3B28"/>
      <path d="M50 100 L50 78" stroke="#8FB573" stroke-width="4" stroke-linecap="round"/>
      <path d="M50 84 C40 82 35 74 35 68 C44 68 50 75 50 84 Z" fill="#8FB573"/>
      <path d="M50 80 C60 78 65 70 65 64 C56 64 50 71 50 80 Z" fill="#A5C98A"/>` },
    { label: "长成小幼苗", svg: `
      <ellipse cx="50" cy="104" rx="30" ry="9" fill="#4A3B28"/>
      <path d="M50 100 L50 62" stroke="#8FB573" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M50 78 C39 76 33 67 33 60 C43 60 50 68 50 78 Z" fill="#8FB573"/>
      <path d="M50 72 C61 70 67 61 67 54 C57 54 50 62 50 72 Z" fill="#A5C98A"/>
      <path d="M50 62 C44 56 43 48 46 42 C52 46 53 55 50 62 Z" fill="#8FB573"/>` },
    { label: "小树苗长高了", svg: `
      <ellipse cx="50" cy="104" rx="32" ry="9" fill="#4A3B28"/>
      <path d="M50 100 L50 48" stroke="#7A6242" stroke-width="6" stroke-linecap="round"/>
      <circle cx="50" cy="38" r="17" fill="#8FB573"/>
      <circle cx="37" cy="47" r="11" fill="#7FA868"/>
      <circle cx="63" cy="47" r="11" fill="#A5C98A"/>
      <path d="M50 100 C42 88 40 70 44 56" stroke="#7A6242" stroke-width="3" fill="none" stroke-linecap="round"/>` },
    { label: "长成小树啦", svg: `
      <ellipse cx="50" cy="104" rx="34" ry="9" fill="#4A3B28"/>
      <path d="M50 100 L48 34" stroke="#7A6242" stroke-width="8" stroke-linecap="round"/>
      <circle cx="48" cy="26" r="22" fill="#8FB573"/>
      <circle cx="30" cy="38" r="14" fill="#7FA868"/>
      <circle cx="66" cy="38" r="14" fill="#A5C98A"/>
      <circle cx="48" cy="16" r="12" fill="#A5C98A"/>
      <path d="M48 70 C38 62 34 52 36 44" stroke="#7A6242" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M48 62 C58 56 62 48 61 40" stroke="#7A6242" stroke-width="4" fill="none" stroke-linecap="round"/>` },
    { label: "大树结金果！", svg: `
      <ellipse cx="50" cy="104" rx="36" ry="9" fill="#4A3B28"/>
      <path d="M50 100 L48 26" stroke="#7A6242" stroke-width="9" stroke-linecap="round"/>
      <circle cx="48" cy="22" r="26" fill="#8FB573"/>
      <circle cx="25" cy="38" r="16" fill="#7FA868"/>
      <circle cx="71" cy="38" r="16" fill="#A5C98A"/>
      <circle cx="38" cy="10" r="13" fill="#A5C98A"/>
      <circle cx="60" cy="9" r="12" fill="#8FB573"/>
      <circle cx="34" cy="30" r="4.5" fill="#E0A93E"/>
      <circle cx="58" cy="24" r="4.5" fill="#E0A93E"/>
      <circle cx="48" cy="42" r="4.5" fill="#E0A93E"/>
      <path d="M48 72 C36 64 32 54 34 46" stroke="#7A6242" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M48 60 C60 54 64 46 63 38" stroke="#7A6242" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M20 14 l2.5 5 5 2.5 -5 2.5 -2.5 5 -2.5 -5 -5 -2.5 5 -2.5 Z" fill="#F4ECD8" opacity=".9"/>
      <path d="M78 8 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2 Z" fill="#F4ECD8" opacity=".7"/>` },
  ];

  function plantStageOf(correctCount) {
    return Math.min(correctCount, PLANT_STAGES.length - 1);
  }

  function renderPlant(grew) {
    const stage = PLANT_STAGES[plantStageOf(state.correctCount)];
    const plantEl = $("#quiz-plant");
    const prevStage = plantEl.dataset.stage;
    plantEl.innerHTML = `<svg viewBox="0 0 100 114">${stage.svg}</svg>`;
    plantEl.dataset.stage = plantStageOf(state.correctCount);
    $("#plant-label").textContent = stage.label;

    if (grew && prevStage !== plantEl.dataset.stage) {
      plantEl.classList.remove("is-growing");
      void plantEl.offsetWidth;
      plantEl.classList.add("is-growing");
      tone(523, 784, 0.16, "sine", 0.045);
      setTimeout(() => tone(784, 1047, 0.2, "sine", 0.04), 110);
    }
  }

  function shakePlant() {
    const plantEl = $("#quiz-plant");
    plantEl.classList.remove("is-shaking");
    void plantEl.offsetWidth;
    plantEl.classList.add("is-shaking");
  }

  // 生命心随题量缩放：至少 3 颗，约每 3 题 1 颗
  const heartsFor = (total) => Math.max(HEARTS_MIN, Math.round(total / 3));

  function startLevel(index) {
    state.worldIndex = index;
    state.qIndex = 0;
    state.maxHearts = heartsFor(questionsOf(WORLDS[index]).length);
    state.hearts = state.maxHearts;
    state.score = 0;
    state.streak = 0;
    state.correctCount = 0;

    const world = WORLDS[index];
    $("#quiz-world-tag").textContent = `第 ${index + 1} 站 · ${world.name}`;
    renderHud();
    renderPlant(false);
    renderQuestion();
    showScreen("quiz");
  }

  function renderHud() {
    const heartsEl = $("#hud-hearts");
    heartsEl.innerHTML = "";
    for (let i = 0; i < state.maxHearts; i++) {
      const s = document.createElement("span");
      s.className = "heart" + (i < state.hearts ? "" : " is-lost");
      s.textContent = "♥";
      heartsEl.appendChild(s);
    }
    $("#hud-score").textContent = state.score;
    $("#hud-streak").textContent = state.streak;
    const total = questionsOf(WORLDS[state.worldIndex]).length;
    $("#quiz-progress-bar").style.width = `${(state.qIndex / total) * 100}%`;
  }

  function renderQuestion() {
    const world = WORLDS[state.worldIndex];
    const qs = questionsOf(world);
    const q = qs[state.qIndex];

    $("#question-scene").textContent = q.scene || "";
    $("#question-text").textContent = q.text;

    const grid = $("#options-grid");
    grid.innerHTML = "";
    grid.className = "options-grid " + (q.options.length === 2 ? "options-2" : "options-4");

    const keys = ["A", "B", "C", "D"];
    q.options.forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "option-btn";
      b.innerHTML = `<span class="option-key">${keys[i]}</span>${opt}`;
      b.addEventListener("click", () => onAnswer(i, b));
      grid.appendChild(b);
    });

    // 重新触发进入动画
    const card = $("#question-card");
    card.style.animation = "none";
    void card.offsetWidth;
    card.style.animation = "";
  }

  function onAnswer(pick, btn) {
    const world = WORLDS[state.worldIndex];
    const qs = questionsOf(world);
    const q = qs[state.qIndex];
    const correct = pick === q.answer;

    // 锁定所有选项并揭示答案
    const buttons = [...$("#options-grid").children];
    buttons.forEach((b) => (b.disabled = true));
    buttons[q.answer].classList.add("is-correct");
    if (!correct) {
      btn.classList.add("is-wrong");
    }

    if (correct) {
      state.streak += 1;
      state.correctCount += 1;
      const gained = 100 + (state.streak - 1) * 25;
      state.score += gained;
      burstConfetti(btn, 18);
      renderPlant(true);
    } else {
      state.streak = 0;
      state.hearts -= 1;
      shakePlant();
    }

    renderHud();

    setTimeout(() => showFeedback(q, correct, pick), 650);
  }

  /* ---------- 反馈弹层 ---------- */
  const overlay = $("#feedback-overlay");

  function showFeedback(q, correct) {
    const verdict = $("#feedback-verdict");
    verdict.textContent = correct
      ? ["答对啦！", "真棒！", "小医生上线！", "完全正确！"][Math.floor(Math.random() * 4)]
      : ["差一点点", "再想想哦", "没关系，记住它！", "这一关的小陷阱"][Math.floor(Math.random() * 4)];
    verdict.className = "feedback-verdict " + (correct ? "is-good" : "is-bad");

    $("#feedback-explain").textContent = q.explain;
    $("#feedback-doctor").textContent = q.doctor ? "「医生说」 " + q.doctor : "";

    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
  }

  $("#btn-feedback-next").addEventListener("click", () => {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");

    if (state.hearts <= 0) {
      levelFailed();
      return;
    }
    state.qIndex += 1;
    const total = questionsOf(WORLDS[state.worldIndex]).length;
    if (state.qIndex >= total) {
      levelCleared();
    } else {
      renderHud();
      renderQuestion();
    }
  });

  $("#btn-quit-level").addEventListener("click", () => {
    overlay.classList.remove("is-open");
    renderMap(state.worldIndex);
    showScreen("map");
  });

  /* ---------- 结算 ---------- */
  function levelCleared() {
    const world = WORLDS[state.worldIndex];
    const total = questionsOf(world).length;
    // 评星按正确率：≥90% 三星，≥70% 两星，其余一星
    const ratio = state.correctCount / total;
    const stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : 1;

    const prev = save.cleared[world.id];
    save.cleared[world.id] = {
      stars: Math.max(stars, prev ? prev.stars : 0),
      score: Math.max(state.score, prev ? prev.score : 0),
    };
    persist();

    renderResultTree(false);

    // 星星逐个弹出
    const starsEl = $("#result-stars");
    starsEl.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const s = document.createElement("span");
      s.className = "star " + (i < stars ? "lit" : "unlit");
      s.textContent = "★";
      s.style.animationDelay = `${0.25 + i * 0.28}s`;
      starsEl.appendChild(s);
    }

    const isLast = state.worldIndex === WORLDS.length - 1;
    $("#result-title").textContent = isLast ? "全部通关！" : `${world.name} · 通过！`;
    $("#result-summary").textContent =
      `答对 ${state.correctCount} / ${total} 题 · 本关得分 ${state.score} · 累计星星 ${totalStars()}`;
    $("#result-tip").textContent = "本关要点 · " + world.tip;
    $("#btn-next-level").style.display = isLast ? "none" : "";

    showScreen("result");
    if (isLast) bigConfetti();
  }

  function levelFailed() {
    const world = WORLDS[state.worldIndex];
    $("#result-stars").innerHTML = "";
    renderResultTree(true);
    $("#result-title").textContent = "小树苗需要再浇浇水";
    $("#result-summary").textContent = "生命心用完了，再来一次一定能通关！";
    $("#result-tip").textContent = "本关要点 · " + world.tip;
    $("#btn-next-level").style.display = "none";
    showScreen("result");
  }

  // 结算页大树：通关=金果大树，未通关=当前阶段的树苗（萎蔫）
  function renderResultTree(wilt) {
    const treeEl = $("#result-tree");
    const stageIdx = wilt ? Math.max(plantStageOf(state.correctCount), 1) : PLANT_STAGES.length - 1;
    const stage = PLANT_STAGES[stageIdx];
    treeEl.className = "result-tree" + (wilt ? " is-wilt" : "");
    treeEl.innerHTML = `<svg viewBox="0 0 100 114">${stage.svg}</svg>`;
  }

  $("#btn-replay").addEventListener("click", () => startLevel(state.worldIndex));
  $("#btn-next-level").addEventListener("click", () => startLevel(state.worldIndex + 1));
  $("#btn-result-map").addEventListener("click", () => {
    renderMap();
    showScreen("map");
  });

  /* ---------- 粒子庆祝 ---------- */
  // 答对：以按钮为中心的少量多边形粒子
  let burstCanvas = null, burstCtx = null, particles = [], rafId = null;

  function ensureBurstCanvas() {
    if (burstCanvas) return;
    burstCanvas = document.createElement("canvas");
    burstCanvas.className = "burst-canvas";
    document.body.appendChild(burstCanvas);
    burstCtx = burstCanvas.getContext("2d");
  }

  function burstConfetti(anchorEl, count) {
    ensureBurstCanvas();
    resizeBurst();
    const r = anchorEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const colors = ["#E0A93E", "#F4ECD8", "#8FB573", "#C96F4A"];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 4.5;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        size: 4 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 60 + Math.random() * 30,
        poly: 3 + Math.floor(Math.random() * 3), // 3-5 边形
      });
    }
    if (!rafId) tickBurst();
  }

  function resizeBurst() {
    burstCanvas.width = window.innerWidth * devicePixelRatio;
    burstCanvas.height = window.innerHeight * devicePixelRatio;
    burstCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  window.addEventListener("resize", () => { if (burstCanvas) resizeBurst(); });

  function tickBurst() {
    burstCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    particles = particles.filter((p) => p.life > 0);
    particles.forEach((p) => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.18;             // 轻重力
      p.vx *= 0.985;
      p.rot += p.vr;
      p.life -= 1;
      burstCtx.save();
      burstCtx.translate(p.x, p.y);
      burstCtx.rotate(p.rot);
      burstCtx.globalAlpha = Math.min(1, p.life / 30);
      burstCtx.fillStyle = p.color;
      burstCtx.beginPath();
      for (let i = 0; i < p.poly; i++) {
        const a = (i / p.poly) * Math.PI * 2;
        const px = Math.cos(a) * p.size;
        const py = Math.sin(a) * p.size;
        i === 0 ? burstCtx.moveTo(px, py) : burstCtx.lineTo(px, py);
      }
      burstCtx.closePath();
      burstCtx.fill();
      burstCtx.restore();
    });
    if (particles.length) {
      rafId = requestAnimationFrame(tickBurst);
    } else {
      rafId = null;
      burstCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  // 通关全屏彩带
  const confettiCanvas = $("#confetti-canvas");
  const confettiCtx = confettiCanvas.getContext("2d");
  let confettiParts = [], confettiRaf = null;

  function bigConfetti() {
    confettiCanvas.width = window.innerWidth * devicePixelRatio;
    confettiCanvas.height = window.innerHeight * devicePixelRatio;
    confettiCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const colors = ["#E0A93E", "#F4ECD8", "#8FB573", "#C96F4A"];
    for (let i = 0; i < 140; i++) {
      confettiParts.push({
        x: Math.random() * window.innerWidth,
        y: -20 - Math.random() * window.innerHeight * 0.5,
        vx: (Math.random() - 0.5) * 1.6,
        vy: 1.5 + Math.random() * 2.5,
        w: 6 + Math.random() * 8,
        h: 8 + Math.random() * 10,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.12,
        color: colors[Math.floor(Math.random() * colors.length)],
        sway: Math.random() * Math.PI * 2,
      });
    }
    if (!confettiRaf) tickConfetti();
  }

  function tickConfetti() {
    confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    confettiParts.forEach((p) => {
      p.sway += 0.03;
      p.x += p.vx + Math.sin(p.sway) * 0.8;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > window.innerHeight + 30) {
        p.y = -20;
        p.x = Math.random() * window.innerWidth;
      }
      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rot);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      confettiCtx.restore();
    });
    confettiRaf = requestAnimationFrame(tickConfetti);
  }

  // 离开结算页时停止彩带
  $("#btn-replay").addEventListener("click", stopConfetti);
  $("#btn-next-level").addEventListener("click", stopConfetti);
  $("#btn-result-map").addEventListener("click", stopConfetti);
  function stopConfetti() {
    if (confettiRaf) cancelAnimationFrame(confettiRaf);
    confettiRaf = null;
    confettiParts = [];
    confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  /* ---------- 启动 ---------- */
  if (save.mode) {
    renderMap();
    showScreen("map");
  } else {
    showScreen("home");
  }
})();
