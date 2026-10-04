import {fieldSize,homeSites,residentSite,fieldExit,encounterSite,fieldNodes,fieldObstacles,newFieldPlayer,stepField,movementVector,nearestSite,nearSite,stepWisp} from './refuge-field.mjs';
import {paintSprite} from './pixels.mjs';
import {gameAnimationFrame} from './game-animations.mjs';
import {fallbackArt} from './refuge-view.mjs';

export function createRefugeControls({canvas,onInteract,onNotice,isBusy,isPaused}){
 const ctx=canvas.getContext('2d'),keys=new Set(),touch=new Map(),cache=new Map(),resourceNames={wood:'bois',food:'vivres',herbs:'herbes',embers:'braises'};
 canvas.width=fieldSize.width;canvas.height=fieldSize.height;canvas.tabIndex=0;
 let world=null,player=newFieldPlayer(),companion={x:450,y:490},scene=null,sites=[],obstacles=[],wisps=[],time=0,last=0,work=0,workId=null,pressed=false,dodge=false,lantern=false,pin=null,floating=[],lastPrompt='',saving=0;
 let initialPosition;try{initialPosition=JSON.parse(localStorage.getItem('nocturne:refuge-position'));}catch{}
 const $=id=>document.getElementById(id);
 const ready=()=>Boolean(world)&&!document.hidden&&!isPaused()&&!document.querySelector('dialog[open]');
 function clearInput(){keys.clear();touch.clear();pressed=false;dodge=false;lantern=false;work=0;workId=null;}
 function savePosition(){if(!scene)return;try{localStorage.setItem('nocturne:refuge-position',JSON.stringify({scene,x:player.x,y:player.y}));}catch{}}
 function getSites(){
  if(!world)return [];
  if(!world.trip)return [...homeSites,...world.residents.slice(0,10).map((r,i)=>({...residentSite(r.id,i),label:'Parler à '+r.name}))];
  return [fieldExit,...(world.trip.event?[{...encounterSite,label:world.trip.choice!==null?'Relire la rencontre':world.trip.discovered?'Reprendre la rencontre':'Examiner la découverte'}]:[]),...fieldNodes(world.trip).filter(n=>!world.trip.collected.includes(n.id)).map(n=>({...n,label:`Récolter ${n.amount} ${resourceNames[n.resource]}`}))];
 }
 function setWorld(value){
  const newScene=value.trip?`trip:${value.trip.fieldId??value.trip.event?.id??value.trip.location}`:'home';
  if(scene!==newScene){savePosition();scene=newScene;player=newFieldPlayer();if(value.trip){player.x=120;player.y=455;}if(initialPosition?.scene===scene&&Number.isFinite(initialPosition.x)&&Number.isFinite(initialPosition.y)&&initialPosition.x>=42&&initialPosition.x<=958&&initialPosition.y>=200&&initialPosition.y<=555){player.x=initialPosition.x;player.y=initialPosition.y;}initialPosition=null;companion={x:player.x-30,y:player.y+12};clearInput();pin=null;floating=[];wisps=value.trip?[{x:500,y:285,homeX:500,homeY:285,phase:0,flee:0},{x:755,y:445,homeX:755,homeY:445,phase:3,flee:0}]:[];}
  world=value;sites=getSites();obstacles=fieldObstacles(world.trip);cache.clear();
  $('field-cargo').hidden=!world.trip;
  $('field-cargo').textContent=world.trip?('Sac · '+(Object.entries(world.trip.cargo??{}).map(([k,v])=>`${v} ${resourceNames[k]}`).join(' · ')||'vide')+' · ramener à la sortie'):'';
  $('field-objective').textContent=world.trip?(world.trip.event&&world.trip.choice===null?'Trouve la lueur dorée, récolte et reviens au panneau.':'Récolte ce qui reste, puis rejoins le panneau du refuge.'):'Rejoins un habitant, un bâtiment ou le panneau des chemins, puis E.';
 }
 function image(key){
  let entry=cache.get(key);if(entry)return entry;
  const asset=world.art[key],base=document.createElement('canvas');if(asset)paintSprite(base,asset.sprite);else fallbackArt(base,key==='player'?'resident.keeper':key,world.buildings[key.split('.')[1]]??1);
  entry={base,animation:asset?.animation,frames:asset?.animation?.frames.map(f=>{const c=document.createElement('canvas');paintSprite(c,f.sprite);return c;})};cache.set(key,entry);return entry;
 }
 function drawSprite(key,x,y,w,h,bob=0){const entry=image(key),frame=entry.animation&&!matchMedia('(prefers-reduced-motion: reduce)').matches?entry.frames[gameAnimationFrame(entry.animation,time)]:entry.base;ctx.imageSmoothingEnabled=false;ctx.drawImage(frame,x-w/2,y-h+bob,w,h);}
 function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
 function label(text,x,y,color='#e9dcba',size=11){ctx.font=`${size}px system-ui`;ctx.textAlign='center';const w=ctx.measureText(text).width;ctx.fillStyle='#102522dd';ctx.fillRect(x-w/2-5,y-12,w+10,17);ctx.fillStyle=color;ctx.fillText(text,x,y);}
 function beacon(site){ellipse(site.x,site.y+4,23,9,'#e7c37c24');ctx.strokeStyle='#e6c17c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(site.x,site.y-16,7,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#f1d89a';ctx.font='bold 13px Georgia';ctx.textAlign='center';ctx.fillText('?',site.x,site.y-12);}
 function drawNode(n){
  ellipse(n.x,n.y+3,23,9,'#091b2166');ctx.lineWidth=3;
  if(n.resource==='wood'){ctx.strokeStyle='#786449';for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(n.x-16+i*8,n.y);ctx.lineTo(n.x+7+i*8,n.y-19);ctx.stroke();}}
  else if(n.resource==='herbs'||n.resource==='food'){for(let i=0;i<4;i++){ctx.strokeStyle='#a9b776';ctx.beginPath();ctx.moveTo(n.x-12+i*7,n.y);ctx.lineTo(n.x-15+i*8,n.y-18-(i%2)*7);ctx.stroke();ellipse(n.x-15+i*8,n.y-19-(i%2)*7,5,3,n.resource==='food'?'#e6b969':'#9aac78');}}
  else{for(let i=0;i<3;i++){ellipse(n.x-13+i*12,n.y-8-(i%2)*5,9,7,'#817262');ellipse(n.x-13+i*12,n.y-9-(i%2)*5,3,2,'#efb873');}}
  ctx.fillStyle='#ecd297';ctx.fillRect(n.x-2,n.y-35,4,4);
 }
 function draw(){
  ctx.clearRect(0,0,1000,600);if(!world)return;
  const nearest=nearestSite(player,sites),entities=[];
  // Ground rings always remain below feet and structures.
  if(nearest){ellipse(nearest.x,nearest.y+3,nearest.kind==='building'?33:24,10,'#e7cf8d25');ctx.strokeStyle='#dfc282aa';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(nearest.x,nearest.y+3,nearest.kind==='building'?33:24,10,0,0,Math.PI*2);ctx.stroke();}
  if(pin){ctx.strokeStyle='#e8cd8077';ctx.setLineDash([4,7]);ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(pin.x,pin.y);ctx.stroke();ctx.setLineDash([]);}
  if(world.trip){
   for(const r of obstacles)entities.push({y:r.y+r.h,draw:()=>{ellipse(r.x+r.w/2,r.y+r.h,r.w*.7,12,'#0a1c2266');ctx.fillStyle='#3d5250';ctx.beginPath();ctx.moveTo(r.x,r.y+r.h);ctx.lineTo(r.x+4,r.y+10);ctx.lineTo(r.x+r.w*.55,r.y-22);ctx.lineTo(r.x+r.w,r.y+18);ctx.lineTo(r.x+r.w,r.y+r.h);ctx.closePath();ctx.fill();ctx.fillStyle='#6f806b';ctx.fillRect(r.x+10,r.y+18,15,5);}});
   for(const n of fieldNodes(world.trip))entities.push({y:n.y,draw:()=>{if(world.trip.collected.includes(n.id))ellipse(n.x,n.y,8,3,'#bdc09333');else drawNode(n);}});
   if(world.trip.event)entities.push({y:encounterSite.y,draw:()=>{beacon(encounterSite);label(world.trip.choice!==null?'Rencontre résolue':'Une présence…',encounterSite.x,encounterSite.y+24);}});
   for(const w of wisps)entities.push({y:w.y,draw:()=>{const g=ctx.createRadialGradient(w.x,w.y-13,1,w.x,w.y-13,25);g.addColorStop(0,w.flee?'#9fc3b777':'#344452cc');g.addColorStop(1,'#19374000');ctx.fillStyle=g;ctx.fillRect(w.x-30,w.y-43,60,60);ellipse(w.x,w.y-13,12,18,w.flee?'#47696699':'#24313be6');ctx.fillStyle='#dccca5';ctx.fillRect(w.x-5,w.y-18,2,3);ctx.fillRect(w.x+3,w.y-18,2,3);}});
   entities.push({y:companion.y,draw:()=>{drawSprite('resident.'+world.trip.resident,companion.x,companion.y,34,49);}});
  }else{
   for(const site of homeSites.filter(s=>s.kind==='building'))entities.push({y:site.rect.y+site.rect.h,draw:()=>{const h=site.id==='inn'?145:site.id==='garden'?80:site.id==='beacon'?125:115,w=site.id==='inn'?190:site.id==='garden'?140:site.id==='beacon'?95:150;ctx.globalAlpha=world.buildings[site.id]?1:.6;drawSprite('building.'+site.id,site.x,site.rect.y+site.rect.h+4,w,h);ctx.globalAlpha=1;label({inn:'Auberge',garden:'Jardin',workshop:'Atelier',beacon:'Fanal'}[site.id]+(world.buildings[site.id]?` · ${world.buildings[site.id]}`:' · chantier'),site.x,site.y+17,'#d7c7a4',10);}});
   for(const [i,r]of world.residents.slice(0,10).entries()){const s=residentSite(r.id,i);entities.push({y:s.y,draw:()=>{drawSprite('resident.'+r.id,s.x,s.y,32,46);label(r.name,s.x,s.y+15,'#c4d2b2',9);}});}
   const hearth=homeSites.find(s=>s.id==='hearth');entities.push({y:hearth.y,draw:()=>{ellipse(hearth.x,hearth.y,19,8,'#78684c');ellipse(hearth.x,hearth.y-14,9,18,'#e3a157');ellipse(hearth.x,hearth.y-12,5,13,'#f0d186');}});
  }
  const exit=world.trip?fieldExit:homeSites.find(s=>s.id==='trail');entities.push({y:exit.y,draw:()=>{ctx.fillStyle='#9a8660';ctx.fillRect(exit.x-2,exit.y-30,4,34);ctx.fillStyle='#5e6f56';ctx.fillRect(exit.x-25,exit.y-40,50,19);label(world.trip?'↙ Refuge':'↗ Chemins',exit.x,exit.y-25,'#ebd7a9',10);}});
  entities.push({y:player.y,draw:()=>{
   ellipse(player.x,player.y+2,15,6,'#07182188');ctx.save();if(player.hurt)ctx.globalAlpha=.5+Math.sin(time*25)*.2;
   const bob=player.moving&&!matchMedia('(prefers-reduced-motion: reduce)').matches?Math.sin(time*(player.sprinting?22:14))*2:0;
   if(player.dash){ctx.translate(player.x,player.y-23);ctx.rotate(player.dx<0?-.55:.55);ctx.translate(-player.x,-player.y+23);}drawSprite('player',player.x,player.y,37,55,bob);ctx.restore();
   const lx=player.x+14,ly=player.y-18;ellipse(lx,ly,4,5,'#f1d292');ctx.strokeStyle='#ecd99c';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(player.x,player.y+3,17,7,0,0,Math.PI*2);ctx.stroke();
   if(player.ward){const radius=145*(1-player.ward/.7);ctx.strokeStyle=`rgba(240,214,147,${player.ward/.7})`;ctx.lineWidth=3;ctx.beginPath();ctx.arc(player.x,player.y-12,radius,0,Math.PI*2);ctx.stroke();}
  }});
  entities.sort((a,b)=>a.y-b.y).forEach(e=>e.draw());
  if(work>0&&nearest?.kind==='supply'){ctx.fillStyle='#102720';ctx.fillRect(nearest.x-23,nearest.y-47,46,6);ctx.fillStyle='#e2c482';ctx.fillRect(nearest.x-23,nearest.y-47,46*Math.min(1,work/.75),6);}
  for(const f of floating){ctx.globalAlpha=Math.min(1,f.life);label(f.text,f.x,f.y-(1.6-f.life)*24,f.color);ctx.globalAlpha=1;}
 }
 function prompt(){
  const s=ready()?nearestSite(player,sites):null,text=s?`${s.kind==='supply'?'Maintenir E':'E'} · ${s.label}`:'ZQSD / flèches · se déplacer';
  if(text!==lastPrompt){$('field-prompt').textContent=text;lastPrompt=text;}
  $('field-stamina').value=player.stamina;$('field-stamina').setAttribute('aria-valuetext',Math.round(player.stamina)+' %');
 }
 async function interact(site){if(!site||isBusy())return;clearInput();pin=null;const ok=await onInteract(site,{x:player.x,y:player.y});if(ok&&site.kind==='supply')floating.push({x:site.x,y:site.y-32,life:1.6,text:`+${site.amount} ${resourceNames[site.resource]}`,color:'#e9d999'});canvas.focus({preventScroll:true});}
 function frame(now){
  const dt=Math.min(.05,(now-(last||now))/1000);last=now;time+=dt;
  if(ready()&&!isBusy()){
   const all=new Set([...keys,...touch.values()]),v=movementVector(all);player=stepField(player,{...v,sprint:all.has('shift'),dodge,lantern},dt,obstacles);dodge=false;lantern=false;
   if(world.trip){for(let i=0;i<wisps.length;i++){wisps[i]=stepWisp(wisps[i],player,dt,time);if(wisps[i].hit){player.hurt=1.3;player.stamina=Math.max(0,player.stamina-25);work=0;floating.push({x:player.x,y:player.y-55,life:1.6,text:'Surpris ! −25 endurance',color:'#deb0a0'});}}const d=Math.hypot(player.x-companion.x,player.y-companion.y);if(d>47){companion.x+=(player.x-companion.x)/d*95*dt;companion.y+=(player.y-companion.y)/d*95*dt;}}
   const target=nearestSite(player,sites),holding=all.has('e');
   if(target?.kind==='supply'&&holding&&!player.moving&&!player.hurt){if(workId!==target.id){workId=target.id;work=0;}work+=dt;if(work>=.75){work=0;void interact(target);}}
   else {work=0;workId=null;if(pressed&&target&&target.kind!=='supply')void interact(target);}
   pressed=false;if(pin&&nearSite(player,pin))pin=null;
   saving+=dt;if(saving>1){saving=0;savePosition();}
  }else{clearInput();}
  floating=floating.map(f=>({...f,life:f.life-dt})).filter(f=>f.life>0);prompt();draw();requestAnimationFrame(frame);
 }
 const gameKeys=new Set(['z','q','s','d','w','a','arrowup','arrowdown','arrowleft','arrowright','shift',' ','e','f']);
 window.addEventListener('keydown',event=>{const key=event.key.toLowerCase();if(!ready()||event.ctrlKey||event.metaKey||event.altKey||event.target.closest?.('input,textarea,select,[contenteditable="true"]')||!gameKeys.has(key))return;event.preventDefault();keys.add(key);if(!event.repeat){if(key==='e')pressed=true;if(key===' ')dodge=true;if(key==='f')lantern=true;}});
 window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));window.addEventListener('blur',()=>{clearInput();savePosition();});document.addEventListener('visibilitychange',()=>{clearInput();savePosition();});window.addEventListener('pagehide',savePosition);
 canvas.addEventListener('pointerdown',()=>canvas.focus({preventScroll:true}));
 for(const b of document.querySelectorAll('[data-field-key]')){
  b.addEventListener('pointerdown',e=>{if(!ready())return;e.preventDefault();b.setPointerCapture(e.pointerId);const key=b.dataset.fieldKey;touch.set(e.pointerId,key);if(key==='e')pressed=true;if(key===' ')dodge=true;if(key==='f')lantern=true;});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,e=>touch.delete(e.pointerId));
 }
 requestAnimationFrame(frame);
 return {setWorld,near:site=>nearSite(player,site),position:()=>({x:player.x,y:player.y}),guide(site){pin=site;onNotice(`Rejoins ${site.label.toLowerCase()} · E pour interagir.`);canvas.focus({preventScroll:true});},resetInput:clearInput};
}
