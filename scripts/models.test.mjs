import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createModelCatalog,parseModels,MODEL_ENDPOINT} from './models.mjs';
import {createCloud} from './cloud.mjs';
import {createServer} from './server.mjs';
import {dungeon} from '../dist/dungeon.mjs';
import {blankScene} from '../dist/scene.mjs';
import {chooseModel} from '../dist/model-picker.mjs';
const reply=models=>new Response(JSON.stringify({object:'list',data:models.map(id=>({id,object:'model'}))}));
async function directory(t){const dir=await mkdtemp(path.join(tmpdir(),'nocturne-models-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('cloud catalogue parses every returned model, deduplicates and rejects malformed names',()=>{
  assert.deepEqual(parseModels({data:[{id:'new-model:cloud',object:'model'},{id:'new-model:cloud',object:'model'},{id:'org/model',object:'model'},{id:'<script>',object:'model'},{id:'other',object:'not-a-model'}]}),['new-model:cloud','org/model']);
  assert.throws(()=>parseModels({data:[]}));assert.throws(()=>parseModels({models:[]}));
  assert.equal(chooseModel(['a','b'],'b','a'),'b');assert.equal(chooseModel(['a','b'],'retired','b'),'b');assert.equal(chooseModel(['a'],'retired','retired'),'a');
});

test('catalogue deduplicates concurrent requests, expires, and survives network failures and restarts',async t=>{
  const dir=await directory(t);let time=Date.now(),calls=0,broken=false;
  const fetcher=async(url,options)=>{calls++;assert.equal(url,MODEL_ENDPOINT);assert.equal(options.headers,undefined,'public listing requires no API key');if(broken)throw Error('offline');return reply(['brand-new','glm-5.3-flash']);};
  const catalog=createModelCatalog({directory:dir,fetcher,fallback:['fallback'],now:()=>time});
  const [a,b]=await Promise.all([catalog.get(),catalog.get()]);assert.deepEqual(a,b);assert.equal(calls,1);await catalog.get();assert.equal(calls,1);
  time+=300001;broken=true;const stale=await catalog.get();assert.equal(stale.stale,true);assert.deepEqual(stale.models,a.models);assert.equal(calls,2);await catalog.get();assert.equal(calls,2);
  const restarted=createModelCatalog({directory:dir,fetcher,fallback:['fallback'],now:()=>time});assert.deepEqual((await restarted.get()).models,a.models);
  time+=30001;broken=false;const fresh=await catalog.get({refresh:true});assert.equal(fresh.stale,false);assert.equal(fresh.error,null);
});

test('first-load outage exposes an explicit limited fallback and can recover',async t=>{
  let time=Date.now(),broken=true;const catalog=createModelCatalog({directory:await directory(t),now:()=>time,fallback:['legacy'],fetcher:async()=>{if(broken)return new Response('unavailable',{status:503});return reply(['new']);}});
  const offline=await catalog.get();assert.equal(offline.source,'fallback');assert.match(offline.error,/secours limitée/);assert.deepEqual(offline.models,['legacy']);
  broken=false;time+=30001;assert.deepEqual((await catalog.get({refresh:true})).models,['new']);
});

test('newly discovered models work across config, dungeons, sprites and rooms; unknown models are rejected',async t=>{
  const dir=await directory(t),requests=[];let result=dungeon.blueprint;
  const config={secretDir:path.join(dir,'settings'),cacheDir:path.join(dir,'dungeons'),spriteDir:path.join(dir,'sprites'),roomDir:path.join(dir,'rooms'),environmentKey:'test-key',modelFetcher:async()=>reply(['brand-new:latest']),fetcher:async(_,init)=>{requests.push(JSON.parse(init.body));return new Response(JSON.stringify({done:true,message:{content:JSON.stringify(result)}}));}};
  const cloud=createCloud(config);await cloud.configure({key:'a-test-key-of-sufficient-length',model:'brand-new:latest'});
  assert.deepEqual((await cloud.status()).models,['brand-new:latest']);
  await assert.rejects(cloud.generate({model:'not-listed'}),e=>e.status===400);
  await cloud.generate({model:'brand-new:latest',mode:'daily'});
  result={name:'Gardien',description:'Un esprit',width:16,height:16,pixels:[{x:8,y:8,rgba:'#AABBCCFF'}]};
  const second=createCloud(config),{record}=await second.design({model:'brand-new:latest',prompt:'Un esprit',size:16});
  await second.updateSpriteGameplay({id:record.id,gameplay:{type:'item',stats:{effect:'vitality',amount:1}}});
  result=blankScene();await createCloud(config).composeRoom({model:'brand-new:latest',inspiration:''});
  assert.equal(requests.length,3);assert.ok(requests.every(r=>r.model==='brand-new:latest'&&!('think'in r)));
  const retired=createCloud({...config,secretDir:path.join(dir,'other-settings'),modelFetcher:async()=>reply(['replacement'])});
  assert.equal((await retired.generate({mode:'daily',model:'brand-new:latest'})).source,'ollama-cloud:brand-new:latest','saved daily dungeon remains loadable after retirement');
});

test('local models route shares the catalogue with status and supports explicit refresh',async t=>{
  const dir=await directory(t);let calls=0;
  const cloud=createCloud({secretDir:dir,cacheDir:path.join(dir,'cache'),modelFetcher:async()=>{calls++;return reply(calls===1?['first']:['first','new']);}});
  const server=createServer({cloud});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.deepEqual((await(await fetch(base+'/api/models')).json()).models,['first']);
  assert.deepEqual((await(await fetch(base+'/api/status')).json()).models,['first']);assert.equal(calls,1);
  assert.deepEqual((await(await fetch(base+'/api/models?refresh=1')).json()).models,['first','new']);assert.equal(calls,2);
});
