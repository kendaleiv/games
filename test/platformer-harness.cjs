const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function createGame(folder) {
  const html = fs.readFileSync(path.join(__dirname, "..", folder, "index.html"), "utf8");
  const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const documentEvents = {}, canvasEvents = {};
  const drawnText = [];
  const drawing = new Proxy({}, {
    get: (_, name) => name === "createLinearGradient"
      ? () => ({ addColorStop() {} })
      : name === "fillText"
        ? text => drawnText.push(text)
        : () => {}
  });
  const canvas = {
    style: {},
    getContext: () => drawing,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }),
    addEventListener: (name, handler) => { canvasEvents[name] = handler; }
  };
  const window = { innerWidth: 806, innerHeight: 450, addEventListener() {} };
  let nextFrame;
  // Instrument only the test copy; no mutable testing API ships to browsers.
  const instrumented = source.replace(/\}\)\(\);\s*$/, `
    window.testWorld = {
      player, platforms, enemies, projectiles, particles, camera, finish,
      update, get frameCount() { return frameCount; }
    };
  })();`);
  assert.notEqual(instrumented, source, "Could not instrument the game script");
  vm.runInNewContext(instrumented, {
    window,
    document: {
      getElementById: id => id === "gameCanvas" ? canvas : { offsetHeight: 38 },
      addEventListener: (name, handler) => { documentEvents[name] = handler; },
      documentElement: {}
    },
    requestAnimationFrame: callback => { nextFrame = callback; }
  });
  nextFrame(0);
  return {
    world: window.testWorld,
    drawnText,
    state: () => window._gameState(),
    step(count = 1) { for (let i = 0; i < count; i++) window.testWorld.update(); },
    tick: timestamp => nextFrame(timestamp),
    press(code = "Space") { documentEvents.keydown({ code, preventDefault() {} }); },
    release(code = "Space") { documentEvents.keyup({ code }); },
    click(x, y) {
      const handler = canvasEvents.pointerdown || canvasEvents.click;
      handler({ clientX: x, clientY: y, preventDefault() {} });
    },
    tap(x, y) {
      if (canvasEvents.pointerdown) this.click(x, y);
      else canvasEvents.touchstart({ touches: [{ clientX: x, clientY: y }], preventDefault() {} });
    },
    start() { this.press("Enter"); this.step(); },
    clearHazards() { window.testWorld.enemies.length = 0; window.testWorld.projectiles.length = 0; },
    until(predicate, limit = 2500) {
      for (let i = 0; i < limit && !predicate(); i++) this.step();
      assert.ok(predicate(), "Game did not reach the expected state");
    }
  };
}

function platformerContract(folder, stationaryType) {
  test("auto-runs at the original speed; jumps obey gravity and cannot repeat in midair", () => {
    const game = createGame(folder);
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
    const game = createGame(folder);
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
    const game = createGame(folder);
    game.start(); game.clearHazards(); game.world.platforms.length = 0;
    game.until(() => game.state().state === "dead");
    assert.equal(game.state().playerAlive, false);
  });

  test("stomping defeats an enemy, scores once, and bounces; a side collision is fatal", () => {
    const game = createGame(folder);
    game.start(); game.clearHazards();
    const enemy = { x: 100, y: 296, w: 44, h: 44, type: stationaryType, alive: true };
    game.world.enemies.push(enemy);
    Object.assign(game.world.player, { x: 100, y: 260, vy: 2, onGround: false });
    game.step();
    assert.equal(enemy.alive, false);
    assert.equal(game.state().score, 100);
    assert.equal(game.world.player.vy, -6.6);
    game.step();
    assert.equal(game.state().score, 100);

    const side = createGame(folder);
    side.start(); side.clearHazards();
    side.world.enemies.push({ ...enemy, alive: true, x: 110 });
    side.step();
    assert.equal(side.state().state, "dead");
  });

  test("projectile collision is fatal and retry restores the complete level", () => {
    const game = createGame(folder);
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

  test("reaching the finish wins and Space returns to the selection screen", () => {
    const game = createGame(folder);
    game.start(); game.clearHazards();
    game.world.player.x = 6380;
    game.step();
    assert.equal(game.state().state, "won");
    game.press(); game.step();
    assert.ok(["menu", "level_select"].includes(game.state().state));
    game.release();
    game.start();
    assert.equal(game.state().playerX, 80);
    assert.equal(game.state().score, 0);
  });

  test("60 Hz and 144 Hz displays advance equally; background pauses do not fast-forward", () => {
    const positions = [];
    for (const hz of [60, 144]) {
      const game = createGame(folder);
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
}

module.exports = { createGame, platformerContract };
