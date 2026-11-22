const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Game, DUNGEONS, TILE, point } = require('../engine.js');

const difficultyReport = {
  schemaVersion: 2,
  game: 'grass-adventure',
  revision: process.env.GAME_TEST_REVISION || process.env.GITHUB_SHA || null,
  generatedAt: new Date().toISOString(),
  sourceSha256: {
    'engine.js': createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../engine.js'))).digest('hex')
  },
  expectedMeasurements: 1,
  routes: [{
    id: 'safe-full-adventure',
    input: 'movement, sword, jump, shield, interact',
    seed: null,
    simulationStepMs: 20,
    strategy: 'safe tile paths; sword every 400 ms; nearby-enemy jump every 800 ms',
    successCondition: 'six-dungeon win without retries'
  }, {
    id: 'stormkeep-lightning',
    level: 6,
    input: 'jump',
    seed: null,
    simulationStepMs: 20,
    frameOrigin: 'lightning warning begins',
    successCondition: 'no hearts lost to actual lightning, no shield or spawn invincibility'
  }],
  measurements: [],
  runs: []
};

test.after(() => {
  if (!process.env.GAME_TEST_REPORT) return;
  fs.mkdirSync(path.dirname(process.env.GAME_TEST_REPORT), { recursive: true });
  fs.writeFileSync(process.env.GAME_TEST_REPORT, JSON.stringify(difficultyReport, null, 2) + '\n');
});

function step(game, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds / .02); i++) game.tick(.02, input);
}
function standBy(game, object) {
  Object.assign(game.player, { x: object.x, y: object.y + 30, facing: { x: 0, y: -1 }, cooldown: 0 });
}

function trackDamage(game) {
  let total = 0;
  const applyDamage = game.damage.bind(game);
  game.damage = (...args) => {
    const previousHp = game.player.hp;
    const result = applyDamage(...args);
    total += Math.max(0, previousHp - game.player.hp);
    return result;
  };
  return () => total;
}

test('hero starts unarmed and earns a sword and rupees by talking indoors', () => {
  const g = new Game();
  assert.equal(g.player.sword, false);
  assert.equal(g.enterDungeon(1), false);
  standBy(g, g.objects.find(o => o.destination === 'elder'));
  g.interact();
  assert.equal(g.room, 'elder');
  standBy(g, g.objects.find(o => o.type === 'npc'));
  g.interact();
  assert.equal(g.player.sword, true);
  assert.equal(g.player.rupees, 20);
  g.interact();
  assert.equal(g.player.rupees, 20, 'sword gift is not repeatable');
});

test('world layout is deterministic and movement collides with walls', () => {
  const a = new Game(), b = new Game();
  assert.deepEqual(a.tiles, b.tiles);
  assert.deepEqual(a.objects, b.objects);
  assert.ok(a.width * TILE > 1500);
  Object.assign(a.player, point(1, 3));
  step(a, 2, { x: -1 });
  assert.ok(a.player.x >= TILE + 7);
  assert.equal(a.player.hp, 3);
});

test('diagonal movement is normalized and oversized frame deltas are capped', () => {
  const a = new Game(), b = new Game();
  Object.assign(a.player, point(10, 31));
  Object.assign(b.player, point(10, 31));
  step(a, .1, { x: 1 });
  step(b, .1, { x: 1, y: 1 });
  const origin = point(10, 31);
  assert.ok(Math.abs(Math.hypot(a.player.x - origin.x, a.player.y - origin.y) - Math.hypot(b.player.x - origin.x, b.player.y - origin.y)) < .01);
  a.tick(100);
  assert.ok(a.elapsed < .2);
});

test('dungeon progression, keys, guardians and heart rewards obey the progression rules', () => {
  const g = new Game();
  g.player.sword = true;
  assert.equal(g.enterDungeon(2), false);
  for (let id = 1; id <= 6; id++) {
    assert.equal(g.enterDungeon(id), true);
    const gate = g.objects.find(o => o.type === 'gate');
    assert.equal(g.solid(gate.x, gate.y), true);
    const pot = g.objects.find(o => o.key);
    standBy(g, pot);
    g.attack();
    assert.equal(g.key, true);
    assert.equal(g.solid(gate.x, gate.y), false);
    const boss = g.enemies.find(e => e.boss);
    const hits = boss.hp;
    assert.equal(id === 6 ? hits : hits > 0, id === 6 ? 20 : true);
    standBy(g, boss);
    for (let i = 0; i < hits; i++) { g.player.cooldown = 0; g.attack(); }
    assert.ok(boss.hp <= 0);
    const seal = g.objects.find(o => o.type === 'seal');
    Object.assign(g.player, { x: seal.x, y: seal.y });
    g.tick(.02);
    assert.ok(g.completed.includes(id));
    assert.equal(g.player.maxHp, 3 + id);
    assert.equal(g.player.hp, g.player.maxHp);
    g.collectSeal(seal);
    assert.equal(g.player.maxHp, 3 + id, 'rewards cannot be collected twice');
  }
  assert.equal(g.mode, 'won');
  assert.equal(g.player.maxHp, 9);
  assert.ok(g.player.iceSword && g.player.frozenShield && g.player.fins);
});

test('ice sword freezes regular enemies, while the boss still takes twenty swings', () => {
  const g = new Game();
  g.player.sword = g.player.iceSword = true;
  g.enterDungeon(6, true);
  const enemy = g.enemies.find(e => !e.boss);
  standBy(g, enemy);
  g.attack();
  assert.equal(enemy.frozen, 2);
  const boss = g.enemies.find(e => e.boss);
  standBy(g, boss);
  g.player.cooldown = 0;
  g.attack();
  assert.equal(boss.hp, 19);
  assert.equal(boss.frozen, 0);
  g.attack();
  assert.equal(boss.hp, 19, 'attack cooldown prevents instant multi-hits');
});

test('jumping avoids hazards; bridges and ladders are safe; fins allow swimming', () => {
  const g = new Game();
  g.player.sword = true;
  g.enterDungeon(5, true);
  const safe = point(4, 15);
  g.safe = safe;
  Object.assign(g.player, point(4, 13), { invincible: 0 });
  g.jump();
  g.tick(.02);
  assert.equal(g.player.hp, 3);
  g.player.jump = 0;
  g.tick(.02);
  assert.equal(g.player.hp, 2);
  assert.equal(g.player.y, safe.y);
  Object.assign(g.player, point(7, 13), { invincible: 0 });
  g.tick(.02);
  assert.equal(g.player.hp, 2);
  g.loadWorld();
  g.player.fins = true;
  Object.assign(g.player, point(34, 20), { invincible: 0 });
  g.tick(.02);
  assert.equal(g.player.hp, 2);
});

test('ice momentum persists and clocks are optional with no timeout', () => {
  const g = new Game();
  g.player.sword = true;
  g.enterDungeon(2, true);
  step(g, .4, { x: 1 });
  const vx = g.player.vx;
  g.tick(.02);
  assert.ok(g.player.vx > vx * .8);
  g.elapsed = 100;
  const clock = g.objects.find(o => o.type === 'clock');
  Object.assign(g.player, { x: clock.x, y: clock.y, vx: 0, vy: 0 });
  g.tick(.02);
  assert.ok(g.elapsed < 71);
  assert.equal(g.mode, 'playing');
});

test('wood shield breaks against skeletons but frozen shield blocks lightning', () => {
  const g = new Game();
  const p = g.player;
  p.shield = p.guarding = true;
  p.invincible = 0;
  g.damage(1, 'skeleton');
  assert.equal(p.shield, false);
  p.frozenShield = true;
  p.invincible = 0;
  g.damage(2, 'bolt');
  assert.equal(p.hp, 3);
  assert.equal(p.frozenShield, true);
  p.guarding = false;
  p.invincible = 0;
  g.damage(2, 'bolt');
  assert.equal(p.hp, 1);
});

test('shops charge currency, bombs break pots and reveal a usable secret shortcut', () => {
  const g = new Game();
  g.player.sword = true;
  g.player.rupees = 120;
  assert.equal(g.buy('bombs'), false, 'cannot buy outside the shop');
  g.loadHouse('shop');
  assert.equal(g.buy('shield'), true);
  assert.equal(g.buy('shield'), false);
  assert.equal(g.buy('bombs'), true);
  assert.equal(g.player.rupees, 0);
  assert.equal(g.player.bombs, 100);
  assert.equal(g.buy('potion'), false);
  g.loadWorld();
  const secret = g.objects.find(o => o.type === 'secret');
  standBy(g, secret);
  g.bomb();
  assert.equal(g.secretOpen, true);
  assert.equal(g.player.bombs, 99);
  g.interact();
  assert.equal(g.room, 6);
  assert.equal(g.key, true);
  assert.equal(g.enemies.find(e => e.boss).hp, 20);
});

test('ABC reveals the shortcut without money, but still requires a sword', () => {
  const g = new Game('ABC');
  assert.equal(g.secretOpen, true);
  standBy(g, g.objects.find(o => o.type === 'secret'));
  g.interact();
  assert.equal(g.room, 'world');
  g.player.sword = true;
  g.interact();
  assert.equal(g.room, 6);
});

test('arcade apples hit targets and award a single prize per target', () => {
  const g = new Game();
  g.player.sword = true;
  g.loadHouse('arcade');
  const target = g.objects.find(o => o.type === 'target');
  standBy(g, target);
  for (let i = 0; i < 3; i++) { g.attack(); step(g, .4); }
  assert.equal(target.hits, 3);
  assert.equal(g.player.rupees, 100);
  g.attack();
  step(g, .4);
  assert.equal(g.player.rupees, 100);
});

test('defeat offers immediate retry preserving progress and equipment', () => {
  const g = new Game();
  g.completed = [1, 2];
  g.player.sword = g.player.iceSword = true;
  g.player.maxHp = 5;
  g.player.rupees = 50;
  g.player.invincible = 0;
  g.damage(3);
  assert.equal(g.mode, 'defeated');
  const elapsed = g.elapsed;
  step(g, 10);
  assert.equal(g.elapsed, elapsed);
  g.retry();
  assert.equal(g.mode, 'playing');
  assert.equal(g.player.hp, 5);
  assert.equal(g.player.sword, true);
  assert.equal(g.player.rupees, 50);
  assert.deepEqual(g.completed, [1, 2]);
});

test('save/resume validates stored values and preserves earned items', () => {
  const g = new Game('Leaf');
  g.completed = [1, 2, 4];
  g.player.sword = true;
  g.player.bombs = 100;
  const restored = new Game('ignored', g.save());
  assert.equal(restored.name, 'Leaf');
  assert.equal(restored.player.maxHp, 6);
  assert.ok(restored.player.iceSword && restored.player.frozenShield && restored.player.fins);
  assert.equal(restored.player.bombs, 100);
  const bad = new Game('Safe', { version: 1, name: {}, completed: [1, 1, 9, '2', null], rupees: -100, bombs: Infinity, elapsed: 'wrong', shield: 'yes' });
  assert.deepEqual(bad.completed, [1]);
  assert.equal(bad.player.rupees, 0);
  assert.equal(bad.player.bombs, 0);
  assert.equal(bad.player.shield, false);
  assert.equal(bad.elapsed, 0);
  g.completed.push(6);
  g.mode = 'playing';
  assert.equal(new Game('ignored', g.save()).mode, 'won', 'continued exploration preserves victory');
});

test('lightning has a visible warning before projectiles appear', () => {
  const g = new Game();
  g.player.sword = true;
  g.enterDungeon(6, true);
  const boss = g.enemies.find(e => e.boss);
  boss.cooldown = 0;
  g.tick(.02);
  assert.ok(boss.charge > 0);
  assert.equal(g.projectiles.length, 0);
  step(g, 1.05);
  assert.ok(g.projectiles.length > 0);
  assert.ok(g.player.hp > 0, 'warning gives time to react');
});

test('distant guardians do not fire before the hero can see their warning', () => {
  const g = new Game();
  g.player.sword = true;
  g.enterDungeon(6, true);
  const boss = g.enemies.find(e => e.boss);
  Object.assign(g.player, point(17, 6));
  boss.cooldown = 0;
  g.tick(.02);
  assert.equal(boss.charge, 0);
  assert.equal(g.projectiles.length, 0);
});

test('every dungeon has a traversable route from entry to key and guardian', () => {
  for (let id = 1; id <= DUNGEONS.length; id++) {
    const g = new Game();
    g.player.sword = true;
    g.enterDungeon(id, true);
    g.key = false;
    const key = g.objects.find(o => o.key);
    function reachable(start, destination) {
      const queue = [start], seen = new Set();
      for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i], index = `${x},${y}`;
        if (seen.has(index)) continue;
        seen.add(index);
        if (x === destination[0] && y === destination[1]) return true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const pos = point(x + dx, y + dy);
          if (!g.solid(pos.x, pos.y) && !['water', 'lava', 'bramble'].includes(g.tileAt(pos.x, pos.y))) queue.push([x + dx, y + dy]);
        }
      }
      return false;
    }
    const keyTile = [Math.floor(key.x / TILE), Math.floor(key.y / TILE) + 1];
    assert.equal(reachable([3, 20], keyTile), true, `dungeon ${id} key accessible without damage`);
    g.key = true;
    const boss = g.enemies.find(e => e.boss);
    assert.equal(reachable(keyTile, [Math.floor(boss.x / TILE), Math.floor(boss.y / TILE) + 1]), true, `dungeon ${id} guardian accessible`);
  }
});

test('playthrough damage accounting includes a hit on the same tick as a heart pickup', () => {
  const g = new Game();
  g.player.sword = true;
  g.enterDungeon(1, true);
  const damageTaken = trackDamage(g);
  const heart = g.objects.find(o => o.type === 'heart');
  const skeleton = g.enemies.find(e => e.type === 'skeleton');
  g.enemies = [skeleton];
  Object.assign(g.player, { x: heart.x, y: heart.y, hp: 2, invincible: 0, jump: 0 });
  Object.assign(skeleton, { x: heart.x + 10, y: heart.y });
  g.tick(.02);
  assert.equal(g.player.hp, 2, 'Healing and damage cancel out the net HP change');
  assert.ok(!g.objects.includes(heart), 'The heart was collected');
  assert.equal(damageTaken(), 1, 'The applied hit still counts in the report');
  g.player.invincible = 0;
  g.damage(1);
  assert.equal(damageTaken(), 2, 'Damage accumulates across calls');
});

test('playthrough damage accounting ignores blocked hits and caps lethal damage at remaining HP', () => {
  const g = new Game();
  const damageTaken = trackDamage(g);
  g.player.invincible = 1;
  g.damage(2);
  assert.equal(damageTaken(), 0);
  g.player.invincible = 0;
  g.player.jump = .5;
  g.damage(2);
  assert.equal(damageTaken(), 0);
  g.player.jump = 0;
  g.player.frozenShield = g.player.guarding = true;
  g.damage(2, 'bolt');
  assert.equal(damageTaken(), 0);
  g.player.invincible = 0;
  g.player.guarding = false;
  g.damage(99);
  assert.equal(damageTaken(), 3, 'Only hearts actually removed count, not the requested damage');
});

test('a fresh hero can walk the whole adventure and win with live enemies and ordinary combat cooldowns', t => {
  const g = new Game();
  const damageTaken = trackDamage(g);
  let ticks = 0;
  function advance(input) {
    // Deliberately slower than the 300 ms sword cooldown, with no timer resets.
    if (ticks % 20 === 0) g.attack();
    if (ticks % 40 === 0 && g.enemies.some(e => e.hp > 0 && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 80)) g.jump();
    g.tick(.02, input);
    assert.notEqual(g.mode, 'defeated', `Defeated in room ${g.room}`);
    ticks++;
  }
  function walkTo(target) {
    const start = [Math.floor(g.player.x / TILE), Math.floor(g.player.y / TILE)];
    const goal = [Math.floor(target.x / TILE), Math.floor(target.y / TILE)];
    const queue = [start], parents = new Map([[start.join(), null]]);
    let end;
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      if (x === goal[0] && y === goal[1]) { end = [x, y]; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = [x + dx, y + dy], p = point(...next);
        if (parents.has(next.join()) || ['water', 'lava', 'bramble'].includes(g.tileAt(p.x, p.y))) continue;
        if ([[-7, -7], [7, -7], [-7, 7], [7, 7]].some(([a, b]) => g.solid(p.x + a, p.y + b))) continue;
        parents.set(next.join(), [x, y]);
        queue.push(next);
      }
    }
    assert.ok(end, `No safe route in room ${g.room} from ${start} to ${goal}`);
    const route = [];
    for (let p = end; p; p = parents.get(p.join())) route.unshift(point(...p));
    for (const p of route.slice(1)) {
      let frames = 0;
      while (Math.hypot(p.x - g.player.x, p.y - g.player.y) > 1.5 && frames++ < 300) {
        if (g.mode === 'won') {
          assert.ok(Math.hypot(target.x - g.player.x, target.y - g.player.y) < 19);
          return;
        }
        advance({
          x: Math.max(-1, Math.min(1, (p.x - g.player.x) / 12)),
          y: Math.max(-1, Math.min(1, (p.y - g.player.y) / 12)),
          shield: true
        });
      }
      assert.ok(frames < 300, `Movement stalled in room ${g.room} toward ${p.x},${p.y}`);
    }
  }
  walkTo(point(8, 28)); g.interact();
  assert.equal(g.room, 'elder');
  walkTo(point(8, 5)); g.interact();
  assert.equal(g.player.sword, true);
  walkTo(point(8, 9)); g.interact();
  assert.equal(g.room, 'world');
  for (let id = 1; id <= DUNGEONS.length; id++) {
    const entrance = g.objects.find(o => o.type === 'dungeon' && o.id === id);
    walkTo({ x: entrance.x, y: entrance.y + TILE }); g.interact();
    assert.equal(g.room, id);
    assert.equal(g.key, false, 'No shortcut or granted key');
    const key = g.objects.find(o => o.key);
    walkTo({ x: key.x, y: key.y + TILE });
    advance({ y: -1, shield: true });
    for (let i = 0; i < 30 && !g.key; i++) advance({ shield: true });
    assert.equal(g.key, true, `Dungeon ${id} key earned by swinging`);
    const boss = g.enemies.find(e => e.boss);
    if (id === 6) assert.equal(boss.hp, 20);
    walkTo({ x: boss.x, y: boss.y + TILE * 2 });
    advance({ y: -1, shield: true });
    for (let i = 0; boss.hp > 0 && i < 700; i++) advance({ shield: true });
    assert.ok(boss.hp <= 0, `Dungeon ${id} guardian survived`);
    walkTo(g.objects.find(o => o.type === 'seal'));
    assert.ok(g.completed.includes(id));
    assert.equal(g.player.hp, 3 + id, 'Earned seal heals and adds a heart');
    if (id < DUNGEONS.length) {
      walkTo(point(3, 21)); g.interact();
      assert.equal(g.room, 'world');
    }
  }
  const damage = damageTaken();
  difficultyReport.runs.push({
    routeId: 'safe-full-adventure',
    simulatedDurationMs: ticks * 20,
    damageHearts: damage,
    retries: 0,
    won: g.mode === 'won',
    completedDungeons: g.completed.slice()
  });
  assert.equal(g.mode, 'won');
  assert.deepEqual(g.completed, [1, 2, 3, 4, 5, 6]);
  assert.ok(g.events.some(e => e.type === 'win'));
  t.diagnostic(`Full adventure: ${(ticks * .02).toFixed(1)} simulated seconds, ${damage} hearts lost, no retries`);
});

test('measures successful jump responses to the final lightning warning', t => {
  const safeDelays = [];
  const measurement = {
    routeId: 'stormkeep-lightning',
    inputId: 'lightning-response',
    location: null,
    sweepDelayFrames: { minimum: 0, maximum: 80 },
    window: null
  };
  difficultyReport.measurements.push(measurement);
  for (let delay = 0; delay <= 80; delay++) {
    const g = new Game();
    g.player.sword = true;
    g.enterDungeon(6, true);
    const boss = g.enemies.find(e => e.boss);
    g.enemies = [boss];
    Object.assign(g.player, { x: boss.x, y: boss.y + 40, invincible: 0 });
    measurement.location = { x: g.player.x, y: g.player.y };
    boss.cooldown = 0;
    g.tick(.02);
    assert.equal(boss.charge, 1);
    let sawLightning = false;
    for (let frame = 0; frame < 100; frame++) {
      if (frame === delay) g.jump();
      g.tick(.02);
      sawLightning ||= g.projectiles.length > 0;
    }
    assert.ok(sawLightning, 'Response test must encounter real lightning');
    if (g.player.hp === 3) safeDelays.push(delay);
  }
  measurement.successfulDelayFrames = safeDelays;
  assert.ok(safeDelays.length > 0, 'A jump must be able to avoid the warned attack');
  let first = safeDelays[0], last = first, start = first;
  for (let i = 1; i < safeDelays.length; i++) {
    if (safeDelays[i] !== safeDelays[i - 1] + 1) start = safeDelays[i];
    if (safeDelays[i] - start > last - first) {
      first = start;
      last = safeDelays[i];
    }
  }
  measurement.window = {
    earliestFrame: first,
    latestFrame: last,
    earliestMs: first * 20,
    latestMs: last * 20,
    slackFrames: last - first,
    slackMs: (last - first) * 20,
    clipped: first === 0 || last === 80
  };
  t.diagnostic(`Lightning response: ${first * 20}-${last * 20} ms after warning, ${(last - first) * 20} ms slack`);
});
