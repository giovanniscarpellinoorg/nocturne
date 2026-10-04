import {validateGameAsset} from './assets.mjs';
import {hitsRect} from './core.mjs';
export const sceneSpawn = {x: 120, y: 320};
export const sceneExit = {x: 880, y: 320};
export const blankScene = () => ({version:1,title:'Ma première salle',theme:'moss',heroId:null,placements:[]});
export function reachableScenePoints(blocks){
  const reachable=new Set([`${sceneSpawn.x},${sceneSpawn.y}`]),queue=[sceneSpawn];
  for(let i=0;i<queue.length;i++)for(const[dx,dy]of[[20,0],[-20,0],[0,20],[0,-20]]){
    const x=queue[i].x+dx,y=queue[i].y+dy,key=`${x},${y}`;
    if(x<60||x>900||y<60||y>540||reachable.has(key)||blocks.some(b=>hitsRect(x,y,16,b)))continue;
    reachable.add(key);queue.push({x,y});
  }
  return reachable;
}
export function placementBox(asset, placement) {
  const {type,stats}=asset.gameplay;
  const w=['wall','decor'].includes(type)?stats.width:type==='boss'?96:type==='item'?40:48;
  const h=['wall','decor'].includes(type)?stats.height:w;
  return {x:placement.x-w/2,y:placement.y-h/2,w,h,solid:type==='wall'||type==='decor'&&stats.kind!=='door'&&stats.solid};
}
export function validateScene(input, library) {
  if(!input||input.version!==1||typeof input.title!=='string'||!input.title.trim()||input.title.length>80||/\p{Cc}/u.test(input.title))throw Error('Titre de salle invalide');
  if(!['moss','ember','violet'].includes(input.theme))throw Error('Ambiance de salle invalide');
  if(!Array.isArray(input.placements)||input.placements.length>40)throw Error('Maximum 40 éléments par salle');
  const map=new Map(library.map(a=>[a.id,a])),used=new Map();
  function asset(id){if(typeof id!=='string'||!map.has(id))throw Error('Un sprite de la salle est introuvable');const a=validateGameAsset(map.get(id));used.set(id,a);return a;}
  const heroId=input.heroId??null;
  if(heroId!==null&&asset(heroId).gameplay.type!=='character')throw Error('Le héros doit être un personnage');
  const exitId=input.exitId??null;
  if(exitId!==null){const door=asset(exitId);if(door.gameplay.type!=='decor'||door.gameplay.stats.kind!=='door')throw Error('La sortie doit être un décor porte');}
  const ids=new Set(),blocks=[],targets=[],boxes=[];let bosses=0;
  const placements=input.placements.map((p,index)=>{
    if(!p||typeof p.id!=='string'||!/^[\w-]{1,64}$/.test(p.id)||ids.has(p.id))throw Error(`Placement ${index}: identifiant invalide ou dupliqué`);
    ids.add(p.id);
    if(!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x%40||p.y%40||p.x<80||p.x>880||p.y<80||p.y>520)throw Error(`Placement ${index}: utilise la grille de 40 px dans la salle`);
    const a=asset(p.assetId),type=a.gameplay.type;
    if(type==='character')throw Error('Choisis le personnage dans le champ Héros');
    if(type==='decor'&&a.gameplay.stats.kind==='door')throw Error('La sortie est déjà prévue à droite ; place les autres décors dans la salle');
    if(type==='boss'&&++bosses>1)throw Error('Un seul boss par salle');
    const box=placementBox(a,p);
    if(box.x<48||box.y<48||box.x+box.w>912||box.y+box.h>552)throw Error(`${a.sprite.name} dépasse les murs extérieurs`);
    if(hitsRect(sceneSpawn.x,sceneSpawn.y,36,box)||hitsRect(sceneExit.x,sceneExit.y,36,box))throw Error('Laisse le départ et la sortie libres');
    const meaningful=box.solid||['enemy','boss','item'].includes(type);
    if(meaningful){for(const other of boxes)if(box.x<other.x+other.w&&box.x+box.w>other.x&&box.y<other.y+other.h&&box.y+box.h>other.y)throw Error('Deux éléments de jeu se chevauchent');boxes.push(box);}
    if(box.solid)blocks.push(box);
    if(['enemy','boss','item'].includes(type))targets.push(p);
    return {id:p.id,assetId:a.id,x:p.x,y:p.y};
  });
  // Flood-fill using the player's collision radius, with all walls treated as intact.
  const reachable=reachableScenePoints(blocks);
  for(const p of [sceneExit,...targets])if(!reachable.has(`${p.x},${p.y}`))throw Error('Un obstacle bloque la sortie, un ennemi ou une récompense');
  return {plan:{version:1,title:input.title.trim(),theme:input.theme,heroId,...(exitId?{exitId}:{}),placements},assets:[...used.values()]};
}

export function scenePrompt(inspiration, records) {
  return `Compose une salle jouable vue du dessus pour Nocturne. Réponds seulement avec le JSON suivant, sans code : ${JSON.stringify(blankScene())}.
title : nom français court, theme : moss/ember/violet, heroId : identifiant d'un personnage disponible ou null pour le héros de base. placements : maximum 40 objets {"id":"p1","assetId":"identifiant disponible","x":480,"y":320}. Chaque id de placement est unique.
La salle mesure 960 × 600. Positions AU CENTRE des sprites, coordonnées multiples de 40, x entre 80 et 880, y entre 80 et 520. Les formes doivent rester dans les murs x=48..912 et y=48..552. Départ (120,320), sortie (880,320) : laisse 80 px libres autour. Ne place aucun personnage dans placements, ni de décor porte. Ne superpose pas d'éléments solides, ennemis ou objets. Laisse des couloirs larges d'au moins 80 px et tous les ennemis, récompenses et la sortie accessibles.
Vise une petite salle avec deux ennemis si disponibles, quelques obstacles et une récompense. Un seul boss maximum, facultatif. Choisis des sprites cohérents avec l'ambiance et leurs avis, privilégie ceux validés ou bien notés. N'invente jamais d'identifiant ou de sprite. Si un type manque, compose avec les éléments existants.
Ambiance demandée : ${JSON.stringify(inspiration)}.
Sprites disponibles (dimensions des décors/murs dans stats, ennemis 48px, boss 96px, objets 40px) : ${JSON.stringify(records.map(r=>({id:r.id,name:r.sprite.name,description:r.sprite.description,gameplay:r.gameplay,review:r.review})))}`;
}
