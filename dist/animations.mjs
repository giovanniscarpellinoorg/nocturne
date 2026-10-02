import {normalizeSprite} from './pixels.mjs';

export const animationTypes = {
  idle: {label: 'Idle · respiration', hint: 'Une respiration, un flottement ou un clignement subtil.'},
  walk: {label: 'Marche · déplacement', hint: 'Une boucle lisible avec un appui et un mouvement du corps.'},
  attack: {label: 'Attaque', hint: 'Anticipation, action puis retour à la pose de base.'},
  hurt: {label: 'Dégâts', hint: 'Un impact court, sans changer la silhouette du sprite.'},
  death: {label: 'Mort', hint: 'Une disparition ou une chute progressive.'},
  custom: {label: 'Animation libre', hint: 'Décris le mouvement que tu veux obtenir.'},
};

const color = value => typeof value === 'string' && /^#[\da-f]{8}$/i.test(value);

export function validateAnimation(value, sprite) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Animation invalide');
  if (value.version !== undefined && value.version !== 1) throw Error('Version d’animation invalide');
  if (value.type !== undefined && !Object.hasOwn(animationTypes, value.type)) throw Error('Type d’animation inconnu');
  if (!Number.isInteger(value.fps) || value.fps < 1 || value.fps > 24) throw Error('FPS d’animation : valeur attendue entre 1 et 24');
  if (typeof value.loop !== 'boolean') throw Error('Boucle d’animation invalide');
  if (!Array.isArray(value.frames) || value.frames.length < 2 || value.frames.length > 12) throw Error('Une animation doit contenir entre 2 et 12 frames');
  const frames = value.frames.map((frame, index) => {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw Error(`Frame ${index + 1} invalide`);
    if (frame.duration !== undefined && (!Number.isInteger(frame.duration) || frame.duration < 40 || frame.duration > 2000)) throw Error(`Durée de la frame ${index + 1} invalide`);
    const frameSprite = frame.sprite && typeof frame.sprite === 'object' ? frame.sprite : frame;
    const normalized = normalizeSprite({
      ...frameSprite,
      name: typeof frame.name === 'string' && frame.name.trim() ? frame.name : typeof frameSprite.name === 'string' && frameSprite.name.trim() ? frameSprite.name : `${sprite.name} · frame ${index + 1}`,
      description: typeof frame.description === 'string' && frame.description.trim() ? frame.description : typeof frameSprite.description === 'string' && frameSprite.description.trim() ? frameSprite.description : `Frame ${index + 1} de l’animation ${value.type ?? 'libre'}.`,
      width: sprite.width,
      height: sprite.height,
    }, sprite.width);
    const pixels = normalized.sprite.pixels.filter(pixel => !pixel.rgba.endsWith('00'));
    if (!pixels.length) throw Error(`Frame ${index + 1} entièrement transparente`);
    return {duration: frame.duration ?? Math.round(1000 / value.fps), sprite: normalized.sprite};
  });
  const palette = new Set(sprite.pixels.map(pixel => pixel.rgba));
  const colors = new Set(frames.flatMap(frame => frame.sprite.pixels.map(pixel => pixel.rgba)));
  if (colors.size > 16) throw Error('Palette d’animation : maximum 16 couleurs');
  return {version: 1, type: value.type ?? 'custom', fps: value.fps, loop: value.loop, frames, palette: [...new Set([...palette, ...colors])].slice(0, 16)};
}

export function animationPrompt(type, fps, frameCount, sprite, prompt = '') {
  const definition = animationTypes[type] ?? animationTypes.custom;
  return [
    `Adapte ce sprite de pixel art en animation « ${definition.label} » : ${definition.hint}`,
    `Le sprite de base mesure ${sprite.width} × ${sprite.height} pixels et possède cette palette : ${JSON.stringify([...new Set(sprite.pixels.map(pixel => pixel.rgba))])}.`,
    `Génère exactement ${frameCount} frames à ${fps} FPS. Conserve strictement la taille, la silhouette, le point d’ancrage visuel et l’identité du sprite. Modifie seulement les pixels nécessaires au mouvement.`,
    'Chaque frame doit rester lisible, avoir un fond transparent et utiliser au maximum 16 couleurs. Ne décale pas le personnage dans la grille : anime les parties du corps à l’intérieur de la même boîte.',
    'Réponds uniquement avec un JSON valide de la forme {"version":1,"type":"idle|walk|attack|hurt|death|custom","fps":8,"loop":true,"frames":[{"duration":125,"name":"...","description":"...","width":16,"height":16,"pixels":[{"x":0,"y":0,"rgba":"#RRGGBBAA"}]}]}.',
    `Sprite de base : ${JSON.stringify(sprite)}`,
    prompt.trim() ? `Consigne supplémentaire : ${JSON.stringify(prompt.trim())}` : '',
  ].filter(Boolean).join('\n');
}
