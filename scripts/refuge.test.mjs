import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {newRefuge,refugeAction,refugeReason,validateRefugeEvent,harvestAmount,energyLimit} from '../dist/refuge-core.mjs';
import {createRefuge} from './refuge.mjs';
import {createCloud,PublicError,DEFAULT_MODEL} from './cloud.mjs';
import {createServer} from './server.mjs';
import {modelFetcher} from './fixtures/model-catalog.mjs';

async function directory(t){const dir=await mkdtemp(path.join(tmpdir(),'nocturne-refuge-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
const event=()=>({title:'La graine bleue',location:'woods',text:'Mara trouve une graine qui chante avec la pluie.',choices:[{label:'La planter',cost:{herbs:1},consequence:'La graine pousse. Deux aubes apporteront une braise.',effects:{rule:{id:'blue-seed',name:'La graine bleue',description:'Une plante qui garde le feu.',kind:'dawn',resource:'embers',amount:1,days:2}}},{label:'La laisser au bord du chemin',cost:{},consequence:'Le chant vous accompagne au retour.',effects:{morale:1}}]});
const response=value=>new Response(JSON.stringify({done:true,message:{content:JSON.stringify(value)}}));
function travel(w,location,choice='0',resident='abel') {if(!w.energy)w=refugeAction(w,'rest');w=refugeAction(w,'depart',{location,resident});w=refugeAction(w,'choose',{choice});return refugeAction(w,'return');}

test('first expedition saves its paid choice before return and gives its consequences exactly once',()=>{
 const start=newRefuge(),before=structuredClone(start);let world=refugeAction(start,'depart',{location:'woods',resident:'sile'});assert.deepEqual(start,before);assert.equal(world.energy,2);
 world=refugeAction(world,'choose',{choice:'0'});assert.equal(world.resources.herbs,1);assert.equal(world.resources.food,4);assert.equal(world.residents.length,3);assert.equal(world.locations.length,2);
 assert.throws(()=>refugeAction(world,'choose',{choice:'0'}));assert.throws(()=>refugeAction(world,'rest'));
 world=refugeAction(JSON.parse(JSON.stringify(world)),'return');assert.equal(world.residents.length,4);assert.ok(world.residents.some(r=>r.id==='brume'));assert.ok(world.locations.some(l=>l.id==='orchard'));assert.equal(world.rules[0].days,3);assert.equal(world.morale,8);assert.equal(world.trip,null);assert.equal(world.events.some(e=>e.id==='first-light'),false);assert.match(world.memories[0].text,/Brume/);assert.throws(()=>refugeAction(world,'return'));
 const next=refugeAction(world,'depart',{location:'woods',resident:'abel'});assert.notEqual(next.trip.event.id,'first-light');
});
test('free choices, early return and exhausted days keep the adventure playable with empty stocks',()=>{
 let w=newRefuge();w.resources={wood:0,food:0,herbs:0,embers:0};w=refugeAction(w,'depart',{location:'woods',resident:'mara'});const before=structuredClone(w);assert.throws(()=>refugeAction(w,'choose',{choice:'0'}));assert.deepEqual(w,before);w=refugeAction(w,'return');assert.ok(w.events.some(e=>e.id==='first-light'));
 w=travel(w,'woods','1');assert.equal(w.residents.length,3);assert.ok(w.locations.some(l=>l.id==='orchard'));
 w.energy=0;assert.throws(()=>refugeAction(w,'depart',{location:'orchard',resident:'mara'}));w=refugeAction(w,'rest');assert.equal(w.energy,3);w=travel(w,'orchard','0','mara');assert.equal(w.resources.food,4);
});
test('the initial village can obtain all resources and finish the garden/fanal objectives through normal play',()=>{
 let w=refugeAction(newRefuge(),'build',{building:'garden'});w=travel(w,'woods');w=travel(w,'river','1');assert.ok(w.locations.some(l=>l.id==='quarry'));
 for(let i=0;i<8&&refugeReason(w,'build',{building:'beacon'});i++){
  if(!w.energy)w=refugeAction(w,'rest');
  if(w.resources.wood<6)w=travel(w,'woods');else if(w.resources.embers<2)w=travel(w,'quarry','0','brume');else break;
 }
 if(!w.energy)w=refugeAction(w,'rest');assert.equal(refugeReason(w,'build',{building:'beacon'}),null);w=refugeAction(w,'build',{building:'beacon'});assert.equal(w.buildings.beacon,1);assert.ok(w.buildings.garden);assert.ok(w.completed.includes('first-light'));
});
test('upgrades consume real materials, increase benefits, cap levels and never allow invalid mutations',()=>{
 let w=newRefuge();w.resources={wood:99,food:99,herbs:99,embers:99};w=refugeAction(w,'build',{building:'inn'});assert.equal(w.buildings.inn,2);assert.equal(w.resources.wood,89);w=refugeAction(w,'rest');assert.equal(w.energy,4);assert.equal(energyLimit(w),4);
 w=refugeAction(w,'build',{building:'inn'});assert.throws(()=>refugeAction(w,'build',{building:'inn'}));assert.throws(()=>refugeAction(w,'build',{building:'__proto__'}));assert.throws(()=>refugeAction(w,'depart',{location:'missing',resident:'mara'}));
 w=refugeAction(w,'talk',{resident:'mara'});assert.throws(()=>refugeAction(w,'talk',{resident:'mara'}));w=refugeAction(w,'rest');assert.equal(refugeReason(w,'talk',{resident:'mara'}),null);
});
test('AI harvest and dawn rules affect calculations and expire, including negative bounded harvests',()=>{
 let w=newRefuge();w.rules=[{id:'harvest',name:'Éclat',kind:'harvest',resource:'wood',amount:2,days:2},{id:'embers',name:'Chaleur',kind:'dawn',resource:'embers',amount:1,days:2}];
 assert.equal(harvestAmount(w,w.locations[0],w.residents[1]),6);w=refugeAction(w,'rest');assert.equal(w.resources.embers,2);assert.equal(w.rules[0].days,1);w=refugeAction(w,'rest');assert.equal(w.resources.embers,3);assert.equal(w.rules.length,0);assert.equal(harvestAmount(w,w.locations[0],w.residents[1]),4);
 w.rules=Array.from({length:5},(_,i)=>({id:String(i),kind:'harvest',resource:'wood',amount:-2,days:1}));assert.equal(harvestAmount(w,w.locations[0],w.residents[0]),1);
});
test('new encounters reject unknown mechanics, unreachable locations, impossible costs and existing/reserved identities',()=>{
 const w=newRefuge();assert.equal(validateRefugeEvent(event(),w).choices.length,2);
 for(const mutate of [e=>e.location='lost',e=>e.choices[0].effects.code='win()',e=>e.choices[0].effects.resources={gold:2},e=>e.choices[0].effects.rule.days=999,e=>e.choices.forEach(c=>c.cost={food:1}),e=>e.choices[0].effects.resident={...w.residents[0]},e=>e.choices[0].effects.location={id:'orchard',name:'Double',description:'Erreur',resource:'food'}]){const bad=event();mutate(bad);assert.throws(()=>validateRefugeEvent(bad,w));}
});
test('server persists active expeditions, rejects stale tabs and does not overwrite unreadable saves',async t=>{
 const dir=await directory(t),service=createRefuge({directory:dir,PublicError});let w=await service.read();
 const results=await Promise.allSettled([service.act({revision:w.revision,action:'depart',payload:{location:'woods',resident:'sile'}}),service.act({revision:w.revision,action:'rest'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 w=await service.read();w=await service.act({revision:w.revision,action:'choose',payload:{choice:'0'}});const restored=createRefuge({directory:dir,PublicError});assert.deepEqual(await restored.read(),w);w=await restored.act({revision:w.revision,action:'return'});assert.equal(w.residents.length,4);assert.equal(JSON.parse(await readFile(path.join(dir,'world.json'),'utf8')).revision,w.revision);
 await writeFile(path.join(dir,'world.json'),'broken');await assert.rejects(restored.read(),e=>e.status===500);assert.equal(await readFile(path.join(dir,'world.json'),'utf8'),'broken');
});
test('notebook drawings and selected animations are snapshots, and updates preserve world actions',async t=>{
 const dir=await directory(t),sprite={name:'Mara',description:'Portrait',width:16,height:16,pixels:[{x:1,y:1,rgba:'#AABBCCFF'}]},animation={id:'idle',name:'Respirer',loop:true,frames:[{duration:250,sprite}]},record={id:'fake',sprite,animations:[animation]},service=createRefuge({directory:dir,designer:{read:async()=>record},PublicError});
 await service.assignArt({key:'resident.mara',spriteId:'fake',animationId:'idle'});const w=await service.read();assert.deepEqual(w.art['resident.mara'].animation,animation);record.sprite.name='Changed';assert.equal((await service.read()).art['resident.mara'].sprite.name,'Mara');
 await assert.rejects(service.assignArt({key:'resident.missing',spriteId:'fake'}),e=>e.status===400);await assert.rejects(service.assignArt({key:'resident.mara',spriteId:'fake',animationId:'missing'}),e=>e.status===400);
 const next=await service.act({revision:w.revision,action:'talk',payload:{resident:'mara'}});assert.equal(next.art['resident.mara'].sprite.name,'Mara');
});
test('Ollama writing uses memories, keeps shared lock, validates a repair and queues a playable persistent event',async t=>{
 const dir=await directory(t);let calls=0,release;const gate=new Promise(r=>release=r);t.after(()=>release());
 const cloud=createCloud({cacheDir:dir,secretDir:path.join(dir,'keys'),spriteDir:path.join(dir,'sprites'),modelFetcher,environmentKey:'fake-secret',fetcher:async(_,init)=>{calls++;const sent=JSON.parse(init.body);assert.match(sent.messages[1].content,/Mara/);if(calls===1){await gate;return response({...event(),location:'impossible'});}return response(event());}});
 const writing=cloud.generateRefugeEvent({model:DEFAULT_MODEL,inspiration:'La graine de Mara'});while(!calls)await new Promise(r=>setImmediate(r));assert.equal((await cloud.status()).busy,true);await assert.rejects(cloud.generateRefugeEvent({model:DEFAULT_MODEL}),e=>e.status===409);
 let w=await cloud.readRefuge();w=await cloud.actRefuge({revision:w.revision,action:'talk',payload:{resident:'mara'}});release();w=await writing;assert.equal(w.conversations.mara,1);assert.equal(calls,2);const generated=w.events.find(e=>e.source==='ollama');assert.ok(generated);
 await assert.rejects(cloud.generateRefugeEvent({model:DEFAULT_MODEL}),e=>e.status===409);
 w=await cloud.actRefuge({revision:w.revision,action:'depart',payload:{location:'woods',resident:'mara'}});w=await cloud.actRefuge({revision:w.revision,action:'choose',payload:{choice:'1'}});w=await cloud.actRefuge({revision:w.revision,action:'return'});
 w=await cloud.actRefuge({revision:w.revision,action:'depart',payload:{location:'woods',resident:'mara'}});assert.equal(w.trip.event.id,generated.id);
});
test('refuge API enforces local authorization and retains old game routes',async t=>{
 const dir=await directory(t),cloud=createCloud({cacheDir:dir,secretDir:path.join(dir,'keys'),spriteDir:path.join(dir,'sprites'),environmentKey:null,modelFetcher}),server=createServer({cloud});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 assert.match(await(await fetch(base+'/')).text(),/refuge.mjs/);assert.match(await(await fetch(base+'/enquete.html')).text(),/enquete.mjs/);assert.match(await(await fetch(base+'/?room=test')).text(),/game.mjs/);
 const w=await(await fetch(base+'/api/refuge')).json(),body=JSON.stringify({revision:w.revision,action:'rest'});assert.equal((await fetch(base+'/api/refuge/action',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);
 const {token}=await(await fetch(base+'/api/session')).json(),headers={'Content-Type':'application/json',Origin:base,'X-Nocturne-Token':token};const updated=await fetch(base+'/api/refuge/action',{method:'POST',headers,body});assert.equal(updated.status,200);assert.equal((await updated.json()).day,2);assert.equal((await fetch(base+'/api/refuge/action',{method:'POST',headers,body})).status,409);
});
test('refuge panoramas reuse the three passes, keep the notebook and bind to the requested place',async t=>{
 const dir=await directory(t);let calls=0;const rect=(x,y,w,h,color)=>({outil:'rectangle',x,y,largeur:w,hauteur:h,couleur:color});
 const cloud=createCloud({cacheDir:dir,secretDir:path.join(dir,'keys'),spriteDir:path.join(dir,'sprites'),environmentKey:'fake-secret',modelFetcher,fetcher:async()=>response(++calls===1?{name:'Le refuge',description:'Une clairière',palette:['#112233','#AABBCC'],composition:'Auberge et jardin.'}:{commands:calls===2?[rect(0,0,256,144,'#112233')]:[rect(20,20,30,40,'#AABBCC')]})});
 const {illustrationJob}=await cloud.illustrateRefuge({key:'village',model:DEFAULT_MODEL});let job;
 for(let i=0;i<300;i++){job=await cloud.readRefugeIllustration(illustrationJob);if(job.status!=='running')break;await new Promise(r=>setTimeout(r,5));}
 assert.equal(job.status,'success',job.error);assert.equal(calls,3);const w=await cloud.readRefuge();assert.equal(w.art.village.sprite.width,256);assert.equal(w.art.village.sprite.height,144);assert.equal((await cloud.readSprite(w.art.village.spriteId)).sprite.name,'Le refuge');
});
