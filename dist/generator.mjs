import {LevelRun,validateLevel} from './level.mjs';
import {createGameImages} from './game-animations.mjs';
import {render} from './render.mjs';
import {updateModelPicker,bindModelRefresh} from './model-picker.mjs';
import {request} from './cloud-ui.mjs';
import {validateDungeon,effects} from './core.mjs';
import {dungeon as example} from './dungeon.mjs';
import {Run} from './engine.mjs';
import {drawMap} from './render.mjs';

const $=selector=>document.querySelector(selector);
const rules={generous:['La crypte vous épargne','Chaque salle de combat terminée rend un cœur.'],swift:['Légers comme l’ombre','Vitesse de déplacement augmentée de 12 %.'],fierce:['La nuit aiguise les dents','Dégâts des tirs augmentés de 15 %.']};
const patterns={ring:'Tirs en anneau',fan:'Tirs en éventail',spiral:'Anneaux tournants'};
const layouts={branch:'Parcours ramifié',cross:'Parcours en croix',loop:'Parcours en boucle'};
const themes={moss:'Mousse',ember:'Braises',violet:'Crépuscule'};
let state=null,busy=false,preview=null,timer=null,initial=true,levelPreview=null,jobId=null,polling=false,resumeId=null;
const mode=()=>document.querySelector('input[name="mode"]:checked').value;

function message(text,isError=false){$('#generation-message').textContent=text;$('#generation-message').classList.toggle('error',isError)}
function controls(){
 $('#resume-level').hidden=!resumeId;$('#resume-level').disabled=busy||Boolean(state?.busy);
 const daily=mode()==='daily',complete=mode()==='level',reuse=daily&&state?.dailyAvailable;
 $('#generate-button').disabled=busy||!state||state.busy||(!state.configured&&!reuse)||!$('#model').value;
 $('#generate-button').textContent=busy?'Construction en cours…':complete?'Construire le niveau complet':reuse?'Charger le donjon du jour':daily?'Générer le donjon du jour':'Générer un nouvel essai';
 $('#level-settings').hidden=!complete;
 $('#model').disabled=busy||reuse;$('#inspiration').disabled=busy||reuse;
 document.querySelectorAll('[name="mode"],#level-settings select').forEach(input=>input.disabled=busy);
 $('#save-key').disabled=busy;$('#api-key').disabled=busy;$('#load-daily').disabled=busy||!state?.dailyAvailable;$('#play-dungeon').disabled=busy;$('#play-level').disabled=busy;$('#show-example').disabled=busy;
 $('#mode-description').textContent=complete?'L’IA prépare le niveau, crée ou réutilise les sprites, associe les animations puis place les éléments dans chaque salle.':reuse?'Le donjon de ce jour existe déjà : il sera chargé sans nouvel appel au modèle.':daily?'Le résultat sera conservé pour cette journée, à l’heure de Paris.':'L’IA choisit parmi les salles, effets et attaques déjà jouables.';
 $('.workshop-controls').setAttribute('aria-busy',String(busy));
}

async function refreshStatus(){try{state=await request('/api/status');for(const id of ['#model','#level-sprite-model','#level-animation-model'])updateModelPicker($(id),state);$('#key-status').textContent=state.configured?'Clé enregistrée':'Clé à renseigner';if(initial){$('#connection').open=!state.configured;initial=false}if(state.busy&&!busy)message('Une génération est en cours dans un autre onglet.');controls()}catch(e){state=null;$('#key-status').textContent='Serveur indisponible';message(e.message,true);controls()}}

$('#connection-form').addEventListener('submit',async event=>{event.preventDefault();$('#save-key').disabled=true;let key=$('#api-key').value.trim();$('#api-key').value='';try{await request('/api/config',{method:'POST',body:{key,model:$('#model').value}});key='';$('#connection-message').textContent='Clé enregistrée. Elle sera vérifiée par Ollama lors de ta première génération.';message('La connexion est configurée. Tu peux lancer une génération.');await refreshStatus()}catch(e){$('#connection-message').textContent=e.message}finally{key='';controls()}});
document.querySelectorAll('[name="mode"]').forEach(input=>input.addEventListener('change',controls));

function showPreview(value){levelPreview=null;$('#level-preview').hidden=true;preview=validateDungeon(value);const b=preview.blueprint;$('#empty-preview').hidden=true;$('#dungeon-preview').hidden=false;$('#preview-title').textContent=b.title;$('#result-badge').hidden=false;$('#result-badge').textContent=preview.source==='prototype'?'Exemple fixe':'Donjon validé';const run=new Run(preview),ctx=$('#preview-map').getContext('2d');ctx.save();ctx.scale(2,2);drawMap(ctx,run);ctx.restore();$('#preview-summary').textContent=`7 salles · 3 reliques · ${themes[b.theme]} · ${layouts[b.layout]}`;$('#preview-rule-name').textContent=rules[b.rule][0];$('#preview-rule-copy').textContent=rules[b.rule][1];$('#preview-items').replaceChildren();for(const item of b.items){const li=document.createElement('li'),detail=document.createElement('span');li.textContent=item.name;detail.textContent=effects[item.effect].label;li.append(detail);$('#preview-items').append(li)}$('#preview-boss').textContent=b.boss.name;$('#preview-boss-pattern').textContent=`${b.boss.health} PV · ${patterns[b.boss.pattern]} · Deux phases`;$('#preview-rooms').replaceChildren();for(const room of b.rooms){const li=document.createElement('li');li.textContent=`${room.name} · ${room.count} ennemis`;$('#preview-rooms').append(li)}$('#preview-origin').textContent=preview.source==='prototype'?'Exemple du prototype : aucun appel à une IA.':`${preview.source.replace('ollama-cloud:','Ollama Cloud · ')} · ${preview.date}`;controls()}

$('#show-example').addEventListener('click',()=>{showPreview(example);message('Aperçu du donjon de test. Aucun appel IA effectué.')});
$('#load-daily').addEventListener('click',async()=>{try{showPreview(await request('/api/daily'));message('Donjon du jour chargé depuis le serveur. Aucun nouvel appel IA.')}catch(e){message(e.message,true)}await refreshStatus()});

$('#generation-form').addEventListener('submit',async event=>{event.preventDefault();if(busy||$('#generate-button').disabled)return;if(mode()==='level'){await startLevel();return;}const cached=mode()==='daily'&&state?.dailyAvailable;busy=true;controls();message('');$('#generation-progress').hidden=false;const started=Date.now();$('#progress-message').textContent=cached?'Chargement du donjon enregistré…':'Ollama Cloud compose le donjon. Cela peut prendre une à deux minutes.';timer=setInterval(()=>{const elapsed=Math.floor((Date.now()-started)/1000);$('#progress-message').textContent=cached?'Chargement du donjon enregistré…':`Génération distante en cours · ${elapsed} s. La réponse sera vérifiée avant de pouvoir jouer.`},1000);try{const value=await request('/api/generate',{method:'POST',body:{mode:mode(),model:$('#model').value,inspiration:$('#inspiration').value.trim()}});showPreview(value);message(cached?'Donjon du jour chargé sans nouvel appel IA.':'Donjon reçu et vérifié. Tu peux maintenant le jouer.')}catch(e){message(e.message,true);if(e.status===401||e.status===503)$('#connection').open=true}finally{clearInterval(timer);busy=false;$('#generation-progress').hidden=true;await refreshStatus();controls()}});

$('#play-dungeon').addEventListener('click',()=>{if(!preview||busy)return;try{localStorage.setItem('nocturne:selected-dungeon',JSON.stringify(preview));location.href='/?dungeon=selected'}catch{message('Le navigateur empêche l’enregistrement du donjon. Autorise le stockage local pour pouvoir le jouer.',true)}});
async function showLevel(value){
 levelPreview=validateLevel(value);preview=null;$('#empty-preview').hidden=true;$('#dungeon-preview').hidden=true;$('#level-preview').hidden=false;
 $('#result-badge').hidden=false;$('#result-badge').textContent='Niveau sauvegardé';$('#level-title').textContent=value.title;
 const assets=[...new Map(value.rooms.flatMap(r=>r.assets).map(a=>[a.id,a])).values()];
 $('#level-summary').textContent=`${value.rooms.length} salles · ${assets.length} sprites · ${assets.reduce((n,a)=>n+(a.animations?.length??0),0)} animations associées`;
 $('#level-rooms').replaceChildren();
 for(const [i,room] of value.rooms.entries()){const li=document.createElement('li');li.textContent=`${i+1}. ${room.plan.title} · ${room.plan.placements.length} éléments `;const link=document.createElement('a');link.href=`/?room=${encodeURIComponent(room.id)}`;link.textContent='Tester cette salle';li.append(link);$('#level-rooms').append(li);}
 $('#level-warnings').textContent=value.warnings?.length?`Animations à revoir : ${value.warnings.join(' ')} Le niveau reste jouable avec les sprites statiques ou les animations existantes.`:'';
 render($('#level-map').getContext('2d'),new LevelRun(value),{complete:false},0,createGameImages(assets));controls();
}
async function loadLevels(){
 try{const levels=await request('/api/levels');$('#saved-levels').replaceChildren();if(!levels.length)$('#saved-levels').textContent='Aucun niveau construit pour le moment.';
 for(const level of levels){const card=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span'),open=document.createElement('button'),play=document.createElement('a');title.textContent=level.title;detail.textContent=`${level.roomCount} salles`;open.className='quiet';open.textContent='Voir le niveau';open.onclick=async()=>{try{await showLevel(await request('/api/levels/'+level.id));}catch(e){message(e.message,true);}};play.href='/?level='+level.id;play.textContent='Jouer';card.append(title,detail,open,play);$('#saved-levels').append(card);}
 }catch(e){$('#saved-levels').textContent=e.message;}
}
async function pollJob(){
 if(!jobId||polling)return;polling=true;
 try{const job=await request('/api/levels/jobs/'+encodeURIComponent(jobId));
 $('#level-journal').hidden=false;$('#level-events').replaceChildren();
 const linkedLogs=new Set();
 for(const event of job.events){const li=document.createElement('li');li.textContent=event.message;if(event.spriteId){const a=document.createElement('a');a.href='/designer.html';a.textContent=' — carnet';li.append(a);}if(event.levelLogId&&!linkedLogs.has(event.levelLogId)){linkedLogs.add(event.levelLogId);const a=document.createElement('a');a.href='/api/levels/logs/'+encodeURIComponent(event.levelLogId);a.download='ollama-'+event.levelLogId+'.json';a.textContent=' — détails JSON';li.append(a);}$('#level-events').append(li);}
 $('#progress-message').textContent=job.events.at(-1)?.message??'Construction en cours…';
 if(job.status==='running'){resumeId=null;busy=true;$('#generation-progress').hidden=false;message('La construction continue sur le serveur. Tu peux quitter cette page et revenir.');}
 else{busy=false;resumeId=job.canResume?job.id:null;$('#generation-progress').hidden=true;
 if(job.status==='complete'){await showLevel(await request('/api/levels/'+job.levelId));message(job.warnings.length?'Niveau prêt, avec des animations à revoir dans le journal.':'Niveau construit et sauvegardé. Tu peux jouer !');await loadLevels();}
 else message(`${job.error} Les sprites déjà créés restent dans le carnet (statut « À revoir »).`,true);
 jobId=null;await refreshStatus();}
 controls();
 }catch(e){if(e.status===404){jobId=null;busy=false;try{localStorage.removeItem('nocturne:level-job');}catch{}controls();message(e.message,true);}else message(e.message+' Le suivi reprendra automatiquement.',true);}
 finally{polling=false;}
}
async function startLevel(){
 busy=true;controls();message('Préparation de la construction…');
 try{const job=await request('/api/levels/generate',{method:'POST',body:{model:$('#model').value,spriteModel:$('#level-sprite-model').value,animationModel:$('#level-animation-model').value,inspiration:$('#inspiration').value.trim(),roomCount:Number($('#room-count').value),assetBudget:Number($('#asset-budget').value),animationBudget:Number($('#animation-budget').value)}});jobId=job.id;try{localStorage.setItem('nocturne:level-job',jobId);}catch{}await pollJob();}
 catch(e){busy=false;message(e.message,true);await refreshStatus();controls();}
}
$('#resume-level').onclick=async()=>{if(!resumeId||busy)return;busy=true;controls();try{const job=await request('/api/levels/resume',{method:'POST',body:{id:resumeId}});jobId=job.id;resumeId=null;await pollJob();}catch(e){busy=false;message(e.message,true);await refreshStatus();controls();}};
$('#play-level').onclick=()=>{if(levelPreview&&!busy)location.href='/?level='+encodeURIComponent(levelPreview.id);};
await refreshStatus();
try{jobId=state?.levelJobId??localStorage.getItem('nocturne:level-job');}catch{jobId=state?.levelJobId;}
if(jobId)await pollJob();
await loadLevels();
setInterval(()=>{if(!document.hidden)pollJob();},2500);
setInterval(()=>{if(!document.hidden&&!busy)refreshStatus()},15000);
window.addEventListener('pagehide',()=>{$('#api-key').value='';clearInterval(timer)});

bindModelRefresh(refreshStatus);
