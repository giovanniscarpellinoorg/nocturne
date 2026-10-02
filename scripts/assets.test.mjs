import {modelFetcher} from './fixtures/model-catalog.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {defaultGameplay, validateGameplay, validateGameAsset, applyItem, assetTypes} from '../dist/assets.mjs';
import {Run} from '../dist/engine.mjs';
import {dungeon} from '../dist/dungeon.mjs';
import {render} from '../dist/render.mjs';
import {createCloud, DEFAULT_MODEL} from './cloud.mjs';
import {createServer} from './server.mjs';

const sprite = {name: 'Esprit du jardin', description: 'Un petit esprit vert.', width: 16, height: 16, pixels: [{x: 8, y: 8, rgba: '#80AA90FF'}]};
const makeAsset = (type, stats = {}) => ({id: 'test-sprite', sprite, gameplay: {type, stats: {...defaultGameplay(type).stats, ...stats}}});

test('typed profiles validate only supported stats and bounded values', () => {
  for (const type of Object.keys(assetTypes)) assert.deepEqual(validateGameplay(defaultGameplay(type)), defaultGameplay(type));
  for (const value of [
    {type: '__proto__', stats: {}}, {type: 'character', stats: {}},
    makeAsset('character', {health: 999}).gameplay, makeAsset('boss', {damage: 0}).gameplay,
    makeAsset('item', {effect: 'heal', amount: 7}).gameplay,
    makeAsset('item', {effect: 'haste', amount: 100}).gameplay,
    makeAsset('item', {effect: 'spread', amount: 2}).gameplay,
    makeAsset('wall', {destructible: 'true'}).gameplay,
    makeAsset('decor', {kind: 'run_code'}).gameplay,
    makeAsset('boss', {script: 'execute'}).gameplay,
  ]) assert.throws(() => validateGameplay(value));
  assert.throws(() => validateGameplay(defaultGameplay('boss'), 'character'));
  assert.throws(() => validateGameAsset(makeAsset('art')));
});

test('character stats govern movement, firing and health; restarting restores them', () => {
  const asset = makeAsset('character', {health: 9, damage: 23, speed: 100, fireRate: .5});
  const run = new Run(dungeon, () => {}, asset);
  assert.equal(run.player.hp, 9); assert.equal(run.player.damage, 23);
  run.start(); const x = run.player.x;
  run.tick(.03, {x: 1, aim: 0});
  assert.equal(run.player.x, x + 3); assert.equal(run.bullets.length, 1);
  for (let i = 0; i < 10; i++) run.tick(.03, {aim: 0});
  assert.equal(run.bullets.length, 1);
  run.player.inv = 0; run.hurt(2); assert.equal(run.player.hp, 7);
  assert.equal(new Run(dungeon, () => {}, asset).player.hp, 9);
});

test('a generated item applies its bonus exactly once and resets on a new run', () => {
  const events = [], run = new Run(dungeon, (name, value) => events.push({name, value}), makeAsset('item', {effect: 'vitality', amount: 3}));
  run.start(); run.player.x = 480; run.player.y = 260; run.tick(.01);
  assert.equal(run.player.maxHp, 9); assert.equal(run.player.hp, 9);
  assert.equal(run.inventory.length, 1); assert.equal(run.pickup, null);
  run.tick(.01); run.enter(1); run.enter(0); run.claimAsset();
  assert.equal(run.inventory.length, 1); assert.equal(run.player.maxHp, 9);
  assert.equal(events.filter(e => e.name === 'asset-item').length, 1);
  const again = new Run(dungeon, () => {}, makeAsset('item'));
  assert.ok(again.pickup); assert.equal(again.player.maxHp, 6);
});

test('all item effects change the corresponding gameplay value and healing respects max health', () => {
  const base = {hp: 3, maxHp: 6, damage: 12, speed: 200, rate: .4, spread: false, pierce: false};
  const cases = [['heal', 6, 'hp', 6], ['vitality', 2, 'maxHp', 8], ['power', 50, 'damage', 18], ['speed', 20, 'speed', 240], ['haste', 25, 'rate', .3], ['spread', 1, 'spread', true], ['pierce', 1, 'pierce', true]];
  for (const [effect, amount, key, expected] of cases) {
    const player = {...base}; applyItem(player, {effect, amount});
    if (typeof expected === 'number') assert.ok(Math.abs(player[key] - expected) < 1e-8);
    else assert.equal(player[key], expected);
  }
});

test('walls block movement and projectiles, can be destroyed, and stay destroyed on revisits', () => {
  const run = new Run(dungeon, () => {}, makeAsset('wall', {health: 12}));
  run.start(); run.player.x = 600; run.player.y = 285;
  run.move(run.player, 20, 0); assert.equal(run.player.x, 600);
  run.shoot(610, 285, 0, 560); run.tick(.03);
  assert.equal(run.prop, null); assert.equal(run.bullets.length, 0);
  run.move(run.player, 20, 0); assert.equal(run.player.x, 620);
  run.enter(1); run.enter(0); assert.equal(run.prop, null);
  const permanent = new Run(dungeon, () => {}, makeAsset('wall', {destructible: false}));
  permanent.start(); permanent.shoot(610, 285, 0, 560); permanent.tick(.03);
  assert.ok(permanent.prop); assert.equal(permanent.bullets.length, 0);
});

test('plants are walkable, furniture can block, and generated doors use normal room progression', () => {
  const plant = new Run(dungeon, () => {}, makeAsset('decor'));
  plant.player.x = 600; plant.player.y = 285; plant.move(plant.player, 20, 0);
  assert.equal(plant.player.x, 620); assert.ok(plant.prop);
  const furniture = new Run(dungeon, () => {}, makeAsset('decor', {kind: 'furniture', solid: true}));
  furniture.player.x = 600; furniture.player.y = 285; furniture.move(furniture.player, 20, 0);
  assert.equal(furniture.player.x, 600);
  const door = new Run(dungeon, () => {}, makeAsset('decor', {kind: 'door'}));
  assert.equal(door.prop, null); door.start(); door.transition = 0;
  door.player.x = 890; door.player.y = 300; door.tick(.01);
  assert.equal(door.roomId, 1);
  door.transition = 0; door.player.x = 70; door.player.y = 300; door.tick(.01);
  assert.equal(door.roomId, 1, 'combat keeps generated doors locked');
});

test('boss profile controls health, attack pattern, projectile speed, damage and cadence', () => {
  const run = new Run(dungeon, () => {}, makeAsset('boss', {health: 400, damage: 3, pattern: 'fan', projectileSpeed: 200, attackCooldown: 3}));
  run.enter(6); run.start();
  const boss = run.room.enemies[0]; assert.equal(boss.hp, 400);
  assert.equal(run.bossName, sprite.name);
  boss.cool = 0; run.tick(.01);
  assert.equal(run.bullets.length, 5); assert.equal(boss.cool, 3);
  assert.ok(run.bullets.every(b => b.damage === 3 && Math.abs(Math.hypot(b.vx, b.vy) - 200) < 1e-8));
  run.player.inv = 0; run.bullets = []; run.shoot(run.player.x, run.player.y, 0, 0, true, 8, 3); run.tick(.01);
  assert.equal(run.player.hp, 3);
  boss.hp = 100; boss.cool = 0; run.bullets = []; run.tick(.01);
  assert.ok(run.bullets.every(b => Math.abs(Math.hypot(b.vx, b.vy) - 230) < 1e-8));
  assert.equal(boss.cool, 3 * .675);
});

test('renderer draws the generated image for each playable type with a pixelated canvas', () => {
  for (const [type, stats] of [['character', {}], ['decor', {}], ['decor', {kind: 'door'}], ['wall', {}], ['item', {}], ['boss', {}]]) {
    const run = new Run(dungeon, () => {}, makeAsset(type, stats));
    if (type === 'boss') run.enter(6);
    const image = {}, draws = [], gradient = {addColorStop() {}};
    const context = new Proxy({}, {get(target, key) {
      if (key in target) return target[key];
      if (key === 'drawImage') return (...args) => draws.push({args, smooth: target.imageSmoothingEnabled});
      if (key.startsWith('create')) return () => gradient;
      return () => {};
    }});
    render(context, run, {complete: false}, 0, image);
    assert.ok(draws.some(d => d.args[0] === image && d.smooth === false), type);
  }
});

test('typed generation and editing are persisted without extra AI calls; old sprites can be classified', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nocturne-assets-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  let calls = 0, prompt;
  const cloud = createCloud({modelFetcher,secretDir: path.join(dir, 'credentials'), cacheDir: path.join(dir, 'dungeons'), spriteDir: path.join(dir, 'sprites'), environmentKey: 'fake-key-for-test', fetcher: async (_, init) => {
    calls++; prompt = JSON.parse(init.body).messages[1].content;
    return new Response(JSON.stringify({done: true, message: {content: JSON.stringify({...sprite, gameplay: defaultGameplay('character')})}}));
  }});
  const server = createServer({cloud}); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`, {token} = await (await fetch(origin + '/api/session')).json();
  const headers = {Origin: origin, 'Content-Type': 'application/json', 'X-Nocturne-Token': token};
  const post = (route, body, h = headers) => fetch(origin + route, {method: 'POST', headers: h, body: JSON.stringify(body)});
  const generation = await post('/api/designer/generate', {prompt: 'Un esprit', size: 16, model: DEFAULT_MODEL, assetType: 'character'});
  assert.equal(generation.status, 200);
  const {record} = await generation.json(); assert.equal(record.gameplay.type, 'character');
  assert.match(prompt, /Type imposé : character/);
  const gameplay = defaultGameplay('item'); gameplay.stats.amount = 2;
  const changed = await post('/api/designer/gameplay', {id: record.id, gameplay}); assert.equal(changed.status, 200);
  const saved = await changed.json(); assert.deepEqual(saved.sprite, record.sprite); assert.deepEqual(saved.gameplay, gameplay);
  const loaded = await (await fetch(origin + '/api/designer/sprites/' + record.id)).json(); assert.deepEqual(loaded, saved);
  assert.equal(calls, 1);
  assert.equal((await post('/api/designer/gameplay', {id: record.id, gameplay}, {...headers, Origin: 'https://example.com'})).status, 403);
  assert.equal((await post('/api/designer/gameplay', {id: record.id, gameplay: makeAsset('item', {amount: 999}).gameplay})).status, 400);
  assert.equal((await post('/api/designer/gameplay', {id: '../secrets', gameplay})).status, 404);
  const file = path.join(dir, 'sprites', record.id + '.json'), legacy = JSON.parse(await readFile(file, 'utf8'));
  delete legacy.gameplay; await writeFile(file, JSON.stringify(legacy));
  assert.equal((await cloud.readSprite(record.id)).gameplay.type, 'art');
  assert.equal((await cloud.updateSpriteGameplay({id: record.id, gameplay: defaultGameplay('wall')})).gameplay.type, 'wall');
});
