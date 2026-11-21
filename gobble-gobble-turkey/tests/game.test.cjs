const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function createGame() {
  const canvasEvents = {};
  const documentEvents = {};
  const drawing = new Proxy({}, {
    get: (_, name) => name === "createLinearGradient"
      ? () => ({ addColorStop() {} })
      : () => {}
  });
  const canvas = {
    style: {},
    getContext: () => drawing,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    addEventListener: (name, handler) => { canvasEvents[name] = handler; }
  };
  const instructions = { offsetHeight: 36, innerHTML: "" };
  const window = { innerWidth: 960, innerHeight: 576, addEventListener() {} };
  let nextFrame;
  let time = 0;
  vm.runInNewContext(script, {
    window,
    document: {
      getElementById: id => id === "gameCanvas" ? canvas : instructions,
      addEventListener: (name, handler) => { documentEvents[name] = handler; }
    },
    requestAnimationFrame: callback => { nextFrame = callback; }
  });
  nextFrame(time);
  return {
    state: () => window._gameState(),
    step() {
      time += 1000 / 60;
      nextFrame(time);
    },
    until(predicate, limit = 2000) {
      for (let i = 0; i < limit && !predicate(); i++) this.step();
      assert.ok(predicate(), "Game did not reach the expected state");
    },
    press(code = "Space", repeat = false) {
      documentEvents.keydown({ code, repeat, preventDefault() {} });
    },
    tap() {
      canvasEvents.pointerdown({ clientX: 400, clientY: 300, preventDefault() {} });
    },
    instructions
  };
}

test("runs without input and automatically recovers from holes", () => {
  const game = createGame();
  game.tap();
  game.until(() => game.state().state === "racing");
  const start = game.state().playerX;
  game.until(() => game.state().playerX > start + 100);
  assert.equal(game.state().playerSpeed, 3);
  assert.equal(game.state().jumps, 0);
  game.until(() => game.state().holeRecovery > 0);
  const fallenX = game.state().playerX;
  game.until(() => game.state().holeRecovery === 0);
  assert.ok(game.state().playerX > fallenX);
  game.until(() => game.state().playerSpeed === 3);
  game.until(() => game.state().state === "finished");
  assert.ok(game.state().holesHit > 3);
  assert.equal(game.state().winner, "turkey");
});

test("tap, click, Space, and Enter jump immediately without speed boosts or air jumps", () => {
  for (const action of ["tap", "Space", "Enter"]) {
    const game = createGame();
    game.press();
    game.until(() => game.state().state === "racing");
    const jump = () => action === "tap" ? game.tap() : game.press(action);
    jump();
    assert.equal(game.state().jumps, 1);
    jump();
    assert.equal(game.state().jumps, 1);
    game.until(() => game.state().playerY > 0);
    assert.equal(game.state().playerSpeed, 3);
    jump();
    assert.equal(game.state().jumps, 1);
    game.until(() => game.state().playerY === 0);
    game.press("Space", true);
    game.step();
    assert.equal(game.state().jumps, 1);
    assert.equal(game.state().playerY, 0);
    jump();
    assert.equal(game.state().jumps, 2);
  }
});

test("timed jumps clear every hole, win the race, and reset on replay", () => {
  const game = createGame();
  game.press("Enter");
  game.press();
  assert.equal(game.state().jumps, 0);
  game.until(() => game.state().state === "racing");
  for (const holeX of [500, 740, 980, 1220, 1460, 1700, 1940, 2180, 2420, 2660, 2900, 3140]) {
    game.until(() => game.state().playerX >= holeX - 12);
    game.tap();
    game.until(() => game.state().playerY > 0);
    game.until(() => game.state().playerY === 0);
    assert.equal(game.state().holesHit, 0);
  }
  game.until(() => game.state().state === "finished");
  assert.equal(game.state().winner, "pig");
  assert.equal(game.state().jumps, 12);
  assert.match(game.instructions.innerHTML, /race again/);
  game.press("Enter");
  assert.equal(game.state().state, "countdown");
  assert.equal(game.state().playerX, 130);
  assert.equal(game.state().jumps, 0);
  assert.equal(game.state().holesHit, 0);
});

test("jump input cannot interrupt hole recovery", () => {
  const game = createGame();
  game.tap();
  game.until(() => game.state().holeRecovery > 0);
  game.tap();
  game.press("Enter");
  game.step();
  assert.equal(game.state().jumps, 0);
  assert.equal(game.state().playerY, 0);
  assert.ok(game.state().holeRecovery > 0);
  assert.ok(game.state().playerSpeed < 3);
});
