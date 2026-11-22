const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { createGame: loadGame } = require("../../test/platformer-harness.cjs");

const createGame = () => loadGame(path.join(__dirname, ".."));

// Frame offsets after selecting a level; each route keeps all hazards intact.
const winningRoutes = [
  [245, 512, 647, 874, 1019, 1085, 1244, 1379, 1454, 1510, 1614, 1711, 1812, 1877, 1919],
  [200, 247, 361, 439, 515, 553, 700, 747, 941, 1009, 1052, 1111, 1153, 1245, 1318, 1409, 1450, 1594, 1645, 1809, 1852, 1933, 1992],
  [212, 301, 412, 604, 646, 688, 778, 848, 1029, 1105, 1288, 1339, 1415, 1611, 1688, 1735, 1912, 1988],
  [248, 300, 356, 397, 443, 550, 614, 709, 756, 802, 851, 944, 1018, 1058, 1112, 1156, 1197, 1250, 1366, 1514, 1574, 1644, 1735, 1805, 1850, 1911, 1950],
  [595, 729, 1379, 1569, 1906]
];
const difficultyReport = {
  schemaVersion: 2,
  game: "porcupine-spikey",
  revision: process.env.GAME_TEST_REVISION || process.env.GITHUB_SHA || null,
  generatedAt: new Date().toISOString(),
  sourceSha256: {
    "index.html": createHash("sha256").update(fs.readFileSync(path.join(__dirname, "../index.html"))).digest("hex")
  },
  expectedMeasurements: winningRoutes.reduce((count, route) => count + route.length, 0),
  routes: winningRoutes.map((route, i) => ({
    id: `level-${i + 1}-keyboard`,
    level: i + 1,
    character: "porcupine",
    input: "keyboard",
    seed: null,
    simulationStepMs: 1000 / 60,
    frameOrigin: "level selected from menu",
    baselineJumpFrames: route,
    successCondition: "full win, all jump inputs grounded, all inputs used"
  })),
  measurements: []
};

test.after(() => {
  if (!process.env.GAME_TEST_REPORT) return;
  fs.mkdirSync(path.dirname(process.env.GAME_TEST_REPORT), { recursive: true });
  fs.writeFileSync(process.env.GAME_TEST_REPORT, JSON.stringify(difficultyReport, null, 2) + "\n");
});

function playRoute({ level, jumps = winningRoutes[level - 1], character = 0, input = "keyboard", hz } = {}) {
  const game = createGame();
  for (let i = 0; i < character; i++) { game.press("ArrowDown"); game.step(); game.release("ArrowDown"); }
  game.click(80 + (level - 1) * 156, 195); game.step();
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

test("all five complete levels are winnable by every character using keyboard or touch with live hazards", () => {
  for (let level = 1; level <= winningRoutes.length; level++) {
    for (const [character, name] of ["porcupine", "pig", "hamster"].entries()) {
      for (const input of ["keyboard", "tap"]) {
        const result = playRoute({ level, character, input });
        assert.equal(result.state.selectedCharacter, name);
        assert.ok(result.won, `Level ${level}, ${name}, ${input} did not win`);
        assert.equal(result.state.playerAlive, true);
      }
    }
  }
});

test("measures full-win jump timing for each level", t => {
  for (let level = 1; level <= winningRoutes.length; level++) {
    const route = winningRoutes[level - 1], widths = [];
    const baseline = playRoute({ level });
    for (let jump = 0; jump < route.length; jump++) {
      const winsAt = offset => {
        const jumps = route.map((frame, i) => frame + (i === jump ? offset : 0));
        return playRoute({ level, jumps }).won;
      };
      const measurement = {
        routeId: `level-${level}-keyboard`,
        inputId: `jump-${jump + 1}`,
        location: baseline.inputs[jump] || null,
        baselineFrame: route[jump],
        baselineWon: baseline.won,
        sweepOffsetFrames: { minimum: -30, maximum: 30 },
        window: null
      };
      difficultyReport.measurements.push(measurement);
      assert.ok(baseline.won, `Level ${level}, jump ${jump + 1} baseline is no longer winnable`);
      let early = 0, late = 0;
      while (early > -30 && winsAt(early - 1)) early--;
      while (late < 30 && winsAt(late + 1)) late++;
      const width = late - early;
      measurement.window = {
        earlyOffsetFrames: early,
        lateOffsetFrames: late,
        earliestFrame: route[jump] + early,
        latestFrame: route[jump] + late,
        earliestMs: (route[jump] + early) * 1000 / 60,
        latestMs: (route[jump] + late) * 1000 / 60,
        slackFrames: width,
        slackMs: width * 1000 / 60,
        clipped: early === -30 || late === 30
      };
      widths.push(width);
    }
    t.diagnostic(`Level ${level}: worst full-win slack ${(Math.min(...widths) * 1000 / 60).toFixed(1)} ms`);
  }
});

test("the introductory and seesaw winning routes work across common display rates", () => {
  for (const level of [1, 5]) {
    for (const hz of [30, 60, 120, 144]) {
      assert.ok(playRoute({ level, hz }).won, `Level ${level} route failed at ${hz} Hz`);
    }
  }
});
