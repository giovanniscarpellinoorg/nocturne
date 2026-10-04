import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {encodeAnimationGif} from '../dist/animation-gif.mjs';

const sprite = {width: 8, height: 8, pixels: [{x: 1, y: 2, rgba: '#000000FF'}, {x: 3, y: 2, rgba: '#FF8800FF'}]};
const animation = {loop: false, frames: [
  {sprite, duration: 125},
  {sprite: {...sprite, pixels: [{x: 5, y: 4, rgba: '#3388FFFF'}]}, duration: 235},
]};

test('GIF export provides a transparent palette and only loops when requested', () => {
  const gif = Buffer.from(encodeAnimationGif(animation, {scale: 4}));
  assert.equal(gif.subarray(0, 6).toString(), 'GIF89a');
  assert.equal(gif.readUInt16LE(6), 32); assert.equal(gif.readUInt16LE(8), 32);
  assert.equal(gif.at(-1), 0x3b);
  assert.ok(!gif.includes('NETSCAPE2.0'));
  assert.ok(Buffer.from(encodeAnimationGif({...animation, loop: true})).includes('NETSCAPE2.0'));
  assert.throws(() => encodeAnimationGif(animation, {scale: 0}), /Dimensions/);
  assert.throws(() => encodeAnimationGif({...animation, frames: [animation.frames[0], {sprite: {...sprite, width: 16}, duration: 100}]}), /Frame/);
});

// Optional independent decoder check: no browser and no dependency in the app.
const hasFFmpeg = spawnSync('ffmpeg', ['-version'], {stdio: 'ignore'}).status === 0;
test('an independent GIF decoder restores every scaled pixel with no trails between poses', {skip: !hasFFmpeg}, () => {
  const scale = 4, size = 32;
  const result = spawnSync('ffmpeg', ['-v', 'error', '-ignore_loop', '1', '-i', 'pipe:0', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], {input: encodeAnimationGif(animation, {scale}), maxBuffer: 1024 * 1024});
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.length, size * size * 4 * animation.frames.length);
  animation.frames.forEach((frame, index) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const pixel = frame.sprite.pixels.find(p => p.x === Math.floor(x / scale) && p.y === Math.floor(y / scale));
      const offset = (index * size * size + y * size + x) * 4;
      const actual = result.stdout.subarray(offset, offset + 4);
      if (pixel) assert.deepEqual(actual, Buffer.from(pixel.rgba.slice(1), 'hex'));
      else assert.equal(actual[3], 0, `Frame ${index}, pixel ${x},${y} should be transparent`);
    }
  });
});

const hasFFprobe = spawnSync('ffprobe', ['-version'], {stdio: 'ignore'}).status === 0;
test('GIF durations survive decoding at centisecond precision without cumulative drift', {skip: !hasFFprobe}, () => {
  const value = {...animation, frames: Array.from({length: 12}, () => animation.frames[0])};
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_packets', '-show_entries', 'packet=duration_time', '-of', 'json', 'pipe:0'], {input: encodeAnimationGif(value)});
  assert.equal(result.status, 0, result.stderr.toString());
  const durations = JSON.parse(result.stdout).packets.map(packet => Number(packet.duration_time));
  assert.deepEqual(durations, Array.from({length: 12}, (_, i) => i % 2 ? .12 : .13));
  assert.ok(Math.abs(durations.reduce((a, b) => a + b, 0) - 1.5) < .001);
});
