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

  /* ---------- 地图渲染 ---------- */
  const mapPath = $("#map-path");
  const mapPathSvg = $("#map-path-svg");

  function isUnlocked(index) {
    if (index === 0) return true;
    return !!save.cleared[WORLDS[index - 1].id];
  }

  function totalStars() {
    return Object.values(save.cleared).reduce((sum, c) => sum + (c.stars || 0), 0);
  }
  function totalScore() {
    return Object.values(save.cleared).reduce((sum, c) => sum + (c.score || 0), 0);
  }

  function renderMap() {
    $("#map-mode-title").textContent = MODE_LABEL[save.mode] || "闯关地图";
    $("#board-stars").textContent = totalStars();
    $("#board-score").textContent = totalScore();

    mapPath.querySelectorAll(".level-node").forEach((n) => n.remove());
    mapPathSvg.innerHTML = "";

    WORLDS.forEach((world, i) => {
      const cleared = save.cleared[world.id];
      const unlocked = isUnlocked(i);

      const node = document.createElement("button");
      node.className = "level-node";
      node.classList.add(unlocked ? "is-open" : "is-locked");
      if (cleared) node.classList.add("is-cleared");

      const starsHtml = cleared
        ? "★".repeat(cleared.stars) + `<span class="dim">${"★".repeat(3 - cleared.stars)}</span>`
        : `<span class="dim">★★★</span>`;

      node.innerHTML = `
        <span class="node-badge">${cleared ? "✓" : i + 1}</span>
        <span class="node-info">
          <span class="node-name">${world.name}</span>
          <span class="node-desc">${world.desc}</span>
          <span class="node-stars">${starsHtml}</span>
        </span>
        ${unlocked ? "" : '<span class="node-lock">🔒</span>'}
      `;
      if (unlocked) {
        node.addEventListener("click", () => startLevel(i));
      }
      mapPath.appendChild(node);
    });

    // 页脚
    let footer = mapPath.parentElement.querySelector(".map-footer");
    if (!footer) {
      footer = document.createElement("p");
      footer.className = "map-footer";
      footer.innerHTML = `医学内容基于循证儿科实践 · 详见 <a href="https://www.yanyisheng.vip" target="_blank" rel="noopener">yanyisheng.vip</a> · 本游戏不能替代面诊`;
      mapPath.parentElement.appendChild(footer);
    }

    requestAnimationFrame(drawPath);
  }

  // 用节点中心绘制蜿蜒虚线路径
  function drawPath() {
    const nodes = [...mapPath.querySelectorAll(".level-node")];
    if (nodes.length < 2) return;
    const box = mapPath.getBoundingClientRect();
    mapPathSvg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    let d = "";
    nodes.forEach((n, i) => {
      const r = n.getBoundingClientRect();
      const x = r.left - box.left + r.width / 2;
      const y = r.top - box.top + r.height / 2;
      d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
      // 是否已开放（前一关已通关）
      const open = i === 0 || !!save.cleared[WORLDS[i - 1].id];
      // 每段单独 path 以区分开放状态
    });
    // 分段绘制，区分开放/锁定状态
    let html = "";
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = centerOf(nodes[i]), b = centerOf(nodes[i + 1]);
      const open = !!save.cleared[WORLDS[i].id];
      html += `<path class="path-line ${open ? "is-open" : ""}" d="M ${a.x} ${a.y} L ${b.x} ${b.y}"/>`;
    }
    mapPathSvg.innerHTML = html;

    function centerOf(n) {
      const r = n.getBoundingClientRect();
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
    }
  }
  window.addEventListener("resize", () => {
    if (screens.map.classList.contains("is-active")) drawPath();
  });

  $("#btn-back-home").addEventListener("click", () => showScreen("home"));

  /* ---------- 答题流程 ---------- */
  const questionsOf = (world) => (save.mode === "kid" ? world.kid : world.parent);

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
    $("#quiz-world-tag").textContent = `第 ${index + 1} 关 · ${world.name}`;
    renderHud();
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
    } else {
      state.streak = 0;
      state.hearts -= 1;
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
    renderMap();
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
    $("#result-title").textContent = "小树苗需要再浇浇水";
    $("#result-summary").textContent = "生命心用完了，再来一次一定能通关！";
    $("#result-tip").textContent = "本关要点 · " + world.tip;
    $("#btn-next-level").style.display = "none";
    showScreen("result");
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
