const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createGame(directory) {
  const html = fs.readFileSync(path.join(directory, "index.html"), "utf8");
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

module.exports = { createGame };
