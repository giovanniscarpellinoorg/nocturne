import {cardRules} from './investigation-core.mjs';

// Describe an already resolved action. Presentation must never draw a second
// token or modify the run, including when an animation is skipped.
export function actionFeedback(before,run,action,payload={}){
 const card=payload.card?.slice(0,-2),rule=cardRules[card],enemy=before.enemies.find(e=>e.id===payload.target);
 const title=action==='play'?run.name('cards',card):({investigate:'Enquêter',attack:'Attaquer',evade:'Esquiver',draw:'Une carte de plus',resource:'Préparer ses ressources',rest:'Reprendre ses esprits',move:run.name('locations',run.location),end:'La nuit avance',resolve:'Le dernier choix'}[action]??'Action');
 const changes=[];
 for(const [key,label,target]of [['health','vie','life'],['sanity','santé mentale','sanity'],['resources','ressource(s)','resources'],['clues','indice(s)','clues'],['doom','menace','doom-count']]){
  const delta=run[key]-before[key];if(delta)changes.push({label:`${delta>0?'+':'−'}${Math.abs(delta)} ${label}`,target,negative:key==='doom'?delta>0:delta<0});
 }
 const drawn=run.hand.filter(id=>!before.hand.includes(id)).map(id=>({key:'card.'+id.slice(0,-2),name:run.name('cards',id.slice(0,-2))}));
 const equipped=run.equipment.filter(id=>!before.equipment.includes(id));
 // The journal is capped at 60 entries, so using its old length loses events
 // late in a game. Match the surviving suffix instead.
 let overlap=Math.min(before.log.length,run.log.length);
 while(overlap&&!before.log.slice(-overlap).every((entry,i)=>entry===run.log[i]))overlap--;
 const events=run.log.slice(overlap).filter(entry=>!run.lastTest||!entry.startsWith(run.lastTest.label+' :'));
 if(run.lastTest&&!run.lastTest.success)events.unshift(({Enquête:'Aucun indice découvert.',Combat:'Aucun dégât infligé.',Esquive:'L’ennemi reste actif et peut toujours attaquer.'})[run.lastTest.label]??'Le test échoue.');
 for(const entry of drawn)events.push('Carte ajoutée à la main : '+entry.name+'.');
 if(equipped.length)events.push('Équipement placé devant vous : +1 à vos tests d’enquête.');
 const cost=action==='end'?'Fin de tour : attaques ennemies, menace, rencontre, puis récupération.':`1 action dépensée${rule?.cost?` · ${rule.cost} ressource(s) payée(s)`:''}.`;
 return {title,context:enemy?run.name('enemies',enemy.type):run.name('locations',run.location),cost,
  test:run.lastTest?{...run.lastTest,total:run.lastTest.skill+run.lastTest.token}:null,
  changes,events,drawn,equipped:Boolean(equipped.length),
  artKey:drawn[0]?.key??(card?'card.'+card:action==='move'?'location.'+run.location:null),
  modal:Boolean(run.lastTest)||action==='end'||action==='draw',
  outcome:run.state,round:run.round,action,location:run.location};
}
