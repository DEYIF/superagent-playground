/**
 * 贪吃蛇游戏界面：负责画布渲染、输入、计时与最高分存储。
 * 纯逻辑在 js/snake-core.js 中，便于单独测试。
 */
(function () {
  "use strict";

  var SnakeCore = window.SnakeCore;
  var COLS = 20;
  var ROWS = 20;
  var CELL = 30;
  var BOARD = COLS * CELL;
  var RENDER_SCALE = 2;
  var STORAGE_KEY = "snake-best-score";

  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var boardWrap = document.querySelector(".board-wrap");
  var overlay = document.getElementById("overlay");
  var overlayKicker = document.getElementById("overlay-kicker");
  var overlayTitle = document.getElementById("overlay-title");
  var overlayText = document.getElementById("overlay-text");
  var overlayHint = document.getElementById("overlay-hint");
  var primaryBtn = document.getElementById("primary-btn");
  var pauseBtn = document.getElementById("pause-btn");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var levelEl = document.getElementById("level");

  var KEY_TO_DIRECTION = {
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down",
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
  };

  var reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var game = createNewGame();
  var best = readBest();
  var overlayMode = "ready";
  var lastTimestamp = 0;
  var accumulator = 0;
  var touchStart = null;

  setupCanvas();
  bindEvents();
  updateHud();
  showOverlay("ready");
  requestAnimationFrame(loop);

  function createNewGame() {
    return SnakeCore.createGame({
      cols: COLS,
      rows: ROWS,
      rng: Math.random,
    });
  }

  function setupCanvas() {
    canvas.width = BOARD * RENDER_SCALE;
    canvas.height = BOARD * RENDER_SCALE;
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
  }

  function readBest() {
    try {
      var stored = Number.parseInt(window.localStorage.getItem(STORAGE_KEY), 10);
      return Number.isFinite(stored) && stored > 0 ? stored : 0;
    } catch (error) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch (error) {
      /* 隐私模式等场景下 localStorage 不可用，忽略即可。 */
    }
  }

  function updateHud() {
    if (game.score > best) {
      best = game.score;
      saveBest(best);
    }

    scoreEl.textContent = String(game.score);
    bestEl.textContent = String(best);
    levelEl.textContent = String(game.level);

    var canPause = game.status === "running" || game.status === "paused";
    pauseBtn.disabled = !canPause;
    pauseBtn.textContent = game.status === "paused" ? "▶" : "Ⅱ";
    pauseBtn.setAttribute(
      "aria-label",
      game.status === "paused" ? "继续游戏" : "暂停游戏"
    );
    pauseBtn.title = game.status === "paused" ? "继续 (空格)" : "暂停 (空格)";
  }

  function bumpScore() {
    scoreEl.classList.remove("bump");
    // 强制重排，让同一个动画可以连续触发。
    void scoreEl.offsetWidth;
    scoreEl.classList.add("bump");
  }

  function showOverlay(mode, event) {
    overlayMode = mode;
    overlay.classList.remove("is-hidden");

    if (mode === "ready") {
      overlayKicker.textContent = "准备好了吗？";
      overlayTitle.textContent = "贪吃蛇";
      overlayText.textContent = "吃掉苹果，别撞墙，也别咬到自己。";
      primaryBtn.textContent = "开始游戏";
      overlayHint.innerHTML = "按 <kbd>Enter</kbd> 开始";
      return;
    }

    if (mode === "paused") {
      overlayKicker.textContent = "已暂停";
      overlayTitle.textContent = "休息一下";
      overlayText.textContent = "游戏已暂停，随时可以继续。";
      primaryBtn.textContent = "继续游戏";
      overlayHint.innerHTML = "按 <kbd>空格</kbd> 继续";
      return;
    }

    if (mode === "won") {
      overlayKicker.textContent = "通关";
      overlayTitle.textContent = "你填满了整个棋盘！";
      overlayText.textContent = "最终得分 " + game.score + " 分 · 最高分 " + best + " 分";
      primaryBtn.textContent = "再来一局";
      overlayHint.innerHTML = "按 <kbd>Enter</kbd> 再来一局";
      return;
    }

    var crashedIntoSelf = event && event.reason === "self";
    overlayKicker.textContent = "游戏结束";
    overlayTitle.textContent = crashedIntoSelf ? "咬到自己了" : "撞到墙了";
    overlayText.textContent = "本局得分 " + game.score + " 分 · 最高分 " + best + " 分";
    primaryBtn.textContent = "再来一局";
    overlayHint.innerHTML = "按 <kbd>Enter</kbd> 再来一局";
  }

  function hideOverlay() {
    overlay.classList.add("is-hidden");
  }

  function startFromReady() {
    if (!SnakeCore.start(game)) {
      return;
    }
    accumulator = 0;
    lastTimestamp = 0;
    hideOverlay();
    updateHud();
  }

  function restartGame() {
    game = createNewGame();
    SnakeCore.start(game);
    accumulator = 0;
    lastTimestamp = 0;
    hideOverlay();
    updateHud();
  }

  function resumeGame() {
    if (!SnakeCore.resume(game)) {
      return;
    }
    accumulator = 0;
    lastTimestamp = 0;
    hideOverlay();
    updateHud();
  }

  function pauseGame() {
    if (!SnakeCore.pause(game)) {
      return;
    }
    showOverlay("paused");
    updateHud();
  }

  function togglePause() {
    if (game.status === "running") {
      pauseGame();
    } else if (game.status === "paused") {
      resumeGame();
    }
  }

  function handleDirectionInput(direction) {
    if (game.status === "ready") {
      SnakeCore.queueDirection(game, direction);
      startFromReady();
    } else if (game.status === "running") {
      SnakeCore.queueDirection(game, direction);
    }
  }

  function handleCrash(event) {
    if (game.score > best) {
      best = game.score;
      saveBest(best);
    }
    boardWrap.classList.remove("shake");
    void boardWrap.offsetWidth;
    boardWrap.classList.add("shake");
    showOverlay("over", event);
    updateHud();
  }

  function handleWin() {
    if (game.score > best) {
      best = game.score;
      saveBest(best);
    }
    showOverlay("won");
    updateHud();
  }

  function processStep() {
    var event = SnakeCore.step(game);

    if (event.type === "ate") {
      bumpScore();
    } else if (event.type === "crashed") {
      handleCrash(event);
    } else if (event.type === "won") {
      handleWin();
    }

    updateHud();
  }

  function loop(timestamp) {
    if (!lastTimestamp) {
      lastTimestamp = timestamp;
    }

    var delta = Math.min(timestamp - lastTimestamp, 200);
    lastTimestamp = timestamp;

    if (game.status === "running") {
      accumulator += delta;
      var interval = SnakeCore.getStepInterval(game);
      var steps = 0;

      while (accumulator >= interval && steps < 4) {
        accumulator -= interval;
        steps += 1;
        processStep();

        if (game.status !== "running") {
          accumulator = 0;
          break;
        }

        interval = SnakeCore.getStepInterval(game);
      }
    }

    draw(timestamp);
    requestAnimationFrame(loop);
  }

  function draw(timestamp) {
    drawBackground();
    drawGrid();
    drawFood(timestamp);
    drawSnake();
  }

  function drawBackground() {
    var gradient = ctx.createLinearGradient(0, 0, BOARD, BOARD);
    gradient.addColorStop(0, "#0a1120");
    gradient.addColorStop(1, "#0c1a2c");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, BOARD, BOARD);
  }

  function drawGrid() {
    ctx.strokeStyle = "rgba(148, 163, 184, 0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 1; i < COLS; i += 1) {
      ctx.moveTo(i * CELL + 0.5, 0);
      ctx.lineTo(i * CELL + 0.5, BOARD);
      ctx.moveTo(0, i * CELL + 0.5);
      ctx.lineTo(BOARD, i * CELL + 0.5);
    }
    ctx.stroke();
  }

  function drawFood(timestamp) {
    if (!game.food) {
      return;
    }

    var pulse = reduceMotion ? 1 : 1 + Math.sin(timestamp / 320) * 0.05;
    var cx = game.food.x * CELL + CELL / 2;
    var cy = game.food.y * CELL + CELL / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);

    ctx.shadowColor = "rgba(251, 113, 133, 0.65)";
    ctx.shadowBlur = 18;
    var apple = ctx.createRadialGradient(-3, -4, 1, 0, 0, 11);
    apple.addColorStop(0, "#fecdd3");
    apple.addColorStop(0.5, "#fb7185");
    apple.addColorStop(1, "#be123c");
    ctx.fillStyle = apple;
    ctx.beginPath();
    ctx.arc(0, 1, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#34d399";
    ctx.beginPath();
    ctx.ellipse(4.5, -8.5, 5, 2.5, -0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#15803d";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.quadraticCurveTo(0.5, -10.5, 3.5, -11.5);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.beginPath();
    ctx.arc(-3, -2, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawSnake() {
    var snake = game.snake;

    for (var i = snake.length - 1; i >= 0; i -= 1) {
      var segment = snake[i];
      var progress = snake.length === 1 ? 0 : i / (snake.length - 1);
      var lightness = 52 - progress * 16;
      var padding = 2.5;
      var x = segment.x * CELL + padding;
      var y = segment.y * CELL + padding;
      var size = CELL - padding * 2;

      ctx.fillStyle = "hsl(152 62% " + lightness.toFixed(1) + "%)";
      if (i === 0) {
        ctx.shadowColor = "rgba(52, 211, 153, 0.5)";
        ctx.shadowBlur = 14;
      }

      roundRect(x, y, size, size, i === 0 ? 9 : 7);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (i === 0) {
        drawEyes(segment);
      }
    }
  }

  function drawEyes(head) {
    var delta = SnakeCore.DIRECTIONS[game.direction];
    var centerX = head.x * CELL + CELL / 2;
    var centerY = head.y * CELL + CELL / 2;
    var horizontal = delta.x !== 0;
    var forwardX = delta.x * 4;
    var forwardY = delta.y * 4;
    var eyes = horizontal
      ? [
          { x: forwardX, y: -5 },
          { x: forwardX, y: 5 },
        ]
      : [
          { x: -5, y: forwardY },
          { x: 5, y: forwardY },
        ];

    for (var i = 0; i < eyes.length; i += 1) {
      var eye = eyes[i];
      ctx.fillStyle = "#ecfdf5";
      ctx.beginPath();
      ctx.arc(centerX + eye.x, centerY + eye.y, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#052e16";
      ctx.beginPath();
      ctx.arc(
        centerX + eye.x + delta.x * 0.9,
        centerY + eye.y + delta.y * 0.9,
        1.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  function roundRect(x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function bindEvents() {
    primaryBtn.addEventListener("click", function () {
      if (overlayMode === "ready") {
        startFromReady();
      } else if (overlayMode === "paused") {
        resumeGame();
      } else {
        restartGame();
      }
    });

    pauseBtn.addEventListener("click", togglePause);

    window.addEventListener("keydown", function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (game.status === "ready") {
          startFromReady();
        } else if (game.status === "running" || game.status === "paused") {
          togglePause();
        }
        return;
      }

      if (event.code === "Enter" || event.code === "NumpadEnter") {
        event.preventDefault();
        if (game.status === "ready") {
          startFromReady();
        } else if (game.status === "paused") {
          resumeGame();
        } else if (game.status === "over" || game.status === "won") {
          restartGame();
        }
        return;
      }

      var direction = KEY_TO_DIRECTION[event.code];
      if (!direction) {
        return;
      }

      event.preventDefault();
      if (event.repeat) {
        return;
      }
      handleDirectionInput(direction);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        pauseGame();
      }
    });

    window.addEventListener("blur", pauseGame);

    var dpadButtons = document.querySelectorAll("[data-direction]");
    Array.prototype.forEach.call(dpadButtons, function (button) {
      var direction = button.getAttribute("data-direction");

      button.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        handleDirectionInput(direction);
      });

      button.addEventListener("click", function (event) {
        event.preventDefault();
        handleDirectionInput(direction);
      });
    });

    canvas.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse") {
        return;
      }
      touchStart = { x: event.clientX, y: event.clientY };
    });

    window.addEventListener("pointerup", function (event) {
      if (!touchStart) {
        return;
      }

      var deltaX = event.clientX - touchStart.x;
      var deltaY = event.clientY - touchStart.y;
      touchStart = null;

      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) {
        return;
      }

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        handleDirectionInput(deltaX > 0 ? "right" : "left");
      } else {
        handleDirectionInput(deltaY > 0 ? "down" : "up");
      }
    });

    scoreEl.addEventListener("animationend", function () {
      scoreEl.classList.remove("bump");
    });

    boardWrap.addEventListener("animationend", function () {
      boardWrap.classList.remove("shake");
    });
  }
})();
