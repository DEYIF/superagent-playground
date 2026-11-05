"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const SnakeCore = require("../js/snake-core.js");

const HEAD = { x: 9, y: 9 };
// 让苹果落在默认蛇头正前方 (10, 9)。
const FOOD_AHEAD = 0.471;

function createDefaultGame(overrides) {
  return SnakeCore.createGame(Object.assign({ rng: () => 0 }, overrides));
}

test("createGame 生成默认棋盘、蛇身和待机状态", () => {
  const game = createDefaultGame();

  assert.equal(game.config.cols, 20);
  assert.equal(game.config.rows, 20);
  assert.equal(game.snake.length, 4);
  assert.deepEqual(game.snake[0], HEAD);
  assert.equal(game.snake[0].x > game.snake[1].x, true);
  assert.equal(game.direction, "right");
  assert.equal(game.status, "ready");
  assert.equal(game.score, 0);
  assert.equal(game.level, 1);
  assert.ok(game.food);
  assert.equal(
    game.snake.some((segment) => SnakeCore.sameCell(segment, game.food)),
    false,
    "苹果不能生成在蛇身上"
  );
});

test("待机状态下 step 不会移动", () => {
  const game = createDefaultGame();
  const event = SnakeCore.step(game);

  assert.equal(event.type, "idle");
  assert.deepEqual(game.snake[0], HEAD);
  assert.equal(game.status, "ready");
});

test("开始后每一步都向当前方向移动一格", () => {
  const game = createDefaultGame();
  SnakeCore.start(game);
  const event = SnakeCore.step(game);

  assert.equal(event.type, "moved");
  assert.deepEqual(game.snake[0], { x: HEAD.x + 1, y: HEAD.y });
  assert.equal(game.snake.length, 4);
  assert.equal(game.status, "running");
});

test("禁止直接掉头，连续转弯最多缓存两个方向", () => {
  const game = createDefaultGame();
  SnakeCore.start(game);

  assert.equal(SnakeCore.queueDirection(game, "left"), false, "不能直接反向");
  assert.equal(SnakeCore.queueDirection(game, "up"), true);
  assert.equal(SnakeCore.queueDirection(game, "up"), false, "重复方向会被忽略");
  assert.equal(SnakeCore.queueDirection(game, "left"), true, "向上后再向左是合法转弯");
  assert.equal(SnakeCore.queueDirection(game, "right"), false, "队列中的方向也不能反向");
  assert.equal(SnakeCore.queueDirection(game, "down"), false, "队列最多缓存两个方向");
});

test("待机时按方向键可先缓存方向，开始后生效", () => {
  const game = createDefaultGame();

  assert.equal(SnakeCore.queueDirection(game, "up"), true);
  SnakeCore.start(game);
  SnakeCore.step(game);

  assert.deepEqual(game.snake[0], { x: HEAD.x, y: HEAD.y - 1 });
  assert.equal(game.direction, "up");
});

test("吃到苹果后变长、加分，并重新生成不与蛇身重叠的苹果", () => {
  const game = SnakeCore.createGame({ rng: () => FOOD_AHEAD });
  assert.deepEqual(game.food, { x: 10, y: 9 });

  SnakeCore.start(game);
  const event = SnakeCore.step(game);

  assert.equal(event.type, "ate");
  assert.equal(game.score, 10);
  assert.equal(game.snake.length, 5);
  assert.equal(game.level, 1);
  assert.equal(game.foodEaten, 1);
  assert.equal(
    game.snake.some((segment) => SnakeCore.sameCell(segment, game.food)),
    false
  );
});

test("每吃 4 个苹果升一级，移动间隔随之缩短并有下限", () => {
  const game = createDefaultGame();
  SnakeCore.start(game);

  for (let eaten = 1; eaten <= 4; eaten += 1) {
    const head = game.snake[0];
    game.food = { x: head.x + 1, y: head.y };
    const event = SnakeCore.step(game);
    assert.equal(event.type, "ate");
    assert.equal(game.score, eaten * 10);
  }

  assert.equal(game.foodEaten, 4);
  assert.equal(game.level, 2);
  assert.equal(SnakeCore.getStepInterval(game), 130);

  game.level = 99;
  assert.equal(SnakeCore.getStepInterval(game), game.config.minInterval);
});

test("撞墙会结束游戏并标记原因", () => {
  const game = createDefaultGame();
  SnakeCore.start(game);
  SnakeCore.queueDirection(game, "up");

  let event = SnakeCore.step(game);
  for (let i = 1; i < 9; i += 1) {
    assert.equal(event.type, "moved");
    event = SnakeCore.step(game);
  }

  assert.equal(event.type, "moved");
  event = SnakeCore.step(game);
  assert.equal(event.type, "crashed");
  assert.equal(event.reason, "wall");
  assert.equal(game.status, "over");
  assert.equal(SnakeCore.step(game).type, "idle");
});

test("咬到自己会结束游戏并标记原因", () => {
  const game = createDefaultGame();
  game.status = "running";
  game.direction = "left";
  game.pendingDirections = [];
  game.food = { x: 15, y: 15 };
  game.snake = [
    { x: 2, y: 2 },
    { x: 2, y: 3 },
    { x: 1, y: 3 },
    { x: 1, y: 2 },
    { x: 1, y: 1 },
  ];

  const event = SnakeCore.step(game);

  assert.equal(event.type, "crashed");
  assert.equal(event.reason, "self");
  assert.equal(game.status, "over");
});

test("蛇身填满棋盘时判定通关", () => {
  const game = SnakeCore.createGame({ cols: 3, rows: 3, initialLength: 2, rng: () => 0 });
  game.status = "running";
  game.direction = "right";
  game.snake = [
    { x: 1, y: 2 },
    { x: 0, y: 2 },
    { x: 0, y: 1 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 1 },
    { x: 1, y: 1 },
  ];
  game.food = { x: 2, y: 2 };

  const event = SnakeCore.step(game);

  assert.equal(event.type, "won");
  assert.equal(game.status, "won");
  assert.equal(game.snake.length, 9);
  assert.equal(game.food, null);
});

test("暂停和恢复控制游戏推进", () => {
  const game = createDefaultGame();
  SnakeCore.start(game);
  assert.equal(SnakeCore.pause(game), true);
  assert.equal(game.status, "paused");
  assert.equal(SnakeCore.step(game).type, "idle");

  assert.equal(SnakeCore.resume(game), true);
  assert.equal(game.status, "running");
  assert.equal(SnakeCore.step(game).type, "moved");
});

test("苹果只会出现在空格；棋盘填满时返回 null", () => {
  for (const value of [0, 0.25, 0.5, 0.999]) {
    const game = createDefaultGame({ rng: () => value });
    game.food = SnakeCore.spawnFood(game);
    assert.ok(game.food.x >= 0 && game.food.x < 20);
    assert.ok(game.food.y >= 0 && game.food.y < 20);
    assert.equal(
      game.snake.some((segment) => SnakeCore.sameCell(segment, game.food)),
      false
    );
  }

  const full = SnakeCore.createGame({ cols: 3, rows: 3, initialLength: 2 });
  full.snake = [];
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      full.snake.push({ x, y });
    }
  }

  assert.equal(SnakeCore.spawnFood(full), null);
});
