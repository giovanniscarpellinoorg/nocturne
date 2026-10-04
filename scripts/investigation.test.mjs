import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {InvestigationRun,sampleInvestigation,demoStory,validateStory,validateInvestigation,cardRules} from '../dist/investigation-core.mjs';
import {createInvestigations} from './investigations.mjs';
import {createCloud,PublicError,DEFAULT_MODEL} from './cloud.mjs';
import {createServer} from './server.mjs';
import {modelFetcher} from './fixtures/model-catalog.mjs';
const fresh=seed=>new InvestigationRun(sampleInvestigation(),seed??1);
const card=(run,id)=>run.hand.find(c=>c.startsWith(id+'-'));
const play=(run,id,target)=>run.act('play',{card:card(run,id),target});
function putInHand(run,id){const found=run.deck.find(c=>c.startsWith(id+'-'));run.deck.splice(run.deck.indexOf(found),1);run.hand.push(found);return found;}
async function temp(t){const dir=await mkdtemp(path.join(tmpdir(),'nocturne-investigation-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('invalid actions cannot consume cards, resources, actions or random draws',()=>{
  const run=fresh();for(const [action,payload]of [['move',{to:'lighthouse'}],['play',{card:'invented'}],['attack',{target:'ghost'}],['resolve',{choice:'save'}],['invented',{}]]){const before=run.save();assert.equal(run.act(action,payload).ok,false);assert.deepEqual(run.save(),before);}
  run.actions=0;const before=run.save();assert.equal(run.act('draw').ok,false);assert.deepEqual(run.save(),before);
});
test('deck has twelve conserved cards, equipment persists and duplicates cannot stack',()=>{
  const run=fresh(7);assert.equal(run.hand.length,5);assert.equal(run.deck.length,7);if(!card(run,'lantern'))putInHand(run,'lantern');assert.equal(play(run,'lantern').ok,true);assert.equal(run.intellect,4);assert.equal(run.resources,1);assert.equal(run.equipment.length,1);
  if(!card(run,'lantern'))putInHand(run,'lantern');run.resources=10;const before=run.save();assert.equal(play(run,'lantern').ok,false);assert.deepEqual(run.save(),before);
  const all=[...run.hand,...run.deck,...run.discard,...run.equipment];assert.equal(new Set(all).size,12);assert.equal(all.length,12);
});
test('investigation cards respect the location clue count and hostile enemies must be handled',()=>{
  const run=fresh(2);if(!card(run,'notes'))putInHand(run,'notes');run.chaos=[2];assert.equal(play(run,'notes').ok,true);assert.equal(run.clues,1);assert.equal(run.remaining.station,0);assert.equal(run.act('investigate').ok,false);
  assert.equal(run.act('move',{to:'archives'}).ok,true);assert.equal(run.here.length,1);assert.equal(run.act('investigate').ok,false);
  run.chaos=[2];assert.equal(run.act('evade',{target:run.here[0].id}).ok,true);assert.equal(run.here[0].exhausted,true);
  run.actions=1;run.chaos=[2];assert.equal(run.act('investigate').ok,true);assert.equal(run.clues,2);
});
test('enemies attack only in the current place, evasion lasts one round, and departure causes opportunity damage',()=>{
  const run=fresh();run.act('move',{to:'archives'});const e=run.here[0];run.chaos=[2];run.act('evade',{target:e.id});run.encounters=['calm'];const health=run.health;run.act('end');assert.equal(run.health,health);assert.equal(e.exhausted,false);assert.equal(run.round,2);assert.equal(run.actions,3);assert.equal(run.doom,1);
  run.act('move',{to:'station'});assert.equal(run.health,health-1);run.encounters=['calm'];run.act('end');assert.equal(run.health,health-1,'enemies in other locations do not attack');
});
test('recycling costs sanity, the hand limit discards overflow, and terminal states stop actions',()=>{
  const run=fresh();run.discard.push(...run.deck.splice(0));run.draw();assert.equal(run.sanity,6);while(run.hand.length<8)run.draw();const size=run.hand.length;run.draw();assert.equal(run.hand.length,size);assert.ok(run.discard.length);
  run.health=1;run.spawn('watcher');run.endRound();assert.equal(run.state,'lost');assert.equal(run.act('end').ok,false);
  const doomed=fresh();doomed.doom=13;doomed.endRound();assert.equal(doomed.state,'lost');assert.equal(doomed.doom,14);
});
test('saving and restoring preserves random outcomes and rejects corrupted card piles',()=>{
  const run=fresh(128);run.act('investigate');run.act('move',{to:'archives'});const restored=InvestigationRun.restore(JSON.parse(JSON.stringify(run.save())));
  const enemy=run.here[0].id;run.act('attack',{target:enemy});restored.act('attack',{target:enemy});assert.deepEqual(restored.save(),run.save());
  const broken=run.save();broken.hand.push(broken.hand[0]);assert.throws(()=>InvestigationRun.restore(broken));const wrong=fresh().save();wrong.clues=8;assert.throws(()=>InvestigationRun.restore(wrong));
});
function playAdventure(seed,ending){
  const run=fresh(seed);let steps=0;
  while(run.state==='playing'&&steps++<200){
    if(!run.actions){run.act('end');continue;}
    let action,payload={};
    if(run.sanity<=3){if(card(run,'breath')){action='play';payload={card:card(run,'breath')};}else action='rest';}
    else if(run.health<=4&&card(run,'bandage')&&run.resources){action='play';payload={card:card(run,'bandage')};}
    else if(run.here.length){const e=run.here[0];if(card(run,'blade')&&run.resources){action='play';payload={card:card(run,'blade'),target:e.id};}else{action='attack';payload={target:e.id};}}
    else if(run.location==='lighthouse'){
      if(ending==='save'&&run.resources<3){action=card(run,'supplies')?'play':'resource';payload={card:card(run,'supplies')};}else{action='resolve';payload={choice:ending};}
    }else if(!run.equipment.length&&card(run,'lantern')&&run.resources>=2){action='play';payload={card:card(run,'lantern')};}
    else if(run.clues>=6){action='move';payload={to:run.location==='station'?'quay':'lighthouse'};}
    else if(run.remaining[run.location]){if(card(run,'notes')&&run.resources){action='play';payload={card:card(run,'notes')};}else action='investigate';}
    else{action='move';payload={to:run.location==='station'?(run.remaining.archives?'archives':'quay'):'station'};}
    const result=run.act(action,payload);assert.equal(result.ok,true,result.error);
    assert.doesNotThrow(()=>InvestigationRun.restore(run.save()));
  }
  return run;
}
test('the complete four-location adventure can reach both endings through normal legal actions',()=>{
  for(const ending of ['seal','save']){const run=playAdventure(1,ending);assert.equal(run.state,'won',run.log.join('\n'));assert.equal(run.ending,ending);assert.equal(run.visited.length,4);assert.ok(run.clues>=6);assert.equal(run.location,'lighthouse');assert.equal(run.here.length,0);assert.equal(run.act('resolve',{choice:ending}).ok,false);}
});
test('story validation retains fixed rule identities and discards model-provided executable or statistical fields',()=>{
  const story=structuredClone(demoStory);story.cards[0].effect='win';story.cards[0].cost=-99;story.health=999;const checked=validateStory(story);assert.equal(checked.cards[0].effect,undefined);assert.equal(checked.health,undefined);assert.equal(cardRules.lantern.cost,2);
  story.locations[0].id='new-location';assert.throws(()=>validateStory(story));assert.throws(()=>validateInvestigation({...sampleInvestigation(),art:{'unknown':{}}}));
});
test('illustrations are snapshots from the sprite workshop, with serialized assignment preserving other cards',async t=>{
  const directory=await temp(t),sprite={name:'Lanterne',description:'Dessin',width:16,height:16,pixels:[{x:1,y:2,rgba:'#AABBCCFF'}]},service=createInvestigations({directory,designer:{read:async()=>({sprite})},PublicError});
  await Promise.all([service.assignArt({id:'sample',key:'card.lantern',spriteId:'fake'}),service.assignArt({id:'sample',key:'location.station',spriteId:'fake'})]);sprite.name='Modifié';const result=await service.read('sample');assert.equal(result.art['card.lantern'].name,'Lanterne');assert.equal(Object.keys(result.art).length,2);assert.equal((await service.list())[0].illustrations,2);assert.deepEqual(result.story,demoStory);
  await assert.rejects(service.assignArt({id:'../keys',key:'card.lantern',spriteId:'fake'}),e=>e.status===400);
});
test('story generation shares the cloud lock, validates and persists, and API mutations require local authorization',async t=>{
  const dir=await temp(t);let release,calls=0;const waiting=new Promise(r=>release=r);
  const cloud=createCloud({secretDir:path.join(dir,'keys'),cacheDir:path.join(dir,'dungeons'),spriteDir:path.join(dir,'sprites'),modelFetcher,environmentKey:'test-key',fetcher:async()=>{await waiting;return new Response(JSON.stringify({done:true,message:{content:JSON.stringify(++calls===1?{...demoStory,cards:[]}:demoStory)}}));}});
  const server=createServer({cloud});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`,session=await(await fetch(base+'/api/session')).json(),headers={Origin:base,'Content-Type':'application/json','X-Nocturne-Token':session.token};
  assert.match(await(await fetch(base+'/')).text(),/refuge.mjs/);assert.match(await(await fetch(base+'/enquete.html')).text(),/enquete.mjs/);assert.match(await(await fetch(base+'/?level=test')).text(),/game.mjs/);assert.match(await(await fetch(base+'/index.html')).text(),/game.mjs/);
  assert.equal((await fetch(base+'/api/investigations/generate',{method:'POST',headers:{...headers,Origin:'https://example.com'},body:JSON.stringify({model:DEFAULT_MODEL,inspiration:''})})).status,403);
  const pending=cloud.createInvestigation({model:DEFAULT_MODEL,inspiration:'Une gare'});for(let i=0;i<20&&!(await cloud.status()).busy;i++)await new Promise(r=>setImmediate(r));await assert.rejects(cloud.design({model:DEFAULT_MODEL,prompt:'test',size:16}),e=>e.status===409);release();const record=await pending;
  assert.equal(calls,2);assert.equal((await cloud.readInvestigation(record.id)).story.title,demoStory.title);assert.equal((await cloud.listInvestigations()).length,2);assert.equal((await fetch(base+'/api/investigations/'+record.id)).status,200);
});
