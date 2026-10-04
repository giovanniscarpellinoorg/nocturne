import {normalizeSprite, compactSprite} from './pixels.mjs';

export const animationTypes = {
  idle: {label: 'Idle · respiration', hint: 'Une respiration, un flottement ou un clignement subtil.'},
  walk: {label: 'Marche · déplacement', hint: 'Une boucle lisible avec un appui et un mouvement du corps.'},
  attack: {label: 'Attaque', hint: 'Anticipation, action puis retour à la pose de base.'},
  hurt: {label: 'Dégâts', hint: 'Un impact court, sans changer la silhouette du sprite.'},
  death: {label: 'Mort', hint: 'Une disparition ou une chute progressive.'},
  open: {label: 'Ouverture', hint: 'Partir de la pose originale fermée et ouvrir COMPLÈTEMENT. Pour une double porte, les deux battants pivotent autour de leurs charnières extérieures jusqu’à ne laisser qu’une tranche de 1 à 2 pixels. Inclure les bordures centrales et poignées dans les battants : la jonction centrale doit disparaître du passage en s’ouvrant. Seul le cadre EXTÉRIEUR reste fixe. La dernière frame est complètement ouverte avec un passage central dégagé, sans retour en arrière.'},
  custom: {label: 'Animation libre', hint: 'Décris le mouvement que tu veux obtenir.'},
};

export const defaultAnimationLoop = type => ['idle', 'walk'].includes(type);
export const animationFrameIndex = (animation, index) => animation.loop ? (index + animation.frames.length) % animation.frames.length : Math.max(0, Math.min(index, animation.frames.length - 1));

// Each frame starts from the original, never from the previous frame.
function applyChanges(frame, sprite, palette, index) {
  const fail = message => {throw Error(`Frame ${index + 1} : ${message}`);};
  const moves = frame.moves ?? [], transforms = frame.transforms ?? [], edits = frame.edits ?? [];
  if (!Array.isArray(moves) || !Array.isArray(transforms) || moves.length + transforms.length > 32 || !Array.isArray(edits) || edits.length > sprite.width * sprite.height) fail('trop de déplacements ou de retouches');
  const base = new Map(sprite.pixels.filter(p => !p.rgba.endsWith('00')).map(p => [`${p.x},${p.y}`, p]));
  const pixels = new Map(base), moved = [];
  const inside = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < sprite.width && y < sprite.height;
  for (const move of moves) {
    if (!Array.isArray(move) || move.length !== 6 || !move.every(Number.isInteger)) fail('déplacement attendu [x,y,largeur,hauteur,dx,dy]');
    const [x, y, w, h, dx, dy] = move;
    if (w < 1 || h < 1 || !inside(x, y) || !inside(x + w - 1, y + h - 1) || Math.abs(dx) >= sprite.width || Math.abs(dy) >= sprite.height) fail('zone de déplacement hors grille');
    for (const pixel of base.values()) {
      if (pixel.x < x || pixel.x >= x + w || pixel.y < y || pixel.y >= y + h) continue;
      if (!inside(pixel.x + dx, pixel.y + dy)) fail('un déplacement ferait sortir des pixels de la grille');
      pixels.delete(`${pixel.x},${pixel.y}`);
      moved.push({...pixel, x: pixel.x + dx, y: pixel.y + dy});
    }
  }
  for (const transform of transforms) {
    if (!Array.isArray(transform) || transform.length !== 8 || !transform.every(Number.isInteger)) fail('transformation attendue [x,y,largeur,hauteur,destinationX,destinationY,destinationLargeur,destinationHauteur]');
    const [x, y, w, h, tx, ty, tw, th] = transform;
    if (Math.min(w, h, tw, th) < 1 || !inside(x, y) || !inside(x + w - 1, y + h - 1) || !inside(tx, ty) || !inside(tx + tw - 1, ty + th - 1)) fail('transformation hors grille');
    for (let sy = y; sy < y + h; sy++) for (let sx = x; sx < x + w; sx++) pixels.delete(`${sx},${sy}`);
    for (let dy = 0; dy < th; dy++) for (let dx = 0; dx < tw; dx++) {
      const pixel = base.get(`${x + Math.min(w - 1, Math.floor((dx + .5) * w / tw))},${y + Math.min(h - 1, Math.floor((dy + .5) * h / th))}`);
      if (pixel) moved.push({...pixel, x: tx + dx, y: ty + dy});
    }
  }
  // Read all regions before writing any: exchanging two limbs must not erase one.
  for (const pixel of moved) pixels.set(`${pixel.x},${pixel.y}`, pixel);
  for (const edit of edits) {
    if (!Array.isArray(edit) || edit.length !== 3 || !inside(edit[0], edit[1])) fail('retouche attendue [x,y,indiceCouleur] dans la grille');
    const [x, y, color] = edit;
    if (color === null) pixels.delete(`${x},${y}`);
    else {
      if (!Number.isInteger(color) || color < 0 || color >= palette.length) fail('indice de couleur invalide');
      pixels.set(`${x},${y}`, {x, y, rgba: palette[color]});
    }
  }
  return {...sprite, pixels: [...pixels.values()]};
}

export function validateAnimation(value, sprite, {requireMovement = false} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Animation invalide');
  if (value.version !== undefined && value.version !== 1) throw Error('Version d’animation invalide');
  if (value.format !== undefined && value.format !== 'changes') throw Error('Format d’animation inconnu');
  if (value.type !== undefined && !Object.hasOwn(animationTypes, value.type)) throw Error('Type d’animation inconnu');
  if (!Number.isInteger(value.fps) || value.fps < 1 || value.fps > 24) throw Error('FPS d’animation : valeur attendue entre 1 et 24');
  if (typeof value.loop !== 'boolean') throw Error('Boucle d’animation invalide');
  if (!Array.isArray(value.frames) || value.frames.length < 2 || value.frames.length > 12) throw Error('Une animation doit contenir entre 2 et 12 frames');
  const basePalette = [...new Set(sprite.pixels.map(pixel => pixel.rgba))];
  const frames = value.frames.map((frame, index) => {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw Error(`Frame ${index + 1} invalide`);
    if (frame.duration !== undefined && (!Number.isInteger(frame.duration) || frame.duration < 40 || frame.duration > 2000)) throw Error(`Durée de la frame ${index + 1} invalide`);
    const changes = value.format === 'changes' || frame.moves !== undefined || frame.transforms !== undefined || frame.edits !== undefined;
    if (changes && ['sprite', 'pixels', 'rows', 'commands'].some(key => frame[key] !== undefined)) throw Error(`Frame ${index + 1} : mélange de formats`);
    const frameSprite = changes ? applyChanges(frame, sprite, basePalette, index) : frame.sprite && typeof frame.sprite === 'object' ? frame.sprite : frame;
    if (frameSprite.width !== undefined && frameSprite.width !== sprite.width || frameSprite.height !== undefined && frameSprite.height !== sprite.height) throw Error(`Frame ${index + 1} : dimensions différentes du sprite`);
    const normalized = normalizeSprite({
      ...frameSprite,
      name: typeof frame.name === 'string' && frame.name.trim() ? frame.name : typeof frameSprite.name === 'string' && frameSprite.name.trim() ? frameSprite.name : `${sprite.name.slice(0, 60)} · frame ${index + 1}`,
      description: typeof frame.description === 'string' && frame.description.trim() ? frame.description : typeof frameSprite.description === 'string' && frameSprite.description.trim() ? frameSprite.description : `Frame ${index + 1} de l’animation ${value.type ?? 'libre'}.`,
      width: sprite.width,
      height: sprite.height,
    }, sprite.width);
    const pixels = normalized.sprite.pixels.filter(pixel => !pixel.rgba.endsWith('00'));
    if (!pixels.length) throw Error(`Frame ${index + 1} entièrement transparente`);
    return {duration: frame.duration ?? Math.round(1000 / value.fps), sprite: normalized.sprite};
  });
  const colors = new Set([...basePalette, ...frames.flatMap(frame => frame.sprite.pixels.map(pixel => pixel.rgba))]);
  if (colors.size > 16) throw Error('Palette d’animation : maximum 16 couleurs');
  const signatures = frames.map(frame => JSON.stringify(frame.sprite.pixels.filter(p => !p.rgba.endsWith('00')).sort((a, b) => a.y - b.y || a.x - b.x)));
  if (requireMovement && new Set(signatures).size < 2) throw Error('Toutes les frames sont identiques : aucun mouvement');
  if (requireMovement && value.type === 'open') {
    const signature = pixels => JSON.stringify(pixels.filter(p => !p.rgba.endsWith('00')).map(p => [p.x, p.y, p.rgba]).sort((a, b) => a[1] - b[1] || a[0] - b[0]));
    if (signature(frames[0].sprite.pixels) !== signature(sprite.pixels)) throw Error('Ouverture : la première frame doit être le sprite original');
    if (signature(frames.at(-1).sprite.pixels) === signature(sprite.pixels)) throw Error('Ouverture : la dernière frame revient à la pose fermée');
  }
  return {version: 1, type: value.type ?? 'custom', fps: value.fps, loop: value.loop, frames, palette: [...colors]};
}

export function animationPrompt(type, fps, frameCount, sprite, prompt = '', {loop = defaultAnimationLoop(type), durationMs} = {}) {
  const definition = animationTypes[type] ?? animationTypes.custom;
  return [
    `Adapte ce sprite de pixel art en animation « ${definition.label} » : ${definition.hint}`,
    `Le sprite de base mesure ${sprite.width} × ${sprite.height} pixels et possède cette palette : ${JSON.stringify([...new Set(sprite.pixels.map(pixel => pixel.rgba))])}.`,
    `Génère exactement ${frameCount} frames à ${fps} FPS. Conserve la taille, le point d’ancrage visuel et l’identité du sprite. Modifie seulement les pixels nécessaires au mouvement. Au moins deux frames doivent être visuellement différentes.`,
    `${loop ? 'Lecture en boucle : créer un cycle cohérent.' : 'Lecture UNE SEULE FOIS : accomplir toute l’action jusqu’au résultat final demandé, conserver cet état à la dernière frame. Ne pas revenir à la pose initiale.'}${durationMs ? ` Durée totale : ${durationMs} ms, répartie sur toutes les frames.` : ''}`,
    'Chaque frame doit rester lisible, avoir un fond transparent et utiliser au maximum 16 couleurs. Ne décale pas le personnage dans la grille : anime les parties du corps à l’intérieur de la même boîte.',
    'Réponds avec des modifications COMPACTES du sprite, jamais en recopiant ses pixels ou sa grille. Chaque frame repart indépendamment du sprite ORIGINAL, pas de la frame précédente.',
    'moves : liste de rectangles [x,y,largeur,hauteur,dx,dy]. Les pixels visibles du rectangle sont découpés puis déplacés. Toutes les zones sont lues sur l’original, effacées puis collées dans l’ordre. Maximum 32 zones. Aucun pixel déplacé ne doit sortir de la grille.',
    'transforms : [x,y,largeur,hauteur,destinationX,destinationY,destinationLargeur,destinationHauteur]. Découpe une zone de l’original et la redimensionne en pixels nets vers le rectangle destination. Dimensions >= 1, rectangles dans la grille. Pour ouvrir une porte, comprime progressivement chaque battant vers sa charnière (largeur finale 1 ou 2), au lieu de le déplacer de quelques pixels. N’inclus pas le cadre fixe dans les zones. moves et transforms lisent tous l’original, puis sont collés, ensuite edits. Maximum 32 zones au total.',
    'edits : retouches après les déplacements [x,y,indiceCouleur] avec un indice ENTIER dans la palette du sprite (0 pour sa première couleur), ou null pour effacer. Utilise moves pour les membres et edits pour les yeux et raccords. Des listes vides représentent la pose originale.',
    `Format exact : {"version":1,"format":"changes","type":"${type}","fps":${fps},"loop":${loop},"frames":[{"duration":${Math.round(1000 / fps)},"moves":[],"transforms":[],"edits":[]}, ...]}. Remplace ... par les autres frames : exactement ${frameCount} au total. Limite-toi à quelques zones et retouches par frame.`,
    `Sprite de base (rows : . = transparent, 0 à F = indices hexadécimaux de palette, origine en haut à gauche, x vers droite, y vers bas) : ${JSON.stringify(compactSprite(sprite))}`,
    prompt.trim() ? `Consigne supplémentaire : ${JSON.stringify(prompt.trim())}` : '',
  ].filter(Boolean).join('\n');
}
