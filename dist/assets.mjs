import {validateSprite} from './pixels.mjs';

const number = (label, value, min, max, step = 1) => ({label, value, min, max, step, type: 'number'});
const select = (label, value, options) => ({label, value, options, type: 'select'});
const toggle = (label, value) => ({label, value, type: 'boolean'});
export const assetTypes = {
  art: {label: 'Dessin libre', hint: 'Une illustration sans comportement de jeu.', fields: {}},
  character: {label: 'Personnage', hint: 'Remplace le héros : déplacement, tirs et esquive.', fields: {
    health: number('Vie (cœurs)', 6, 1, 12), damage: number('Dégâts par tir', 12, 1, 50), speed: number('Vitesse (px/s)', 225, 80, 360), fireRate: number('Délai entre tirs (s)', .3, .1, 1.5, .05),
  }},
  enemy: {label: 'Ennemi', hint: 'Un adversaire à poursuivre, éviter ou combattre dans une salle.', fields: {
    health: number('Vie (PV)', 36, 1, 300), damage: number('Dégâts (cœurs)', 1, 1, 4), speed: number('Vitesse (px/s)', 80, 20, 200), behavior: select('Comportement', 'chase', {chase: 'Poursuivre', shoot: 'Tirer à distance', charge: 'Charger', patrol: 'Patrouiller'}), projectileSpeed: number('Vitesse des tirs (px/s)', 160, 80, 300), attackCooldown: number('Délai des attaques (s)', 2, .5, 5, .1),
  }},
  decor: {label: 'Décor', hint: 'Plante ou mobilier dans la salle de départ. Une porte remplace les passages et suit leur verrouillage.', fields: {
    kind: select('Nature', 'plant', {plant: 'Plante', furniture: 'Mobilier', door: 'Porte'}), solid: toggle('Bloque les déplacements et les tirs (hors porte)', false), width: number('Largeur en jeu (px)', 64, 16, 128), height: number('Hauteur en jeu (px)', 64, 16, 128),
  }},
  wall: {label: 'Mur', hint: 'Un obstacle solide dans la salle de départ. S’il est destructible, tes tirs réduisent sa résistance.', fields: {
    width: number('Largeur en jeu (px)', 96, 16, 160), height: number('Hauteur en jeu (px)', 48, 16, 128), destructible: toggle('Destructible', true), health: number('Résistance (PV, si destructible)', 48, 1, 300),
  }},
  item: {label: 'Objet interactif', hint: 'Marche dessus pour le ramasser une seule fois et appliquer son bonus.', fields: {
    effect: select('Effet au ramassage', 'vitality', {heal: 'Soigner des cœurs', vitality: 'Ajouter des cœurs maximum et soigner', power: 'Augmenter les dégâts (%)', speed: 'Augmenter la vitesse (%)', haste: 'Réduire le délai entre tirs (%)', spread: 'Tirer trois projectiles', pierce: 'Projectiles traversants'}),
    amount: number('Valeur du bonus', 1, 1, 100),
  }},
  boss: {label: 'Boss', hint: 'Test immédiat dans la salle du gardien, avec deux phases de combat.', fields: {
    health: number('Vie (PV)', 150, 50, 1000), damage: number('Dégâts (cœurs)', 1, 1, 4), pattern: select('Attaque', 'ring', {ring: 'Anneaux', fan: 'Éventail', spiral: 'Spirale'}), projectileSpeed: number('Vitesse des projectiles (px/s)', 160, 80, 300), attackCooldown: number('Délai entre attaques (s)', 2, .5, 4, .1),
  }},
};

export function defaultGameplay(type = 'art') {
  if (!Object.hasOwn(assetTypes, type)) throw Error('Type de sprite inconnu');
  return {type, stats: Object.fromEntries(Object.entries(assetTypes[type].fields).map(([key, field]) => [key, field.value]))};
}

export function itemAmountLimit(effect) {return ['heal', 'vitality'].includes(effect) ? 6 : effect === 'haste' ? 50 : ['spread', 'pierce'].includes(effect) ? 1 : 100;}

export function validateGameplay(value, expectedType) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(assetTypes, value.type)) throw Error('Type de sprite inconnu');
  if (expectedType && value.type !== expectedType) throw Error(`Type attendu : ${expectedType}`);
  if (Object.keys(value).some(key => !['type', 'stats'].includes(key))) throw Error('Champs de fiche inconnus');
  const fields = assetTypes[value.type].fields, stats = value.stats;
  if (!stats || typeof stats !== 'object' || Array.isArray(stats) || Object.keys(stats).some(key => !Object.hasOwn(fields, key))) throw Error('Statistiques invalides');
  const checked = {};
  for (const [key, field] of Object.entries(fields)) {
    const v = stats[key];
    if (field.type === 'number' && (!Number.isFinite(v) || v < field.min || v > field.max || (field.step === 1 && !Number.isInteger(v)))) throw Error(`${field.label} : valeur attendue entre ${field.min} et ${field.max}`);
    if (field.type === 'boolean' && typeof v !== 'boolean') throw Error(`${field.label} : booléen attendu`);
    if (field.type === 'select' && (typeof v !== 'string' || !Object.hasOwn(field.options, v))) throw Error(`${field.label} : choix invalide`);
    checked[key] = v;
  }
  if (value.type === 'item' && checked.amount > itemAmountLimit(checked.effect)) throw Error(`Valeur du bonus : maximum ${itemAmountLimit(checked.effect)} pour cet effet`);
  return {type: value.type, stats: checked};
}

export function validateGameAsset(record) {
  if (!record || typeof record.id !== 'string' || record.id.length > 80) throw Error('Sprite de jeu invalide');
  const gameplay = validateGameplay(record.gameplay);
  if (gameplay.type === 'art') throw Error('Choisis un type de jeu pour ce dessin avant de le tester');
  return {id: record.id, sprite: validateSprite(record.sprite), gameplay};
}

export function gameplayInstructions(type) {
  if (type === 'art') return '';
  const definition = assetTypes[type];
  const limits = Object.fromEntries(Object.entries(definition.fields).map(([key, field]) => [key, field.type === 'number' ? {min: field.min, max: field.max, integer: field.step === 1} : field.type === 'select' ? Object.keys(field.options) : 'boolean']));
  return `Ce dessin est un ${definition.label}. ${definition.hint} Dessine un élément isolé, sans fond opaque, lisible dans un jeu vu du dessus. Ajoute au même objet JSON le champ gameplay, selon ce modèle : ${JSON.stringify(defaultGameplay(type))}. Propose des statistiques cohérentes avec la demande, pas forcément les valeurs de l'exemple. Type imposé : ${type}. Champs obligatoires et limites : ${JSON.stringify(limits)}. Pour un objet, amount signifie cœurs pour heal/vitality (1 à 6), pourcentage pour power/speed (1 à 100) ou haste (1 à 50), et vaut 1 pour spread/pierce. Pour un décor porte, les dimensions et solid ne modifient pas les passages du donjon : le moteur gère leur ouverture.`;
}

export function itemLabel({effect, amount}) {
  return {heal: `Soigne ${amount} cœur(s)`, vitality: `Vie max. +${amount}, soin complet`, power: `Dégâts +${amount} %`, speed: `Vitesse +${amount} %`, haste: `Délai de tir −${amount} %`, spread: 'Trois projectiles par tir', pierce: 'Tirs traversants'}[effect];
}

export function applyItem(player, stats) {
  const {effect, amount} = validateGameplay({type: 'item', stats}).stats;
  if (effect === 'heal') player.hp = Math.min(player.maxHp, player.hp + amount);
  if (effect === 'vitality') {player.maxHp += amount; player.hp = player.maxHp;}
  if (effect === 'power') player.damage *= 1 + amount / 100;
  if (effect === 'speed') player.speed *= 1 + amount / 100;
  if (effect === 'haste') player.rate *= 1 - amount / 100;
  if (effect === 'spread') player.spread = true;
  if (effect === 'pierce') player.pierce = true;
}
