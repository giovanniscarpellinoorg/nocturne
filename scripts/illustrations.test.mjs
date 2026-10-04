import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createCloud,PublicError,DEFAULT_MODEL} from './cloud.mjs';
import {createIllustrations} from './illustrations.mjs';
import {createServer} from './server.mjs';
import {createDesigner} from './designer.mjs';
import {modelFetcher} from './fixtures/model-catalog.mjs';
import {normalizeSprite,validateSprite,compactSprite} from '../dist/pixels.mjs';
import {rasterizeCommands} from '../dist/drawing-tools.mjs';

const plan={name:'Gare panoramique',description:'La verrière éclaire les quais.',palette:['#112233','#FFEEDD'],composition:'Verrière en haut, quai et voies en perspective.'};
const rectangle=(x,y,largeur,hauteur,couleur='#112233')=>({outil:'rectangle',x,y,largeur,hauteur,couleur});
const response=value=>new Response(JSON.stringify({done:true,message:{content:JSON.stringify(value)}}));
async function fixture(t,fetcher){const root=await mkdtemp(path.join(tmpdir(),'nocturne-illustrations-'));t.after(()=>rm(root,{recursive:true,force:true}));return {root,cloud:createCloud({secretDir:path.join(root,'credentials'),cacheDir:path.join(root,'dungeons'),spriteDir:path.join(root,'sprites'),environmentKey:'test-secret-never-output',modelFetcher,fetcher})};}
async function completed(cloud,id){for(let i=0;i<300;i++){const job=await cloud.readIllustrationJob(id);if(job.status!=='running')return job;await new Promise(r=>setTimeout(r,5));}throw Error('Job timeout');}

test('panorama supports 32-color single-character rows and portraits keep rectangular dimensions',()=>{
 const pixels=Array.from({length:32},(_,i)=>({x:i,y:143,rgba:'#'+(0x112200+i).toString(16)+'FF'}));
 const panorama=validateSprite({...plan,width:256,height:144,pixels,palette:undefined});
 assert.deepEqual(validateSprite(compactSprite(panorama)),panorama);
 assert.equal(compactSprite(panorama).rows[143].slice(0,32),'0123456789ABCDEFGHIJKLMNOPQRSTUV');
 const portrait=validateSprite({...plan,width:64,height:96,pixels:[{x:63,y:95,rgba:'#112233FF'}],palette:undefined});
 assert.deepEqual(validateSprite(compactSprite(portrait)),portrait);
 assert.throws(()=>validateSprite({...portrait,height:97}),/Dimensions/);
 assert.throws(()=>validateSprite({...portrait,pixels}),/hors/);
 const many={...panorama,pixels:[...pixels,{x:32,y:143,rgba:'#ABCDEF80'}]};
 assert.throws(()=>validateSprite(many),/maximum 32/);
 assert.equal(normalizeSprite(many,undefined,{repairPalette:true}).diagnostics.colors,32);
});

test('illustration API runs three incremental passes, keeps global lock and persists art in notebook and investigation',async t=>{
 const calls=[];let release;const gate=new Promise(r=>release=r);t.after(()=>release());
 const {cloud,root}=await fixture(t,async(_,init)=>{const sent=JSON.parse(init.body);calls.push(sent);if(calls.length===1){await gate;return response(plan);}return response({commands:calls.length===2?[rectangle(0,0,256,144)]:[rectangle(20,40,30,50,'#FFEEDD')]});});
 const server=createServer({cloud});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const {token}=await (await fetch(base+'/api/session')).json(),headers={'Content-Type':'application/json',Origin:base,'X-Nocturne-Token':token};
 const options={id:'sample',key:'location.station',model:DEFAULT_MODEL,prompt:'Une gare'};
 assert.equal((await fetch(base+'/api/investigations/illustrate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(options)})).status,403);
 const started=await fetch(base+'/api/investigations/illustrate',{method:'POST',headers,body:JSON.stringify(options)});assert.equal(started.status,202);const initial=await started.json();
 assert.equal((await cloud.status()).busy,true);await assert.rejects(cloud.illustrateInvestigation(options),e=>e.status===409);
 release();const job=await completed(cloud,initial.id);assert.equal(job.status,'success',job.error);assert.equal(calls.length,3);assert.match(calls[2].messages[1].content,/DÉJÀ peintes/);
 const record=await cloud.readSprite(job.spriteId),investigation=await cloud.readInvestigation('sample');
 assert.deepEqual(investigation.art['location.station'],record.sprite);assert.equal(record.sprite.width,256);assert.equal(record.drawing.commands.length,2);
 assert.deepEqual(rasterizeCommands(record.drawing.commands,256,144).pixels,record.sprite.pixels);
 const jobResponse=await fetch(base+'/api/investigations/illustrations/'+initial.id);assert.equal(jobResponse.status,200);
 const log=await cloud.readDesignLog(job.diagnosticId);assert.equal(log.status,'success');assert.equal(log.responses.length,3);assert.ok(!JSON.stringify(log).includes('test-secret-never-output'));
 assert.ok((await readFile(path.join(root,'sprites',job.spriteId+'.json'),'utf8')).includes('illustration'));
});

test('invalid detail passes do not replace an existing illustration and request at most one repair',async t=>{
 let calls=0;const {cloud}=await fixture(t,async()=>{calls++;return response(calls===1?plan:calls===2?{commands:[rectangle(0,0,256,144)]}:{commands:[rectangle(250,140,100,100)]});});
 const before=await cloud.readInvestigation('sample');const initial=await cloud.illustrateInvestigation({id:'sample',key:'location.station',model:DEFAULT_MODEL,prompt:'Une gare'});
 const job=await completed(cloud,initial.id);assert.equal(job.status,'error');assert.equal(calls,4);assert.deepEqual(await cloud.readInvestigation('sample'),before);assert.equal((await cloud.listSprites()).length,0);
 assert.equal((await cloud.readDesignLog(job.diagnosticId)).status,'error');
});

test('jobs left running after a process restart are reported interrupted',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'nocturne-interrupted-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const service=createIllustrations({directory,investigations:{read:async()=>({id:'sample',story:{title:'Test'}})},PublicError});
 const job=await service.create({id:'sample',key:'investigator',model:DEFAULT_MODEL,prompt:'Une personne'});
 assert.equal((await service.read(job.id)).status,'error');await assert.rejects(service.read('../credentials'),e=>e.status===404);
});

test('portrait pipeline keeps a transparent margin and returns a reloadable 64 by 96 character',async t=>{
 let calls=0;const {cloud,root}=await fixture(t,async(_,init)=>{const request=JSON.parse(init.body);assert.equal(request.think,'low');calls++;return response(calls===1?{...plan,name:'Alix en pied'}:{commands:calls===2?[rectangle(20,5,24,85)]:[rectangle(26,12,4,4,'#FFEEDD')]});});
 const job=await completed(cloud,(await cloud.illustrateInvestigation({id:'sample',key:'investigator',model:DEFAULT_MODEL,prompt:'Alix entière sur fond transparent'})).id);
 assert.equal(job.status,'success',job.error);const record=await cloud.readSprite(job.spriteId);assert.equal(record.sprite.height,96);assert.equal(record.sprite.width,64);
 assert.ok(record.sprite.pixels.every(p=>p.x>0&&p.y>0&&p.y<95));assert.equal(record.illustration.kind,'portrait');
 const designer=createDesigner({directory:path.join(root,'sprites'),PublicError,defaultModel:DEFAULT_MODEL,fetcher:()=>{throw Error('No request expected');}});
 await assert.rejects(designer.generateAnimation({spriteId:record.id},'fake-key'),e=>e.status===400);
});
