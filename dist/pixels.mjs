import {rasterizeCommands} from './drawing-tools.mjs';
export const spriteSizes = [8, 16, 24, 32, 48, 64];

function colorOf(rgba, context) {
  if (typeof rgba !== 'string' || !/^#[\da-f]{6}([\da-f]{2})?$/i.test(rgba)) throw Error(`${context} : couleur attendue #RRGGBB ou #RRGGBBAA`);
  return rgba.toUpperCase() + (rgba.length === 7 ? 'FF' : '');
}

export function normalizeSprite(value, expectedSize) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Sprite invalide');
  const {name, description, width, height} = value;
  for (const [label, text, limit] of [['Nom', name, 80], ['Description', description, 400]]) {
    if (typeof text !== 'string' || !text.trim() || text.length > limit || /\p{Cc}/u.test(text)) throw Error(`${label} invalide`);
  }
  if (!spriteSizes.includes(width) || height !== width || (expectedSize && width !== expectedSize)) throw Error(`Dimensions incorrectes : reçu ${width} × ${height}, attendu ${expectedSize || spriteSizes.join('/')} pixels carrés`);
  let pixels = value.pixels;
  const compact = value.rows !== undefined || value.palette !== undefined;
  let drawing;
  if (value.commands !== undefined) {
    if (pixels !== undefined || compact) throw Error('Fournis commands seul, sans pixels ni palette/rows');
    drawing = rasterizeCommands(value.commands, width, height);
    pixels = drawing.pixels;
  }
  const gridRepairs = [];
  if (compact) {
    if (pixels !== undefined) throw Error('Fournis pixels ou palette/rows, pas les deux');
    if (!Array.isArray(value.palette) || !value.palette.length || value.palette.length > 16) throw Error('Palette : 1 à 16 couleurs attendues');
    const palette = value.palette.map((c, i) => colorOf(c, `Palette[${i}]`));
    if (!Array.isArray(value.rows) || !value.rows.length || value.rows.length > height * 2) throw Error(`Grille invalide : reçu ${value.rows?.length ?? 0} lignes, maximum ${height * 2}`);
    pixels = [];
    value.rows.forEach((row, y) => {
      if (typeof row !== 'string' || row.length > width * 2) throw Error(`Ligne ${y} invalide : reçu ${row?.length ?? 0} caractères, maximum ${width * 2}`);
      // Only repair transparent suffixes. Never shift a row or discard a colored pixel.
      if (y >= height) {
        if (!/^\.*$/.test(row)) throw Error(`Ligne ${y} : pixels non transparents hors de la grille ${width} × ${height}`);
        gridRepairs.push({type: 'trim-transparent-row', y, characters: row.length});
        return;
      }
      if (row.length > width) {
        if (!/^\.*$/.test(row.slice(width))) throw Error(`Ligne ${y} : pixels non transparents au-delà de la colonne ${width - 1}`);
        gridRepairs.push({type: 'trim-transparent-suffix', y, from: row.length, to: width});
        row = row.slice(0, width);
      } else if (row.length < width) {
        gridRepairs.push({type: 'pad-transparent-suffix', y, from: row.length, to: width});
        row = row.padEnd(width, '.');
      }
      [...row].forEach((symbol, x) => {
        if (symbol === '.') return;
        if (!/^[0-9a-f]$/i.test(symbol) || parseInt(symbol, 16) >= palette.length) throw Error(`Pixel (${x}, ${y}) : indice de palette « ${symbol} » invalide`);
        pixels.push({x, y, rgba: palette[parseInt(symbol, 16)]});
      });
    });
    if (value.rows.length < height) gridRepairs.push({type: 'pad-transparent-rows', from: value.rows.length, to: height});
  }
  if (!Array.isArray(pixels) || !pixels.length || pixels.length > width * height * 4) throw Error(`Nombre de pixels invalide (maximum ${width * height * 4} entrées)`);
  const positions = new Map();
  const diagnostics = {format: drawing ? 'commands' : compact ? 'rows' : 'pixels', inputPixels: pixels.length, uniquePixels: 0, duplicatePixels: 0, overwrittenPixels: 0, duplicateSamples: [], colors: 0, gridRepairs, ...(drawing ? drawing.stats : {})};
  pixels.forEach((pixel, index) => {
    if (!pixel || typeof pixel !== 'object') throw Error(`Pixel[${index}] invalide`);
    const {x, y, rgba} = pixel;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) throw Error(`Pixel[${index}] (${x}, ${y}) hors de la grille ${width} × ${height}`);
    const color = colorOf(rgba, `Pixel[${index}] (${x}, ${y})`), position = `${x},${y}`;
    if (positions.has(position)) {
      diagnostics.duplicatePixels++;
      const previous = positions.get(position).rgba;
      if (previous !== color) diagnostics.overwrittenPixels++;
      if (diagnostics.duplicateSamples.length < 20) diagnostics.duplicateSamples.push({x, y, previous, replacement: color});
    }
    positions.set(position, {x, y, rgba: color});
  });
  const result = [...positions.values()];
  if (!result.some(p => !p.rgba.endsWith('00'))) throw Error('Le sprite est entièrement transparent');
  const colors = new Set(result.map(p => p.rgba));
  if (colors.size > 16) throw Error(`Palette finale : ${colors.size} couleurs, maximum 16`);
  diagnostics.uniquePixels = result.length; diagnostics.colors = colors.size;
  return {sprite: {name: name.trim(), description: description.trim(), width, height, pixels: result}, diagnostics, ...(drawing ? {drawing: {version: 1, commands: drawing.commands}} : {})};
}

export function validateSprite(value, expectedSize) {return normalizeSprite(value, expectedSize).sprite;}

export function compactSprite(sprite) {
  const palette = [...new Set(sprite.pixels.map(p => p.rgba))];
  const rows = Array.from({length: sprite.height}, () => Array(sprite.width).fill('.'));
  for (const {x, y, rgba} of sprite.pixels) rows[y][x] = palette.indexOf(rgba).toString(16).toUpperCase();
  return {name: sprite.name, description: sprite.description, width: sprite.width, height: sprite.height, palette, rows: rows.map(row => row.join(''))};
}

export function paintSprite(canvas, sprite, scale = 1, grid = false) {
  canvas.width = sprite.width * scale;
  canvas.height = sprite.height * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (const {x, y, rgba} of sprite.pixels) {
    ctx.fillStyle = rgba;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  if (grid && scale >= 4) {
    ctx.strokeStyle = '#b9c8bf33';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < sprite.width; x++) {ctx.moveTo(x * scale + .5, 0); ctx.lineTo(x * scale + .5, canvas.height);}
    for (let y = 1; y < sprite.height; y++) {ctx.moveTo(0, y * scale + .5); ctx.lineTo(canvas.width, y * scale + .5);}
    ctx.stroke();
  }
}
