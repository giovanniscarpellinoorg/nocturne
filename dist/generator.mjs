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
let state=null,busy=false,preview=null,timer=null,initial=true;
const mode=()=>document.querySelector('input[name="mode"]:checked').value;

function message(text,isError=false){$('#generation-message').textContent=text;$('#generation-message').classList.toggle('error',isError)}
function controls(){const daily=mode()==='daily',reuse=daily&&state?.dailyAvailable;$('#generate-button').disabled=busy||!state||state.busy||(!state.configured&&!reuse);$('#generate-button').textContent=busy?'Génération en cours…':reuse?'Charger le donjon du jour':daily?'Générer le donjon du jour':'Générer un nouvel essai';$('#model').disabled=busy||reuse;$('#inspiration').disabled=busy||reuse;document.querySelectorAll('[name="mode"]').forEach(input=>input.disabled=busy);$('#save-key').disabled=busy;$('#api-key').disabled=busy;$('#load-daily').disabled=busy||!state?.dailyAvailable;$('#play-dungeon').disabled=busy;$('#show-example').disabled=busy;$('#mode-description').textContent=reuse?'Le donjon de ce jour existe déjà : il sera chargé sans nouvel appel au modèle.':daily?'Le résultat sera conservé pour cette journée, à l’heure de Paris.':'L’IA choisit parmi les salles, effets et attaques déjà jouables. Tes essais ne remplacent pas le donjon du jour.';$('.workshop-controls').setAttribute('aria-busy',String(busy));}

async function refreshStatus(){try{state=await request('/api/status');updateModelPicker($('#model'),state);$('#key-status').textContent=state.configured?'Clé enregistrée':'Clé à renseigner';if(initial){$('#connection').open=!state.configured;initial=false}if(state.busy&&!busy)message('Une génération est en cours dans un autre onglet.');controls()}catch(e){state=null;$('#key-status').textContent='Serveur indisponible';message(e.message,true);controls()}}

$('#connection-form').addEventListener('submit',async event=>{event.preventDefault();$('#save-key').disabled=true;let key=$('#api-key').value.trim();$('#api-key').value='';try{await request('/api/config',{method:'POST',body:{key,model:$('#model').value}});key='';$('#connection-message').textContent='Clé enregistrée. Elle sera vérifiée par Ollama lors de ta première génération.';message('La connexion est configurée. Tu peux lancer une génération.');await refreshStatus()}catch(e){$('#connection-message').textContent=e.message}finally{key='';controls()}});
document.querySelectorAll('[name="mode"]').forEach(input=>input.addEventListener('change',controls));

function showPreview(value){preview=validateDungeon(value);const b=preview.blueprint;$('#empty-preview').hidden=true;$('#dungeon-preview').hidden=false;$('#preview-title').textContent=b.title;$('#result-badge').hidden=false;$('#result-badge').textContent=preview.source==='prototype'?'Exemple fixe':'Donjon validé';const run=new Run(preview),ctx=$('#preview-map').getContext('2d');ctx.save();ctx.scale(2,2);drawMap(ctx,run);ctx.restore();$('#preview-summary').textContent=`7 salles · 3 reliques · ${themes[b.theme]} · ${layouts[b.layout]}`;$('#preview-rule-name').textContent=rules[b.rule][0];$('#preview-rule-copy').textContent=rules[b.rule][1];$('#preview-items').replaceChildren();for(const item of b.items){const li=document.createElement('li'),detail=document.createElement('span');li.textContent=item.name;detail.textContent=effects[item.effect].label;li.append(detail);$('#preview-items').append(li)}$('#preview-boss').textContent=b.boss.name;$('#preview-boss-pattern').textContent=`${b.boss.health} PV · ${patterns[b.boss.pattern]} · Deux phases`;$('#preview-rooms').replaceChildren();for(const room of b.rooms){const li=document.createElement('li');li.textContent=`${room.name} · ${room.count} ennemis`;$('#preview-rooms').append(li)}$('#preview-origin').textContent=preview.source==='prototype'?'Exemple du prototype : aucun appel à une IA.':`${preview.source.replace('ollama-cloud:','Ollama Cloud · ')} · ${preview.date}`;controls()}

$('#show-example').addEventListener('click',()=>{showPreview(example);message('Aperçu du donjon de test. Aucun appel IA effectué.')});
$('#load-daily').addEventListener('click',async()=>{try{showPreview(await request('/api/daily'));message('Donjon du jour chargé depuis le serveur. Aucun nouvel appel IA.')}catch(e){message(e.message,true)}await refreshStatus()});

$('#generation-form').addEventListener('submit',async event=>{event.preventDefault();if(busy||$('#generate-button').disabled)return;const cached=mode()==='daily'&&state?.dailyAvailable;busy=true;controls();message('');$('#generation-progress').hidden=false;const started=Date.now();$('#progress-message').textContent=cached?'Chargement du donjon enregistré…':'Ollama Cloud compose le donjon. Cela peut prendre une à deux minutes.';timer=setInterval(()=>{const elapsed=Math.floor((Date.now()-started)/1000);$('#progress-message').textContent=cached?'Chargement du donjon enregistré…':`Génération distante en cours · ${elapsed} s. La réponse sera vérifiée avant de pouvoir jouer.`},1000);try{const value=await request('/api/generate',{method:'POST',body:{mode:mode(),model:$('#model').value,inspiration:$('#inspiration').value.trim()}});showPreview(value);message(cached?'Donjon du jour chargé sans nouvel appel IA.':'Donjon reçu et vérifié. Tu peux maintenant le jouer.')}catch(e){message(e.message,true);if(e.status===401||e.status===503)$('#connection').open=true}finally{clearInterval(timer);busy=false;$('#generation-progress').hidden=true;await refreshStatus();controls()}});

$('#play-dungeon').addEventListener('click',()=>{if(!preview||busy)return;try{localStorage.setItem('nocturne:selected-dungeon',JSON.stringify(preview));location.href='/?dungeon=selected'}catch{message('Le navigateur empêche l’enregistrement du donjon. Autorise le stockage local pour pouvoir le jouer.',true)}});
await refreshStatus();
setInterval(()=>{if(!document.hidden&&!busy)refreshStatus()},15000);
window.addEventListener('pagehide',()=>{$('#api-key').value='';clearInterval(timer)});

bindModelRefresh(refreshStatus);
