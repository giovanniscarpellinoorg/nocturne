import {updateModelPicker,bindModelRefresh} from './model-picker.mjs';
import {request} from './cloud-ui.mjs';
import {paintSprite} from './pixels.mjs';
import {assetTypes} from './assets.mjs';
import {blankScene,validateScene,placementBox,sceneSpawn,sceneExit} from './scene.mjs';
const $=s=>document.querySelector(s),canvas=$('#room-canvas'),ctx=canvas.getContext('2d');
let records=[],images=new Map(),plan=blankScene(),roomId=null,selected=null,brush=null,mode='place',undo=[],busy=false,dirty=true,valid=false,connection=null,drag=null,frozen=new Map();
const byId=id=>frozen.get(id)??records.find(r=>r.id===id);
function useSnapshot(assets){frozen=new Map(assets.map(a=>[a.id,a]));for(const a of assets){const image=document.createElement('canvas');paintSprite(image,a.sprite);images.set(a.id,image);}$('#room-hero').replaceChildren(new Option('Porte-lanterne de base',''),...[...new Map([...records,...assets].map(a=>[a.id,a])).values()].filter(a=>a.gameplay.type==='character').map(a=>new Option(a.sprite.name,a.id)));}
function notice(text,error=false){$('#room-message').textContent=text;$('#room-message').classList.toggle('error',error);}
function capture(){undo.push(structuredClone(plan));if(undo.length>30)undo.shift();dirty=true;}
function setMode(value){mode=value;$('#mode-place').setAttribute('aria-pressed',String(mode==='place'));$('#mode-move').setAttribute('aria-pressed',String(mode==='move'));}
function sync(){
  $('#refresh-room-animations').disabled=busy||!roomId||dirty;
  if(document.activeElement!==$('#room-title'))$('#room-title').value=plan.title;$('#room-theme').value=plan.theme;$('#room-hero').value=plan.heroId??'';
  $('#placement-selection').replaceChildren(new Option('Aucun',''),...plan.placements.map((p,i)=>new Option(`${i+1}. ${byId(p.assetId)?.sprite.name??'Sprite absent'}`,p.id)));
  if(plan.placements.some(p=>p.id===selected))$('#placement-selection').value=selected;else selected=null;
  const p=plan.placements.find(p=>p.id===selected);$('#placement-x').value=p?.x??'';$('#placement-y').value=p?.y??'';
  for(const field of ['#placement-x','#placement-y','#delete-placement'])$(field).disabled=busy||!p;
  try{validateScene(plan,[...records,...frozen.values()]);valid=true;$('#room-validation').textContent=`Salle valide · ${plan.placements.length} éléments · passages accessibles.`;$('#room-validation').classList.remove('error');}catch(e){valid=false;$('#room-validation').textContent=e.message;$('#room-validation').classList.add('error');}
  $('#save-room').disabled=busy||!valid;$('#play-room').disabled=busy||!valid||dirty||!roomId;$('#undo-room').disabled=busy||!undo.length;
  $('#compose-room').disabled=busy||!connection?.configured||connection.busy;
  for(const input of document.querySelectorAll('.workshop-controls input,.workshop-controls select,.workshop-controls textarea,.workshop-controls button,.room-toolbar button'))input.disabled=busy;
  for(const field of ['#placement-x','#placement-y'])$(field).disabled=busy||!p;$('#placement-selection').disabled=busy;
  $('#compose-room').disabled=busy||!connection?.configured||connection.busy;$('#undo-room').disabled=busy||!undo.length;$('#delete-placement').disabled=busy||!p;
  draw();
}
function draw(){
  ctx.fillStyle={moss:'#293b2e',ember:'#45302a',violet:'#363046'}[plan.theme];ctx.fillRect(0,0,960,600);
  ctx.fillStyle='#101815';ctx.fillRect(0,0,960,48);ctx.fillRect(0,552,960,48);ctx.fillRect(0,0,48,600);ctx.fillRect(912,0,48,600);
  ctx.strokeStyle='#ffffff12';ctx.lineWidth=1;for(let x=80;x<=880;x+=40){ctx.beginPath();ctx.moveTo(x,48);ctx.lineTo(x,552);ctx.stroke();}for(let y=80;y<=520;y+=40){ctx.beginPath();ctx.moveTo(48,y);ctx.lineTo(912,y);ctx.stroke();}
  for(const [point,label,color]of[[sceneSpawn,'DÉPART','#9fc8b5'],[sceneExit,'SORTIE','#dfb77b']]){ctx.fillStyle=color;ctx.fillRect(point.x-20,point.y-20,40,40);ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText(label,point.x,point.y+40);}
  const hero=images.get(plan.heroId);if(hero){ctx.imageSmoothingEnabled=false;ctx.drawImage(hero,sceneSpawn.x-24,sceneSpawn.y-24,48,48);}
  for(const p of plan.placements){const a=byId(p.assetId);if(!a)continue;const box=placementBox(a,p),image=images.get(a.id);ctx.imageSmoothingEnabled=false;ctx.drawImage(image,box.x,box.y,box.w,box.h);if(p.id===selected){ctx.strokeStyle='#efc579';ctx.lineWidth=3;ctx.strokeRect(box.x-3,box.y-3,box.w+6,box.h+6);}if(a.gameplay.type==='enemy'||a.gameplay.type==='boss'){ctx.fillStyle='#ed8e82';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(a.gameplay.type==='boss'?'BOSS':a.gameplay.stats.behavior, p.x,box.y-8);}}
}
function palette(){
  $('#room-palette').replaceChildren(...records.filter(r=>!['art','character'].includes(r.gameplay.type)&&!(r.gameplay.type==='decor'&&r.gameplay.stats.kind==='door')&&($('#palette-type').value==='all'||r.gameplay.type===$('#palette-type').value)).map(r=>{
    const button=document.createElement('button'),image=document.createElement('canvas'),label=document.createElement('span'),detail=document.createElement('small');button.type='button';paintSprite(image,r.sprite,2);label.textContent=r.sprite.name;detail.textContent=`${assetTypes[r.gameplay.type].label} · ${r.review?.rating?'★'.repeat(r.review.rating):'Non noté'}${r.review?.status==='rejected'?' · Écarté':''}`;button.append(image,label,detail);button.setAttribute('aria-pressed',String(brush===r.id));button.onclick=()=>{if(busy)return;brush=r.id;setMode('place');$('#palette-hint').textContent=`${r.sprite.name} sélectionné : clique dans la grille pour le placer.`;palette();};return button;
  }));
}
function point(event){const rect=canvas.getBoundingClientRect();return {x:Math.max(80,Math.min(880,Math.round((event.clientX-rect.left)/rect.width*960/40)*40)),y:Math.max(80,Math.min(520,Math.round((event.clientY-rect.top)/rect.height*600/40)*40))};}
function hit(p){return [...plan.placements].reverse().find(entry=>{const a=byId(entry.assetId);if(!a)return false;const b=placementBox(a,entry);return p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h;});}
canvas.addEventListener('pointerdown',event=>{if(busy)return;const p=point(event);canvas.focus();
  if(mode==='place'){if(!brush){notice('Choisis un sprite dans le carnet à gauche.');return;}if(plan.placements.length>=40){notice('Maximum 40 éléments.',true);return;}capture();selected=crypto.randomUUID();plan.placements.push({id:selected,assetId:brush,...p});sync();}
  else{const placed=hit(p);selected=placed?.id??null;if(placed){capture();drag=placed.id;canvas.setPointerCapture(event.pointerId);}sync();}
});
canvas.addEventListener('pointermove',event=>{if(!drag||busy)return;Object.assign(plan.placements.find(p=>p.id===drag),point(event));sync();});
canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
$('#mode-place').onclick=()=>setMode('place');$('#mode-move').onclick=()=>setMode('move');
$('#delete-placement').onclick=()=>{if(!selected||busy)return;capture();plan.placements=plan.placements.filter(p=>p.id!==selected);selected=null;sync();};
$('#undo-room').onclick=()=>{if(!undo.length||busy)return;plan=undo.pop();dirty=true;selected=null;sync();};
$('#placement-selection').onchange=()=>{selected=$('#placement-selection').value;setMode('move');sync();};
for(const key of ['x','y'])$('#placement-'+key).onchange=()=>{const p=plan.placements.find(p=>p.id===selected);if(p){capture();p[key]=Number($('#placement-'+key).value);sync();}};
for(const [selector,key]of[['#room-title','title'],['#room-theme','theme'],['#room-hero','heroId']])$(selector).addEventListener('change',()=>{capture();plan[key]=$(selector).value||null;sync();});
$('#palette-type').onchange=palette;
$('#new-room').onclick=()=>{if(busy)return;if(dirty&&plan.placements.length){notice('Enregistre la salle avant d’en créer une nouvelle.',true);return;}useSnapshot([]);for(const r of records){const c=document.createElement('canvas');paintSprite(c,r.sprite);images.set(r.id,c);}plan=blankScene();roomId=null;undo=[];dirty=true;selected=null;sync();notice('Nouvelle salle.');};
$('#starter-room').onclick=()=>{
  capture();const available=records.filter(r=>r.review?.status!=='rejected'),first=type=>available.find(r=>r.gameplay.type===type);
  plan={...blankScene(),title:plan.title,theme:plan.theme,heroId:first('character')?.id??null};
  const add=(a,x,y)=>{if(a)plan.placements.push({id:crypto.randomUUID(),assetId:a.id,x,y});};
  const enemy=first('enemy');if(enemy){add(enemy,600,200);add(enemy,680,440);}else add(first('boss'),680,200);
  add(first('wall'),400,160);add(first('wall'),400,440);add(first('item'),760,320);add(available.find(r=>r.gameplay.type==='decor'&&r.gameplay.stats.kind!=='door'),280,120);
  sync();notice(enemy?'Base placée : ajuste les positions à ta guise.':'Base placée avec les sprites disponibles. Crée un sprite Ennemi dans le Designer pour ajouter des adversaires.');
};
async function savedRooms(){const rooms=await request('/api/rooms');$('#saved-rooms').replaceChildren(...rooms.map(r=>{const button=document.createElement('button'),label=document.createElement('span'),detail=document.createElement('small');label.textContent=r.title;detail.textContent=`${r.count} éléments`;button.append(label,detail);button.onclick=async()=>{if(busy)return;if(dirty&&plan.placements.length){notice('Enregistre tes modifications avant de charger une autre salle.',true);return;}try{const saved=await request('/api/rooms/'+r.id);useSnapshot(saved.assets);plan=saved.plan;roomId=saved.id;undo=[];dirty=false;selected=null;sync();notice('Salle chargée. Jouer reprend les sprites de sa sauvegarde.');}catch(e){notice(e.message,true);}};return button;}));}
$('#save-room').onclick=async()=>{if(busy||!valid)return;busy=true;sync();try{const saved=await request('/api/rooms/save',{method:'POST',body:{...(roomId?{id:roomId}:{}),plan}});roomId=saved.id;useSnapshot(saved.assets);dirty=false;notice('Salle enregistrée. Tu peux la jouer.');await savedRooms();}catch(e){notice(e.message,true);}finally{busy=false;sync();}};
$('#refresh-room-animations').onclick=async()=>{if(busy||!roomId||dirty)return;busy=true;sync();try{const saved=await request('/api/rooms/save',{method:'POST',body:{id:roomId,plan,refreshAnimations:true}});useSnapshot(saved.assets);notice('Animations du carnet appliquées à cette salle.');await savedRooms();}catch(e){notice(e.message,true);}finally{busy=false;sync();}};
$('#play-room').onclick=()=>{if(!$('#play-room').disabled)location.href='/?room='+encodeURIComponent(roomId);};
$('#compose-room').onclick=async()=>{if($('#compose-room').disabled)return;busy=true;sync();$('#compose-status').textContent='Ollama compose la salle…';try{const generated=await request('/api/rooms/generate',{method:'POST',body:{model:$('#room-model').value,inspiration:$('#room-inspiration').value.trim()}});capture();plan=generated.plan;selected=null;$('#compose-status').textContent='Plan reçu et vérifié. Tu peux le modifier avant de l’enregistrer.';}catch(e){$('#compose-status').textContent=e.message;}finally{busy=false;try{connection=await request('/api/status');updateModelPicker($('#room-model'),connection);}catch{}sync();}};
try{
  [records,connection]=await Promise.all([request('/api/designer/sprites'),request('/api/status')]);
  updateModelPicker($('#room-model'),connection);
  for(const r of records){const image=document.createElement('canvas');paintSprite(image,r.sprite);images.set(r.id,image);}
  for(const [type,def]of Object.entries(assetTypes))if(!['art','character'].includes(type))$('#palette-type').add(new Option(def.label,type));
  for(const r of records.filter(r=>r.gameplay.type==='character'))$('#room-hero').add(new Option(r.sprite.name,r.id));
  palette();await savedRooms();if(!connection.configured)$('#compose-status').textContent='Configure la connexion Ollama dans le Designer pour demander un plan.';sync();
}catch(e){notice(e.message,true);}
const poll=setInterval(async()=>{if(!busy&&!document.hidden){try{connection=await request('/api/status');updateModelPicker($('#room-model'),connection);$('#compose-room').disabled=!connection.configured||connection.busy;}catch{}}},15000);
window.addEventListener('pagehide',()=>clearInterval(poll));

bindModelRefresh(async()=>{connection=await request('/api/status');updateModelPicker($('#room-model'),connection);sync();});
