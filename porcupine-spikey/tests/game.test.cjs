const assert = require("node:assert/strict");
const test = require("node:test");
const { createGame, platformerContract } = require("../../test/platformer-harness.cjs");

platformerContract("porcupine-spikey", "moose");

test("all five levels start from the menu, with deterministic terrain on replay", () => {
  for (let level = 1; level <= 5; level++) {
    const game = createGame("porcupine-spikey");
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
  const game = createGame("porcupine-spikey");
  assert.equal(game.state().selectedCharacter, "porcupine");
  for (const character of ["pig", "hamster", "porcupine"]) {
    game.press("ArrowDown"); game.step(); game.release("ArrowDown");
    assert.equal(game.state().selectedCharacter, character);
    game.tick(17);
  }
});

test("Level 1 provides a safe opening, jumpable gaps, and four projectile throwers", () => {
  const game = createGame("porcupine-spikey");
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
  const game = createGame("porcupine-spikey");
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
