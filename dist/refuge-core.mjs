import {fieldNodes,fieldExit,encounterSite,nearSite} from './refuge-field.mjs';
export const resources={wood:'Bois',food:'Vivres',herbs:'Herbes',embers:'Braises'};
export const buildings={
 inn:{name:'L’auberge',description:'Un toit pour ceux qui reviennent. Chaque amélioration apporte une action de plus par journée.',cost:{wood:5,embers:1},max:3},
 garden:{name:'Le jardin',description:'Des cultures à l’abri du vent. Produit 2 vivres par niveau à chaque aube.',cost:{wood:4,herbs:1},max:3},
 workshop:{name:'L’atelier',description:'Des outils pour explorer plus loin. Chaque niveau ajoute 1 bois aux récoltes de bois.',cost:{wood:5,embers:1},max:3},
 beacon:{name:'Le fanal',description:'Une lumière dans la brume. Chaque niveau ranime 1 point d’espoir à l’aube.',cost:{wood:6,embers:2},max:3},
};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const fail=message=>{throw Error(message);};
const string=(v,max,label)=>typeof v==='string'&&v.trim()&&v.length<=max&&!/[\x00-\x1f]/.test(v)?v.trim():fail(label+' invalide.');
const identifier=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,45}$/.test(v)?v:fail('Identifiant invalide.');
function amounts(value={},min=0,max=8){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Ressources invalides.');
 const result={};for(const [key,n]of Object.entries(value)){if(!Object.hasOwn(resources,key)||!Number.isInteger(n)||n<min||n>max)fail('Quantité de ressource invalide.');if(n)result[key]=n;}return result;
}
export function validateRefugeEvent(value,world){
 if(!value||typeof value!=='object')fail('Rencontre invalide.');
 if(!world.locations.some(l=>l.id===value.location))fail('Lieu de rencontre inconnu.');
 if(!Array.isArray(value.choices)||value.choices.length<2||value.choices.length>3)fail('Deux ou trois choix sont nécessaires.');
 const reserved=(kind,entries)=>new Set([...entries.map(e=>e.id),...(world.events??[]).flatMap(e=>e.choices.map(c=>c.effects[kind]?.id).filter(Boolean))]);
 const residentIds=reserved('resident',world.residents),locationIds=reserved('location',world.locations);
 const choices=value.choices.map((c,index)=>{
  const cost=amounts(c.cost),e=c.effects??{},effects={resources:amounts(e.resources)};
  if(e.morale!==undefined){if(!Number.isInteger(e.morale)||Math.abs(e.morale)>2)fail('Variation d’espoir invalide.');effects.morale=e.morale;}
  if(e.resident){const r=e.resident;if(residentIds.size>=30)fail('Le refuge accueille déjà 30 habitants.');if(residentIds.has(r.id))fail('Cet habitant existe déjà.');if(!Object.hasOwn(resources,r.skill))fail('Talent inconnu.');effects.resident={id:identifier(r.id),name:string(r.name,65,'Nom'),role:string(r.role,60,'Rôle'),description:string(r.description,500,'Portrait'),skill:r.skill};}
  if(e.location){const l=e.location;if(locationIds.size>=30)fail('Trente lieux sont déjà explorables.');if(locationIds.has(l.id))fail('Ce lieu existe déjà.');if(!Object.hasOwn(resources,l.resource))fail('Récolte inconnue.');effects.location={id:identifier(l.id),name:string(l.name,65,'Lieu'),description:string(l.description,600,'Description'),resource:l.resource};}
  if(e.rule){const r=e.rule;if(!['harvest','dawn'].includes(r.kind)||!Object.hasOwn(resources,r.resource)||!Number.isInteger(r.amount)||!r.amount||r.amount< -2||r.amount>3||!Number.isInteger(r.days)||r.days<1||r.days>5)fail('Règle de refuge invalide.');effects.rule={id:identifier(r.id),name:string(r.name,65,'Règle'),description:string(r.description,300,'Règle'),kind:r.kind,resource:r.resource,amount:r.amount,days:r.days};}
  if(Object.keys(e).some(k=>!['resources','morale','resident','location','rule'].includes(k)))fail('Effet de rencontre inconnu.');
  return {id:String(index),label:string(c.label,100,'Choix'),consequence:string(c.consequence,700,'Conséquence'),cost,effects};
 });
 if(!choices.some(c=>!Object.keys(c.cost).length))fail('Un choix gratuit est nécessaire.');
 return {title:string(value.title,90,'Titre'),text:string(value.text,1200,'Récit'),location:value.location,choices};
}
export function newRefuge(){
 const world={version:1,revision:0,name:'Le refuge des lucioles',day:1,energy:3,morale:6,resources:{wood:6,food:5,herbs:2,embers:1},buildings:{inn:1,garden:0,workshop:0,beacon:0},
 residents:[{id:'mara',name:'Mara',role:'Jardinière',description:'Elle garde des graines dans la doublure de son manteau. Elle veut voir quelque chose pousser ici.',skill:'food'},{id:'abel',name:'Abel',role:'Charpentier',description:'Il répare les chaises avant de s’asseoir. Il parle peu de la maison qu’il a quittée.',skill:'wood'},{id:'sile',name:'Sile',role:'Veilleuse',description:'Elle connaît le nom des lumières qui flottent dans les bois. Certaines lui répondent.',skill:'herbs'}],
 locations:[{id:'woods',name:'Le bois des murmures',description:'Sous les branches, des lumières basses dessinent un chemin. Quelque chose attend au bord du sentier.',resource:'wood'},{id:'river',name:'La rivière pâle',description:'Une eau claire traverse les ruines d’un vieux moulin. Des herbes poussent entre les pierres.',resource:'herbs'}],
 rules:[],events:[],completed:[],memories:[],journal:[],trip:null,art:{},lastReport:null,conversations:{}};
 world.events=[{id:'first-light',source:'refuge',...validateRefugeEvent({title:'Une petite lumière blessée',location:'woods',text:'Un renardeau aux oreilles lumineuses est pris sous une branche. À ton approche, les lucioles se rassemblent autour de sa patte blessée. Il tient dans sa gueule une clé couverte de mousse.',choices:[
 {label:'Le soigner et l’accueillir au refuge',cost:{herbs:1,food:1},consequence:'Vous ramenez Brume à l’auberge. Il dépose sa clé près du feu. Cette nuit, il vous montre le sentier d’un verger oublié.',effects:{morale:2,resident:{id:'brume',name:'Brume',role:'Compagnon des lucioles',description:'Un renardeau lumineux. Sauvé dans les bois, il a choisi de vous suivre. Il déniche des braises sous les pierres.',skill:'embers'},location:{id:'orchard',name:'Le verger oublié',description:'Des fruits dorés brillent derrière une grille envahie de mousse. La clé de Brume ouvre le passage.',resource:'food'},rule:{id:'fireflies',name:'Le sillage des lucioles',description:'Les lucioles accompagnent vos sorties dans les bois.',kind:'harvest',resource:'wood',amount:1,days:3}}},
 {label:'Le libérer et le laisser repartir',cost:{},consequence:'Vous soulevez la branche. Avant de disparaître, le renardeau laisse sa clé. Les lucioles vous guident vers un verger que la brume cachait jusque-là.',effects:{resources:{wood:2},morale:1,location:{id:'orchard',name:'Le verger oublié',description:'Une grille rouillée ouvre sur des arbres chargés de fruits dorés. Un petit renard vous a laissé la clé.',resource:'food'}}}
 ]},world)}];
 world.events.push({id:'river-lantern',source:'refuge',...validateRefugeEvent({title:'Les braises du moulin',location:'river',text:'Dans les ruines, un four brûle encore sous la pluie. Une passerelle brisée mène à une réserve de braises. Plus haut, un sentier rejoint une ancienne carrière où la pierre reste chaude.',choices:[
 {label:'Réparer la passerelle et récupérer les braises',cost:{wood:2},consequence:'La passerelle tient. Vous rapportez le feu du moulin et repérez la carrière tiède, une source de braises pour vos futurs chantiers.',effects:{resources:{embers:3},location:{id:'quarry',name:'La carrière tiède',description:'Même sous la pluie, ces pierres gardent la chaleur. On peut recueillir des braises entre leurs veines rouges.',resource:'embers'}}},
 {label:'Prendre une braise accessible et repérer le sentier',cost:{},consequence:'Vous protégez une braise dans une pierre creuse. La carrière sera plus facile à explorer qu’un moulin en ruine.',effects:{resources:{embers:1},location:{id:'quarry',name:'La carrière tiède',description:'Derrière le moulin, la pierre couve un feu ancien. Des braises se ramassent entre les roches.',resource:'embers'}}}
 ]},world)});
 note(world,'Une première nuit à l’abri. Mara, Abel et Sile comptent sur toi pour faire vivre ce lieu.');return world;
}
export function ruleText(rule){return `${rule.kind==='harvest'?'À chaque récolte de '+resources[rule.resource].toLowerCase():'À chaque aube'} : ${rule.amount>0?'+':''}${rule.amount} ${resources[rule.resource].toLowerCase()} · ${rule.days} nuit(s)`;}
export function effectText(e){const parts=Object.entries(e.resources??{}).map(([k,v])=>`+${v} ${resources[k].toLowerCase()}`);if(e.morale)parts.push(`${e.morale>0?'+':''}${e.morale} espoir`);if(e.resident)parts.push(`Accueillir ${e.resident.name}`);if(e.location)parts.push(`Découvrir ${e.location.name}`);if(e.rule)parts.push(ruleText(e.rule));return parts.join(' · ')||'Un souvenir pour le refuge';}
export function costText(cost){return Object.entries(cost).map(([k,v])=>`${v} ${resources[k].toLowerCase()}`).join(' · ')||'Sans coût';}
export function energyLimit(world){return 2+world.buildings.inn;}
export function upgradeCost(world,id){return Object.fromEntries(Object.entries(buildings[id].cost).map(([key,n])=>[key,n*(world.buildings[id]+1)]));}
const affordable=(world,cost)=>Object.entries(cost).every(([k,v])=>world.resources[k]>=v);
function note(world,text){world.journal.push({day:world.day,text});world.journal=world.journal.slice(-100);}
function alter(world,delta){for(const [k,v]of Object.entries(delta))world.resources[k]=clamp(world.resources[k]+v,0,99);}
function remember(world,text){world.memories.push({day:world.day,text});world.memories=world.memories.slice(-200);note(world,text);}
export function harvestAmount(world,location,resident){return clamp(3+(resident?.skill===location.resource?1:0)+(location.resource==='wood'?world.buildings.workshop:0)+world.rules.filter(r=>r.kind==='harvest'&&r.resource===location.resource).reduce((n,r)=>n+r.amount,0),1,12);}
export function refugeReason(world,action,p={}){
 if(world.trip&&!['choose','return','discover','collect'].includes(action))return 'Reviens d’abord de ton expédition.';
 if(['depart','build','talk'].includes(action)&&world.energy<1)return 'La journée touche à sa fin. Passez la nuit à l’auberge.';
 if(action==='depart'){if(p.mode!==undefined&&p.mode!=='field')return 'Mode d’expédition inconnu.';if(!world.locations.some(l=>l.id===p.location)||!world.residents.some(r=>r.id===p.resident))return 'Choisis un lieu et un compagnon.';}
 else if(action==='choose'){if(world.trip?.fieldVersion===1&&!world.trip.discovered)return 'Rejoins la découverte et examine-la avec E.';if(!world.trip?.event||world.trip.choice!==null)return 'Cette rencontre est déjà résolue.';const c=world.trip.event.choices.find(c=>c.id===p.choice);if(!c)return 'Choix inconnu.';if(!affordable(world,c.cost))return 'Il manque des provisions pour ce choix.';}
 else if(action==='discover'){if(!world.trip?.event||world.trip.fieldVersion!==1)return 'Aucune rencontre à examiner.';if(world.trip.discovered)return 'Cette découverte a déjà été examinée.';if(!nearSite(p.position,encounterSite))return 'Approche-toi de la découverte.';}
 else if(action==='collect'){if(world.trip?.fieldVersion!==1)return 'Aucune récolte en cours.';const site=fieldNodes(world.trip).find(n=>n.id===p.node);if(!site)return 'Récolte inconnue.';if(world.trip.collected.includes(site.id))return 'Ce point a déjà été récolté.';if(!nearSite(p.position,site))return 'Approche-toi de la ressource.';}
 else if(action==='return'){if(!world.trip)return 'Tu es déjà au refuge.';if(world.trip.fieldVersion===1&&!nearSite(p.position,fieldExit))return 'Rejoins le chemin du refuge pour rentrer.';}
 else if(action==='build'){if(!Object.hasOwn(buildings,p.building))return 'Bâtiment inconnu.';if(world.buildings[p.building]>=buildings[p.building].max)return 'Ce bâtiment est entièrement aménagé.';if(!affordable(world,upgradeCost(world,p.building)))return 'Il manque des matériaux pour ce chantier.';}
 else if(action==='talk'){if(!world.residents.some(r=>r.id===p.resident))return 'Habitant inconnu.';if(world.conversations[p.resident]===world.day)return 'Vous avez déjà partagé un moment aujourd’hui.';}
 else if(action!=='rest')return 'Action inconnue.';
 return null;
}
function gathering(world,location,resident){
 const amount=harvestAmount(world,location,resident);
 return {id:`gather-${world.day}-${world.revision}`,title:'Ce que le chemin vous offre',text:`${location.description} ${resident.name} s’arrête pour vous aider. Vous pouvez faire des réserves, ou prendre le temps de vous retrouver.`,location:location.id,choices:[
 {id:'0',label:`Récolter avec ${resident.name}`,cost:{},consequence:`Vous rentrez avec ${amount} ${resources[location.resource].toLowerCase()}. ${resident.name} repère le chemin pour une prochaine sortie.`,effects:{resources:{[location.resource]:amount}}},
 {id:'1',label:'Faire une petite récolte et parler en chemin',cost:{},consequence:`Au retour, ${resident.name} vous confie que ce refuge commence à ressembler à une maison.`,effects:{resources:{[location.resource]:1},morale:1}}
 ]};
}
export function refugeAction(world,action,p={}){
 const reason=refugeReason(world,action,p);if(reason)throw Error(reason);
 // Every mutation works on a copy so rejected operations never consume a cost.
 const next=structuredClone(world);next.lastReport=null;
 if(action==='depart'){
  const place=next.locations.find(l=>l.id===p.location),resident=next.residents.find(r=>r.id===p.resident);
  next.energy--;next.trip={location:p.location,resident:p.resident,event:next.events.find(e=>e.location===p.location)??(p.mode==='field'?null:gathering(next,place,resident)),choice:null,...(p.mode==='field'?{fieldVersion:1,collected:[],cargo:{},resource:place.resource,yield:harvestAmount(next,place,resident),discovered:false}: {})};
  note(next,`Départ vers ${place.name} avec ${resident.name}.`);
 }else if(action==='discover'){next.trip.discovered=true;
 }else if(action==='collect'){const site=fieldNodes(next.trip).find(n=>n.id===p.node);next.trip.collected.push(site.id);next.trip.cargo[site.resource]=(next.trip.cargo[site.resource]??0)+site.amount;
 }else if(action==='choose'){
  const choice=next.trip.event.choices.find(c=>c.id===p.choice);alter(next,Object.fromEntries(Object.entries(choice.cost).map(([k,v])=>[k,-v])));next.trip.choice=choice.id;
 }else if(action==='return'){
  const trip=next.trip,choice=trip.event?.choices.find(c=>c.id===trip.choice);
  if(choice){
   const e=choice.effects;alter(next,e.resources??{});next.morale=clamp(next.morale+(e.morale??0),0,10);
   if(e.resident&&!next.residents.some(r=>r.id===e.resident.id))next.residents.push(e.resident);
   if(e.location&&!next.locations.some(l=>l.id===e.location.id))next.locations.push(e.location);
   if(e.rule){next.rules=next.rules.filter(r=>r.id!==e.rule.id);next.rules.push(e.rule);}
   next.events=next.events.filter(e=>e.id!==trip.event.id);next.completed.push(trip.event.id);next.completed=next.completed.slice(-300);
   remember(next,`${trip.event.title} — ${choice.label}. ${choice.consequence}`);
   next.lastReport={title:'Vous êtes de retour',text:choice.consequence,effects:effectText(e)};
  }else{note(next,'Vous êtes rentrés sans intervenir. La rencontre vous attendra.');next.lastReport={title:'Le feu vous attend',text:'Vous rentrez sans prendre de risque. La rencontre reste accessible.',effects:''};}
  if(trip.cargo&&Object.keys(trip.cargo).length){alter(next,trip.cargo);const haul=effectText({resources:trip.cargo});note(next,'Récoltes rapportées : '+haul);next.lastReport.effects=[next.lastReport.effects,haul].filter(Boolean).join(' · ');if(!choice)next.lastReport.text=trip.event?'Vous ramenez vos récoltes. La rencontre reste disponible pour une prochaine sortie.':'Vous déposez vos récoltes au refuge. Le chemin reste ouvert pour une prochaine sortie.';}
  next.trip=null;
 }else if(action==='build'){
  const cost=upgradeCost(next,p.building);alter(next,Object.fromEntries(Object.entries(cost).map(([k,v])=>[k,-v])));next.buildings[p.building]++;next.energy--;
  const text=`${buildings[p.building].name} atteint le niveau ${next.buildings[p.building]}. ${buildings[p.building].description}`;remember(next,text);next.lastReport={title:'Le refuge prend forme',text,effects:'−1 action · '+costText(cost)};
 }else if(action==='talk'){
  const r=next.residents.find(r=>r.id===p.resident);next.energy--;next.morale=clamp(next.morale+1,0,10);next.conversations[r.id]=next.day;
  const text=`${r.name} partage un moment près du feu. ${r.description}`;note(next,text);next.lastReport={title:`Un moment avec ${r.name}`,text,effects:'+1 espoir · −1 action'};
 }else if(action==='rest'){
  const produced=next.buildings.garden*2;alter(next,{food:produced});for(const rule of next.rules.filter(r=>r.kind==='dawn'))alter(next,{[rule.resource]:rule.amount});
  const needed=Math.ceil(next.residents.length/2),used=Math.min(needed,next.resources.food),missing=needed-used;alter(next,{food:-used});next.morale=clamp(next.morale+(missing?-2:1)+next.buildings.beacon,0,10);
  next.rules=next.rules.map(r=>({...r,days:r.days-1})).filter(r=>r.days>0);next.day++;next.energy=energyLimit(next);next.conversations={};
  const text=`Le jardin produit ${produced} vivres. Le refuge en consomme ${used} sur ${needed} nécessaires. ${missing?'Le repas est trop léger : −2 espoir.':'Tout le monde a mangé : +1 espoir.'} ${next.buildings.beacon?`Le fanal apporte +${next.buildings.beacon} espoir.`:''}`;
  note(next,`Aube du jour ${next.day}. ${text}`);next.lastReport={title:'Une nouvelle aube',text,effects:`${next.energy} actions disponibles`};
 }
 next.revision++;return next;
}
export function refugeArtTargets(world){return [{key:'player',name:'Le gardien du refuge',description:'Un voyageur en manteau bleu nuit, sac de marche et petite lanterne ambrée à la ceinture. Personnage entier vu de trois quarts.',kind:'resident'},{key:'village',name:world.name,description:'Panorama d’une clairière à la tombée du jour, entourée de forêt brumeuse. Grand terrain central dégagé, chemins et lisière. Aucun bâtiment : les constructions et habitants seront placés au premier plan par le jeu.',kind:'scene'},...Object.entries(buildings).map(([id,b])=>({key:'building.'+id,name:b.name,description:b.description+` Niveau ${world.buildings[id]}.`,kind:'building'})),...world.residents.map(r=>({key:'resident.'+r.id,name:r.name,description:r.description,kind:'resident'})),...world.locations.map(l=>({key:'location.'+l.id,name:l.name,description:l.description,kind:'scene'}))];}
