import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {defaultGameplay, validateGameAsset} from '../dist/assets.mjs';
import {gameAnimationSlots, validateAnimationBindings, gameAnimationFrame, createGameImages} from '../dist/game-animations.mjs';
import {Run} from '../dist/engine.mjs';
import {SceneRun} from '../dist/scene-run.mjs';
import {dungeon} from '../dist/dungeon.mjs';
import {blankScene, validateScene} from '../dist/scene.mjs';
import {render} from '../dist/render.mjs';
import {createRooms} from './rooms.mjs';
import {PublicError} from './cloud.mjs';

const sprite = {name: 'Animé', description: 'Sprite test', width: 16, height: 16, pixels: [{x: 2, y: 5, rgba: '#112233FF'}]};
const animation = name => ({id: name, name, version: 1, type: 'custom', fps: 10, loop: true, frames: [0, 1, 2].map(i => ({duration: 100, sprite: {...sprite, pixels: [{x: 2 + i, y: 5, rgba: '#112233FF'}]}}))});
function asset(type, stats = {}) {
  const gameplay = {type, stats: {...defaultGameplay(type).stats, ...stats}}, slots = Object.keys(gameAnimationSlots(gameplay));
  return {id: randomUUID(), sprite, gameplay, animations: slots.map(animation), animationBindings: Object.fromEntries(slots.map(slot => [slot, slot]))};
}
const step = (run, seconds, input = {}) => {for (let time = 0; time < seconds; time += .02) run.tick(.02, input);};
const pose = (run, entity = run.player) => run.animations.pose(run, entity.assetId ?? run.assetForEntity(entity), run.animations.key(entity));

test('game assets validate bindings and snapshot only the assigned animations', () => {
  const hero = asset('character'); hero.animations.push(animation('unused'));
  const checked = validateGameAsset(hero);
  assert.equal(checked.animations.length, 5);
  assert.deepEqual(validateGameAsset(checked), checked);
  assert.throws(() => validateAnimationBindings({open: 'idle'}, hero.gameplay, hero.animations), /incompatible/);
  assert.throws(() => validateAnimationBindings({idle: 'foreign'}, hero.gameplay, hero.animations), /introuvable/);
  assert.equal(validateGameAsset({...hero, animationBindings: {}}).animations, undefined);
  const scene = validateScene({...blankScene(), heroId: hero.id}, [hero]);
  assert.deepEqual(scene.assets[0].animationBindings, hero.animationBindings);
});

test('movement, shots, damage and death trigger the chosen character animations; pause freezes them', () => {
  const run = new Run(dungeon, () => {}, asset('character')); run.start();
  run.tick(.02); assert.equal(pose(run).id, 'idle');
  run.tick(.02, {x: 1}); assert.equal(pose(run).id, 'walk');
  step(run, .12, {x: 1}); assert.equal(pose(run).index, 1);
  run.tick(.02, {aim: 0}); assert.equal(pose(run).id, 'attack');
  run.pause(); const frozen = pose(run); step(run, 1); assert.deepEqual(pose(run), frozen);
  run.pause(); step(run, .4); assert.equal(pose(run).id, 'idle');
  run.player.inv = 0; run.shoot(run.player.x, run.player.y, 0, 0, true, 5, 1); run.tick(.02);
  assert.equal(pose(run).id, 'hurt');
  run.player.inv = 0; run.shoot(run.player.x, run.player.y, 0, 0, true, 5, 50); run.tick(.02);
  assert.equal(run.state, 'dead'); assert.equal(pose(run).id, 'death');
  step(run, .5); assert.equal(pose(run).index, 2);
  const again = new Run(dungeon, () => {}, run.asset); assert.equal(again.animations.time, 0);
});

test('two copies of an enemy animate independently and death keeps a temporary visual only', () => {
  const enemy = asset('enemy', {behavior: 'shoot', health: 12});
  const run = new SceneRun({assets: [enemy], plan: {...blankScene(), placements: [{id: 'one', assetId: enemy.id, x: 400, y: 160}, {id: 'two', assetId: enemy.id, x: 720, y: 440}]}});
  run.start(); const [a, b] = run.room.enemies; a.cool = 0;
  run.tick(.02); assert.equal(pose(run, a).id, 'attack'); assert.equal(pose(run, b).id, 'walk');
  run.shoot(a.x, a.y, 0, 0); run.tick(.02);
  assert.equal(run.room.enemies.length, 1); assert.equal(run.animations.ghosts.length, 1);
  assert.equal(pose(run, run.animations.ghosts[0]).id, 'death');
  step(run, .4); assert.equal(run.animations.ghosts.length, 0); assert.equal(run.kills, 1);
});

test('pickup and wall destruction retain visuals without repeating gameplay effects', () => {
  const itemRun = new Run(dungeon, () => {}, asset('item')); itemRun.start(); itemRun.player.x = 480; itemRun.player.y = 260;
  itemRun.tick(.02); assert.equal(itemRun.inventory.length, 1); assert.equal(itemRun.pickups.length, 0);
  assert.equal(pose(itemRun, itemRun.animations.ghosts[0]).id, 'collect');
  step(itemRun, .5); assert.equal(itemRun.inventory.length, 1); assert.equal(itemRun.animations.ghosts.length, 0);
  const wallRun = new Run(dungeon, () => {}, asset('wall', {health: 12})); wallRun.start();
  wallRun.shoot(610, 285, 0, 560); wallRun.tick(.03);
  assert.equal(wallRun.props.length, 0); assert.equal(pose(wallRun, wallRun.animations.ghosts[0]).id, 'death');
});

test('contact attacks and boss shots trigger their assigned animation', () => {
  const enemy = new Run(dungeon, () => {}, asset('enemy', {behavior: 'chase'})); enemy.start();
  const attacker = enemy.room.enemies[0]; attacker.x = enemy.player.x + 20; attacker.y = enemy.player.y; enemy.player.inv = 0;
  enemy.tick(.02); assert.equal(pose(enemy, attacker).id, 'attack');
  const boss = new Run(dungeon, () => {}, asset('boss')); boss.enter(6); boss.start();
  const guardian = boss.room.enemies[0]; guardian.cool = 0; boss.tick(.02);
  assert.equal(pose(boss, guardian).id, 'attack');
});

test('doors animate on unlocking and hold the open pose even when the assigned clip loops', () => {
  const door = asset('decor', {kind: 'door'}), run = new Run(dungeon, () => {}, door); run.start();
  const get = open => run.animations.pose(run, door.id, 'door-test', open);
  assert.equal(get(false).id, 'idle'); assert.deepEqual(get(true), {id: 'open', index: 0});
  step(run, .16); assert.equal(get(true).index, 1);
  step(run, .6); assert.equal(get(true).index, 2);
  assert.equal(get(false).id, 'idle'); assert.equal(get(true).index, 0);
});

test('renderer receives animated frames from a cached image provider and static assets still work', () => {
  const hero = asset('character'), run = new Run(dungeon, () => {}, hero); run.start(); step(run, .14, {x: 1});
  let count = 0;
  const images = createGameImages([validateGameAsset(hero)], () => ({number: ++count, getContext: () => ({fillRect() {}})}));
  const expected = images(hero.id, pose(run)), draws = [];
  const ctx = new Proxy({}, {get: (_, key) => key === 'drawImage' ? (...args) => draws.push(args[0]) : key.startsWith('create') ? () => ({addColorStop() {}}) : () => {}, set: () => true});
  render(ctx, run, {complete: false}, 0, images);
  assert.ok(draws.includes(expected)); assert.notEqual(expected, images(hero.id, null));
  const allocated = count; render(ctx, run, {complete: false}, 1, images); assert.equal(count, allocated);
  assert.equal(gameAnimationFrame(animation('test'), 10, false), 2);
});

test('a generated door only permits passage after its opening completes', () => {
  const run = new Run(dungeon, () => {}, asset('decor', {kind: 'door'})); run.start(); run.transition = 0;
  run.player.x = 890; run.player.y = 300; run.tick(.02);
  assert.equal(run.roomId, 0);
  step(run, .36); assert.equal(run.roomId, 1);
  run.player.x = 70; run.player.y = 300; run.transition = 0; step(run, .4);
  assert.equal(run.roomId, 1, 'a combat room still locks doors');
});

test('saved rooms freeze animation choices until explicitly refreshed from the notebook', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nocturne-room-animation-')); t.after(() => rm(directory, {recursive: true, force: true}));
  const hero = asset('character'); let library = [hero];
  const rooms = createRooms({directory, designer: {list: async () => library}, PublicError});
  const saved = await rooms.save({plan: {...blankScene(), heroId: hero.id}});
  library = [{...hero, animationBindings: {idle: 'walk'}, gameplay: {...hero.gameplay, stats: {...hero.gameplay.stats, health: 12}}}];
  const unchanged = await rooms.save({id: saved.id, plan: saved.plan});
  assert.deepEqual(unchanged.assets[0].animationBindings, hero.animationBindings);
  const refreshed = await rooms.save({id: saved.id, plan: saved.plan, refreshAnimations: true});
  assert.deepEqual(refreshed.assets[0].animationBindings, {idle: 'walk'});
  assert.equal(refreshed.assets[0].gameplay.stats.health, hero.gameplay.stats.health);
  assert.deepEqual((await rooms.read(saved.id)).assets, refreshed.assets);
});
