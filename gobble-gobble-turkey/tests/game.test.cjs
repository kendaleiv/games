const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createHash } = require("node:crypto");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function createGame({ render = true } = {}) {
  const canvasEvents = {};
  const documentEvents = {};
  const drawnText = [];
  const drawing = new Proxy({}, {
    get: (_, name) => name === "createLinearGradient"
      ? () => ({ addColorStop() {} })
      : name === "fillText"
        ? text => { drawnText.push(text); }
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
  const instrumented = script.replace(/\}\)\(\);\s*$/, 'window.testUpdate = update; })();');
  assert.notEqual(instrumented, script, "Could not instrument the race script");
  vm.runInNewContext(instrumented, {
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
      if (render) this.frame(1000 / 60);
      else window.testUpdate();
    },
    frame(milliseconds) { time += milliseconds; nextFrame(time); },
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
    instructions,
    drawnText
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

const holePositions = [500, 940, 1380, 1820, 2260, 2700, 3140];
const difficultyReport = {
  schemaVersion: 2,
  game: "gobble-gobble-turkey",
  revision: process.env.GAME_TEST_REVISION || process.env.GITHUB_SHA || null,
  generatedAt: new Date().toISOString(),
  sourceSha256: { "index.html": createHash("sha256").update(html).digest("hex") },
  expectedMeasurements: holePositions.length,
  routes: [],
  measurements: []
};

test.after(() => {
  if (!process.env.GAME_TEST_REPORT) return;
  fs.mkdirSync(path.dirname(process.env.GAME_TEST_REPORT), { recursive: true });
  fs.writeFileSync(process.env.GAME_TEST_REPORT, JSON.stringify(difficultyReport, null, 2) + "\n");
});

function race({ offsets = [], missed = -1 } = {}) {
  const game = createGame({ render: false });
  game.press();
  game.until(() => game.state().state === "racing");
  let nextHole = 0;
  const inputs = [];
  for (let frame = 0; frame < 2000 && game.state().state !== "finished"; frame++) {
    if (nextHole < holePositions.length &&
        game.state().playerX >= holePositions[nextHole] - 12 + (offsets[nextHole] || 0) * 3) {
      if (nextHole !== missed) {
        inputs.push({ frame, x: game.state().playerX, heightAboveGround: game.state().playerY });
        game.tap();
      }
      nextHole++;
    }
    game.step();
  }
  assert.equal(game.state().state, "finished", "Race did not finish");
  return { ...game.state(), inputs };
}

test("measures per-hole jump timing on a complete winning route", t => {
  const windows = [];
  const baseline = race();
  difficultyReport.routes.push({
    id: "zero-hit-race",
    level: 1,
    input: "pointer",
    seed: null,
    simulationStepMs: 1000 / 60,
    frameOrigin: "race begins after countdown",
    baselineInputs: baseline.inputs,
    successCondition: "pig wins, seven jumps, no holes hit"
  });
  for (let hole = 0; hole < holePositions.length; hole++) {
    const successful = new Set();
    for (let offset = -20; offset <= 8; offset++) {
      const offsets = [];
      offsets[hole] = offset;
      const result = race({ offsets });
      if (result.holesHit === 0 && result.winner === "pig" && result.jumps === 7) successful.add(offset);
    }
    const measurement = {
      routeId: "zero-hit-race",
      inputId: `hole-${hole + 1}`,
      location: { x: holePositions[hole] },
      baselineFrame: baseline.inputs[hole]?.frame ?? null,
      baselineWon: successful.has(0),
      sweepOffsetFrames: { minimum: -20, maximum: 8 },
      window: null
    };
    difficultyReport.measurements.push(measurement);
    assert.ok(successful.has(0), `Baseline jump at hole ${holePositions[hole]} failed`);
    let early = 0, late = 0;
    while (successful.has(early - 1)) early--;
    while (successful.has(late + 1)) late++;
    measurement.window = {
      earlyOffsetFrames: early,
      lateOffsetFrames: late,
      earliestFrame: measurement.baselineFrame + early,
      latestFrame: measurement.baselineFrame + late,
      earliestMs: (measurement.baselineFrame + early) * 1000 / 60,
      latestMs: (measurement.baselineFrame + late) * 1000 / 60,
      slackFrames: late - early,
      slackMs: (late - early) * 1000 / 60,
      clipped: early === -20 || late === 8
    };
    windows.push(`${holePositions[hole]}: ${early}..${late} frames`);
  }
  t.diagnostic(`Full-win, zero-hole-hit jump windows relative to the route: ${windows.join("; ")}`);
});

test("the pig can still win after missing any one of the seven holes", () => {
  for (let missed = 0; missed < holePositions.length; missed++) {
    const result = race({ missed });
    assert.equal(result.holesHit, 1, `Only the skipped hole at ${holePositions[missed]} should be hit`);
    assert.equal(result.winner, "pig", `One mistake at ${holePositions[missed]} must be recoverable`);
    assert.equal(result.jumps, 6);
  }
});

test("timed-input wins work across display rates and a background pause does not advance the race", () => {
  const finishes = [];
  for (const hz of [30, 60, 120, 144]) {
    const game = createGame();
    game.press();
    game.until(() => game.state().state === "racing");
    let nextHole = 0;
    for (let frame = 0; frame < hz * 25 && game.state().state !== "finished"; frame++) {
      if (nextHole < holePositions.length && game.state().playerX >= holePositions[nextHole] - 12) {
        game.press(); nextHole++;
      }
      game.frame(1000 / hz);
    }
    assert.equal(game.state().winner, "pig", `${hz} Hz route failed`);
    assert.equal(game.state().holesHit, 0);
    finishes.push(game.state().playerX);
  }
  assert.ok(Math.max(...finishes) - Math.min(...finishes) <= 3);
  const paused = createGame();
  paused.press();
  paused.until(() => paused.state().state === "racing");
  const before = paused.state().playerX;
  paused.frame(10000);
  assert.ok(paused.state().playerX - before <= 6, "Background pause fast-forwarded the race");
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
  for (const holeX of [500, 940, 1380, 1820, 2260, 2700, 3140]) {
    game.until(() => game.state().playerX >= holeX - 12);
    game.tap();
    game.until(() => game.state().playerY > 0);
    game.until(() => game.state().playerY === 0);
    assert.equal(game.state().holesHit, 0);
  }
  game.until(() => game.state().state === "finished");
  assert.equal(game.state().winner, "pig");
  assert.equal(game.state().jumps, 7);
  assert.ok(game.drawnText.some(text => /Holes avoided: 7\/7$/.test(text)));
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
