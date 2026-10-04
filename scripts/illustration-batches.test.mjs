import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createIllustrationBatches} from './illustration-batches.mjs';
import {createCloud,PublicError,DEFAULT_MODEL} from './cloud.mjs';
import {createServer} from './server.mjs';
import {modelFetcher} from './fixtures/model-catalog.mjs';
import {sampleInvestigation,illustrationKeys} from '../dist/investigation-core.mjs';

async function fixture(t){const directory=await mkdtemp(path.join(tmpdir(),'nocturne-batch-'));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}
const image={name:'Dessin existant',description:'À conserver.',width:8,height:8,pixels:[{x:0,y:0,rgba:'#AABBCCFF'}]};
async function completed(cloud,id){for(let i=0;i<300;i++){const j=await cloud.readIllustrationBatch(id);if(j.status!=='running')return j;await new Promise(r=>setTimeout(r,10));}throw Error('Job timeout');}

test('batch runs every unique adventure asset sequentially, persists results and resumes after a stop',async t=>{
 const directory=await fixture(t),record=sampleInvestigation(),calls=[];let service;
 const investigations={read:async()=>structuredClone(record),assignArt:async({key,spriteId})=>{record.art[key]={spriteId};}};
 const illustrations={create:async o=>({...o,id:'child'}),read:async()=>({stage:'Détails'}),run:async o=>{calls.push(o.key);if(calls.length===1)await service.stop(job.id);return {status:'success',spriteId:'image-'+o.key};}};
 const designer={generate:async()=>{calls.push('card');return {record:{id:'card-'+calls.length}};}};
 service=createIllustrationBatches({directory,investigations,illustrations,designer,PublicError});
 const job=await service.create({id:'sample',model:DEFAULT_MODEL});await service.run(job,'secret');
 assert.equal((await service.read(job.id)).status,'stopped');assert.equal(calls.length,1);assert.ok(record.art.investigator);
 const resumed=await service.resume(job.id);await service.run(resumed,'secret');const done=await service.read(job.id);
 assert.equal(done.status,'success');assert.equal(calls.length,14);assert.equal(calls.filter(k=>k==='card').length,6);assert.equal(Object.keys(record.art).length,14);
 const noWork=await service.create({id:'sample',model:DEFAULT_MODEL});assert.equal(noWork.status,'success');assert.ok(noWork.items.every(i=>i.status==='skipped'));
 const all=await service.create({id:'sample',model:DEFAULT_MODEL,mode:'all'});assert.ok(all.items.every(i=>i.status==='pending'));
 const restored=createIllustrationBatches({directory,investigations,illustrations,designer,PublicError});assert.equal((await restored.read(all.id)).status,'interrupted');
});

test('quota failures stop the queue without discarding successful items',async t=>{
 const directory=await fixture(t),record=sampleInvestigation();let calls=0;
 const service=createIllustrationBatches({directory,PublicError,investigations:{read:async()=>record,assignArt:async()=>{}},illustrations:{create:async o=>({...o,id:'child'}),run:async()=>++calls===1?{status:'success',spriteId:'first'}:{status:'error',errorStatus:429,error:'Quota atteint'}}});
 const job=await service.create({id:'sample',model:DEFAULT_MODEL});await service.run(job,'secret');
 const result=await service.read(job.id);assert.equal(calls,2);assert.equal(result.status,'partial');assert.equal(result.items[0].status,'success');assert.equal(result.items[1].status,'error');assert.ok(result.items.slice(2).every(i=>i.status==='pending'));
});

test('batch API protects writes, keeps existing art, handles a rejected card, and retries only that card',async t=>{
 const root=await fixture(t),record=sampleInvestigation();for(const k of illustrationKeys)if(!['card.lantern','card.blade'].includes(k))record.art[k]=image;
 const investigations=path.join(root,'investigations');await mkdir(investigations);await writeFile(path.join(investigations,'sample.json'),JSON.stringify(record));
 let calls=0,release;const gate=new Promise(r=>release=r);t.after(()=>release());
 const cloud=createCloud({investigationDir:investigations,spriteDir:path.join(root,'sprites'),secretDir:path.join(root,'credentials'),cacheDir:path.join(root,'dungeons'),environmentKey:'fake-secret',modelFetcher,fetcher:async()=>{calls++;if(calls===1)await gate;return new Response(JSON.stringify({done:true,message:{content:JSON.stringify({name:'Carte',description:'Illustration.',width:64,height:64,commands:[{outil:'pixel',x:calls===1?999:10,y:10,couleur:'#AABBCC'}]})}}));}});
 const server=createServer({cloud});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const {token}=await(await fetch(base+'/api/session')).json(),headers={'Content-Type':'application/json',Origin:base,'X-Nocturne-Token':token};
 const options={id:'sample',model:DEFAULT_MODEL};assert.equal((await fetch(base+'/api/investigations/illustrate-all',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(options)})).status,403);
 const start=await fetch(base+'/api/investigations/illustrate-all',{method:'POST',headers,body:JSON.stringify(options)});assert.equal(start.status,202);const initial=await start.json();
 assert.equal((await cloud.status()).illustrationBatchId,initial.id);await assert.rejects(cloud.illustrateAdventure(options),e=>e.status===409);
 release();let job=await completed(cloud,initial.id);assert.equal(job.status,'partial');assert.equal(calls,2);assert.equal(job.items.filter(i=>i.status==='skipped').length,12);
 const saved=await cloud.readInvestigation('sample');assert.deepEqual(saved.art.investigator,image);const blade=saved.art['card.blade'];assert.ok(blade);
 const resumed=await fetch(base+'/api/investigations/illustration-batches/resume',{method:'POST',headers,body:JSON.stringify({id:job.id})});assert.equal(resumed.status,202);
 job=await completed(cloud,job.id);assert.equal(job.status,'success');assert.equal(calls,3);assert.deepEqual((await cloud.readInvestigation('sample')).art['card.blade'],blade);
 assert.equal((await fetch(base+'/api/investigations/illustration-batches/'+job.id)).status,200);
});
