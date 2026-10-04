import {InvestigationRun,sampleInvestigation,validateInvestigation,cardRules,locationRules,enemyRules,artBrief,illustrationKeys} from './investigation-core.mjs';
import {paintSprite} from './pixels.mjs';
import {sceneState,visibleBounds} from './investigation-scene.mjs';
import {boardState,boardSize,boardCard,fitBoard} from './investigation-board.mjs';
import {actionFeedback} from './investigation-feedback.mjs';
import {request} from './cloud-ui.mjs';
import {updateModelPicker,bindModelRefresh} from './model-picker.mjs';

const $=s=>document.querySelector(s),saveKey='nocturne:investigation-run-v1';
let run,status=null,working=false,detail=null,artKey=null,confirmAction=null,loadedSave=false;
function resizeBoard(){
 const viewport=$('.board-scroll'),surface=$('.location-board'),fit=fitBoard(viewport.clientWidth,viewport.clientHeight);
 surface.style.width=boardSize.width+'px';surface.style.height=boardSize.height+'px';
 surface.style.transform=`translate(-50%,-50%) scale(${fit.scale})`;
}
new ResizeObserver(resizeBoard).observe($('.board-scroll'));
const node=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
const symbols={investigator:'◒',location:'⌂',card:'✧',enemy:'◈'};
function notice(message){$('#notice').textContent=message;}
function save(){try{localStorage.setItem(saveKey,JSON.stringify({...run.save(),record:{...run.record,art:{}}}));$('#save-state').textContent='Partie sauvegardée dans ce navigateur.';}catch{$('#save-state').textContent='Stockage local indisponible : cette partie ne peut pas être sauvegardée.';}}
function art(key){const surface=node('div','art-surface'),kind=key.split('.')[0];surface.dataset.kind=kind;const image=run.record.art[key];if(image){const canvas=node('canvas');paintSprite(canvas,image);canvas.setAttribute('aria-label',image.description||image.name);surface.append(canvas);}else{const symbol=node('span','sigil-art',symbols[kind]??'✧');symbol.setAttribute('aria-hidden','true');surface.append(symbol);}return surface;}
function actorArt(key){
 const image=run.record.art[key],surface=node('div','actor-art');
 if(image){const bounds=visibleBounds(image),canvas=node('canvas');paintSprite(canvas,{width:bounds.width,height:bounds.height,pixels:image.pixels.map(p=>({...p,x:p.x-bounds.x,y:p.y-bounds.y}))});canvas.setAttribute('aria-label',image.name);surface.append(canvas);}
 else {const silhouette=node('span','actor-silhouette '+(key==='investigator'?'human':'creature'));silhouette.setAttribute('aria-hidden','true');surface.append(silhouette);surface.classList.add('unillustrated');}
 return surface;
}
function renderScene(){
 const scene=sceneState(run),key='location.'+scene.location.id,stage=$('#location-scene');stage.dataset.place=scene.location.id;
 if(run.record.art[key]){$('#current-art').replaceChildren(art(key));stage.classList.add('illustrated');}
 else {const architecture=node('div','scene-architecture');for(let i=0;i<5;i++)architecture.append(node('i'));$('#current-art').replaceChildren(architecture);stage.classList.remove('illustrated');}
 $('#scene-illustrate').textContent=run.record.art[key]?'Voir le lieu':'Illustrer le lieu';$('#scene-illustrate').onclick=()=>showDetail(key);
 const hero=node('button','scene-actor hero');hero.type='button';hero.append(actorArt('investigator'),node('strong','actor-name',scene.investigator.name),node('span','actor-state',`${run.health} vie · ${run.sanity} mental`));hero.setAttribute('aria-label','Voir '+scene.investigator.name);hero.onclick=()=>showDetail('investigator');$('#scene-investigator').replaceChildren(hero);
 $('#enemies').replaceChildren();$('#enemy-help').textContent=scene.enemies.length?`${scene.enemies.length} présence${scene.enemies.length>1?'s':''} hostile${scene.enemies.length>1?'s':''}`:'Le lieu semble désert…';
 for(const enemy of scene.enemies){
  const figure=node('article','scene-foe'+(enemy.exhausted?' exhausted':'')),button=node('button','scene-actor');button.type='button';button.append(actorArt('enemy.'+enemy.type),node('strong','actor-name',enemy.name),node('span','actor-state',`${enemy.health} / ${enemy.maxHealth} PV · ${enemy.exhausted?'Esquivé':'Hostile'}`));button.setAttribute('aria-label',`Voir ${enemy.name}, ${enemy.health} points de vie`);button.onclick=()=>showDetail('enemy.'+enemy.type);
  const controls=node('div','enemy-buttons');controls.append(actionButton('Attaquer','attack',{target:enemy.id}),actionButton('Esquiver','evade',{target:enemy.id}));figure.append(button,controls);$('#enemies').append(figure);
 }
 $('#scene-exits').replaceChildren(node('span','eyebrow','SE DÉPLACER'));
 for(const exit of scene.exits){const button=actionButton('↗ '+exit.name,'move',{to:exit.to});button.append(node('small','',exit.reason??'1 action'));$('#scene-exits').append(button);}
}
function renderBoard(){
 const board=boardState(run),svg=$('#board-links'),ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const makeSVG=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
 for(const edge of board.edges){
  const group=makeSVG('g',{class:'board-route'+(edge.locked?' locked':edge.adjacent?' adjacent':'')}),title=makeSVG('title',{});title.textContent=edge.label;
  group.append(title,makeSVG('line',{x1:edge.x1,y1:edge.y1,x2:edge.x2,y2:edge.y2}));
  const cx=(edge.x1+edge.x2)/2,cy=(edge.y1+edge.y2)/2;
  group.append(makeSVG('circle',{cx,cy,r:15}));const label=makeSVG('text',{x:cx,y:cy+5,'text-anchor':'middle'});label.textContent=edge.locked?'6':'↔';group.append(label);svg.append(group);
 }
 $('#locations').replaceChildren();
 for(const place of board.places){
  const element=node('article','location-card'+(place.current?' is-current':'')+(place.adjacent&&!place.locked?' is-adjacent':'')+(place.locked?' is-locked':''));element.dataset.location=place.id;element.style.left=place.x+'px';element.style.top=place.y+'px';element.style.width=boardCard.width+'px';element.style.height=boardCard.height+'px';
  const face=node('button','location-face');face.type='button';face.setAttribute('aria-label',`${place.name}. ${place.current?'Votre position. ':''}Relié à ${place.connections.join(', ')}. Voir la fiche.`);if(place.current)face.setAttribute('aria-current','location');face.onclick=()=>showDetail('location.'+place.id);
  const image=node('div','map-art');image.append(art('location.'+place.id));face.append(node('h3','card-title',place.name),image,node('span','card-type',place.locked?'LIEU · VERROUILLÉ':place.current?'LIEU · VOUS ÊTES ICI':place.visited?'LIEU · EXPLORÉ':'LIEU · À DÉCOUVRIR'));
  const stats=node('div','location-counters');stats.append(node('span','counter clue',place.clues+' indices'),node('span','counter difficulty','Difficulté '+place.difficulty));face.append(stats);
  element.append(face);
  const presence=node('div','location-presence');if(place.current){const pawn=node('span','investigator-pawn');pawn.append(actorArt('investigator'));pawn.title=run.record.story.investigator.name+' est ici';presence.append(pawn,node('strong','',run.record.story.investigator.name));}if(place.enemies.length)presence.append(node('span','enemy-marker',place.enemies.length+' ennemi'+(place.enemies.length>1?'s':'')));if(!place.current&&!place.enemies.length)presence.append(node('span','',place.locked?'6 indices pour y accéder':place.visited?'Aucune présence hostile':'Lieu inexploré'));element.append(presence);
  if(place.current){const enter=node('button','location-travel','Observer le lieu');enter.onclick=()=>$('#scene-dialog').showModal();element.append(enter);}
  else if(place.adjacent){const travel=actionButton(place.locked?'Passage verrouillé':'Se déplacer · 1 action','move',{to:place.id});travel.className='location-travel';element.append(travel);}
  else element.append(node('span','location-distance','Rejoindre un lieu relié d’abord'));
  $('#locations').append(element);
 }
 const current=board.places.find(p=>p.current),destinations=board.places.filter(p=>p.adjacent);
 $('#travel-help').textContent=`Depuis ${current.name} : ${destinations.map(p=>p.name+(p.locked?' (6 indices requis)':'')).join(' ou ')}. `+(run.here.some(e=>!e.exhausted)?'Partir sans esquiver coûte 1 vie par ennemi actif.':'Les lignes indiquent les trajets directs dans les deux sens.');
}
function renderThreats(){
 $('#threat-location').textContent=run.name('locations',run.location);$('#threat-help').textContent=run.here.length?'Ces ennemis sont dans votre lieu. Attaquer ou esquiver coûte 1 action.':'Aucun ennemi ici. Vous pouvez enquêter.';$('#threats').replaceChildren();
 for(const e of run.here){const enemy=run.record.story.enemies.find(a=>a.id===e.type),rule=enemyRules[e.type],card=node('article','enemy-table-card'+(e.exhausted?' exhausted':'')),picture=node('button','enemy-table-art');picture.append(art('enemy.'+e.type));picture.setAttribute('aria-label','Voir '+enemy.name);picture.onclick=()=>showDetail('enemy.'+e.type);
 const content=node('div','enemy-table-copy');content.append(node('span','card-type',e.exhausted?'ENNEMI · ESQUIVÉ':'ENNEMI · ACTIF'),node('h3','card-title',enemy.name),node('p','',`${e.health} PV · Défense ${rule.defense} · Esquive ${rule.evade}`),node('p','micro',`Fin du tour : ${rule.damage} dégât(s), ${rule.horror} horreur.`));const actions=node('div','enemy-buttons');actions.append(actionButton('Attaquer','attack',{target:e.id}),actionButton('Esquiver','evade',{target:e.id}));content.append(actions);card.append(picture,content);$('#threats').append(card);}
 if(!run.here.length)$('#threats').append(node('div','empty-slot','Aucune menace dans ce lieu'));
}
function renderEquipment(){
 $('#equipment').replaceChildren();for(const instance of run.equipment){const id=instance.slice(0,-2),card=run.record.story.cards.find(c=>c.id===id),button=node('button','equipped-card');button.append(art('card.'+id),node('strong','',card.name),node('span','','+1 aux tests d’enquête'));button.onclick=()=>showDetail('card.'+id);$('#equipment').append(button);}
 if(!run.equipment.length)$('#equipment').append(node('div','empty-slot','Jouez un équipement pour le placer ici'));
}
function actionButton(text,action,payload={}){const button=node('button','',text),reason=run.reason(action,payload);button.type='button';button.disabled=Boolean(reason);button.title=reason??'Coûte 1 action';button.onclick=()=>perform(action,payload);return button;}
let feedbackBusy=false,feedbackTimers=[],feedbackData=null,toastTimer;
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function clearFeedbackTimers(){feedbackTimers.forEach(clearTimeout);feedbackTimers=[];}
function feedbackChanges(container,changes){container.replaceChildren(...changes.map(c=>node('span',c.negative?'negative':'positive',c.label)));}
function dismissToast(){clearTimeout(toastTimer);const toast=$('#action-toast');if(toast.hidePopover&&toast.matches(':popover-open'))toast.hidePopover();toast.hidden=true;}
$('#dismiss-action-toast').onclick=dismissToast;
function highlightChanges(data){
 const targets=data.changes.map(c=>$('#'+c.target));targets.push($('#action-tokens'));
 if(data.equipped)targets.push($('#equipment'));
 if(data.drawn.length)targets.push($('#hand'));
 if(data.action==='move')targets.push(document.querySelector(`[data-location="${data.location}"]`));
 for(const target of targets)if(target&&!reducedMotion())target.animate([{filter:'brightness(1)'},{filter:'brightness(1.8)',offset:.35},{filter:'brightness(1)'}],{duration:900});
}
function showActionFeedback(data){
 dismissToast();feedbackData=data;
 if(!data.modal){
  $('#toast-title').textContent=data.title;$('#toast-cost').textContent=data.cost;feedbackChanges($('#toast-changes'),data.changes);
  $('#toast-copy').textContent=data.events.join(' ');$('#toast-art').replaceChildren(...(data.artKey?[art(data.artKey)]:[]));$('#toast-art').hidden=!data.artKey;
  $('#action-toast').hidden=false;$('#action-toast').showPopover?.();clearTimeout(toastTimer);toastTimer=setTimeout(dismissToast,6500);highlightChanges(data);return;
 }
 feedbackBusy=true;clearFeedbackTimers();const dialog=$('#action-dialog');dialog.dataset.phase=data.test?'drawing':'result';dialog.dataset.outcome='';
 $('#feedback-label').textContent=data.test?'LE SAC DU DESTIN':data.action==='end'?'FIN DU TOUR':'PIOCHE';
 $('#feedback-title').textContent=data.title;$('#feedback-context').textContent=data.context;
 $('#chaos-stage').hidden=!data.test;$('#chaos-token').textContent='?';$('#feedback-result').hidden=true;
 $('#feedback-art').hidden=!data.artKey||Boolean(data.test);$('#feedback-art').replaceChildren(...(data.artKey?[art(data.artKey)]:[]));
 $('#feedback-phase').textContent=data.test?`Compétence ${data.test.skill} · difficulté ${data.test.difficulty}. Un jeton sort du sac…`:'';
 $('#feedback-continue').textContent=data.test?'Révéler maintenant':'Revenir au plateau';dialog.showModal();
 if(data.test&&!reducedMotion()){
  feedbackTimers.push(setTimeout(()=>{dialog.dataset.phase='token';$('#chaos-token').textContent=data.test.token>=0?'+'+data.test.token:String(data.test.token);$('#feedback-phase').textContent=`Jeton tiré : ${data.test.token>=0?'+':''}${data.test.token}.`;},700));
  feedbackTimers.push(setTimeout(revealFeedback,1450));
 }else revealFeedback();
}
function revealFeedback(){
 clearFeedbackTimers();const data=feedbackData;if(!data||!$('#action-dialog').open)return;const test=data.test,dialog=$('#action-dialog');dialog.dataset.phase='result';dialog.dataset.outcome=test?(test.success?'success':'failure'):data.outcome==='lost'?'failure':'neutral';
 $('#chaos-token').textContent=test?(test.token>=0?'+'+test.token:String(test.token)):'?';
 $('#feedback-equation').hidden=!test;$('#feedback-equation').replaceChildren();
 if(test){for(const [label,value]of [['Compétence',test.skill],['Jeton',(test.token>=0?'+':'')+test.token],['Total',test.total],['Difficulté',test.difficulty]]){const term=node('div');term.append(node('span','',label),node('strong','',String(value)));$('#feedback-equation').append(term);}}
 $('#feedback-verdict').textContent=test?(test.success?'Réussite':'Échec'):data.outcome==='lost'?'L’enquête s’achève':data.action==='end'?`Tour ${data.round} · ${run.actions} actions disponibles`:data.drawn.length?data.drawn[0].name:'Aucune carte ajoutée à la main';
 feedbackChanges($('#feedback-changes'),data.changes);$('#feedback-events').replaceChildren(...data.events.map(text=>node('li','',text)));$('#feedback-cost').textContent=data.cost;
 $('#feedback-result').hidden=false;$('#feedback-phase').textContent=test?`${test.total} ${test.success?'≥':'<'} ${test.difficulty} : ${test.success?'le test réussit':'le test échoue'}.`:'Action résolue.';
 $('#feedback-continue').textContent='Revenir au plateau';
}
$('#feedback-continue').onclick=()=>{if($('#action-dialog').dataset.phase!=='result')revealFeedback();else $('#action-dialog').close();};
$('#action-dialog').addEventListener('cancel',event=>{if($('#action-dialog').dataset.phase!=='result'){event.preventDefault();revealFeedback();}});
$('#action-dialog').addEventListener('close',()=>{clearFeedbackTimers();feedbackBusy=false;highlightChanges(feedbackData);});
function perform(action,payload={}){
 if(feedbackBusy)return;
 const before=run.save(),result=run.act(action,payload);if(!result.ok){notice(result.error);return;}
 const feedback=actionFeedback(before,run,action,payload);
 if(run.state!=='playing')$('#scene-dialog').close();
 notice(run.state==='playing'&&run.actions===0?'Tes actions sont épuisées. Termine le tour pour continuer.':'');save();render();showActionFeedback(feedback);
}
function render(){
 const story=run.record.story;$('#story-title').textContent=story.title;$('#story-intro').textContent=story.intro;$('#journal-title').textContent=story.title;
 $('#investigator-name').textContent=story.investigator.name;$('#investigator-description').textContent=story.investigator.description;$('#investigator-art').replaceChildren(art('investigator'));
 for(const [id,value]of [['life',`${run.health} / 8`],['sanity',`${run.sanity} / 7`],['resources',run.resources],['clues',`${run.clues} / 6`]])$('#'+id).textContent=value;
 $('#intellect').textContent='Enquête '+run.intellect;
 renderBoard();renderThreats();renderEquipment();
 const place=story.locations.find(p=>p.id===run.location);renderScene();$('#location-title').textContent=place.name;$('#location-description').textContent=place.description;$('#location-stats').replaceChildren(node('span','',`${run.remaining[place.id]} indice(s) restant(s)`),node('span','',`Difficulté ${locationRules[place.id].difficulty}`));
 $('#turn-label').textContent='TOUR '+run.round;$('#actions-left').textContent=`${run.actions} action${run.actions>1?'s':''} restante${run.actions>1?'s':''}`;$('#end-turn').disabled=run.state!=='playing';$('#end-turn').textContent=run.actions?'Terminer le tour':'Passer à la nuit suivante';
 for(const button of document.querySelectorAll('[data-action]')){const reason=run.reason(button.dataset.action);button.disabled=Boolean(reason);button.title=reason??'Coûte 1 action';}
 $('#action-help').textContent=run.here.some(e=>!e.exhausted)?'Un ennemi actif empêche d’enquêter. Combats-le ou esquive-le. Partir sans l’esquiver coûte 1 vie par ennemi.':'Enquêter découvre 1 indice sur un test réussi. Une action permet aussi de piocher, gagner 1 ressource ou récupérer 1 santé mentale.';
 $('#test-result').hidden=!run.lastTest;if(run.lastTest){const t=run.lastTest;$('#test-result').classList.toggle('failure',!t.success);$('#test-result').textContent=`${t.success?'Réussite':'Échec'} · ${t.label} : compétence ${t.skill}, jeton ${t.token>=0?'+':''}${t.token} = ${t.skill+t.token} · difficulté ${t.difficulty}`;}
 $('#doom-count').textContent=`${run.doom} / 14`;$('#doom-meter').value=run.doom;$('#act-label').textContent=run.clues<3?'ACTE I':'ACTE II';$('#act-title').textContent=run.clues<3?'Des voix dans la nuit':'L’autre côté du passage';$('#act-copy').textContent=story.acts[run.clues<3?0:1];$('#objective-summary').textContent=run.clues<6?`Réunir 6 indices · ${run.clues} / 6`:'Rejoindre le dernier lieu, vaincre ses ennemis et fermer le passage.';
 $('#game-log').replaceChildren(...run.log.slice().reverse().map(entry=>node('li','',entry)));
 $('#resolution').hidden=run.location!=='lighthouse'||run.state!=='playing';$('#resolution-button').hidden=$('#resolution').hidden;if($('#resolution').hidden)$('#resolution-dialog').close();for(const [id,choice]of[['seal-ending','seal'],['save-ending','save']]){const reason=run.reason('resolve',{choice});$('#'+id).disabled=Boolean(reason);$('#'+id).title=reason??'Coûte 1 action';}$('#resolution-help').textContent=run.here.length?'Tous les ennemis de ce lieu doivent être vaincus.':'Chaque dénouement coûte 1 action. Sceller demande au moins 3 santé mentale ; sauver demande 3 ressources.';
 $('#action-tokens').replaceChildren(...Array.from({length:3},(_,i)=>{const token=node('span','action-token'+(i<run.actions?' ready':' spent'),String(i+1));token.setAttribute('aria-label',i<run.actions?'Action disponible':'Action dépensée');return token;}));
 $('#draw-count').textContent=run.deck.length+' cartes';$('#discard-count').textContent=run.discard.length+' cartes';$('#draw-pile').disabled=Boolean(run.reason('draw'));$('#draw-pile').title=run.reason('draw')??'Piocher coûte 1 action';
 $('#hand').replaceChildren();
 for(const instance of run.hand){
  const id=instance.slice(0,-2),card=story.cards.find(c=>c.id===id),rule=cardRules[id],element=node('article','player-card'),image=node('button','card-image');image.setAttribute('aria-label','Voir '+card.name);image.append(art('card.'+id));image.onclick=()=>showDetail('card.'+id,instance);element.dataset.type=rule.effect;element.title=card.name+' — '+rule.text;const cost=node('span','card-cost',String(rule.cost));cost.setAttribute('aria-label',rule.cost+' ressource(s)');element.append(node('h3','card-title',card.name),image,cost,node('p','card-type',rule.label),node('p','card-text',rule.text),node('p','card-flavor',card.flavor));
  const payload={card:instance,target:run.here[0]?.id},reason=run.reason('play',payload),play=node('button','play-card',rule.effect==='attack'&&run.here.length>1?'Choisir une cible':'Jouer · 1 action');play.disabled=Boolean(reason);play.title=reason??rule.text;play.onclick=()=>rule.effect==='attack'&&run.here.length>1?showDetail('card.'+id,instance):perform('play',payload);element.append(play);if(reason)element.append(node('p','card-reason',reason));$('#hand').append(element);
 }
 if(!run.hand.length)$('#hand').append(node('p','micro','Ta main est vide. Pioche une carte pour 1 action, ou termine le tour.'));
 $('#deck-button').textContent=`Deck ${run.deck.length} · Défausse ${run.discard.length}`;
 $('#outcome').hidden=run.state==='playing';if(run.state!=='playing'){$('#outcome-label').textContent=run.state==='won'?'ENQUÊTE RÉSOLUE':'LA NUIT A GAGNÉ';$('#outcome-title').textContent=run.state==='won'?(run.ending==='seal'?'Le silence revient.':'Ils reviennent avec toi.'):'L’enquête s’interrompt.';$('#outcome-copy').textContent=run.state==='won'?story.endings[run.ending]:run.log.at(-1);}
}
function showDetail(key,instance){
 detail={key,instance};const [kind,id]=key.split('.'),story=run.record.story,entry=kind==='investigator'?story.investigator:story[{location:'locations',card:'cards',enemy:'enemies'}[kind]].find(e=>e.id===id);
 $('#card-dialog').dataset.kind=kind;$('#card-dialog').dataset.type=kind==='card'?cardRules[id].effect:kind;
 $('#detail-type').textContent={investigator:'INVESTIGATEUR',location:'LIEU',card:'CARTE',enemy:'ENNEMI'}[kind];$('#detail-title').textContent=entry.name;$('#detail-art').replaceChildren(art(key));$('#detail-copy').textContent=entry.description??entry.flavor;
 $('#detail-play').hidden=kind!=='card'||!instance;$('#detail-move').hidden=kind!=='location'||id===run.location;$('#detail-target').hidden=kind!=='card'||cardRules[id]?.effect!=='attack';
 $('#card-target').replaceChildren(...run.here.map(e=>new Option(run.name('enemies',e.type)+` · ${e.health} PV`,e.id)));
 if(kind==='card')$('#detail-rule').textContent=`${cardRules[id].text} Coût : ${cardRules[id].cost} ressource(s) et 1 action.`;
 else if(kind==='location')$('#detail-rule').textContent=`Difficulté ${locationRules[id].difficulty} · ${run.remaining[id]} indice(s). Relié à : ${locationRules[id].links.map(k=>run.name('locations',k)).join(', ')}.`;
 else if(kind==='enemy'){const r=enemyRules[id];$('#detail-rule').textContent=`${r.health} PV · défense ${r.defense} · esquive ${r.evade}. À la fin du tour : ${r.damage} dégât(s) et ${r.horror} horreur si actif dans ton lieu.`;}
 else $('#detail-rule').textContent=`Vie 8 · Santé mentale 7 · Enquête 3 · Combat 3 · Esquive 3.`;
 updateDetail();$('#card-dialog').showModal();
}
function updateDetail(){const {key,instance}=detail,[kind,id]=key.split('.');let reason='';if(kind==='card'&&instance){reason=run.reason('play',{card:instance,target:$('#card-target').value});$('#detail-play').disabled=Boolean(reason);}if(kind==='location'&&id!==run.location){reason=run.reason('move',{to:id});$('#detail-move').disabled=Boolean(reason);}$('#detail-reason').textContent=reason??'';}
$('#card-target').onchange=updateDetail;$('#detail-play').onclick=()=>{const payload={card:detail.instance,target:$('#card-target').value};$('#card-dialog').close();perform('play',payload);};$('#detail-move').onclick=()=>{const to=detail.key.split('.')[1];$('#card-dialog').close();perform('move',{to});};
$('#investigator-art').onclick=()=>showDetail('investigator');$('#end-turn').onclick=()=>perform('end');for(const button of document.querySelectorAll('[data-action]'))button.onclick=()=>perform(button.dataset.action);
$('#seal-ending').onclick=()=>perform('resolve',{choice:'seal'});$('#save-ending').onclick=()=>perform('resolve',{choice:'save'});
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>$('#'+button.dataset.close).close();
$('#rules-button').onclick=()=>$('#rules-dialog').showModal();
$('#navigation-button').onclick=()=>$('#navigation-dialog').showModal();
$('#journal-button').onclick=$('#objective-button').onclick=()=>$('#journal-dialog').showModal();
$('#resolution-button').onclick=()=>$('#resolution-dialog').showModal();
function confirm(title,callback){$('#confirm-title').textContent=title;confirmAction=callback;$('#confirm-dialog').showModal();}
$('#confirm-yes').onclick=()=>{$('#confirm-dialog').close();confirmAction?.();confirmAction=null;};
function begin(record){dismissToast();for(const id of ['navigation-dialog','journal-dialog','scene-dialog','resolution-dialog'])$('#'+id).close();run=new InvestigationRun(record);notice('Trois actions pour commencer. Les règles sont disponibles en haut du plateau.');save();render();}
$('#restart-story').onclick=$('#replay-story').onclick=()=>confirm('Recommencer cette enquête ?',()=>begin(run.record));
function openPile(discard=false){
 $('#pile-label').textContent=discard?'VOTRE DÉFAUSSE':'VOTRE DECK · 12 CARTES';$('#pile-title').textContent=discard?'Les cartes déjà jouées':'Vos moyens de tenir';
 $('#deck-summary').textContent=`${run.deck.length} à piocher · ${run.hand.length} en main · ${run.discard.length} défaussées · ${run.equipment.length} équipée(s).`;
 const entries=discard?run.discard.map(instance=>run.record.story.cards.find(c=>c.id===instance.slice(0,-2))):run.record.story.cards;
 $('#deck-list').replaceChildren(...entries.map(c=>{const e=node('button','pile-entry');e.append(art('card.'+c.id),node('strong','',c.name+(discard?'':' ×2')),node('span','',cardRules[c.id].text));e.onclick=()=>showDetail('card.'+c.id);return e;}));if(!entries.length)$('#deck-list').append(node('p','micro','La défausse est vide.'));
 $('#deck-dialog').showModal();
}
$('#deck-button').onclick=()=>openPile();$('#discard-pile').onclick=()=>openPile(true);$('#draw-pile').onclick=()=>perform('draw');$('#open-scene').onclick=()=>$('#scene-dialog').showModal();

async function refreshStatus(){try{status=await request('/api/status');for(const selector of ['#model','#art-model','#batch-model'])updateModelPicker($(selector),status);$('#connection-status').textContent=status.configured?'Ollama est configuré.':'Configure une clé pour écrire et dessiner avec Ollama.';}catch{status=null;$('#connection-status').textContent='Serveur inaccessible. L’enquête de démonstration reste jouable.';}$('#generate-story').disabled=working||!status?.configured||status.busy;$('#generate-art').disabled=working||!status?.configured||status.busy;updateBatchEstimate();}
async function loadStories(){try{const list=await request('/api/investigations');$('#stories-list').replaceChildren(...list.map(r=>{const div=node('div'),copy=node('div'),button=node('button','quiet','Jouer');copy.append(node('strong','',r.title),node('small','',`${r.id==='sample'?'Enquête de démonstration':'Enquête Ollama'} · ${r.illustrations} illustration(s)`));button.onclick=()=>{confirm('Commencer « '+r.title+' » ?',async()=>{try{const record=validateInvestigation(await request('/api/investigations/'+r.id));$('#stories-dialog').close();begin(record);}catch(e){notice(e.message);}});};div.append(copy,button);return div;}));}catch(e){$('#stories-list').replaceChildren(node('p','micro',e.message),actionSample());}}
function actionSample(){const b=node('button','quiet','Jouer la démonstration');b.onclick=()=>confirm('Commencer la démonstration ?',()=>{$('#stories-dialog').close();begin(sampleInvestigation());});return b;}
$('#choose-story').onclick=()=>{$('#stories-dialog').showModal();loadStories();refreshStatus();};
$('#story-form').onsubmit=async event=>{event.preventDefault();if(working||$('#generate-story').disabled)return;working=true;refreshStatus();$('#story-generation-message').textContent='Ollama écrit l’enquête… Les règles et les identifiants seront vérifiés.';try{const record=await request('/api/investigations/generate',{method:'POST',body:{model:$('#model').value,inspiration:$('#story-prompt').value.trim()},timeoutMs:320000});$('#story-generation-message').textContent='« '+record.story.title+' » est sauvegardée. Clique sur Jouer dans la liste pour commencer.';await loadStories();}catch(e){$('#story-generation-message').textContent=e.message;}finally{working=false;await refreshStatus();}};
$('#detail-illustrate').onclick=async()=>{artKey=detail.key;$('#card-dialog').close();$('#art-title').textContent=$('#detail-title').textContent;$('#art-prompt').value=artBrief(run.record.story,artKey);const staged=!artKey.startsWith('card.');$('#art-size').disabled=staged;$('#art-size').replaceChildren(...(staged?[new Option(artKey.startsWith('location.')?'Panorama · 256 × 144 · 32 couleurs':'Personnage · 64 × 96 · 16 couleurs','staged')]:[new Option('32 × 32','32'),new Option('48 × 48','48'),new Option('64 × 64','64')]));if(!staged)$('#art-size').value='64';$('#art-generation-help').textContent=staged?'Trois étapes : composition, volumes, détails. Trois appels Ollama, avec au maximum un nouvel essai par étape si le format est invalide. La progression est conservée sur le serveur.':'Un appel utilise ton quota ; le dessin est aussi conservé dans le carnet.';$('#art-message').textContent='';$('#art-dialog').showModal();$('#existing-art').replaceChildren(new Option('Choisir un sprite…',''));$('#assign-art').disabled=true;try{const records=await request('/api/designer/sprites');for(const r of records.filter(r=>r.review.status!=='rejected').sort((a,b)=>Number(b.review.status==='approved')-Number(a.review.status==='approved'))){$('#existing-art').add(new Option(`${r.sprite.name} · ${r.review.status==='approved'?'validé':'à revoir'}`,r.id));}}catch(e){$('#art-message').textContent=e.message;}await refreshStatus();};
$('#existing-art').onchange=()=>$('#assign-art').disabled=working||!$('#existing-art').value;
async function assign(id,key,spriteId){const record=await request('/api/investigations/art',{method:'POST',body:{id,key,spriteId}});if(run.record.id===id){run.record.art=record.art;save();render();}return record;}
$('#assign-art').onclick=async()=>{if(working||!$('#existing-art').value)return;working=true;$('#assign-art').disabled=true;try{await assign(run.record.id,artKey,$('#existing-art').value);$('#art-message').textContent='Illustration enregistrée sur la carte et sur le serveur.';}catch(e){$('#art-message').textContent=e.message;}finally{working=false;$('#assign-art').disabled=!$('#existing-art').value;await refreshStatus();}};
const batchStorageKey='nocturne:illustration-batch';
let batchJob=null,batchWatching=false;
function updateBatchEstimate(){
 const keys=illustrationKeys.filter(k=>$('#batch-mode').value==='all'||!run.record.art[k]),calls=keys.reduce((n,k)=>n+(k.startsWith('card.')?1:3),0);
 $('#batch-estimate').textContent=keys.length?`${keys.length} illustrations à générer · ${calls} appels Ollama prévus, hors corrections éventuelles. Cela peut prendre plusieurs dizaines de minutes et utilise ton quota. Les anciens dessins restent dans le carnet.`:'Toutes les illustrations sont déjà présentes.';
 $('#batch-resume').disabled=working||batchWatching||Boolean(status?.busy);$('#batch-start').disabled=!keys.length||working||batchWatching||!status?.configured||status.busy;$('#batch-mode').disabled=batchWatching;$('#batch-model').disabled=batchWatching;
}
function paintBatch(job){
 batchJob=job;$('#batch-form').hidden=job.investigationId!==run.record.id;const done=job.items.filter(i=>['success','skipped'].includes(i.status)).length,failed=job.items.filter(i=>i.status==='error').length,current=job.items.find(i=>i.status==='running');
 const state=job.status==='success'?'Terminée':job.status==='running'?(job.stopRequested?'Arrêt après ce dessin':current?.name??'Préparation'):job.status==='stopped'?'Arrêtée':job.status==='interrupted'?'Interrompue':'À reprendre';
 const text=`${job.title} · ${done} / ${job.items.length} illustrations prêtes · ${state}${job.stage?' · '+job.stage:''}${failed?' · '+failed+' échec(s)':''}`;
 $('#batch-title').textContent=job.title;$('#batch-banner').hidden=false;$('#batch-banner-copy').textContent=text;$('#batch-progress-area').hidden=false;$('#batch-progress-copy').textContent=text;$('#batch-progress').max=job.items.length;$('#batch-progress').value=done;
 const labels={pending:'En attente',running:'En cours',success:'Créée',skipped:'Conservée',error:'Échec'};
 $('#batch-items').replaceChildren(...job.items.map(i=>{const row=node('li','batch-item '+i.status);row.append(node('strong','',i.name),node('span','',labels[i.status]));if(i.error)row.append(node('small','',i.error));return row;}));
 $('#batch-stop').hidden=job.status!=='running';$('#batch-stop').disabled=job.stopRequested;$('#batch-resume').hidden=['running','success'].includes(job.status);$('#batch-resume').disabled=working||status?.busy;$('#batch-message').textContent=job.message??'';
}
async function followBatch(id){
 if(batchWatching)return;batchWatching=true;working=true;updateBatchEstimate();let lastDone=-1;
 try{for(;;){const job=await request('/api/investigations/illustration-batches/'+encodeURIComponent(id));paintBatch(job);const done=job.items.filter(i=>i.status==='success').length;
  if(job.investigationId===run.record.id&&done!==lastDone){const latest=validateInvestigation(await request('/api/investigations/'+encodeURIComponent(job.investigationId)));run.record.art=latest.art;save();render();lastDone=done;}
  if(job.status!=='running')break;await new Promise(resolve=>setTimeout(resolve,2000));
 }}catch(e){$('#batch-message').textContent=e.message+' Le suivi reprendra en rouvrant cette fenêtre.';}
 finally{working=false;batchWatching=false;await refreshStatus();if(batchJob)$('#batch-resume').disabled=Boolean(status?.busy);}
}
$('#batch-mode').onchange=updateBatchEstimate;
$('#illustrate-adventure').onclick=async()=>{
 $('#batch-dialog').showModal();$('#batch-form').hidden=false;$('#batch-title').textContent=run.record.story.title;await refreshStatus();
 if(batchJob?.status==='running'||status?.illustrationBatchId){const id=status?.illustrationBatchId??batchJob.id;void followBatch(id);}
 else if(batchJob?.investigationId===run.record.id)paintBatch(batchJob);
 else {$('#batch-progress-area').hidden=true;$('#batch-message').textContent='';}
 updateBatchEstimate();
};
$('#batch-show-progress').onclick=()=>{$('#batch-dialog').showModal();if(batchJob){paintBatch(batchJob);if(!batchWatching)void followBatch(batchJob.id);}};
$('#batch-form').onsubmit=async event=>{event.preventDefault();if($('#batch-start').disabled)return;working=true;updateBatchEstimate();$('#batch-message').textContent='Préparation de la file…';
 try{const job=await request('/api/investigations/illustrate-all',{method:'POST',body:{id:run.record.id,model:$('#batch-model').value,mode:$('#batch-mode').value}});try{localStorage.setItem(batchStorageKey,job.id);}catch{}await followBatch(job.id);}catch(e){$('#batch-message').textContent=e.message;working=false;await refreshStatus();}
};
$('#batch-stop').onclick=async()=>{if(!batchJob)return;$('#batch-stop').disabled=true;try{paintBatch(await request('/api/investigations/illustration-batches/stop',{method:'POST',body:{id:batchJob.id}}));}catch(e){$('#batch-message').textContent=e.message;$('#batch-stop').disabled=false;}};
$('#batch-resume').onclick=async()=>{if(!batchJob||working||status?.busy)return;working=true;$('#batch-resume').disabled=true;try{const job=await request('/api/investigations/illustration-batches/resume',{method:'POST',body:{id:batchJob.id}});await followBatch(job.id);}catch(e){$('#batch-message').textContent=e.message;working=false;await refreshStatus();$('#batch-resume').disabled=false;}};
const illustrationJobKey='nocturne:illustration-job';
async function followIllustration(id){
 working=true;await refreshStatus();
 try{
  for(;;){const job=await request('/api/investigations/illustrations/'+encodeURIComponent(id));const message=job.stage+(job.status==='running'?'…':'');$('#art-message').textContent=message;notice('Illustration · '+message);
   if(job.status==='error'){try{localStorage.removeItem(illustrationJobKey);}catch{}throw Error(job.error);}
   if(job.status==='success'){
    if(run.record.id===job.investigationId){const latest=validateInvestigation(await request('/api/investigations/'+run.record.id));run.record.art=latest.art;save();render();}
    try{localStorage.removeItem(illustrationJobKey);}catch{}$('#art-message').textContent='Illustration enregistrée dans la scène et dans le carnet.';notice('Nouvelle illustration prête · '+job.width+' × '+job.height);break;
   }
   await new Promise(resolve=>setTimeout(resolve,2000));
  }
 }catch(e){$('#art-message').textContent=e.message;notice(e.message);}
 finally{working=false;$('#assign-art').disabled=!$('#existing-art').value;await refreshStatus();}
}
$('#art-form').onsubmit=async event=>{
 event.preventDefault();if(working||$('#generate-art').disabled)return;const id=run.record.id,key=artKey;working=true;$('#assign-art').disabled=true;refreshStatus();$('#art-message').textContent='Préparation du dessin…';
 try{
  if(!key.startsWith('card.')){
   const job=await request('/api/investigations/illustrate',{method:'POST',body:{id,key,model:$('#art-model').value,prompt:$('#art-prompt').value.trim()}});
   try{localStorage.setItem(illustrationJobKey,job.id);}catch{}await followIllustration(job.id);
  }else{
   const result=await request('/api/designer/generate',{method:'POST',body:{model:$('#art-model').value,prompt:$('#art-prompt').value.trim(),size:Number($('#art-size').value),method:'tools',assetType:'art',allowReuse:false,useFeedback:true},timeoutMs:320000});await assign(id,key,result.record.id);$('#art-message').textContent='Illustration créée et ajoutée au carnet.'+(result.diagnostics?.clipping?` ${result.diagnostics.clipping.count} forme(s) rognée(s) aux bords ; détails dans le journal de l’atelier.`:'')+(result.diagnostics?.paletteReduction?` Palette harmonisée à ${result.diagnostics.paletteReduction.to} couleurs.`:'');
  }
 }catch(e){$('#art-message').textContent=e.message;}
 finally{working=false;$('#assign-art').disabled=!$('#existing-art').value;await refreshStatus();}
};
$('#fullscreen-story').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#investigation-surface').requestFullscreen();}catch{notice('Le plein écran n’est pas disponible dans ce navigateur.');}};
document.addEventListener('fullscreenchange',()=>$('#fullscreen-story').textContent=document.fullscreenElement?'Quitter le plein écran':'Plein écran');
try{const raw=localStorage.getItem(saveKey);if(raw){if(raw.length>8000000)throw Error('Sauvegarde trop volumineuse');run=InvestigationRun.restore(JSON.parse(raw));loadedSave=true;}}catch{notice('La sauvegarde locale est illisible. Une nouvelle enquête est prête.');}
if(!run){try{run=new InvestigationRun(await request('/api/investigations/sample'));}catch{run=new InvestigationRun(sampleInvestigation());}}
if(loadedSave){try{const latest=await request('/api/investigations/'+encodeURIComponent(run.record.id));run.record.art=validateInvestigation(latest).art;}catch{}}
render();if(loadedSave)$('#save-state').textContent='Partie reprise depuis ce navigateur.';else save();
await refreshStatus();bindModelRefresh(refreshStatus);setInterval(()=>{if(!document.hidden&&!working)refreshStatus();},15000);

try{const single=localStorage.getItem(illustrationJobKey),batchId=status?.illustrationBatchId??localStorage.getItem(batchStorageKey);if(status?.illustrationBatchId)void followBatch(status.illustrationBatchId);else if(single)void followIllustration(single);else if(batchId)void followBatch(batchId);}catch{}
