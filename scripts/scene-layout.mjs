import {validateScene,placementBox,sceneSpawn,sceneExit,reachableScenePoints} from '../dist/scene.mjs';
import {validateGameAsset} from '../dist/assets.mjs';
import {hitsRect} from '../dist/core.mjs';

// Keep every requested instance and its identity. Only its position may change.
export function prepareSceneLayout(input,library){
  try{return {scene:validateScene(input,library),adjustments:[]};}catch{}
  if(!Array.isArray(input?.placements)||input.placements.length>40)throw Error('Maximum 40 éléments par salle');
  validateScene({...input,placements:[]},library);
  const assets=new Map(library.map(a=>[a.id,a])),checked=new Map(),ids=new Set();let bosses=0;
  const placements=input.placements.map((p,index)=>{
    if(!p||typeof p.id!=='string'||!/^[\w-]{1,64}$/.test(p.id)||ids.has(p.id))throw Error(`Placement ${index} : identifiant invalide ou dupliqué`);
    ids.add(p.id);
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error(`${p.id} : coordonnées numériques attendues`);
    if(!assets.has(p.assetId))throw Error(`${p.id} : sprite ${p.assetId} introuvable`);
    if(!checked.has(p.assetId))checked.set(p.assetId,validateGameAsset(assets.get(p.assetId)));
    const a=checked.get(p.assetId),type=a.gameplay.type;
    if(type==='character')throw Error(`${p.id} : un personnage doit être choisi comme héros`);
    if(type==='decor'&&a.gameplay.stats.kind==='door')throw Error(`${p.id} : la porte doit être affectée à la sortie`);
    if(type==='boss'&&++bosses>1)throw Error('Un seul boss par salle');
    return {...p,index,asset:a};
  });
  const positions=[];for(let y=80;y<=520;y+=40)for(let x=80;x<=880;x+=40)positions.push({x,y});
  const placed=[],result=new Map(),targets=[],blocks=[];
  // Place actors/rewards first so adding obstacles can never seal them away.
  const order=[...placements].sort((a,b)=>Number(placementBox(a.asset,a).solid)-Number(placementBox(b.asset,b).solid));
  for(const p of order){
    const target=['enemy','boss','item'].includes(p.asset.gameplay.type);
    const candidates=[...positions].sort((a,b)=>(a.x-p.x)**2+(a.y-p.y)**2-((b.x-p.x)**2+(b.y-p.y)**2));
    let selected;
    for(const point of candidates){
      const box=placementBox(p.asset,point),meaningful=box.solid||target;
      if(box.x<48||box.y<48||box.x+box.w>912||box.y+box.h>552||[sceneSpawn,sceneExit].some(s=>hitsRect(s.x,s.y,36,box)))continue;
      if(meaningful&&placed.some(other=>other.meaningful&&box.x<other.x+other.w&&box.x+box.w>other.x&&box.y<other.y+other.h&&box.y+box.h>other.y))continue;
      if(box.solid){
        const reachable=reachableScenePoints([...blocks,box]);
        if([sceneExit,...targets].some(t=>!reachable.has(`${t.x},${t.y}`)))continue;
      }
      selected={id:p.id,assetId:p.assetId,...point};placed.push({...box,meaningful});
      if(box.solid)blocks.push(box);if(target)targets.push(point);break;
    }
    if(!selected)throw Error(`${p.id} (${p.asset.sprite.name}) : aucune place accessible. Réduis les obstacles ou leur taille sans supprimer les sprites requis.`);
    result.set(p.id,selected);
  }
  const corrected=placements.map(p=>result.get(p.id));
  const scene=validateScene({...input,placements:corrected},library);
  const adjustments=placements.flatMap(p=>{const q=result.get(p.id);return p.x===q.x&&p.y===q.y?[]:[`${p.id} (${p.asset.sprite.name}) déplacé de (${p.x},${p.y}) vers (${q.x},${q.y}) pour dégager les passages et éviter les chevauchements.`];});
  return {scene,adjustments};
}
