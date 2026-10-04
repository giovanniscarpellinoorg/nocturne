import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSceneLayout} from './scene-layout.mjs';
import {validateScene,blankScene} from '../dist/scene.mjs';
import {defaultGameplay} from '../dist/assets.mjs';

const asset=(id,type,stats={})=>({id,sprite:{name:id,description:'Test',width:16,height:16,pixels:[{x:1,y:1,rgba:'#AABBCCFF'}]},gameplay:{type,stats:{...defaultGameplay(type).stats,...stats}}});
const at=(id,assetId,x,y)=>({id,assetId,x,y});
test('AI placements near exits are moved without losing instances and valid layouts remain identical',()=>{
  const assets=[asset('item','item'),asset('wall','wall',{width:96,height:80})],input={...blankScene(),placements:[at('wall','wall',760,320),at('reward','item',840,320)]},before=structuredClone(input);
  assert.throws(()=>validateScene(input,assets),/sortie/);
  const {scene,adjustments}=prepareSceneLayout(input,assets);assert.equal(adjustments.length,2);assert.equal(scene.plan.placements.length,2);assert.deepEqual(input,before);
  assert.deepEqual(prepareSceneLayout(scene.plan,assets),{scene,adjustments:[]});
});
test('full wall barriers are reopened while every target and the exit remain reachable with walls intact',()=>{
  const assets=[asset('wall','wall',{width:40,height:120}),asset('enemy','enemy')],input={...blankScene(),placements:[...Array.from({length:4},(_,i)=>at('w'+i,'wall',480,120+i*120)),at('enemy','enemy',720,320)]};
  assert.throws(()=>validateScene(input,assets),/bloque/);
  const result=prepareSceneLayout(input,assets);assert.equal(result.scene.plan.placements.length,5);assert.ok(result.adjustments.length);assert.doesNotThrow(()=>validateScene(result.scene.plan,assets));
});
test('overlap and grid errors are repaired deterministically while preserving identity and asset assignments',()=>{
  const assets=[asset('enemy','enemy'),asset('item','item')],input={...blankScene(),placements:[at('a','enemy',-50,70.5),at('b','enemy',400,320),at('c','item',400,320)]};
  const first=prepareSceneLayout(input,assets),again=prepareSceneLayout(input,assets);assert.deepEqual(first,again);assert.equal(first.scene.plan.placements.length,3);assert.equal(first.adjustments.length,2);
  assert.deepEqual(first.scene.plan.placements.map(p=>[p.id,p.assetId]),input.placements.map(p=>[p.id,p.assetId]));
});
test('layout repair rejects unknown assets, duplicate identities and unsupported roles instead of removing them',()=>{
  const assets=[asset('hero','character'),asset('door','decor',{kind:'door'}),asset('boss','boss')];
  for(const placements of [[at('x','missing',400,320)],[at('x','hero',400,320)],[at('x','door',400,320)],[at('x','boss',400,320),at('x','boss',600,320)],[at('x','boss',400,320),at('y','boss',600,320)],[at('x','boss',NaN,320)]])assert.throws(()=>prepareSceneLayout({...blankScene(),placements},assets));
});
