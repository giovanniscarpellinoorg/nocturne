import {modelFetcher} from './fixtures/model-catalog.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {defaultGameplay} from '../dist/assets.mjs';
import {emptyReview} from '../dist/sprite-review.mjs';
import {blankScene,validateScene,sceneSpawn,sceneExit} from '../dist/scene.mjs';
import {SceneRun} from '../dist/scene-run.mjs';
import {render} from '../dist/render.mjs';
import {createRooms} from './rooms.mjs';
import {createCloud,PublicError,DEFAULT_MODEL} from './cloud.mjs';
import {createServer} from './server.mjs';

const asset=(type,stats={})=>({version:1,id:randomUUID(),model:DEFAULT_MODEL,createdAt:'2026-10-02T12:00:00Z',review:emptyReview(),sprite:{name:type,description:'Un sprite de test',width:16,height:16,pixels:[{x:8,y:8,rgba:'#80AA90FF'}]},gameplay:{type,stats:{...defaultGameplay(type).stats,...stats}}});
const placed=(a,x,y)=>({id:randomUUID(),assetId:a.id,x,y});
function fixture(){const hero=asset('character',{health:9,damage:30}),enemy=asset('enemy',{health:30}),wall=asset('wall',{health:30}),item=asset('item',{amount:2});const assets=[hero,enemy,wall,item];return {assets,hero,enemy,wall,item,plan:{...blankScene(),heroId:hero.id,placements:[placed(enemy,600,200),placed(enemy,680,440),placed(wall,400,160),placed(item,760,320)]}};}
async function temporary(t){const dir=await mkdtemp(path.join(tmpdir(),'nocturne-rooms-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('rooms validate asset roles, bounds, overlap and a traversable route even with intact destructible walls',()=>{
  const f=fixture();assert.equal(validateScene(f.plan,f.assets).assets.length,4);
  for(const changes of [{heroId:f.item.id},{placements:[placed(f.enemy,120,320)]},{placements:[placed(f.wall,80,80)]},{placements:[placed(f.enemy,401,200)]},{placements:[placed(f.enemy,400,200),placed(f.item,400,200)]},{placements:[placed({id:'unknown'},400,200)]},{placements:[placed(f.hero,400,200)]}])assert.throws(()=>validateScene({...f.plan,...changes},f.assets));
  const wall=asset('wall',{width:40,height:120});const barrier=[120,240,360,480].map(y=>placed(wall,480,y));
  assert.throws(()=>validateScene({...blankScene(),placements:barrier},[wall]),/bloque/);
  assert.doesNotThrow(()=>validateScene({...blankScene(),placements:barrier.filter(p=>p.y!==240)},[wall]));
  const door=asset('decor',{kind:'door'}),boss=asset('boss');
  assert.throws(()=>validateScene({...blankScene(),placements:[placed(door,400,200)]},[door]),/sortie/);
  assert.throws(()=>validateScene({...blankScene(),placements:[placed(boss,400,200),placed(boss,680,400)]},[boss]),/seul boss/);
});

test('a room is playable through normal movement and shots, rewards apply once and restarting restores it',()=>{
  const f=fixture(),run=new SceneRun(f);run.start();
  assert.equal(run.player.hp,9);assert.equal(run.player.damage,30);assert.equal(run.room.enemies.length,2);
  run.claimPlacedItem(run.pickups[0]);assert.equal(run.inventory.length,0,'reward stays locked during combat');
  for(let tick=0;tick<1600&&run.room.enemies.length;tick++)run.tick(.02,{auto:true});
  assert.equal(run.room.enemies.length,0);assert.equal(run.kills,2);assert.equal(run.state,'playing');
  for(let tick=0;tick<300&&run.player.x<760;tick++)run.tick(.02,{x:1});
  assert.equal(run.inventory.length,1);assert.equal(run.player.maxHp,11);assert.equal(run.pickups.length,0);
  for(let tick=0;tick<100&&run.state==='playing';tick++)run.tick(.02,{x:1});
  assert.equal(run.state,'won');assert.equal(run.inventory.length,1);
  const again=new SceneRun(f);assert.equal(again.room.enemies.length,2);assert.equal(again.pickups.length,1);assert.equal(again.player.maxHp,9);assert.equal(again.props[0].hp,30);
});

test('multiple placed walls have independent health and collisions, and enemies obey their profiles',()=>{
  const wall=asset('wall',{width:40,height:80,health:12}),enemy=asset('enemy',{behavior:'shoot',damage:3,projectileSpeed:200,attackCooldown:3});
  const run=new SceneRun({assets:[wall,enemy],plan:{...blankScene(),placements:[placed(wall,400,320),placed(wall,400,160),placed(enemy,680,320)]}});run.start();
  run.player.x=360;run.move(run.player,300,0);assert.ok(run.player.x<380-run.player.r,'even a fast dash cannot pass through a thin wall');run.player.x=360;
  run.shoot(365,320,0,560);run.tick(.03);assert.equal(run.props.length,1);assert.equal(run.props[0].hp,12);run.move(run.player,40,0);assert.equal(run.player.x,400);
  const e=run.room.enemies[0];e.cool=0;run.tick(.01);assert.equal(e.cool,3);assert.ok(run.bullets.some(b=>b.hostile&&b.damage===3&&Math.abs(Math.hypot(b.vx,b.vy)-200)<1e-8));
  for(const behavior of ['chase','charge','patrol']){
    const a=asset('enemy',{behavior}),r=new SceneRun({assets:[a],plan:{...blankScene(),placements:[placed(a,480,320)]}});r.start();const e=r.room.enemies[0],x=e.x;
    e.cool=.4;r.tick(.02);assert.notEqual(e.x,x,behavior);
    if(behavior==='charge'){assert.ok(e.warning>0);e.cool=0;r.tick(.02);const angle=e.chargeAngle;r.player.y=120;r.tick(.02);assert.ok(e.charge>0);assert.equal(e.chargeAngle,angle);}
  }
});

test('bosses stay near their placement, respect arena bounds and do not skip the room exit objective',()=>{
  const boss=asset('boss',{pattern:'fan',damage:2}),wall=asset('wall',{width:40,height:128,destructible:false});
  const run=new SceneRun({assets:[boss,wall],plan:{...blankScene(),placements:[placed(boss,720,440),placed(wall,800,400)]}});run.start();const e=run.room.enemies[0];e.cool=0;run.tick(.02);
  assert.ok(Math.hypot(e.x-720,e.y-440)<2);assert.equal(run.bullets.filter(b=>b.hostile).length,5);
  for(let i=0;i<200;i++)run.tick(.02);assert.ok(e.x+e.r<=780,'boss cannot cross the placed wall');
  e.hp=0;run.tick(.02);assert.equal(run.state,'playing');Object.assign(run.player,sceneExit);run.tick(.02);assert.equal(run.state,'won');
});

test('renderer selects the matching pixel image for every placed type and the hero',()=>{
  const f=fixture(),run=new SceneRun(f),images=new Map(f.assets.map(a=>[a.id,{id:a.id}])),draws=[];
  const context=new Proxy({},{get(target,key){if(key in target)return target[key];if(key==='drawImage')return image=>draws.push({image,smooth:target.imageSmoothingEnabled});if(key.startsWith('create'))return ()=>({addColorStop(){}});return ()=>{};}});
  render(context,run,{complete:false},0,images);
  for(const image of images.values())assert.ok(draws.some(d=>d.image===image&&d.smooth===false),image.id);
});

test('saved rooms freeze sprites and stats across notebook edits and subsequent layout saves',async t=>{
  const directory=await temporary(t),f=fixture();let library=f.assets;
  const service=createRooms({directory,designer:{list:async()=>library},PublicError});
  const saved=await service.save({plan:f.plan});library=library.map(a=>a.id===f.enemy.id?{...a,gameplay:defaultGameplay('item')}:a);
  assert.equal((await service.read(saved.id)).assets.find(a=>a.id===f.enemy.id).gameplay.type,'enemy');
  const updated=await service.save({id:saved.id,plan:{...saved.plan,title:'Une autre disposition'}});
  assert.equal(updated.assets.find(a=>a.id===f.enemy.id).gameplay.type,'enemy');assert.equal((await service.list())[0].title,'Une autre disposition');
  await assert.rejects(service.save({id:saved.id,plan:{...saved.plan,placements:[placed({id:'missing'},400,200)]}}));assert.deepEqual(await service.read(saved.id),updated);
});

test('Ollama composition excludes rejected sprites, retries invalid paths and never saves a proposal automatically',async t=>{
  const directory=await temporary(t),f=fixture(),discarded=asset('decor');discarded.review.status='rejected';let calls=0,prompt;
  const service=createRooms({directory,designer:{list:async()=>[...f.assets,discarded]},PublicError,defaultModel:DEFAULT_MODEL,fetcher:async(_,init)=>{calls++;prompt=JSON.parse(init.body).messages[1].content;const plan=calls===1?{...f.plan,placements:[placed(f.enemy,sceneSpawn.x,sceneSpawn.y)]}:f.plan;return new Response(JSON.stringify({done:true,message:{content:JSON.stringify(plan)}}));}});
  const result=await service.generate({model:DEFAULT_MODEL,inspiration:'Une forêt'},'test-key');assert.equal(calls,2);assert.equal(result.plan.title,f.plan.title);assert.doesNotMatch(prompt,new RegExp(discarded.id));assert.match(prompt,/plan précédent est invalide/);assert.deepEqual(await service.list(),[]);
});

test('room and review APIs persist changes, enforce local authorization, and share the generation lock',async t=>{
  const dir=await temporary(t),f=fixture(),spriteDir=path.join(dir,'sprites');await mkdir(spriteDir);
  for(const a of f.assets)await writeFile(path.join(spriteDir,a.id+'.json'),JSON.stringify(a));
  let release;const pending=new Promise(resolve=>{release=resolve;});
  const cloud=createCloud({modelFetcher,secretDir:path.join(dir,'keys'),cacheDir:path.join(dir,'dungeons'),spriteDir,roomDir:path.join(dir,'rooms'),environmentKey:'test-key',fetcher:async()=>{await pending;return new Response(JSON.stringify({done:true,message:{content:JSON.stringify(f.plan)}}));}});
  const server=createServer({cloud});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,{token}=await(await fetch(origin+'/api/session')).json();
  const headers={Origin:origin,'Content-Type':'application/json','X-Nocturne-Token':token};
  const post=(route,body,h=headers)=>fetch(origin+route,{method:'POST',headers:h,body:JSON.stringify(body)});
  const savedResponse=await post('/api/rooms/save',{plan:f.plan});assert.equal(savedResponse.status,200);const saved=await savedResponse.json();
  assert.equal((await fetch(origin+'/api/rooms/'+saved.id)).status,200);
  const review={...emptyReview(),rating:4,likes:'Lisible'};assert.equal((await post('/api/designer/review',{id:f.enemy.id,review})).status,200);assert.deepEqual((await cloud.readSprite(f.enemy.id)).review,review);
  for(const [route,body]of [['/api/rooms/save',{plan:f.plan}],['/api/designer/review',{id:f.enemy.id,review}],['/api/rooms/generate',{model:DEFAULT_MODEL,inspiration:''}]])assert.equal((await post(route,body,{...headers,Origin:'https://example.com'})).status,403);
  assert.equal((await post('/api/designer/review',{id:f.enemy.id,review:{...review,rating:6}})).status,400);
  const composing=cloud.composeRoom({model:DEFAULT_MODEL,inspiration:''});
  for(let i=0;i<20&&!(await cloud.status()).busy;i++)await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(cloud.design({prompt:'Test',size:16,model:DEFAULT_MODEL}),e=>e.status===409);
  release();await composing;assert.equal((await cloud.status()).busy,false);
});
