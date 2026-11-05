/**
 * 贪吃蛇核心逻辑：不依赖 DOM，浏览器中挂到 window.SnakeCore，
 * Node 中可通过 require() 引入以进行单元测试。
 */
(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SnakeCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DIRECTIONS = Object.freeze({
    up: Object.freeze({ x: 0, y: -1 }),
    down: Object.freeze({ x: 0, y: 1 }),
    left: Object.freeze({ x: -1, y: 0 }),
    right: Object.freeze({ x: 1, y: 0 }),
  });

  var DEFAULTS = Object.freeze({
    cols: 20,
    rows: 20,
    initialLength: 4,
    pointsPerFood: 10,
    foodPerLevel: 4,
    baseInterval: 140,
    minInterval: 70,
    intervalStep: 10,
  });

  function toPositiveInt(value, fallback) {
    var number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function normalizeConfig(options) {
    var source = options || {};
    var config = {
      cols: Math.max(3, toPositiveInt(source.cols, DEFAULTS.cols)),
      rows: Math.max(3, toPositiveInt(source.rows, DEFAULTS.rows)),
      initialLength: toPositiveInt(source.initialLength, DEFAULTS.initialLength),
      pointsPerFood: Math.max(1, toPositiveInt(source.pointsPerFood, DEFAULTS.pointsPerFood)),
      foodPerLevel: Math.max(1, toPositiveInt(source.foodPerLevel, DEFAULTS.foodPerLevel)),
      baseInterval: Math.max(20, toPositiveInt(source.baseInterval, DEFAULTS.baseInterval)),
      minInterval: Math.max(20, toPositiveInt(source.minInterval, DEFAULTS.minInterval)),
      intervalStep: Math.max(0, toPositiveInt(source.intervalStep, DEFAULTS.intervalStep)),
      rng: typeof source.rng === "function" ? source.rng : Math.random,
    };

    if (config.minInterval > config.baseInterval) {
      config.minInterval = config.baseInterval;
    }

    var startX = Math.floor((config.cols - 1) / 2);
    config.initialLength = Math.max(2, Math.min(config.initialLength, startX + 1));

    return Object.freeze(config);
  }

  function isOpposite(a, b) {
    return (
      DIRECTIONS[a] &&
      DIRECTIONS[b] &&
      DIRECTIONS[a].x + DIRECTIONS[b].x === 0 &&
      DIRECTIONS[a].y + DIRECTIONS[b].y === 0
    );
  }

  function sameCell(a, b) {
    return Boolean(a && b && a.x === b.x && a.y === b.y);
  }

  function isFreeCell(game, x, y) {
    return !game.snake.some(function (segment) {
      return segment.x === x && segment.y === y;
    });
  }

  /**
   * 在所有空格中随机挑选一个放苹果；棋盘已满时返回 null。
   */
  function spawnFood(game) {
    var freeCells = [];
    for (var y = 0; y < game.config.rows; y += 1) {
      for (var x = 0; x < game.config.cols; x += 1) {
        if (isFreeCell(game, x, y)) {
          freeCells.push({ x: x, y: y });
        }
      }
    }

    if (freeCells.length === 0) {
      return null;
    }

    var rawIndex = Math.floor(game.rng() * freeCells.length);
    var index = Math.max(0, Math.min(freeCells.length - 1, rawIndex));
    return freeCells[index];
  }

  function createGame(options) {
    var config = normalizeConfig(options);
    var startX = Math.floor((config.cols - 1) / 2);
    var startY = Math.floor((config.rows - 1) / 2);
    var snake = [];

    for (var i = 0; i < config.initialLength; i += 1) {
      snake.push({ x: startX - i, y: startY });
    }

    var game = {
      config: config,
      rng: config.rng,
      snake: snake,
      direction: "right",
      pendingDirections: [],
      food: null,
      score: 0,
      foodEaten: 0,
      level: 1,
      status: "ready",
      lastEvent: null,
    };

    game.food = spawnFood(game);
    return game;
  }

  function start(game) {
    if (game.status === "ready") {
      game.status = "running";
      return true;
    }
    return false;
  }

  function pause(game) {
    if (game.status === "running") {
      game.status = "paused";
      return true;
    }
    return false;
  }

  function resume(game) {
    if (game.status === "paused") {
      game.status = "running";
      return true;
    }
    return false;
  }

  /**
   * 记录玩家输入的方向。最多缓存两个，连续快速转弯时不会丢失。
   */
  function queueDirection(game, directionName) {
    if (!DIRECTIONS[directionName]) {
      return false;
    }
    if (game.status !== "ready" && game.status !== "running") {
      return false;
    }
    if (game.pendingDirections.length >= 2) {
      return false;
    }

    var reference = game.pendingDirections.length
      ? game.pendingDirections[game.pendingDirections.length - 1]
      : game.direction;

    if (reference === directionName || isOpposite(reference, directionName)) {
      return false;
    }

    game.pendingDirections.push(directionName);
    return true;
  }

  function moveResult(game, type, extra) {
    var event = {
      type: type,
      score: game.score,
      level: game.level,
      length: game.snake.length,
      reason: null,
    };

    if (extra) {
      Object.keys(extra).forEach(function (key) {
        event[key] = extra[key];
      });
    }

    game.lastEvent = event;
    return event;
  }

  /**
   * 前进一步。只有 running 状态会移动，其余状态返回 idle。
   */
  function step(game) {
    if (game.status !== "running") {
      return { type: "idle" };
    }

    if (game.pendingDirections.length > 0) {
      game.direction = game.pendingDirections.shift();
    }

    var delta = DIRECTIONS[game.direction];
    var head = game.snake[0];
    var next = { x: head.x + delta.x, y: head.y + delta.y };

    var hitsWall =
      next.x < 0 ||
      next.x >= game.config.cols ||
      next.y < 0 ||
      next.y >= game.config.rows;

    if (hitsWall) {
      game.status = "over";
      return moveResult(game, "crashed", { reason: "wall", head: next });
    }

    var willEat = sameCell(next, game.food);
    var bodyToCheck = willEat ? game.snake : game.snake.slice(0, -1);
    var hitsSelf = bodyToCheck.some(function (segment) {
      return sameCell(segment, next);
    });

    if (hitsSelf) {
      game.status = "over";
      return moveResult(game, "crashed", { reason: "self", head: next });
    }

    game.snake.unshift(next);

    if (!willEat) {
      game.snake.pop();
      return moveResult(game, "moved", { head: next });
    }

    game.score += game.config.pointsPerFood;
    game.foodEaten += 1;
    game.level = Math.floor(game.foodEaten / game.config.foodPerLevel) + 1;

    if (game.snake.length === game.config.cols * game.config.rows) {
      game.food = null;
      game.status = "won";
      return moveResult(game, "won", { head: next, ate: true });
    }

    game.food = spawnFood(game);
    return moveResult(game, "ate", { head: next, ate: true });
  }

  /**
   * 当前等级对应的每步间隔（毫秒），等级越高速度越快。
   */
  function getStepInterval(game) {
    var config = game.config;
    var level = Math.max(1, game.level);
    return Math.max(
      config.minInterval,
      config.baseInterval - (level - 1) * config.intervalStep
    );
  }

  return {
    DIRECTIONS: DIRECTIONS,
    DEFAULTS: DEFAULTS,
    createGame: createGame,
    start: start,
    pause: pause,
    resume: resume,
    queueDirection: queueDirection,
    spawnFood: spawnFood,
    step: step,
    getStepInterval: getStepInterval,
    isOpposite: isOpposite,
    sameCell: sameCell,
  };
});
