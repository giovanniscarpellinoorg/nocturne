import {resources,buildings,refugeReason,refugeArtTargets,costText,effectText,ruleText,energyLimit,upgradeCost,harvestAmount} from './refuge-core.mjs';
import {request} from './cloud-ui.mjs';
import {updateModelPicker} from './model-picker.mjs';
import {drawLandscape,createRefugeArt} from './refuge-view.mjs';

const $=s=>document.querySelector(s),node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
let world=null,status=null,mutating=false,generating=false,selectedBuilding=null,selectedResident=null,artKey=null,library=[],panoramaJob=null,messageTimer;
const visuals=createRefugeArt(),icons={wood:'▥',food:'♧',herbs:'❧',embers:'✦'};
function button(label,fn,cls=''){const b=node('button',cls,label);b.type='button';b.onclick=fn;return b;}
function message(text,error=false){
 $('#game-message').textContent=text;$('#game-message').hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>$('#game-message').hidden=true,7000);
 if(error){const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);if(dialog){let line=dialog.querySelector('.error-line');if(!line){line=node('p','error-line');line.setAttribute('role','alert');dialog.append(line);}line.textContent=text;}}
}
function open(id){const dialog=$('#'+id);dialog.querySelector('.error-line')?.remove();if(!dialog.open)dialog.showModal();}
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$('#'+b.dataset.close).close();
function accept(value){if(!world||value.revision>=world.revision){world=value;render();}}
async function reload(){accept(await request('/api/refuge'));}
async function act(action,payload={}){
 if(!world||mutating)return;const reason=refugeReason(world,action,payload);if(reason){message(reason,true);return;}
 mutating=true;$('#save-status').textContent='Le refuge garde une trace…';
 try{const result=await request('/api/refuge/action',{method:'POST',body:{revision:world.revision,action,payload}});accept(result);
  if(action==='depart')$('#expedition-dialog').close();
  if(result.lastReport){for(const id of ['building-dialog','resident-dialog','night-dialog'])$('#'+id).close();$('#report-title').textContent=result.lastReport.title;$('#report-text').textContent=result.lastReport.text;$('#report-effects').textContent=result.lastReport.effects;open('report-dialog');}
 }catch(e){if(e.status===409)await reload().catch(()=>{});message(e.message,true);$('#save-status').textContent='Action non enregistrée · réessaie';}finally{mutating=false;}
}
function render(){
 visuals.setWorld(world);document.title=`Jour ${world.day} — ${world.name}`;
 $('#supplies').replaceChildren(...Object.entries(resources).map(([key,label])=>{const el=node('div','supply');el.append(node('span','',icons[key]),node('strong','',String(world.resources[key])),node('small','',label));return el;}));
 $('#day-label').textContent=`JOUR ${world.day}`;$('#energy-label').textContent=`${world.energy} / ${energyLimit(world)} actions`;
 $('#hope-label').textContent=`Espoir ${world.morale} / 10`;$('#population-label').textContent=`${world.residents.length} habitants · ${world.locations.length} chemins ouverts`;
 $('#save-status').textContent='Refuge conservé sur le serveur';
 const trip=world.trip,place=trip?world.locations.find(l=>l.id===trip.location):null,key=place?'location.'+place.id:'village';
 $('#village-stage').classList.toggle('expedition',Boolean(trip));$('#village-stage').classList.toggle('has-art',Boolean(world.art[key]));
 drawLandscape($('#landscape'),place?.id??'village');$('#scene-art').replaceChildren(...(world.art[key]?[visuals.canvas(key)]:[]));
 $('#chapter-label').textContent=trip?'AU-DELÀ DU REFUGE':world.buildings.beacon?'UNE LUMIÈRE DANS LA BRUME':'UNE LUMIÈRE À PROTÉGER';
 $('#place-title').textContent=place?.name??world.name;$('#place-description').textContent=place?.description??(world.completed.includes('first-light')?'Le village porte déjà la trace de vos premiers choix.':'Trois inconnus. Un toit. Tout le reste est à construire.');
 $('#scene-art-button').onclick=()=>showArt(key);
 $('#village-buildings').hidden=Boolean(trip);$('#hearth').hidden=Boolean(trip);$('#home-guidance').hidden=Boolean(trip);$('#living-rules').hidden=Boolean(trip);
 $('#village-buildings').replaceChildren(...Object.entries(buildings).map(([id,b])=>{const el=button('',()=>showBuilding(id),'village-building'+(!world.buildings[id]?' unbuilt':''));el.dataset.building=id;el.setAttribute('aria-label',`${b.name}, ${world.buildings[id]?'niveau '+world.buildings[id]:'à aménager'}`);el.append(visuals.canvas('building.'+id),node('strong','',b.name),node('small','',world.buildings[id]?`Niveau ${world.buildings[id]} · voir le bâtiment`:'À aménager'));return el;}));
 const visible=trip?world.residents.filter(r=>r.id===trip.resident):world.residents.slice(0,6);
 $('#village-residents').replaceChildren(...visible.map(r=>{const el=button('',()=>showResident(r.id),'village-resident');el.setAttribute('aria-label',`${r.name}, ${r.role}`);el.append(visuals.canvas('resident.'+r.id),node('span','',r.name));return el;}));
 $('#objectives').replaceChildren(...[[world.completed.includes('first-light'),'Suivre les lumières dans les bois'],[world.buildings.garden>0,'Faire pousser le premier jardin'],[world.buildings.beacon>0,'Rallumer le fanal du refuge']].map(([done,label])=>node('li',done?'done':'',label)));
 if(world.buildings.beacon&&world.completed.includes('first-light')&&world.buildings.garden)$('#objectives').append(node('li','','Faire naître la suite avec Ollama'));
 $('#living-rules').replaceChildren(...world.rules.map(r=>{const el=node('div','living-rule');el.title=r.description;el.append(node('strong','',r.name),node('span','',ruleText(r)));return el;}));
 for(const id of ['depart-button','rest-button']){$('#'+id).disabled=Boolean(trip)||(id==='depart-button'&&!world.energy);$('#'+id).title=trip?'Reviens au refuge pour continuer.':id==='depart-button'&&!world.energy?'Passe la nuit pour retrouver tes actions.':'';}
 $('#encounter-panel').hidden=!trip;
 if(trip){const event=trip.event,chosen=event.choices.find(c=>c.id===trip.choice);$('#encounter-origin').textContent=event.source==='ollama'?'UNE NOUVELLE PAGE · OLLAMA':'SUR LE CHEMIN';$('#encounter-title').textContent=event.title;$('#encounter-text').textContent=event.text;
  $('#encounter-choices').hidden=Boolean(chosen);$('#encounter-result').hidden=!chosen;
  $('#encounter-choices').replaceChildren(...event.choices.map(c=>{const el=button('',()=>act('choose',{choice:c.id}),'encounter-choice'),reason=refugeReason(world,'choose',{choice:c.id});el.disabled=Boolean(reason);el.title=reason??'';el.append(node('strong','',c.label),node('span','',costText(c.cost)),node('span','',effectText(c.effects)));return el;}));
  if(chosen){$('#choice-consequence').textContent=chosen.consequence;$('#choice-effects').textContent='Au retour : '+effectText(chosen.effects);}
  $('#return-button').textContent=chosen?'Rentrer avec ces découvertes':'Rentrer sans intervenir';
 }
 updateGenerationControls();
}
$('#return-button').onclick=()=>act('return');
$('#menu-button').onclick=()=>open('menu-dialog');
$('#fullscreen-button').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#refuge-app').requestFullscreen();}catch{message('Le refuge occupe déjà la fenêtre ; le plein écran est indisponible ici.');}};
document.addEventListener('fullscreenchange',()=>$('#fullscreen-button').setAttribute('aria-label',document.fullscreenElement?'Quitter le plein écran':'Passer en plein écran'));
function destinations(){
 const companion=world.residents.find(r=>r.id===$('#companion').value)??world.residents[0];
 $('#destinations').replaceChildren(...world.locations.map(l=>{const el=button('',()=>act('depart',{location:l.id,resident:companion.id}),'destination'),art=node('div','destination-art');art.append(visuals.canvas('location.'+l.id));el.append(art,node('strong','',l.name),node('p','',l.description));const event=world.events.find(e=>e.location===l.id);el.append(node('small',event?'new-event':'',event?'✧ '+event.title:`Récolte : ${harvestAmount(world,l,companion)} ${resources[l.resource].toLowerCase()}`),node('small','','1 action · '+companion.name));el.disabled=Boolean(refugeReason(world,'depart',{location:l.id,resident:companion.id}));return el;}));
}
$('#depart-button').onclick=()=>{if(!world)return;$('#companion').replaceChildren(...world.residents.map(r=>new Option(`${r.name} · +1 ${resources[r.skill].toLowerCase()} sur les récoltes correspondantes`,r.id)));destinations();open('expedition-dialog');};$('#companion').onchange=destinations;
function showBuilding(id){if(!world)return;selectedBuilding=id;const b=buildings[id];$('#building-title').textContent=b.name;$('#building-preview').replaceChildren(visuals.canvas('building.'+id));$('#building-description').textContent=b.description;$('#building-level').textContent=world.buildings[id]?`Niveau ${world.buildings[id]} sur ${b.max}`:'Ce lieu attend son premier chantier.';$('#building-cost').textContent=world.buildings[id]<b.max?'Chantier : '+costText(upgradeCost(world,id))+' · 1 action':'Aménagement terminé';const reason=refugeReason(world,'build',{building:id});$('#build-button').disabled=Boolean(reason);$('#building-reason').textContent=reason??'';$('#build-button').textContent=world.buildings[id]?'Améliorer ce lieu':'Aménager ce lieu';open('building-dialog');}
$('#build-button').onclick=()=>act('build',{building:selectedBuilding});$('#building-art-button').onclick=()=>{$('#building-dialog').close();showArt('building.'+selectedBuilding);};
function showResident(id){const r=world.residents.find(r=>r.id===id);selectedResident=id;$('#resident-name').textContent=r.name;$('#resident-role').textContent=r.role;$('#resident-preview').replaceChildren(visuals.canvas('resident.'+id));$('#resident-description').textContent=r.description;$('#resident-talent').textContent=`En expédition : +1 ${resources[r.skill].toLowerCase()} sur les récoltes de cette ressource.`;const reason=refugeReason(world,'talk',{resident:id});$('#talk-button').disabled=Boolean(reason);$('#talk-reason').textContent=reason??'Un moment partagé apporte 1 espoir.';open('resident-dialog');}
$('#talk-button').onclick=()=>act('talk',{resident:selectedResident});$('#resident-art-button').onclick=()=>{$('#resident-dialog').close();showArt('resident.'+selectedResident);};
$('#people-button').onclick=()=>{if(!world)return;$('#people-list').replaceChildren(...world.residents.map(r=>{const el=button('',()=>{$('#people-dialog').close();showResident(r.id);},'person-card');el.append(visuals.canvas('resident.'+r.id),node('strong','',r.name),node('small','',r.role));return el;}));open('people-dialog');};
$('#journal-button').onclick=()=>{if(!world)return;$('#memory-list').replaceChildren(...world.memories.slice().reverse().map(m=>{const e=node('article','memory');e.append(node('span','',`JOUR ${m.day}`),node('p','',m.text));return e;}));if(!world.memories.length)$('#memory-list').append(node('p','','Les premiers souvenirs s’écriront au retour de votre expédition.'));$('#journal-list').replaceChildren(...world.journal.slice().reverse().map(m=>node('li','',`Jour ${m.day} · ${m.text}`)));open('journal-dialog');};
$('#rest-button').onclick=()=>{if(!world)return;const food=Math.ceil(world.residents.length/2),garden=world.buildings.garden*2;$('#night-description').textContent=`Le jardin fournira ${garden} vivres. Il en faut ${food} pour les ${world.residents.length} habitants. Vous en avez ${world.resources.food} en réserve. Au matin : ${energyLimit(world)} actions. ${world.energy?`Les ${world.energy} actions restantes ne sont pas reportées.`:''} Si le repas est incomplet, le refuge perd 2 espoir.`;$('#night-rules').textContent=world.rules.filter(r=>r.kind==='dawn').map(ruleText).join(' · ')||'Les règles temporaires perdront une nuit de durée.';open('night-dialog');};$('#confirm-rest').onclick=()=>act('rest');

function updateGenerationControls(){
 const locked=generating||Boolean(status?.busy)||!status?.configured;
 $('#write-event').disabled=locked||!world||world.events.some(e=>e.source==='ollama');
 $('#draw-art').disabled=locked||!artKey;const target=world&&refugeArtTargets(world).find(t=>t.key===artKey),asset=world?.art[artKey];
 $('#variant-art').disabled=locked||!asset||target?.kind==='scene';$('#animate-art').disabled=locked||!asset||asset.sprite.width!==asset.sprite.height;
 $('#animate-art').title=asset&&asset.sprite.width!==asset.sprite.height?'Les animations sont disponibles pour les dessins carrés.':'';
 $('#assign-art').disabled=generating||!$('#library-sprite').value;
}
async function refreshStatus(){try{status=await request('/api/status');for(const id of ['story-model','art-model'])updateModelPicker($('#'+id),status);}catch{status=null;}updateGenerationControls();}
$('#imagine-button').onclick=()=>{if(!world)return;const event=world.events.find(e=>e.source==='ollama');$('#event-message').textContent=event?`À découvrir : « ${event.title} », à ${world.locations.find(l=>l.id===event.location).name}.`:status?.configured?'La prochaine rencontre tiendra compte de vos décisions.':'Configure Ollama dans l’atelier pour continuer à écrire le monde.';open('imagine-dialog');void refreshStatus();};
async function generate(path,body,messageId){
 if(generating)return;generating=true;updateGenerationControls();$('#'+messageId).textContent='Ollama travaille… Le refuge reste jouable. Tu peux fermer cette fenêtre.';$('#generation-status').hidden=false;$('#generation-status').textContent='Ollama façonne la suite…';
 try{const result=await request(path,{method:'POST',body,timeoutMs:650000});if(result.illustrationJob){try{localStorage.setItem('nocturne:refuge-illustration',result.illustrationJob);}catch{}await followPanorama(result.illustrationJob);}else accept(result);
  $('#'+messageId).textContent='Enregistré dans le refuge.';if(path.endsWith('/event')){const e=world.events.find(e=>e.source==='ollama');$('#'+messageId).textContent=e?`« ${e.title} » vous attend à ${world.locations.find(l=>l.id===e.location).name}.`:'La rencontre a rejoint le monde.';}
  if(artKey&&$('#art-dialog').open)$('#art-preview').replaceChildren(...(world.art[artKey]?[visuals.canvas(artKey)]:[]));
 }catch(e){$('#'+messageId).textContent=e.message;message(e.message,true);}finally{generating=false;$('#generation-status').hidden=true;await refreshStatus();}
}
async function followPanorama(id){panoramaJob=id;$('#generation-status').hidden=false;try{for(;;){const job=await request('/api/refuge/illustrations/'+id);$('#generation-status').textContent='Ollama · '+job.stage;if(job.status!=='running'){try{localStorage.removeItem('nocturne:refuge-illustration');}catch{}if(job.status!=='success')throw Error(job.error??'Illustration interrompue.');await reload();break;}await new Promise(r=>setTimeout(r,2200));}}finally{panoramaJob=null;}}
$('#write-event').onclick=()=>generate('/api/refuge/event',{model:$('#story-model').value,inspiration:$('#inspiration').value.trim()},'event-message');
async function showArt(key){
 artKey=key;const target=refugeArtTargets(world).find(t=>t.key===key);if(!target)return;
 $('#art-title').textContent=target.name;$('#art-description').textContent=target.description;$('#art-preview').replaceChildren(...(world.art[key]?[visuals.canvas(key)]:[]));$('#art-message').textContent='';
 $('#art-generation-hint').textContent=target.kind==='scene'?'Panorama 256 × 144 : composition, volumes, détails. Trois appels, avec corrections éventuelles. La progression survit au rechargement.':'Dessin 64 × 64 : un appel. Animation au repos : quatre poses, avec corrections éventuelles. La variante part du dessin actuel.';
 $('#variant-art').hidden=target.kind==='scene';$('#animate-art').hidden=target.kind==='scene';$('#library-sprite').replaceChildren(new Option('Choisir un dessin du carnet…',''));$('#library-animation').replaceChildren(new Option('Image fixe',''));open('art-dialog');updateGenerationControls();
 try{library=await request('/api/designer/sprites');if(artKey!==key)return;for(const r of library.filter(r=>r.review.status!=='rejected').sort((a,b)=>Number(b.review.status==='approved')-Number(a.review.status==='approved')))$('#library-sprite').add(new Option(`${r.sprite.name}${r.review.status==='approved'?' · validé':''}`,r.id));}catch(e){$('#art-message').textContent=e.message;}await refreshStatus();
}
$('#library-sprite').onchange=()=>{const r=library.find(r=>r.id===$('#library-sprite').value);$('#library-animation').replaceChildren(new Option('Image fixe',''),...(r?.animations??[]).map(a=>new Option(a.name,a.id)));updateGenerationControls();};
$('#assign-art').onclick=async()=>{if(!$('#library-sprite').value)return;$('#assign-art').disabled=true;try{accept(await request('/api/refuge/art',{method:'POST',body:{key:artKey,spriteId:$('#library-sprite').value,animationId:$('#library-animation').value}}));$('#art-preview').replaceChildren(visuals.canvas(artKey));$('#art-message').textContent='Le dessin et son animation sont conservés dans le refuge.';}catch(e){$('#art-message').textContent=e.message;}finally{updateGenerationControls();}};
$('#draw-art').onclick=()=>generate('/api/refuge/illustrate',{key:artKey,model:$('#art-model').value},'art-message');$('#variant-art').onclick=()=>generate('/api/refuge/illustrate',{key:artKey,model:$('#art-model').value,variant:true},'art-message');$('#animate-art').onclick=()=>generate('/api/refuge/animate',{key:artKey,model:$('#art-model').value},'art-message');
for(let i=0;i<18;i++){const mote=node('i','mote');mote.style.setProperty('--x',(10+i*47%83)+'%');mote.style.setProperty('--y',(35+i*13%50)+'%');mote.style.setProperty('--delay',(-i*.7)+'s');$('#fireflies').append(mote);}
try{await reload();await refreshStatus();let job;try{job=localStorage.getItem('nocturne:refuge-illustration');}catch{}if(job){generating=true;updateGenerationControls();void followPanorama(job).catch(e=>message(e.message,true)).finally(()=>{generating=false;$('#generation-status').hidden=true;void refreshStatus();});}}
catch(e){$('#save-status').textContent='Refuge inaccessible';message(e.message,true);$('#place-description').textContent='Le serveur doit être démarré avec cette version pour retrouver le refuge.';}
setInterval(()=>void refreshStatus(),20000);
