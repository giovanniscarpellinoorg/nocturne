// GIF89a encoder for the workshop's small pixel-art animations. Runs offline.
export function encodeAnimationGif(animation, {scale = 1} = {}) {
  const frames = animation?.frames;
  if (!Array.isArray(frames) || frames.length < 2 || frames.length > 12 || typeof animation.loop !== 'boolean') throw Error('Animation GIF invalide.');
  const {width, height} = frames[0].sprite;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 64 || height > 64 || !Number.isInteger(scale) || scale < 1 || width * scale > 512 || height * scale > 512) throw Error('Dimensions GIF invalides.');
  // Index zero is always transparent. GIF only supports binary transparency.
  const palette = [0], indices = new Map();
  const grids = frames.map(({sprite, duration}) => {
    if (sprite.width !== width || sprite.height !== height || !Number.isFinite(duration) || duration < 40 || duration > 2000) throw Error('Frame GIF invalide.');
    const grid = new Uint8Array(width * height);
    for (const {x, y, rgba} of sprite.pixels) {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height || !/^#[\da-f]{6}([\da-f]{2})?$/i.test(rgba)) throw Error('Pixel GIF invalide.');
      if (rgba.length === 9 && parseInt(rgba.slice(7), 16) < 128) {grid[y * width + x] = 0; continue;}
      const rgb = parseInt(rgba.slice(1, 7), 16);
      if (!indices.has(rgb)) {indices.set(rgb, palette.length); palette.push(rgb);}
      if (palette.length > 32) throw Error('Trop de couleurs pour cet export GIF.');
      grid[y * width + x] = indices.get(rgb);
    }
    return grid;
  });
  const bytes = [], byte = n => bytes.push(n & 255), word = n => {byte(n); byte(n >> 8);};
  const text = value => {for (const character of value) byte(character.charCodeAt(0));};
  text('GIF89a'); word(width * scale); word(height * scale);
  byte(0xf4); byte(0); byte(0); // Global palette: 32 entries; transparent background.
  for (let i = 0; i < 32; i++) {const color = palette[i] ?? 0; byte(color >> 16); byte(color >> 8); byte(color);}
  // Omit the loop extension for one-shot actions: players keep the last frame.
  if (animation.loop) {byte(0x21); byte(0xff); byte(11); text('NETSCAPE2.0'); byte(3); byte(1); word(0); byte(0);}
  let elapsed = 0, encodedElapsed = 0;
  frames.forEach((frame, frameIndex) => {
    elapsed += frame.duration;
    const end = Math.round(elapsed / 10), delay = end - encodedElapsed; encodedElapsed = end;
    byte(0x21); byte(0xf9); byte(4); byte(9); word(delay); byte(0); byte(0);
    // Disposal 2 clears the previous pose so moving transparent regions leave no trails.
    byte(0x2c); word(0); word(0); word(width * scale); word(height * scale); byte(0);
    byte(5); // LZW minimum code size for the 32-entry palette.
    const data = []; let bits = 0, count = 0, run = 0;
    const code = value => {
      bits |= value << count; count += 6;
      while (count >= 8) {data.push(bits & 255); bits >>>= 8; count -= 8;}
    };
    // Short literal runs with clear codes keep LZW at six bits throughout.
    // This trades some compression for a compact, bounded, dependency-free encoder.
    code(32);
    for (let y = 0; y < height * scale; y++) for (let x = 0; x < width * scale; x++) {
      if (run === 30) {code(32); run = 0;}
      code(grids[frameIndex][Math.floor(y / scale) * width + Math.floor(x / scale)]); run++;
    }
    code(33); if (count) data.push(bits & 255);
    for (let start = 0; start < data.length; start += 255) {
      const block = data.slice(start, start + 255); byte(block.length); bytes.push(...block);
    }
    byte(0);
  });
  byte(0x3b);
  return new Uint8Array(bytes);
}
