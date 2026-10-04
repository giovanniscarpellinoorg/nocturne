import test from 'node:test';
import assert from 'node:assert/strict';
import {InvestigationRun,sampleInvestigation,artBrief} from '../dist/investigation-core.mjs';
import {sceneState,visibleBounds} from '../dist/investigation-scene.mjs';

test('scene occupants and exits follow actual gameplay without changing the save',()=>{
  const run=new InvestigationRun(sampleInvestigation(),1);
  run.spawn('watcher','archives');run.spawn('drowned','quay');
  const before=run.save(),initial=sceneState(run);
  assert.deepEqual(run.save(),before);
  assert.equal(initial.location.id,'station');assert.equal(initial.enemies.length,0);
  assert.deepEqual(initial.exits.map(e=>e.to),['archives','quay']);
  assert.equal(run.act('move',{to:'archives'}).ok,true);
  const scene=sceneState(run);
  assert.ok(scene.enemies.length>0);assert.ok(scene.enemies.every(e=>e.location==='archives'));
  assert.ok(scene.exits.find(e=>e.to==='lighthouse').reason);
  run.clues=6;assert.equal(sceneState(run).exits.find(e=>e.to==='lighthouse').reason,null);
  run.actions=0;assert.ok(sceneState(run).exits.every(e=>e.reason));
  run.here[0].health=1;run.here[0].exhausted=true;
  assert.equal(sceneState(run).enemies[0].health,1);assert.equal(sceneState(run).enemies[0].exhausted,true);
});

test('actor bounds ignore transparent margins and artwork briefs distinguish scenery from actors',()=>{
  const sprite={pixels:[{x:0,y:0,rgba:'#00000000'},{x:8,y:10,rgba:'#102030FF'},{x:12,y:24,rgba:'#10203080'}]};
  assert.deepEqual(visibleBounds(sprite),{x:8,y:10,width:5,height:15});
  const story=sampleInvestigation().story;
  assert.match(artBrief(story,'location.station'),/fond opaque/);
  assert.match(artBrief(story,'investigator'),/tête aux pieds/);
  assert.match(artBrief(story,'enemy.watcher'),/Fond entièrement transparent/);
});
