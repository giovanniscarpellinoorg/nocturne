import {validateAnimation} from './animations.mjs';
import {paintSprite} from './pixels.mjs';

const labels = {idle: 'Au repos', walk: 'Déplacement', attack: 'Attaque', hurt: 'Dégâts reçus', death: 'Mort / destruction', open: 'Ouverture', collect: 'Ramassage'};
export function gameAnimationSlots(gameplay) {
  const type = gameplay.type;
  const keys = ['character', 'enemy', 'boss'].includes(type) ? ['idle', 'walk', 'attack', 'hurt', 'death']
    : type === 'wall' ? ['idle', ...(gameplay.stats.destructible ? ['hurt', 'death'] : [])]
    : type === 'item' ? ['idle', 'collect'] : type === 'decor' ? ['idle', ...(gameplay.stats.kind === 'door' ? ['open'] : [])] : [];
  return Object.fromEntries(keys.map(key => [key, labels[key]]));
}

export function validateAnimationBindings(value = {}, gameplay, animations = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Affectations d’animations invalides.');
  const slots = gameAnimationSlots(gameplay), result = {};
  for (const [slot, id] of Object.entries(value)) {
    if (!Object.hasOwn(slots, slot)) throw Error('Action d’animation incompatible avec ce type de sprite.');
    if (typeof id !== 'string' || !animations.some(animation => animation.id === id)) throw Error('Animation introuvable dans ce sprite.');
    result[slot] = id;
  }
  return result;
}

export function gameAnimationAssets(record, gameplay, sprite) {
  const bindings = validateAnimationBindings(record.animationBindings, gameplay, record.animations ?? []);
  if (!Object.keys(bindings).length) return {};
  const animations = [...new Set(Object.values(bindings))].map(id => {
    const entry = record.animations.find(animation => animation.id === id);
    return {...validateAnimation(entry, sprite), id, name: entry.name};
  });
  return {animationBindings: bindings, animations};
}

export const animationDuration = animation => animation.frames.reduce((total, frame) => total + frame.duration, 0) / 1000;
export function gameAnimationFrame(animation, elapsed, loop = animation.loop) {
  const total = animationDuration(animation) * 1000;
  let time = Math.max(0, elapsed * 1000);
  time = loop ? time % total : Math.min(time, total);
  for (let index = 0; index < animation.frames.length; index++) {
    if (time < animation.frames[index].duration) return index;
    time -= animation.frames[index].duration;
  }
  return animation.frames.length - 1;
}

// Every instance owns its clock: two enemies sharing a sprite can animate independently.
export class GameAnimations {
  constructor() {this.time = 0; this.states = new Map(); this.ghosts = []; this.roomId = null;}
  asset(run, id) {return run.sceneAssets?.get(id) ?? (run.asset?.id === id ? run.asset : null);}
  animation(asset, slot) {return asset?.animations?.find(a => a.id === asset.animationBindings?.[slot]);}
  key(entity) {return entity.animationKey ?? entity.id ?? entity;}
  capture(run) {
    const entities = [run.player, ...run.room.enemies, ...run.props, ...run.pickups];
    return entities.map(entity => ({entity, key: this.key(entity), assetId: entity.assetId ?? run.assetForEntity(entity), x: entity.x, y: entity.y, hp: entity.hp, cool: entity.cool, charge: entity.charge}));
  }
  update(run, dt, before, playing) {
    if (run.state === 'paused' || run.state === 'ready') return;
    this.time += dt;
    if (this.roomId !== null && this.roomId !== run.roomId) {this.states.clear(); this.ghosts = []; before = [];}
    this.roomId = run.roomId;
    if (run.asset?.gameplay.type === 'decor' && run.asset.gameplay.stats.kind === 'door') {
      for (const next of run.adjacent()) this.pose(run, run.asset.id, `door-${run.roomId}-${next.id}`, run.room.cleared && (next.type !== 'boss' || run.bossUnlocked()));
    }
    this.ghosts = this.ghosts.filter(g => this.time - g.started < g.duration);
    if (!playing) return;
    const previous = new Map(before.map(sample => [sample.key, sample]));
    const after = this.capture(run), remaining = new Set(after.map(sample => sample.key));
    for (const sample of after) {
      const asset = this.asset(run, sample.assetId); if (!asset) continue;
      const old = previous.get(sample.key) ?? sample;
      let state = this.states.get(sample.key);
      if (!state) {state = {slot: 'idle', started: this.time}; this.states.set(sample.key, state);}
      let event = null;
      if (sample.hp <= 0 && old.hp > 0) event = 'death';
      else if (sample.hp < old.hp) event = 'hurt';
      else if (sample.cool > old.cool || sample.charge > (old.charge ?? 0)) event = 'attack';
      else if (sample.entity !== run.player && ['enemy', 'boss'].includes(asset.gameplay.type) && run.player.hp < previous.get(run.player)?.hp && Math.hypot(sample.x - run.player.x, sample.y - run.player.y) < sample.entity.r + run.player.r) event = 'attack';
      const eventAnimation = this.animation(asset, event);
      if (eventAnimation) {state.slot = event; state.started = this.time;}
      const active = this.animation(asset, state.slot);
      if (state.slot === 'death' && active) continue;
      if (['hurt', 'attack'].includes(state.slot) && active && this.time - state.started < animationDuration(active)) continue;
      const slot = Math.hypot(sample.x - old.x, sample.y - old.y) > .01 ? 'walk' : 'idle';
      if (state.slot !== slot) {state.slot = slot; state.started = this.time;}
    }
    for (const sample of before) {
      if (remaining.has(sample.key)) continue;
      const asset = this.asset(run, sample.assetId);
      const slot = asset?.gameplay.type === 'item' ? 'collect' : 'death';
      const animation = this.animation(asset, slot);
      if (animation) this.ghosts.push({...sample.entity, assetId: sample.assetId, animationKey: sample.key, started: this.time, duration: animationDuration(animation), slot, visualKind: asset.gameplay.type});
      this.states.delete(sample.key);
    }
  }
  pose(run, id, key, doorOpen) {
    const asset = this.asset(run, id); if (!asset) return null;
    const ghost = this.ghosts.find(g => g.animationKey === key);
    let state = ghost ? {slot: ghost.slot, started: ghost.started} : this.states.get(key);
    if (doorOpen !== undefined) {
      const slot = doorOpen ? 'open' : 'idle';
      if (!state || state.slot !== slot) {state = {slot, started: this.time}; this.states.set(key, state);}
    }
    state ??= {slot: 'idle', started: 0};
    const animation = this.animation(asset, state.slot) ?? this.animation(asset, 'idle');
    if (!animation) return null;
    const once = ['open', 'attack', 'hurt', 'death', 'collect'].includes(state.slot);
    return {id: animation.id, index: gameAnimationFrame(animation, this.time - state.started, once ? false : animation.loop)};
  }
  doorReady(run, next) {
    if (run.asset?.gameplay.type !== 'decor' || run.asset.gameplay.stats.kind !== 'door') return true;
    const animation = this.animation(run.asset, 'open'); if (!animation) return true;
    const key = `door-${run.roomId}-${next.id}`;
    this.pose(run, run.asset.id, key, true);
    return this.time - this.states.get(key).started >= animationDuration(animation);
  }
}

export function createGameImages(assets, createCanvas = () => document.createElement('canvas')) {
  const images = new Map();
  for (const asset of assets) {
    const base = createCanvas(); paintSprite(base, asset.sprite);
    const animations = new Map((asset.animations ?? []).map(animation => [animation.id, animation.frames.map(frame => {const image = createCanvas(); paintSprite(image, frame.sprite); return image;})]));
    images.set(asset.id, {base, animations});
  }
  return (id, pose) => {const entry = images.get(id); return (pose && entry?.animations.get(pose.id)?.[pose.index]) || entry?.base;};
}
