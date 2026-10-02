export function createEnemy(asset,x,y){const stats=asset.gameplay.stats;return {x,y,originX:x,originY:y,r:asset.gameplay.type==='boss'?43:20,type:asset.gameplay.type==='boss'?'boss':'custom',assetId:asset.id,profile:stats,hp:stats.health,maxHp:stats.health,cool:1.2,t:0,flash:0,warning:0,charge:0,chargeAngle:0};}
export function stepEnemy(run,e,dt){
  const p=run.player,s=e.profile,angle=Math.atan2(p.y-e.y,p.x-e.x),dist=Math.hypot(p.x-e.x,p.y-e.y);
  if(s.behavior==='chase')run.move(e,Math.cos(angle)*s.speed*dt,Math.sin(angle)*s.speed*dt);
  if(s.behavior==='shoot'){
    const speed=dist>260?s.speed:dist<160?-s.speed:0;run.move(e,Math.cos(angle)*speed*dt,Math.sin(angle)*speed*dt);
    if(e.cool<=0){run.shoot(e.x,e.y,angle,s.projectileSpeed,true,7,s.damage);e.cool=s.attackCooldown;run.onEvent('enemyshot');}
  }
  if(s.behavior==='patrol'){
    const x=e.originX+Math.cos(e.t*.8)*60,y=e.originY+Math.sin(e.t*.8)*45,a=Math.atan2(y-e.y,x-e.x);run.move(e,Math.cos(a)*s.speed*dt,Math.sin(a)*s.speed*dt);
  }
  if(s.behavior==='charge'){
    if(e.charge>0){e.charge=Math.max(0,e.charge-dt);run.move(e,Math.cos(e.chargeAngle)*s.speed*3*dt,Math.sin(e.chargeAngle)*s.speed*3*dt);}
    else if(e.cool<=0){e.charge=.45;e.chargeAngle=angle;e.cool=s.attackCooldown;e.warning=0;}
    else{e.warning=e.cool<.65?1-e.cool/.65:0;run.move(e,Math.cos(angle)*s.speed*.2*dt,Math.sin(angle)*s.speed*.2*dt);}
  }
}
