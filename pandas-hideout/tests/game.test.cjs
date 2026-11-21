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
  const enemy = { x: 100, y: 296, w: 44, h: 44, type: "beetle", alive: true };
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

test("reaching the finish wins and Space returns to character selection", () => {
  const game = createGame();
  game.start(); game.clearHazards();
  game.world.player.x = 6380;
  game.step();
  assert.equal(game.state().state, "won");
  game.press(); game.step();
  assert.equal(game.state().state, "menu");
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

test("only panda and skunk are selectable; panda is the default and selection persists on retry", () => {
  const game = createGame();
  assert.equal(game.state().selectedCharacter, "panda");
  game.press("ArrowDown"); game.step();
  assert.equal(game.state().selectedCharacter, "skunk");
  game.press("ArrowDown"); game.step();
  assert.equal(game.state().selectedCharacter, "panda");
  game.tap(470, 190); game.step();
  assert.equal(game.state().selectedCharacter, "skunk");
  game.tap(400, 285); game.step();
  assert.equal(game.state().state, "playing");
  game.clearHazards(); game.world.platforms.length = 0;
  game.until(() => game.state().state === "dead");
  game.step(91); game.tap(400, 200); game.step();
  assert.equal(game.state().state, "playing");
  assert.equal(game.state().selectedCharacter, "skunk");
});

test("keyboard, click, and tap start the single level and jump", () => {
  for (const input of ["keyboard", "click", "tap"]) {
    const game = createGame();
    if (input === "keyboard") game.start();
    else { game[input](400, 285); game.step(); }
    assert.equal(game.state().currentLevel, 1);
    assert.equal(game.state().state, "playing");
    game.step();
    if (input === "keyboard") game.press();
    else game[input](400, 200);
    game.step();
    assert.ok(game.world.player.vy < 0);
    assert.ok(game.world.player.y < 304);
  }
});

test("rainforest terrain provides an introductory obstacle budget and safe enemy placement", () => {
  const game = createGame();
  game.start();
  assert.equal(game.world.finish.x, 6400);
  assert.equal(game.world.enemies.length, 16);
  assert.equal(game.world.enemies.filter(e => e.type === "laser").length, 4);
  assert.equal(game.world.platforms.filter(p => p.h === 16).length, 20);
  const gapWidths = world => {
    const ground = Array.from(world.platforms).filter(p => p.h === 60);
    return ground.slice(1).map((p, i) => p.x - ground[i].x - ground[i].w).filter(Boolean).sort((a, b) => a - b);
  };
  assert.deepEqual(gapWidths(game.world), [80, 80, 80, 80, 160]);
  assert.ok(game.world.enemies.every(e => e.x >= 900));
  for (const enemy of game.world.enemies) {
    for (let x = Math.floor(enemy.x / 80) * 80; x < enemy.x + enemy.w; x += 80) {
      assert.ok(game.world.platforms.some(p => p.h === 60 && p.x === x));
    }
  }
});

test("laser sentries warn before firing slow horizontal beams that can be avoided", () => {
  const game = createGame();
  game.start();
  const sentry = game.world.enemies.find(e => e.type === "laser");
  game.clearHazards(); game.world.enemies.push(sentry);
  sentry.x = 500; sentry.shootTimer = 30;
  game.tick(1);
  assert.ok(game.drawnText.includes("!"));
  game.step(29);
  assert.equal(game.world.projectiles.length, 0);
  game.step();
  const beam = game.world.projectiles[0];
  assert.ok(beam);
  assert.equal(beam.vx, -3);
  assert.equal(beam.vy, 0);
  const y = beam.y;
  game.step(10);
  assert.equal(beam.y, y);
  Object.assign(game.world.player, { x: beam.x - 3, y: y - 50, vy: 0 });
  game.step();
  assert.equal(game.state().state, "playing");
});

test("returning to the menu and replaying rebuilds the same single level", () => {
  const game = createGame();
  game.start();
  const terrain = JSON.stringify(game.world.platforms);
  game.press("Escape"); game.step();
  game.press("ArrowRight"); game.step();
  game.start();
  assert.equal(game.state().currentLevel, 1);
  assert.equal(JSON.stringify(game.world.platforms), terrain);
  game.tick(17);
  assert.ok(game.drawnText.includes("PANDA'S HIDEOUT"));
  assert.ok(!game.drawnText.some(text => /Level [2-5]/.test(text)));
});

test("both characters can complete the entire level with timed jumps, platforms, and live lasers", () => {
  const jumps = [
    923, 1472, 1622, 1730, 2072, 2264, 2672, 2741, 2873, 3173,
    3365, 3791, 3860, 4061, 4220, 4328, 4412, 4673, 4883, 5273,
    5363, 5522, 5630, 5873, 6065, 6242
  ];
  const outcomes = [];
  for (const character of ["panda", "skunk"]) {
    const game = createGame();
    if (character === "skunk") { game.press("ArrowDown"); game.step(); }
    game.start();
    let jumpIndex = 0, usedPlatforms = false, sawLasers = false;
    for (let frame = 0; frame < 2400 && game.state().state === "playing"; frame++) {
      const player = game.world.player;
      if (jumpIndex < jumps.length && player.x >= jumps[jumpIndex]) {
        assert.equal(player.onGround, true, `Jump at ${jumps[jumpIndex]} must be reachable`);
        game.press(); jumpIndex++;
      }
      game.step(); game.release();
      if (player.onGround && player.y + player.h < 340) usedPlatforms = true;
      if (game.world.projectiles.length) sawLasers = true;
    }
    assert.equal(game.state().state, "won");
    assert.equal(game.state().playerAlive, true);
    assert.equal(jumpIndex, jumps.length);
    assert.ok(usedPlatforms);
    assert.ok(sawLasers);
    assert.ok(game.state().score > 0);
    outcomes.push([game.state().playerX, game.state().score]);
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
});
