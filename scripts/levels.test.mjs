import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {defaultGameplay} from '../dist/assets.mjs';
import {emptyReview} from '../dist/sprite-review.mjs';
import {validateScene,sceneExit} from '../dist/scene.mjs';
import {LevelRun,validateLevel} from '../dist/level.mjs';
import {createCloud,DEFAULT_MODEL,PublicError} from './cloud.mjs';
import {createServer} from './server.mjs';
import {createLevels,validateLevelOptions,validateLevelPlan,prepareLevelPlan} from './levels.mjs';
import {modelFetcher} from './fixtures/model-catalog.mjs';

const sprite={name:'Test',description:'Test',width:32,height:32,pixels:[{x:8,y:8,rgba:'#AABBCCFF'}]};
const asset=(type,stats={})=>({id:randomUUID(),version:1,createdAt:'2026-10-03T00:00:00Z',sprite:{...sprite,name:type},model:DEFAULT_MODEL,review:{...emptyReview(),status:'approved'},gameplay:{type,stats:{...defaultGameplay(type).stats,...stats}}});
const reply=value=>new Response(JSON.stringify({done:true,message:{content:JSON.stringify(value)}}));
async function fixture(t){const dir=await mkdtemp(path.join(tmpdir(),'nocturne-level-'));t.after(()=>rm(dir,{recursive:true,force:true}));const options={secretDir:path.join(dir,'keys'),cacheDir:path.join(dir,'dungeons'),roomDir:path.join(dir,'rooms'),spriteDir:path.join(dir,'sprites'),levelDir:path.join(dir,'levels'),modelFetcher,environmentKey:'test-key'};await mkdir(options.spriteDir);return options;}
const options=()=>({model:DEFAULT_MODEL,spriteModel:'gemma4:31b',animationModel:'gemma4:31b',roomCount:2,assetBudget:4,animationBudget:2,inspiration:'Forêt de cristal'});
function planFor(hero,enemy,item,door){return {title:'Forêt de cristal',theme:'moss',style:'Cristal bleu et mousse, silhouettes nettes',hero:'hero',door:'door',assets:[
  {key:'hero',type:'character',action:'reuse',reference:hero.id,animations:[{slot:'walk',prompt:'Marche délicate'}]},
  {key:'enemy',type:'enemy',action:'reuse',reference:enemy.id,animations:[]},
  {key:'variant',type:'enemy',action:'variant',reference:'enemy',prompt:'Un ennemi de cristal',animations:[]},
  {key:'item',type:'item',action:'reuse',reference:item.id,animations:[]},
  {key:'boss',type:'boss',action:'create',prompt:'Gardien de cristal',animations:[]},
  {key:'door',type:'decor',action:'reuse',reference:door.id,animations:[]},
],rooms:[{title:'Clairière',brief:'Combattre et récolter',assets:['variant','item']},{title:'Gardien',brief:'Combat final',assets:['boss']}]};}

test('production plans enforce creation budgets, prior references, playable roles and animation ownership',()=>{
  const hero=asset('character'),enemy=asset('enemy'),item=asset('item'),door=asset('decor',{kind:'door'}),library=[hero,enemy,item,door],plan=planFor(...library),o=options();
  assert.equal(validateLevelPlan(plan,o,library).assets.length,6);
  const extra=structuredClone(plan);extra.assets.push({key:'unused',type:'item',action:'create',prompt:'Objet inutilisé',animations:[]});
  assert.deepEqual(validateLevelPlan(extra,o,library).assets,validateLevelPlan(plan,o,library).assets,'ignore unused recipes but preserve variant ancestors');
  assert.throws(()=>validateLevelPlan(plan,{...o,assetBudget:1},library),/budget/);
  assert.throws(()=>validateLevelPlan(plan,{...o,animationBudget:0},library),/budget/);
  for(const mutate of [p=>p.assets[2].reference='unknown',p=>p.assets[0].animations[0]={slot:'walk',animationId:'foreign'},p=>p.assets[0].animations[0].slot='open',p=>p.rooms[0].assets=['boss'],p=>p.rooms[1].assets=['item'],p=>p.hero='item']){const p=structuredClone(plan);mutate(p);assert.throws(()=>validateLevelPlan(p,o,library));}
  assert.throws(()=>validateLevelOptions({...o,animationBudget:100},[DEFAULT_MODEL,'gemma4:31b']));
});

test('a character reused as an enemy becomes a separate variant without copying its animation frames or changing the source',()=>{
  const hero=asset('character'),mushroom=asset('character'),item=asset('item'),door=asset('decor',{kind:'door'}),library=[hero,mushroom,item,door];
  mushroom.animations=[{id:'original-idle',type:'idle'}];
  const input=planFor(...library);input.assets[1].animations=[{slot:'idle',animationId:'original-idle'}];const before=structuredClone({input,library});
  const {plan,adjustments}=prepareLevelPlan(input,options(),library),converted=plan.assets.find(a=>a.key==='enemy');
  assert.equal(converted.action,'variant');assert.equal(converted.type,'enemy');assert.equal(converted.reference,mushroom.id);assert.ok(converted.prompt);assert.deepEqual(converted.animations,[]);
  assert.equal(plan.assets.find(a=>a.key==='variant').reference,'enemy');assert.equal(adjustments.length,2);assert.deepEqual({input,library},before);
  assert.throws(()=>prepareLevelPlan(input,{...options(),assetBudget:2},library),/budget/,'role conversion must count as a creation');
  const unknown=structuredClone(input);unknown.assets[1].reference='unknown';assert.throws(()=>prepareLevelPlan(unknown,options(),library),/référence unknown/,'never invent missing references');
});

test('foreign animations are omitted and animation budgets prioritize movement and combat without discarding the whole plan',()=>{
  const hero=asset('character'),enemy=asset('enemy'),item=asset('item'),door=asset('decor',{kind:'door'}),library=[hero,enemy,item,door];
  enemy.animations=[{id:'enemy-idle',type:'idle'}];item.animationBindings={idle:'item-idle'};item.animations=[{id:'item-idle',type:'idle'}];
  const input=planFor(...library);input.assets[0].animations.push({slot:'idle',prompt:'Respirer'},{slot:'hurt',prompt:'Impact'});input.assets[4].animations.push({slot:'attack',prompt:'Attaquer'},{slot:'idle',prompt:'Respirer'});
  input.assets[3].animations=[{slot:'idle',animationId:'enemy-idle'}];
  const {plan,adjustments}=prepareLevelPlan(input,options(),library);
  assert.deepEqual(plan.assets.flatMap(a=>a.animations.filter(c=>!c.animationId).map(c=>`${a.key}.${c.slot}`)),['hero.walk','boss.attack']);
  assert.deepEqual(plan.assets.find(a=>a.key==='item').animations,[]);assert.deepEqual(item.animationBindings,{idle:'item-idle'});assert.equal(adjustments.length,4);
  const zero=prepareLevelPlan(input,{...options(),animationBudget:0},library);assert.equal(zero.plan.assets.flatMap(a=>a.animations).length,0);
});

test('complete production uses real sprite/animation services, saves variants and rooms, and persists playable snapshots',async t=>{
  const dirs=await fixture(t),hero=asset('character'),enemy=asset('enemy'),item=asset('item'),door=asset('decor',{kind:'door'}),rejected=asset('enemy');rejected.review.status='rejected';
  for(const a of [hero,enemy,item,door,rejected])await writeFile(path.join(dirs.spriteDir,a.id+'.json'),JSON.stringify(a));
  const plan=planFor(hero,enemy,item,door);let calls=[],roomCalls=0,planCalls=0,cloud;
  const fetcher=async(_,init)=>{
    const body=JSON.parse(init.body),prompt=body.messages[1].content;calls.push(body);
    if(prompt.includes('plan de production')){assert.ok(!prompt.includes(rejected.id));if(++planCalls===2){assert.equal(JSON.parse(body.messages.find(m=>m.role==='assistant').content).hero,'missing');assert.match(body.messages.at(-1).content,/Corrige uniquement/);}return reply(planCalls===1?{...plan,hero:'missing'}:plan);}
    if(body.messages[0].content.includes('animateur'))return reply({version:1,type:'walk',fps:8,loop:true,format:'changes',frames:Array.from({length:6},(_,i)=>({moves:i%2?[[8,8,1,1,1,0]]:[]}))});
    if(body.messages[0].content.includes('artiste')){const type=prompt.includes('Type imposé : enemy')?'enemy':'boss';return reply({name:type,description:'Cristal',width:32,height:32,commands:[{outil:'rectangle',x:8,y:8,largeur:10,hauteur:12,couleur:'#AABBCC'}],gameplay:defaultGameplay(type)});}
    const library=await cloud.listSprites(),variant=library.find(a=>a.parentId===enemy.id),boss=library.find(a=>a.gameplay.type==='boss');
    roomCalls++;const first=roomCalls<3;
    return reply({version:1,title:first?'Clairière':'Gardien',theme:'moss',heroId:hero.id,placements:first?[{id:'e',assetId:variant.id,x:roomCalls===1?120:600,y:roomCalls===1?320:160},{id:'i',assetId:item.id,x:720,y:400}]:[{id:'b',assetId:boss.id,x:680,y:240}]});
  };
  cloud=createCloud({...dirs,fetcher});const job=await cloud.buildLevel(options());
  assert.equal(job.status,'running');assert.equal((await cloud.status()).busy,true);
  await assert.rejects(cloud.design({model:DEFAULT_MODEL,prompt:'test',size:16}),e=>e.status===409);
  let result;for(let i=0;i<500;i++){result=await cloud.readLevelJob(job.id);if(result.status!=='running')break;await new Promise(r=>setTimeout(r,5));}
  assert.equal(result.status,'complete',result.error);assert.equal(roomCalls,3);assert.equal(planCalls,2);
  const level=await cloud.readLevel(job.id);assert.equal(level.rooms.length,2);assert.equal((await cloud.listRooms()).length,2);assert.equal((await cloud.listLevels()).length,1);
  const records=await cloud.listSprites(),variant=records.find(a=>a.parentId===enemy.id);assert.equal(variant.rootId,enemy.id);assert.equal(variant.review.status,'draft');
  const savedHero=level.rooms[0].assets.find(a=>a.id===hero.id);assert.ok(savedHero.animationBindings.walk);assert.equal((await cloud.readSprite(hero.id)).animationBindings,undefined,'existing notebook assignments remain unchanged');
  assert.equal(calls.find(c=>c.messages[0].content.includes('animateur')).model,'gemma4:31b');assert.equal(calls.find(c=>c.messages[0].content.includes('artiste')).model,'gemma4:31b');
  const run=new LevelRun(level);run.start();run.tick(.02,{x:1});assert.equal(run.animations.pose(run,hero.id,run.player).id,savedHero.animationBindings.walk);
  await cloud.updateSpriteGameplay({id:hero.id,gameplay:{...hero.gameplay,stats:{...hero.gameplay.stats,health:2}}});
  const restarted=createCloud({...dirs,fetcher:()=>{throw Error('No AI on reload');}});assert.deepEqual(await restarted.readLevel(job.id),level);assert.equal((await restarted.readLevelJob(job.id)).status,'complete');
});

function playable(){
  const hero=asset('character'),item=asset('item',{amount:2}),boss=asset('boss'),door=asset('decor',{kind:'door'});
  door.animations=[{id:'open',name:'Ouverture',version:1,type:'custom',fps:10,loop:true,frames:[0,1,2].map(i=>({duration:100,sprite:{...sprite,pixels:[{x:8+i,y:8,rgba:'#AABBCCFF'}]}}))}];door.animationBindings={open:'open'};
  const scene=placements=>validateScene({version:1,title:'Salle',theme:'moss',heroId:hero.id,exitId:door.id,placements},[hero,item,boss,door]);
  return {version:1,title:'Niveau',rooms:[scene([{id:'i',assetId:item.id,x:600,y:320}]),scene([{id:'b',assetId:boss.id,x:680,y:240}])]};
}
test('room transitions keep health and rewards, wait for the door, and win only at the final exit',()=>{
  const level=playable(),events=[],run=new LevelRun(level,type=>events.push(type));run.start();run.player.hp=3;
  Object.assign(run.player,sceneExit);run.tick(.02);assert.equal(run.roomId,0,'reward locks passage');
  run.claimPlacedItem(run.pickups[0]);const max=run.player.maxHp;run.player.hp=4;run.tick(.02);assert.equal(run.roomId,0,'wait for opening');
  run.pause();for(let i=0;i<20;i++)run.tick(.02);assert.equal(run.roomId,0);run.pause();
  for(let i=0;i<20;i++)run.tick(.02);assert.equal(run.roomId,1);assert.equal(run.player.hp,4);assert.equal(run.player.maxHp,max);assert.equal(run.inventory.length,1);assert.equal(run.rooms.filter(r=>r.visited).length,2);
  Object.assign(run.player,sceneExit);run.tick(.02);assert.equal(run.state,'playing','boss locks exit');
  run.room.enemies[0].hp=0;run.tick(.02);assert.equal(run.state,'playing','boss death does not skip door');
  for(let i=0;i<20;i++)run.tick(.02);assert.equal(run.state,'won');assert.equal(events.filter(e=>e==='won').length,1);
  const again=new LevelRun(level);assert.equal(again.roomId,0);assert.equal(again.inventory.length,0);assert.equal(again.player.maxHp,6);
  assert.throws(()=>validateLevel({...level,rooms:[level.rooms[0]]}));
});

test('failed animation is reported without losing a playable level, and invalid planning publishes nothing',async t=>{
  const dirs=await fixture(t),hero=asset('character'),item=asset('item'),boss=asset('boss'),lib=[hero,item,boss];
  for(const a of lib)await writeFile(path.join(dirs.spriteDir,a.id+'.json'),JSON.stringify(a));
  const plan={title:'Niveau',theme:'moss',style:'Bleu',hero:'hero',assets:lib.map((a,i)=>({key:['hero','item','boss'][i],type:a.gameplay.type,action:'reuse',reference:a.id,animations:i===0?[{slot:'walk',prompt:'Marche'}]:[]})),rooms:[{title:'Entrée',brief:'Objet',assets:['item']},{title:'Fin',brief:'Boss',assets:['boss']}]};
  let scenes=0;
  const cloud=createCloud({...dirs,fetcher:async(_,init)=>{const body=JSON.parse(init.body),prompt=body.messages[1].content;if(prompt.includes('plan de production'))return reply(plan);if(body.messages[0].content.includes('animateur'))return reply({frames:[]});return reply({version:1,title:'Salle',theme:'moss',placements:[{id:'p',assetId:scenes++===0?item.id:boss.id,x:600,y:240}]});}});
  const job=await cloud.buildLevel(options());let result;
  for(let i=0;i<500;i++){result=await cloud.readLevelJob(job.id);if(result.status!=='running')break;await new Promise(r=>setTimeout(r,5));}
  assert.equal(result.status,'complete',result.error);assert.equal(result.warnings.length,1);assert.ok(result.events.some(e=>e.diagnosticId));assert.equal((await cloud.readLevel(job.id)).warnings.length,1);
  const bad=createCloud({...dirs,fetcher:async()=>reply({})}),failed=await bad.buildLevel(options());
  for(let i=0;i<100;i++){result=await bad.readLevelJob(failed.id);if(result.status!=='running')break;await new Promise(r=>setTimeout(r,5));}
  assert.equal(result.status,'failed');await assert.rejects(bad.readLevel(failed.id));assert.equal((await bad.listLevels()).length,1);assert.equal((await bad.status()).busy,false);
});

test('level API authorizes mutations and returns a job immediately while the provider is pending',async t=>{
  const dirs=await fixture(t);let release;const pending=new Promise(r=>release=r);
  const cloud=createCloud({...dirs,fetcher:async()=>{await pending;return reply({});}}),server=createServer({cloud});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const origin=`http://127.0.0.1:${server.address().port}`,session=await(await fetch(origin+'/api/session')).json(),headers={'Content-Type':'application/json','X-Nocturne-Token':session.token,Origin:origin};
  const post=h=>fetch(origin+'/api/levels/generate',{method:'POST',headers:h,body:JSON.stringify(options())});
  assert.equal((await post({...headers,Origin:'https://example.com'})).status,403);
  const response=await post(headers);assert.equal(response.status,202);const job=await response.json();assert.equal((await(await fetch(origin+'/api/levels/jobs/'+job.id)).json()).status,'running');assert.equal((await post(headers)).status,409);
  const resume=h=>fetch(origin+'/api/levels/resume',{method:'POST',headers:h,body:JSON.stringify({id:job.id})});
  assert.equal((await resume({...headers,Origin:'https://example.com'})).status,403);assert.equal((await resume(headers)).status,409);
  assert.equal((await fetch(origin+'/api/levels/not-an-id')).status,404);release();
  for(let i=0;i<100&&(await cloud.status()).busy;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal((await cloud.readLevelJob(job.id)).status,'failed');
  assert.equal((await resume(headers)).status,400,'failed planning has no rooms to resume');
});

test('DeepSeek uses direct JSON, retries exhausted output with more tokens and accepts complete JSON at the token limit',async t=>{
  const dirs=await fixture(t),hero=asset('character'),item=asset('item'),boss=asset('boss'),library=[hero,item,boss];
  const plan={title:'Cristal',theme:'moss',style:'Bleu',hero:'hero',assets:library.map((a,i)=>({key:['hero','item','boss'][i],type:a.gameplay.type,action:'reuse',reference:a.id,animations:[]})),rooms:[{title:'Entrée',brief:'Objet',assets:['item']},{title:'Fin',brief:'Boss',assets:['boss']}]};
  const requests=[];let rooms=0;
  const service=createLevels({directory:dirs.levelDir,designer:{list:async()=>library},rooms:{saveSnapshot:async(plan,assets)=>({id:randomUUID(),plan,assets})},PublicError,defaultModel:DEFAULT_MODEL,fetcher:async(_,init)=>{
    const body=JSON.parse(init.body);requests.push(body);
    if(requests.length===1)return new Response(JSON.stringify({done:true,done_reason:'length',eval_count:16000,message:{content:'',thinking:'private-test-key'}}));
    if(requests.length===2)return new Response(JSON.stringify({done:true,done_reason:'length',eval_count:24000,message:{content:JSON.stringify(plan)}}));
    return reply({version:1,title:'Salle',theme:'moss',placements:[{id:'p',assetId:rooms++===0?item.id:boss.id,x:600,y:240}]});
  }});
  const job=await service.createJob({...options(),model:'deepseek-v4.1-flash'});await service.run(job.id,'private-test-key');const result=await service.readJob(job.id);
  assert.equal(result.status,'complete',result.error);assert.ok(requests.every(r=>r.think===false));assert.deepEqual(requests.map(r=>r.options.num_predict),[16000,24000,16000,16000]);
  assert.ok(result.events.some(e=>e.message.includes('Budget épuisé avant de produire le JSON')));
  const log=await service.readLog(result.events.find(e=>e.levelLogId).levelLogId);
  assert.equal(log.status,'success');assert.ok(log.attempt1Response.includes('[REDACTED]'));assert.ok(!JSON.stringify(log).includes('private-test-key'));assert.ok(log.attempt2Response.includes('Cristal'));
  await assert.rejects(service.readLog('../credentials'),e=>e.status===404);
});

test('an interrupted response containing valid JSON is still rejected and diagnosed',async t=>{
  const dirs=await fixture(t),service=createLevels({directory:dirs.levelDir,designer:{list:async()=>[]},PublicError,defaultModel:DEFAULT_MODEL,fetcher:async()=>new Response(JSON.stringify({done:false,message:{content:'{}'}}))});
  const job=await service.createJob(options());await service.run(job.id,'test-key');const result=await service.readJob(job.id);
  assert.equal(result.status,'failed');assert.match(result.error,/interrompue par Ollama/);assert.equal(result.events.filter(e=>e.message.startsWith('Proposition rejetée')).length,2);
  assert.equal((await service.readLog(result.events.find(e=>e.levelLogId).levelLogId)).status,'error');
});

test('failed room generation resumes from saved sprites and rooms, and a requested door is bound to the exit',async t=>{
  const dirs=await fixture(t),hero=asset('character'),item=asset('item'),boss=asset('boss'),door=asset('decor',{kind:'door'}),library=[hero,item,boss,door];
  const plan={title:'Reprise',theme:'moss',style:'Bleu',hero:'hero',door:null,assets:library.map((a,i)=>({key:['hero','item','boss','door'][i],type:a.gameplay.type,action:'reuse',reference:a.id,animations:[]})),rooms:[{title:'Entrée',brief:'Objet',assets:['item']},{title:'Fin',brief:'Boss et sortie',assets:['boss','door']}]};
  let calls=0;
  const config={directory:dirs.levelDir,designer:{list:async()=>library},rooms:{saveSnapshot:async(plan,assets)=>({id:randomUUID(),plan,assets})},PublicError,defaultModel:DEFAULT_MODEL};
  const service=createLevels({...config,fetcher:async()=>{calls++;return calls===1?reply(plan):calls===2?reply({version:1,title:'Entrée',theme:'moss',placements:[{id:'i',assetId:item.id,x:600,y:320}]}):new Response('',{status:503});}});
  const job=await service.createJob(options());await service.run(job.id,'key');assert.equal((await service.readJob(job.id)).canResume,true);
  hero.gameplay.stats.health=2;
  let retried=0;
  const restarted=createLevels({...config,designer:{list:()=>{throw Error('Do not replan or redraw');}},fetcher:async()=>{retried++;return reply({version:1,title:'Fin',theme:'moss',placements:[{id:'b',assetId:boss.id,x:600,y:240},{id:'d',assetId:door.id,x:480,y:320}]});}});
  await restarted.resumeJob(job.id);await restarted.run(job.id,'key');const result=await restarted.readJob(job.id);assert.equal(result.status,'complete',result.error);assert.equal(retried,1);
  const level=await restarted.read(job.id);assert.equal(level.rooms[0].assets.find(a=>a.id===hero.id).gameplay.stats.health,6);assert.equal(level.rooms[1].plan.exitId,door.id);assert.equal(level.rooms[1].plan.placements.length,1);assert.ok(level.adjustments.some(a=>a.includes('sortie fixe')));
  await assert.rejects(restarted.resumeJob(job.id),e=>e.status===400);
});
