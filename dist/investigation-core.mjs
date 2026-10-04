import {validateSprite} from './pixels.mjs';

export const cardRules={
  lantern:{cost:2,effect:'equip',label:'Équipement',text:'Reste en jeu : +1 à tous tes tests d’enquête. Une seule lampe équipée.'},
  blade:{cost:1,effect:'attack',label:'Combat',text:'Attaque un ennemi ici avec +2 au test. Inflige 2 dégâts si tu réussis.'},
  notes:{cost:1,effect:'investigate',label:'Enquête',text:'Enquête avec +2 au test. Découvre jusqu’à 2 indices si tu réussis.'},
  breath:{cost:0,effect:'sanity',label:'Soutien',text:'Récupère 2 points de santé mentale.'},
  bandage:{cost:1,effect:'heal',label:'Soutien',text:'Récupère 2 points de vie.'},
  supplies:{cost:0,effect:'resources',label:'Préparation',text:'Gagne 3 ressources.'},
};
export const locationRules={station:{links:['archives','quay'],clues:1,difficulty:2},archives:{links:['station','lighthouse'],clues:3,difficulty:3},quay:{links:['station','lighthouse'],clues:3,difficulty:3},lighthouse:{links:['archives','quay'],clues:1,difficulty:4}};
export const enemyRules={watcher:{health:2,defense:3,evade:3,damage:1,horror:0},drowned:{health:2,defense:3,evade:2,damage:0,horror:1},keeper:{health:3,defense:4,evade:4,damage:1,horror:1}};
export const demoStory={
  title:'La dernière lumière',
  intro:'À Port-Brume, le phare éclaire depuis trois nuits une mer sans marée. Les habitants disparus parlent à travers les postes de radio. Ce soir, tu reconnais la voix de ta sœur. Son message tient en quatre mots : ne rallume pas la lampe.',
  investigator:{name:'Alix Morel',description:'Archiviste revenue à Port-Brume après la disparition de sa sœur. Elle connaît les rues, mais ne reconnaît plus leurs habitants.'},
  locations:[
    {id:'station',name:'La gare déserte',description:'L’horloge marque minuit treize. Sur le quai, les valises attendent des voyageurs qui ne descendront jamais.',discovery:'Un billet porte le nom de ta sœur. Au verso : « Les gardiens ont effacé le registre. »'},
    {id:'archives',name:'Les archives noyées',description:'L’eau noire lèche les rayonnages. Des dossiers respirent sous leurs couvertures de cuir.',discovery:'Les disparitions suivent les cycles du phare. Le gardien n’était pas chargé de guider les navires, mais de retenir quelque chose.'},
    {id:'quay',name:'Le quai des absents',description:'Les amarres grincent sans vent. Sous la jetée, des voix récitent les noms de ceux qui vivent encore.',discovery:'Une barque ramène des vêtements secs depuis le fond de la baie. Parmi eux, le manteau de ta sœur, encore chaud.'},
    {id:'lighthouse',name:'Le phare sans ombre',description:'L’escalier monte autour d’un vide. Dans la lanterne, ta sœur attend devant une porte faite de lumière.',discovery:'Tu peux refermer le passage à travers ta propre mémoire, ou réparer le mécanisme pour ramener les captifs. Le gardien te barre la route.'},
  ],
  cards:[{id:'lantern',name:'Lampe de poche',flavor:'Le faisceau révèle des traces que le jour dissimule.'},{id:'blade',name:'Lame de marin',flavor:'Son manche porte une initiale presque effacée.'},{id:'notes',name:'Notes de terrain',flavor:'Il y a une logique dans ces répétitions.'},{id:'breath',name:'Garder pied',flavor:'Son nom. Ton nom. Le monde n’a pas encore gagné.'},{id:'bandage',name:'Bandages de fortune',flavor:'Un morceau de tissu suffit pour continuer.'},{id:'supplies',name:'Dernières provisions',flavor:'Tu avais juré de ne revenir que pour une nuit.'}],
  enemies:[{id:'watcher',name:'Le veilleur creux',description:'Il classe des dossiers avec des mains qui traversent le papier.'},{id:'drowned',name:'La voix sous l’eau',description:'Elle parle avec la bouche de ceux que tu cherches.'},{id:'keeper',name:'Le gardien de la lanterne',description:'Sous son manteau, la lumière dessine des côtes humaines.'}],
  acts:['Retrouver la piste des disparus. Réunis 3 indices dans les lieux de Port-Brume.','Le phare retient les disparus. Réunis 6 indices au total, gagne le phare et vaincs son gardien pour choisir leur sort.'],
  endings:{seal:'Tu refermes le passage. Port-Brume retrouve sa marée, mais le souvenir de ta sœur quitte ta mémoire avec la dernière lumière. Dans ta poche, un billet de train porte un nom que tu ne connais plus.',save:'Tu répares le mécanisme et ouvres une brèche assez longtemps pour les faire passer. Ta sœur serre ta main. Au large, une seconde lumière s’allume. Vous avez gagné cette nuit ; la mer, elle, attend.'},
};
const ids={locations:Object.keys(locationRules),cards:Object.keys(cardRules),enemies:Object.keys(enemyRules)};
function text(value,max,label){if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw Error(`${label} invalide`);return value.trim();}
export function validateStory(value){
  if(!value||typeof value!=='object')throw Error('Enquête invalide');
  const story={title:text(value.title,80,'Titre'),intro:text(value.intro,1200,'Introduction'),investigator:{name:text(value.investigator?.name,80,'Investigateur'),description:text(value.investigator?.description,500,'Description')}};
  for(const [kind,keys] of Object.entries(ids)){
    const entries=value[kind];if(!Array.isArray(entries)||entries.length!==keys.length||new Set(entries.map(e=>e?.id)).size!==keys.length)throw Error(`Liste ${kind} invalide`);
    story[kind]=keys.map(id=>{const entry=entries.find(e=>e.id===id);if(!entry)throw Error(`Identifiant ${id} manquant`);return {id,name:text(entry.name,80,'Nom'),...(kind==='cards'?{flavor:text(entry.flavor,250,'Texte de carte')}:{description:text(entry.description,600,'Description')}),...(kind==='locations'?{discovery:text(entry.discovery,600,'Découverte')}:{})};});
  }
  if(!Array.isArray(value.acts)||value.acts.length!==2)throw Error('Deux actes attendus');story.acts=value.acts.map(a=>text(a,600,'Acte'));
  story.endings={seal:text(value.endings?.seal,1200,'Dénouement'),save:text(value.endings?.save,1200,'Dénouement')};return story;
}
export const illustrationKeys=['investigator',...Object.keys(locationRules).map(id=>'location.'+id),...Object.keys(cardRules).map(id=>'card.'+id),...Object.keys(enemyRules).map(id=>'enemy.'+id)];
export function validateInvestigation(value){
  if(!value||value.version!==1||typeof value.id!=='string'||!/^sample$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.id))throw Error('Archive d’enquête invalide');
  const art={};for(const [key,image] of Object.entries(value.art??{})){if(!illustrationKeys.includes(key))throw Error('Illustration inconnue');art[key]=validateSprite(image);}
  return {version:1,id:value.id,story:validateStory(value.story),art,source:typeof value.source==='string'?value.source:'prototype',...(value.updatedAt?{updatedAt:value.updatedAt}:{})};
}
export const sampleInvestigation=()=>({version:1,id:'sample',story:structuredClone(demoStory),art:{},source:'prototype'});
export function artBrief(story,key){
  let subject;if(key==='investigator')subject=story.investigator;else{const [type,id]=key.split('.');subject=story[{location:'locations',card:'cards',enemy:'enemies'}[type]]?.find(e=>e.id===id);}
  if(!subject)throw Error('Illustration inconnue');
  return `Illustration pixel art pour une carte d’enquête fantastique nocturne. ${story.title}. Sujet : ${subject.name}. ${subject.description??subject.flavor} ${key.startsWith('location.')?'Dessine un décor immersif sans personnages : scène complète avec profondeur, arrière-plan et sol dégagé au premier plan pour y placer des personnages. Remplis toute la grille, fond opaque.':key==='investigator'||key.startsWith('enemy.')?'Dessine le personnage seul, entier de la tête aux pieds, vu de face ou de trois quarts, debout. Fond entièrement transparent, sans décor, sans socle.':'Dessine une silhouette lisible et expressive.'} Palette : vert profond, bleu nuit, or patiné et touches ivoire. Sans texte, sans lettres, sans cadre, sans statistiques.`.slice(0,1000);
}

const encounters=['whisper','calm','shadow','rain','omen','calm','whisper','rain'];
const initialCards=()=>Object.keys(cardRules).flatMap(id=>[id+'-0',id+'-1']);
const cardId=instance=>instance.slice(0,-2);
export class InvestigationRun{
  constructor(record,seed=Date.now()){
    this.record=validateInvestigation(record);this.seed=(seed>>>0)||1;
    this.state='playing';this.round=1;this.actions=3;this.resources=3;this.health=8;this.sanity=7;this.clues=0;this.doom=0;this.limit=14;this.location='station';this.visited=['station'];this.remaining=Object.fromEntries(Object.entries(locationRules).map(([id,r])=>[id,r.clues]));
    this.deck=this.shuffle(initialCards());this.hand=[];this.discard=[];this.equipment=[];this.enemies=[];this.encounters=this.shuffle([...encounters]);this.chaos=[];this.log=[];this.serial=0;this.ending=null;this.lastTest=null;
    for(let i=0;i<5;i++)this.draw();this.note('L’enquête commence. Explore, découvre des indices et surveille la menace.');
  }
  random(){this.seed^=this.seed<<13;this.seed^=this.seed>>>17;this.seed^=this.seed<<5;this.seed>>>=0;return this.seed/4294967296;}
  shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  note(message){this.log.push(message);if(this.log.length>60)this.log.shift();}
  get here(){return this.enemies.filter(e=>e.location===this.location);}
  get intellect(){return 3+(this.equipment.some(c=>cardId(c)==='lantern')?1:0);}
  name(kind,id){return this.record.story[kind].find(e=>e.id===id)?.name??id;}
  test(skill,difficulty,label){if(!this.chaos.length)this.chaos=this.shuffle([-2,-1,0,0,1,2]);const token=this.chaos.pop(),success=skill+token>=difficulty;this.lastTest={label,skill,token,difficulty,success};this.note(`${label} : ${skill} ${token>=0?'+':''}${token} contre ${difficulty} — ${success?'réussite':'échec'}.`);return success;}
  checkEnd(){if(this.health<=0||this.sanity<=0||this.doom>=this.limit){this.state='lost';this.note(this.health<=0?'Tes blessures mettent fin à l’enquête.':this.sanity<=0?'Tu perds pied. La ville garde ses secrets.':'La menace arrive à son terme. Le passage est ouvert.');}return this.state!=='playing';}
  draw(){
    if(!this.deck.length){if(!this.discard.length){this.note('Aucune carte disponible à piocher.');return;}this.deck=this.shuffle(this.discard.splice(0));this.sanity=Math.max(0,this.sanity-1);this.note('La défausse reforme le deck : −1 santé mentale.');if(this.checkEnd())return;}
    const card=this.deck.pop();if(this.hand.length>=8){this.discard.push(card);this.note('Main pleine (8) : '+this.name('cards',cardId(card))+' défaussée.');}else this.hand.push(card);
  }
  spawn(type,location=this.location){this.enemies.push({id:'enemy-'+(++this.serial),type,location,health:enemyRules[type].health,exhausted:false});this.note(this.name('enemies',type)+' apparaît.');}
  reason(action,payload={}){
    if(this.state!=='playing')return 'Cette enquête est terminée.';
    if(action==='end')return null;
    if(this.actions<1)return 'Termine le tour pour retrouver tes actions.';
    if(action==='move'){
      if(!locationRules[this.location].links.includes(payload.to))return 'Ce lieu n’est pas relié au lieu actuel.';
      if(payload.to==='lighthouse'&&this.clues<6)return 'Il faut 6 indices pour trouver le passage vers le phare.';return null;
    }
    if(action==='investigate'){if(!this.remaining[this.location])return 'Tous les indices de ce lieu sont découverts.';if(this.here.some(e=>!e.exhausted))return 'Élimine ou esquive les ennemis avant d’enquêter.';return null;}
    if(['attack','evade'].includes(action)){if(!this.here.some(e=>e.id===payload.target))return 'Choisis un ennemi dans ce lieu.';if(action==='evade'&&this.here.find(e=>e.id===payload.target).exhausted)return 'Cet ennemi est déjà esquivé.';return null;}
    if(action==='play'){
      if(!this.hand.includes(payload.card))return 'Cette carte n’est pas en main.';const rule=cardRules[cardId(payload.card)];if(this.resources<rule.cost)return 'Ressources insuffisantes.';
      if(rule.effect==='equip'&&this.equipment.length)return 'Une lampe est déjà équipée.';
      if(rule.effect==='heal'&&this.health===8)return 'Ta santé est déjà au maximum.';if(rule.effect==='sanity'&&this.sanity===7)return 'Ta santé mentale est déjà au maximum.';
      if(['attack','investigate'].includes(rule.effect))return this.reason(rule.effect,payload);return null;
    }
    if(action==='resolve'){
      if(this.location!=='lighthouse'||this.clues<6||this.here.length)return 'Réunis 6 indices et élimine tous les ennemis du phare.';
      if(payload.choice==='seal')return this.sanity>2?null:'Il faut au moins 3 points de santé mentale.';
      if(payload.choice==='save')return this.resources>=3?null:'Il faut 3 ressources pour réparer le mécanisme.';return 'Choix inconnu.';
    }
    if(!['draw','resource','rest'].includes(action))return 'Action inconnue.';if(action==='rest'&&this.sanity===7)return 'Ta santé mentale est déjà au maximum.';return null;
  }
  act(action,payload={}){
    const error=this.reason(action,payload);if(error)return {ok:false,error};
    this.lastTest=null;if(action==='end'){this.endRound();return {ok:true};}this.actions--;
    if(action==='move'){
      for(const e of this.here.filter(e=>!e.exhausted)){this.health=Math.max(0,this.health-1);this.note(this.name('enemies',e.type)+' frappe pendant ta fuite : −1 vie.');}
      if(this.checkEnd())return {ok:true};this.location=payload.to;
      if(!this.visited.includes(payload.to)){this.visited.push(payload.to);if(payload.to==='archives')this.spawn('watcher');if(payload.to==='quay')this.spawn('drowned');if(payload.to==='lighthouse')this.spawn('keeper');this.note(this.record.story.locations.find(l=>l.id===payload.to).discovery);}
      this.note('Tu rejoins '+this.name('locations',this.location)+'.');
    }else if(action==='investigate')this.investigate(0,1);
    else if(action==='attack')this.attack(payload.target,0,1);
    else if(action==='evade'){const e=this.here.find(e=>e.id===payload.target);if(this.test(3,enemyRules[e.type].evade,'Esquive')){e.exhausted=true;this.note('Cet ennemi n’attaquera pas à la fin de ce tour.');}}
    else if(action==='draw')this.draw();
    else if(action==='resource'){this.resources=Math.min(20,this.resources+1);this.note('+1 ressource.');}
    else if(action==='rest'){this.sanity=Math.min(7,this.sanity+1);this.note('Tu reprends tes esprits : +1 santé mentale.');}
    else if(action==='play'){
      const rule=cardRules[cardId(payload.card)];this.resources-=rule.cost;this.hand.splice(this.hand.indexOf(payload.card),1);(rule.effect==='equip'?this.equipment:this.discard).push(payload.card);this.note('Carte jouée : '+this.name('cards',cardId(payload.card))+'.');
      if(rule.effect==='attack')this.attack(payload.target,2,2);if(rule.effect==='investigate')this.investigate(2,2);if(rule.effect==='heal')this.health=Math.min(8,this.health+2);if(rule.effect==='sanity')this.sanity=Math.min(7,this.sanity+2);if(rule.effect==='resources')this.resources=Math.min(20,this.resources+3);
    }else if(action==='resolve'){this.ending=payload.choice;if(payload.choice==='seal')this.sanity-=2;else this.resources-=3;this.state='won';this.note(this.record.story.endings[payload.choice]);}
    this.checkEnd();return {ok:true};
  }
  investigate(bonus,amount){if(this.test(this.intellect+bonus,locationRules[this.location].difficulty,'Enquête')){const found=Math.min(amount,this.remaining[this.location]);this.remaining[this.location]-=found;const before=this.clues;this.clues+=found;this.note(`${found} indice(s) découvert(s).`);if(before<3&&this.clues>=3)this.note('Acte II — '+this.record.story.acts[1]);if(before<6&&this.clues>=6)this.note('Le passage vers le phare est révélé.');}}
  attack(id,bonus,damage){const e=this.here.find(e=>e.id===id);if(this.test(3+bonus,enemyRules[e.type].defense,'Combat')){e.health-=damage;this.note(`${damage} dégât(s) infligé(s).`);if(e.health<=0){this.enemies=this.enemies.filter(a=>a!==e);this.note(this.name('enemies',e.type)+' est vaincu.');}}}
  endRound(){
    for(const e of this.here.filter(e=>!e.exhausted)){const rule=enemyRules[e.type];this.health=Math.max(0,this.health-rule.damage);this.sanity=Math.max(0,this.sanity-rule.horror);this.note(`${this.name('enemies',e.type)} attaque : −${rule.damage} vie, −${rule.horror} santé mentale.`);if(this.checkEnd())return;}
    this.doom++;if(this.checkEnd())return;
    if(!this.encounters.length)this.encounters=this.shuffle([...encounters]);const encounter=this.encounters.pop();
    if(encounter==='whisper'){this.sanity=Math.max(0,this.sanity-1);this.note('Murmures derrière toi : −1 santé mentale.');}
    if(encounter==='omen'){this.doom++;this.note('Un présage accélère la menace : +1 supplémentaire.');}
    if(encounter==='rain'){if(this.resources){this.resources--;this.note('La pluie abîme tes provisions : −1 ressource.');}else this.note('La pluie redouble, mais tu n’as plus de provisions à perdre.');}
    if(encounter==='shadow'){if(this.here.length<2)this.spawn('drowned');else this.note('Une ombre passe derrière les ennemis.');}
    if(encounter==='calm'){this.resources=Math.min(20,this.resources+1);this.note('Un répit inattendu : +1 ressource.');}
    if(this.checkEnd())return;
    for(const e of this.enemies)e.exhausted=false;
    this.round++;this.actions=3;this.resources=Math.min(20,this.resources+1);this.draw();if(this.state==='playing')this.note(`Tour ${this.round} : trois actions, +1 ressource et une carte.`);
  }
  save(){const keys=['seed','state','round','actions','resources','health','sanity','clues','doom','location','visited','remaining','deck','hand','discard','equipment','enemies','encounters','chaos','log','serial','ending','lastTest'];return {version:1,record:this.record,...Object.fromEntries(keys.map(k=>[k,structuredClone(this[k])]))};}
  static restore(saved){
    if(saved?.version!==1)throw Error('Sauvegarde inconnue');const run=new InvestigationRun(saved.record,1);
    const ranges={seed:[1,4294967295],round:[1,30],actions:[0,3],resources:[0,20],health:[0,8],sanity:[0,7],clues:[0,8],doom:[0,15],serial:[0,50]};
    for(const [key,[min,max]]of Object.entries(ranges))if(!Number.isInteger(saved[key])||saved[key]<min||saved[key]>max)throw Error('Sauvegarde invalide : '+key);
    if(!['playing','won','lost'].includes(saved.state)||!Object.hasOwn(locationRules,saved.location)||!Array.isArray(saved.visited)||saved.visited.some(l=>!Object.hasOwn(locationRules,l))||!saved.visited.includes(saved.location))throw Error('Progression invalide');
    const piles=['deck','hand','discard','equipment'];if(piles.some(k=>!Array.isArray(saved[k]))||saved.hand.length>8||saved.equipment.length>1||saved.equipment.some(c=>!['lantern-0','lantern-1'].includes(c)))throw Error('Deck invalide');
    const cards=piles.flatMap(k=>saved[k]);if([...cards].sort().join('|')!==initialCards().sort().join('|'))throw Error('Cartes manquantes ou dupliquées');
    for(const [id,rule]of Object.entries(locationRules))if(!Number.isInteger(saved.remaining?.[id])||saved.remaining[id]<0||saved.remaining[id]>rule.clues)throw Error('Indices invalides');
    if(saved.clues!==8-Object.values(saved.remaining).reduce((n,c)=>n+c,0))throw Error('Compte d’indices incohérent');
    if(!Array.isArray(saved.enemies)||saved.enemies.length>30||new Set(saved.enemies.map(e=>e.id)).size!==saved.enemies.length||saved.enemies.some(e=>!/^enemy-\d+$/.test(e.id)||!enemyRules[e.type]||!locationRules[e.location]||!Number.isInteger(e.health)||e.health<1||e.health>enemyRules[e.type].health||typeof e.exhausted!=='boolean'))throw Error('Ennemis invalides');
    if(!Array.isArray(saved.chaos)||saved.chaos.length>6||saved.chaos.some(n=>![-2,-1,0,1,2].includes(n))||!Array.isArray(saved.encounters)||saved.encounters.length>8||saved.encounters.some(e=>!encounters.includes(e)))throw Error('Tirages invalides');
    if(!Array.isArray(saved.log)||saved.log.length>60||saved.log.some(s=>typeof s!=='string'||s.length>1400))throw Error('Journal invalide');
    if(saved.ending!==null&&!['seal','save'].includes(saved.ending)||saved.state==='won'&&!saved.ending||saved.state==='playing'&&(!saved.health||!saved.sanity||saved.doom>=14))throw Error('État final incohérent');
    for(const key of Object.keys(run.save()))if(!['version','record','lastTest'].includes(key))run[key]=structuredClone(saved[key]);run.lastTest=null;return run;
  }
}
