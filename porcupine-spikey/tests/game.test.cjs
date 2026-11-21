const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { createGame: loadGame } = require("../../test/platformer-harness.cjs");

const createGame = () => loadGame(path.join(__dirname, ".."));

test("auto-runs at the original speed; jumps obey gravity and cannot repeat in midair", () => {
  const game = createGame();
  game.start(); game.clearHazards(); game.step();
  assert.equal(game.world.player.x, 83);
  assert.equal(game.world.player.onGround, true);
  game.press(); game.step(); game.release();
  assert.ok(Math.abs(game.world.player.vy - (-11 + 0.6)) < 1e-9);
  const firstY = game.world.player.y;
  game.press(); game.step(); game.release();
  assert.ok(Math.abs(game.world.player.vy - (-11 + 1.2)) < 1e-9);
  assert.ok(game.world.player.y < firstY);
  game.until(() => game.world.player.onGround);
  assert.equal(game.world.player.y, 304);
});

test("lands on a raised platform only while descending", () => {
  const game = createGame();
  game.start(); game.clearHazards();
  const p = { x: 100, y: 260, w: 120, h: 16 };
  game.world.platforms.length = 0; game.world.platforms.push(p);
  Object.assign(game.world.player, { x: 120, y: 220, vy: 4, onGround: false });
  game.step();
  assert.equal(game.world.player.y, 224);
  assert.equal(game.world.player.onGround, true);
  Object.assign(game.world.player, { x: 120, y: 230, vy: -5, onGround: false });
  game.step();
  assert.equal(game.world.player.onGround, false);
  assert.ok(game.world.player.vy < 0);
});

test("falling into a gap is fatal", () => {
  const game = createGame();
  game.start(); game.clearHazards(); game.world.platforms.length = 0;
  game.until(() => game.state().state === "dead");
  assert.equal(game.state().playerAlive, false);
});

test("stomping defeats an enemy, scores once, and bounces; a side collision is fatal", () => {
  const game = createGame();
  game.start(); game.clearHazards();
  const enemy = { x: 100, y: 296, w: 44, h: 44, type: "moose", alive: true };
  game.world.enemies.push(enemy);
  Object.assign(game.world.player, { x: 100, y: 260, vy: 2, onGround: false });
  game.step();
  assert.equal(enemy.alive, false);
  assert.equal(game.state().score, 100);
  assert.equal(game.world.player.vy, -6.6);
  game.step();
  assert.equal(game.state().score, 100);

  const side = createGame();
  side.start(); side.clearHazards();
  side.world.enemies.push({ ...enemy, alive: true, x: 110 });
  side.step();
  assert.equal(side.state().state, "dead");
});

test("projectile collision is fatal and retry restores the complete level", () => {
  const game = createGame();
  game.start();
  const enemyCount = game.world.enemies.length;
  game.clearHazards();
  game.world.projectiles.push({
    x: 90, y: 309, w: 26, h: 7, vx: 0, vy: 0, life: 100, ptype: "laser"
  });
  game.step();
  assert.equal(game.state().state, "dead");
  game.step(91); game.press(); game.step(); game.release();
  assert.equal(game.state().state, "playing");
  assert.equal(game.state().playerX, 80);
  assert.equal(game.state().score, 0);
  assert.equal(game.world.enemies.length, enemyCount);
  assert.equal(game.world.projectiles.length, 0);
  assert.equal(game.world.particles.length, 0);
});

test("reaching the finish wins and Space returns to level selection", () => {
  const game = createGame();
  game.start(); game.clearHazards();
  game.world.player.x = 6380;
  game.step();
  assert.equal(game.state().state, "won");
  game.press(); game.step();
  assert.equal(game.state().state, "level_select");
  game.release();
  game.start();
  assert.equal(game.state().playerX, 80);
  assert.equal(game.state().score, 0);
});

test("60 Hz and 144 Hz displays advance equally; background pauses do not fast-forward", () => {
  const positions = [];
  for (const hz of [60, 144]) {
    const game = createGame();
    game.start(); game.clearHazards();
    for (let i = 1; i <= hz; i++) game.tick(i * 1000 / hz);
    positions.push(game.state().playerX);
    const beforePause = game.state().playerX;
    game.tick(11000);
    assert.ok(game.state().playerX - beforePause <= 6);
  }
  assert.ok(Math.abs(positions[0] - positions[1]) <= 3);
  assert.ok(positions[0] >= 257 && positions[0] <= 260);
});

test("all five levels start from the menu, with deterministic terrain on replay", () => {
  for (let level = 1; level <= 5; level++) {
    const game = createGame();
    game.click(80 + (level - 1) * 156, 195); game.step();
    assert.equal(game.state().state, "playing");
    assert.equal(game.state().currentLevel, level);
    const terrain = JSON.stringify(game.world.platforms);
    assert.ok(game.world.enemies.length > 0);
    game.press("Escape"); game.step();
    game.release("Escape");
    game.click(80 + (level - 1) * 156, 195); game.step();
    assert.equal(JSON.stringify(game.world.platforms), terrain);
    game.tick(17);
  }
});

test("character selection includes the original default and cycles through all choices", () => {
  const game = createGame();
  assert.equal(game.state().selectedCharacter, "porcupine");
  for (const character of ["pig", "hamster", "porcupine"]) {
    game.press("ArrowDown"); game.step(); game.release("ArrowDown");
    assert.equal(game.state().selectedCharacter, character);
    game.tick(17);
  }
});

test("Level 1 provides a safe opening, jumpable gaps, and four projectile throwers", () => {
  const game = createGame();
  game.start();
  assert.equal(game.world.enemies.length, 16);
  assert.equal(game.world.enemies.filter(e => e.type === "thrower").length, 4);
  assert.equal(game.world.platforms.filter(p => p.h === 16).length, 20);
  assert.ok(game.world.enemies.every(e => e.x >= 900));
  const ground = game.world.platforms.filter(p => p.h === 60);
  const gaps = [];
  for (let i = 1; i < ground.length; i++) {
    const width = ground[i].x - ground[i - 1].x - ground[i - 1].w;
    if (width) gaps.push(width);
  }
  assert.ok(gaps.length > 0);
  assert.ok(gaps.every(width => width <= 160));
  game.clearHazards(); game.step(120);
  assert.equal(game.state().state, "playing");
});

test("Level 4 lasers fire horizontally and can be jumped over", () => {
  const game = createGame();
  game.click(560, 195); game.step();
  const laser = game.world.enemies.find(e => e.type === "cyclops_laser");
  game.clearHazards(); game.world.enemies.push(laser);
  laser.x = 500; laser.shootTimer = 1;
  game.step();
  assert.equal(game.world.projectiles.length, 1);
  const beam = game.world.projectiles[0];
  assert.equal(beam.ptype, "laser");
  assert.equal(beam.vy, 0);
  const y = beam.y;
  game.step(10);
  assert.equal(beam.y, y);
  assert.ok(beam.x < 500);
  Object.assign(game.world.player, { x: beam.x - 3, y: y - 50, vy: 0 });
  game.step();
  assert.equal(game.state().state, "playing");
});
