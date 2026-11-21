const assert = require("node:assert/strict");
const test = require("node:test");
const { createGame, platformerContract } = require("../../test/platformer-harness.cjs");

platformerContract("pandas-hideout", "beetle");

test("only panda and skunk are selectable; panda is the default and selection persists on retry", () => {
  const game = createGame("pandas-hideout");
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
    const game = createGame("pandas-hideout");
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

test("new terrain matches Level 1's obstacle budget without copying its layout", () => {
  const original = createGame("porcupine-spikey"), game = createGame("pandas-hideout");
  original.start(); game.start();
  assert.notEqual(JSON.stringify(game.world.platforms), JSON.stringify(original.world.platforms));
  assert.equal(game.world.finish.x, original.world.finish.x);
  assert.equal(game.world.enemies.length, original.world.enemies.length);
  assert.equal(game.world.enemies.filter(e => e.type === "laser").length, 4);
  assert.equal(game.world.platforms.filter(p => p.h === 16).length, 20);
  const gapWidths = world => {
    const ground = Array.from(world.platforms).filter(p => p.h === 60);
    return ground.slice(1).map((p, i) => p.x - ground[i].x - ground[i].w).filter(Boolean).sort();
  };
  assert.deepEqual(gapWidths(game.world), gapWidths(original.world));
  assert.ok(game.world.enemies.every(e => e.x >= 900));
  for (const enemy of game.world.enemies) {
    for (let x = Math.floor(enemy.x / 80) * 80; x < enemy.x + enemy.w; x += 80) {
      assert.ok(game.world.platforms.some(p => p.h === 60 && p.x === x));
    }
  }
});

test("laser sentries warn before firing slow horizontal beams that can be avoided", () => {
  const game = createGame("pandas-hideout");
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
  const game = createGame("pandas-hideout");
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
    const game = createGame("pandas-hideout");
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
