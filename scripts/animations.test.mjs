import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAnimation, animationPrompt, defaultAnimationLoop, animationFrameIndex} from '../dist/animations.mjs';
import {validateSprite} from '../dist/pixels.mjs';

const sprite = validateSprite({name: 'Héros', description: 'Test', width: 16, height: 16, pixels: [
  {x: 4, y: 4, rgba: '#123456'}, {x: 5, y: 4, rgba: '#abcdef'}, {x: 8, y: 8, rgba: '#123456'},
]});
const animation = frames => ({format: 'changes', fps: 8, loop: true, frames});

test('compact frames independently preserve the original, move regions and apply palette edits', () => {
  const before = structuredClone(sprite);
  const result = validateAnimation(animation([
    {moves: [], edits: []},
    {moves: [[4, 4, 2, 1, 0, -1]], edits: [[8, 8, null], [8, 7, 1]], duration: 250},
    {edits: [[8, 8, 1]]},
  ]), sprite, {requireMovement: true});
  assert.deepEqual(sprite, before);
  assert.deepEqual(result.frames[1].sprite.pixels, [
    {x: 4, y: 3, rgba: '#123456FF'}, {x: 5, y: 3, rgba: '#ABCDEFFF'}, {x: 8, y: 7, rgba: '#ABCDEFFF'},
  ]);
  assert.equal(result.frames[1].duration, 250);
  assert.deepEqual(result.frames[2].sprite.pixels.slice(0, 2), sprite.pixels.slice(0, 2));
  assert.deepEqual(validateAnimation(result, sprite), result);
});

test('simultaneous region exchanges do not erase overwritten sources', () => {
  const result = validateAnimation(animation([{}, {moves: [[4, 4, 1, 1, 1, 0], [5, 4, 1, 1, -1, 0]]}]), sprite);
  assert.equal(result.frames[1].sprite.pixels.find(p => p.x === 4).rgba, '#ABCDEFFF');
  assert.equal(result.frames[1].sprite.pixels.find(p => p.x === 5).rgba, '#123456FF');
});

test('invalid animation movements, edits, sizes and timing are rejected', () => {
  for (const frame of [
    {moves: [[4, 4, 2, 1, -5, 0]]}, {moves: [[15, 15, 2, 1, 0, 0]]},
    {moves: [[4, 4, 2, 1, 0.5, 0]]}, {moves: 'bad'},
    {edits: [[8, 8, 16]]}, {edits: [[8, 8, '0']]}, {edits: [[16, 0, 0]]},
    {edits: [], pixels: sprite.pixels}, {duration: 0},
    {edits: [[4, 4, null], [5, 4, null], [8, 8, null]]},
  ]) assert.throws(() => validateAnimation(animation([{}, frame]), sprite));
  assert.throws(() => validateAnimation({fps: 8, loop: true, frames: [sprite, {...sprite, width: 32}]}, sprite), /dimensions/);
  assert.throws(() => validateAnimation(animation([{}, {}]), sprite, {requireMovement: true}), /identiques/);
  // Old stored animations remain readable even if they did not move.
  assert.equal(validateAnimation(animation([{}, {}]), sprite).frames.length, 2);
});

test('large sprites use a compact reference and a bounded modification format', () => {
  const large = {...sprite, width: 64, height: 64, pixels: Array.from({length: 4096}, (_, i) => ({x: i % 64, y: Math.floor(i / 64), rgba: '#123456FF'}))};
  const prompt = animationPrompt('walk', 12, 6, large, 'Lever les bras');
  assert.ok(prompt.length < 9000);
  assert.match(prompt, /"format":"changes"/);
  assert.match(prompt, /exactement 6/);
  assert.match(prompt, /Lever les bras/);
  assert.ok(!prompt.includes('"pixels":'));
});

test('a double door can open fully with both leaves compressed toward their hinges', () => {
  const door = {...sprite, pixels: Array.from({length: 12 * 10}, (_, i) => ({x: 2 + i % 12, y: 3 + Math.floor(i / 12), rgba: '#123456FF'}))};
  const value = {...animation([
    {}, {transforms: [[2, 3, 6, 10, 2, 3, 3, 10], [8, 3, 6, 10, 11, 3, 3, 10]]},
    {transforms: [[2, 3, 6, 10, 2, 3, 1, 10], [8, 3, 6, 10, 13, 3, 1, 10]]},
  ]), type: 'open', loop: false};
  const result = validateAnimation(value, door, {requireMovement: true});
  assert.equal(result.frames.at(-1).sprite.pixels.length, 20);
  assert.ok(result.frames.at(-1).sprite.pixels.every(p => p.x === 2 || p.x === 13));
  assert.deepEqual(result.frames[0].sprite.pixels, door.pixels);
  assert.deepEqual(validateAnimation(result, door), result);
  assert.throws(() => validateAnimation({...value, frames: [value.frames[0], value.frames[1], {}]}, door, {requireMovement: true}), /pose fermée/);
  for (const transform of [[2, 3, 6, 10, 16, 3, 1, 10], [2, 3, 6, 10, 2, 3, 0, 10], [2, 3, 99, 10, 2, 3, 1, 10]]) {
    assert.throws(() => validateAnimation(animation([{}, {transforms: [transform]}]), door), /hors grille/);
  }
});

test('one-shot playback and manual stepping hold the last frame, cycles wrap', () => {
  const oneShot = {loop: false, frames: [{}, {}, {}]};
  assert.equal(animationFrameIndex(oneShot, 3), 2);
  assert.equal(animationFrameIndex(oneShot, -1), 0);
  assert.equal(animationFrameIndex({...oneShot, loop: true}, 3), 0);
  assert.equal(defaultAnimationLoop('open'), false);
  assert.equal(defaultAnimationLoop('custom'), false);
  assert.equal(defaultAnimationLoop('walk'), true);
  const prompt = animationPrompt('open', 4, 8, sprite, '', {loop: false, durationMs: 2000});
  assert.match(prompt, /COMPLÈTEMENT/);
  assert.match(prompt, /UNE SEULE FOIS/);
  assert.match(prompt, /2000 ms/);
});
