import {locationRules,enemyRules} from './investigation-core.mjs';

// Read-only view of the current room, shared by scene controls and tests.
export function sceneState(run) {
  return {
    location: run.record.story.locations.find(p=>p.id===run.location),
    investigator: run.record.story.investigator,
    enemies: run.here.map(enemy=>({...enemy, name:run.name('enemies',enemy.type), maxHealth:enemyRules[enemy.type].health})),
    exits: locationRules[run.location].links.map(to=>({to,name:run.name('locations',to),reason:run.reason('move',{to})})),
  };
}

// Anchor feet on the ground even when generated sprites have large empty margins.
export function visibleBounds(sprite) {
  const visible=sprite.pixels.filter(p=>!p.rgba.endsWith('00'));
  const xs=visible.map(p=>p.x),ys=visible.map(p=>p.y);
  const x=Math.min(...xs),y=Math.min(...ys);
  return {x,y,width:Math.max(...xs)-x+1,height:Math.max(...ys)-y+1};
}
