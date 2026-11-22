const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { createGame: loadGame } = require("../../test/platformer-harness.cjs");

const createGame = () => loadGame(path.join(__dirname, ".."));

const winningJumpFrames = [
  279, 459, 515, 558, 602, 660, 727, 847, 878, 928, 973, 1025, 1093, 1224,
  1264, 1315, 1369, 1415, 1450, 1529, 1598, 1719, 1758, 1819, 1864, 1935, 1998, 2051
];
const difficultyReport = {
  schemaVersion: 2,
  game: "pandas-hideout",
  revision: process.env.GAME_TEST_REVISION || process.env.GITHUB_SHA || null,
  generatedAt: new Date().toISOString(),
  sourceSha256: {
    "index.html": createHash("sha256").update(fs.readFileSync(path.join(__dirname, "../index.html"))).digest("hex")
  },
  expectedMeasurements: winningJumpFrames.length,
  routes: [{
    id: "rainforest-keyboard",
    level: 1,
    character: "panda",
    input: "keyboard",
    seed: null,
    simulationStepMs: 1000 / 60,
    frameOrigin: "game starts from menu",
    baselineJumpFrames: winningJumpFrames,
    successCondition: "full win, all jump inputs grounded, all inputs used"
  }],
  measurements: []
};

test.after(() => {
  if (!process.env.GAME_TEST_REPORT) return;
  fs.mkdirSync(path.dirname(process.env.GAME_TEST_REPORT), { recursive: true });
  fs.writeFileSync(process.env.GAME_TEST_REPORT, JSON.stringify(difficultyReport, null, 2) + "\n");
});

function playRoute({ jumps = winningJumpFrames, character = 0, input = "keyboard", hz } = {}) {
  const game = createGame();
  for (let i = 0; i < character; i++) { game.press("ArrowDown"); game.step(); }
  game.start();
  const startFrame = game.world.frameCount;
  let jumpIndex = 0, groundedInputs = true;
  const inputs = [];
  for (let frame = 0; frame < (hz || 60) * 40 && game.state().state === "playing"; frame++) {
    if (jumpIndex < jumps.length && game.world.frameCount - startFrame >= jumps[jumpIndex]) {
      groundedInputs &&= game.world.player.onGround;
      inputs.push({ x: game.world.player.x, y: game.world.player.y });
      if (input === "keyboard") game.press();
      else game.tap(400, 200);
      jumpIndex++;
    }
    if (hz) game.tick((frame + 1) * 1000 / hz);
    else game.step();
    if (!hz || game.world.frameCount > startFrame + (jumps[jumpIndex - 1] ?? -1)) {
      game.release(); game.endTap();
    }
  }
  return {
    state: game.state(), inputs,
    won: game.state().state === "won" && groundedInputs && jumpIndex === jumps.length
  };
}

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

test("panda is the default and keyboard selection cycles through panda, skunk, and pig in both directions", () => {
  const game = createGame();
  assert.equal(game.state().selectedCharacter, "panda");
  for (const key of ["ArrowDown", "ArrowRight", "KeyS", "KeyD"]) {
    for (const character of ["skunk", "pig", "panda"]) {
      game.press(key); game.step();
      assert.equal(game.state().selectedCharacter, character);
    }
  }
  for (const key of ["ArrowUp", "ArrowLeft", "KeyW", "KeyA"]) {
    for (const character of ["pig", "skunk", "panda"]) {
      game.press(key); game.step();
      assert.equal(game.state().selectedCharacter, character);
    }
  }
  game.tick(17);
  assert.ok(game.drawnText.includes("Pig"));
});

test("all three character cards support click and tap, and selection persists on retry and menu return", () => {
  for (const input of ["click", "tap"]) {
    for (const [character, x] of [["panda", 260], ["skunk", 400], ["pig", 540]]) {
      const game = createGame();
      game[input](x, 190); game.step();
      assert.equal(game.state().selectedCharacter, character);
      game[input](400, 285); game.step();
      assert.equal(game.state().state, "playing");
      game.tick(17);
      game.clearHazards(); game.world.platforms.length = 0;
      game.until(() => game.state().state === "dead");
      game.step(91); game[input](400, 200); game.step();
      assert.equal(game.state().state, "playing");
      assert.equal(game.state().selectedCharacter, character);
      game.press("Escape"); game.step();
      assert.equal(game.state().state, "menu");
      assert.equal(game.state().selectedCharacter, character);
    }
  }
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

test("all three characters can complete the entire level with timed jumps, platforms, and live lasers", () => {
  for (const [index, character] of ["panda", "skunk", "pig"].entries()) {
    for (const input of ["keyboard", "tap"]) {
      const result = playRoute({ character: index, input });
      assert.equal(result.state.selectedCharacter, character);
      assert.ok(result.won, `${character} ${input} route did not win`);
      assert.equal(result.state.playerAlive, true);
    }
  }
});

test("measures jump timing on the live-hazard winning route", t => {
  const widths = [];
  const baseline = playRoute();
  for (let jump = 0; jump < winningJumpFrames.length; jump++) {
    const winsAt = offset => {
      const jumps = winningJumpFrames.map((frame, i) => frame + (i === jump ? offset : 0));
      return playRoute({ jumps }).won;
    };
    const measurement = {
      routeId: "rainforest-keyboard",
      inputId: `jump-${jump + 1}`,
      location: baseline.inputs[jump] || null,
      baselineFrame: winningJumpFrames[jump],
      baselineWon: baseline.won,
      sweepOffsetFrames: { minimum: -20, maximum: 20 },
      window: null
    };
    difficultyReport.measurements.push(measurement);
    assert.ok(baseline.won, `Baseline jump ${jump + 1} failed`);
    let early = 0, late = 0;
    while (early > -20 && winsAt(early - 1)) early--;
    while (late < 20 && winsAt(late + 1)) late++;
    const width = late - early;
    measurement.window = {
      earlyOffsetFrames: early,
      lateOffsetFrames: late,
      earliestFrame: winningJumpFrames[jump] + early,
      latestFrame: winningJumpFrames[jump] + late,
      earliestMs: (winningJumpFrames[jump] + early) * 1000 / 60,
      latestMs: (winningJumpFrames[jump] + late) * 1000 / 60,
      slackFrames: width,
      slackMs: width * 1000 / 60,
      clipped: early === -20 || late === 20
    };
    widths.push(width);
  }
  t.diagnostic(`Worst full-win jump slack: ${(Math.min(...widths) * 1000 / 60).toFixed(1)} ms; sweep capped at +/-20 frames`);
});

test("the full winning route works across common display rates", () => {
  for (const hz of [30, 60, 120, 144]) {
    assert.ok(playRoute({ hz }).won, `Full route failed at ${hz} Hz`);
  }
});
