import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {emptyReview, validateReview, filterSprites, groupSpriteFamilies, feedbackContext} from '../dist/sprite-review.mjs';
import {defaultGameplay} from '../dist/assets.mjs';
import {createDesigner, validateDesignOptions} from './designer.mjs';
import {DEFAULT_MODEL, MODELS, PublicError} from './cloud.mjs';

const sprite={name:'Gardien végétal',description:'Une silhouette feuillue.',width:16,height:16,pixels:[{x:8,y:8,rgba:'#80AA90FF'}]};
const review={rating:5,status:'approved',likes:'Contour bien lisible',dislikes:'Éclaircir les yeux',tags:['forêt']};
const entry=(id,changes={})=>({id,createdAt:'2026-10-02T12:00:00Z',model:DEFAULT_MODEL,sprite,gameplay:defaultGameplay('enemy'),review:emptyReview(),...changes});
async function setup(t){
  const directory=await mkdtemp(path.join(tmpdir(),'nocturne-reviews-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const prompts=[];let next;
  const service=createDesigner({directory,PublicError,defaultModel:DEFAULT_MODEL,fetcher:async(_,init)=>{
    prompts.push(JSON.parse(init.body).messages[1].content);
    return new Response(JSON.stringify({done:true,message:{content:JSON.stringify(next??{...sprite,gameplay:defaultGameplay('enemy')})}}));
  }});
  const draw=extra=>service.generate(validateDesignOptions({prompt:'Un gardien',size:16,model:DEFAULT_MODEL,assetType:'enemy',...extra},MODELS),'test-key');
  return {directory,service,draw,prompts,reply:value=>{next=value;}};
}

test('reviews validate bounded ratings, statuses and comments, and normalize tags',()=>{
  assert.deepEqual(validateReview({...review,tags:[' Forêt ','FORÊT']}),review);
  for(const change of [{rating:6},{rating:2.5},{status:'__proto__'},{likes:'x'.repeat(801)},{dislikes:'a\u0000b'},{tags:Array(9).fill('a')},{tags:['x'.repeat(25)]},{unknown:true}])assert.throws(()=>validateReview({...review,...change}));
});

test('notebook filters combine accent-insensitive text, rating, type, status, size, model and family',()=>{
  const records=[entry('root',{review}),entry('variant',{rootId:'root',parentId:'root',review:{...review,rating:4}}),entry('discard',{review:{...review,status:'rejected'}}),entry('other',{gameplay:defaultGameplay('item')})];
  const filters={query:'vegetal',type:'enemy',status:'approved',rating:'4',size:'16',model:DEFAULT_MODEL,family:'root',sort:'rating'};
  assert.deepEqual(filterSprites(records,filters).map(r=>r.id),['root','variant']);
  assert.equal(filterSprites(records,{...filters,query:'foret'}).length,2);
  assert.equal(filterSprites(records,{...filters,size:'64'}).length,0);
  assert.equal(filterSprites(records,{status:'rejected'})[0].id,'discard');
  const selected=feedbackContext(records,'enemy',records[1]);assert.ok(selected.some(r=>r.id==='discard'));assert.ok(!selected.some(r=>r.id==='other'));assert.equal(new Set(selected.map(r=>r.id)).size,selected.length);
});

test('family stacks collect nested variants without merging unrelated sprites with identical names', () => {
  const records = [entry('root'), entry('child', {rootId: 'root', parentId: 'root'}), entry('grandchild', {rootId: 'root', parentId: 'child'}), entry('unrelated')];
  const before = structuredClone(records);
  const groups = groupSpriteFamilies(records);
  assert.deepEqual(groups.map(group => [group.rootId, group.total, group.members.map(r => r.id)]), [
    ['root', 3, ['root', 'child', 'grandchild']], ['unrelated', 1, ['unrelated']],
  ]);
  assert.deepEqual(records, before);
});

test('stacks keep matching variants when originals are filtered out and retain the full family count', () => {
  const records = [entry('root', {review: {...review, status: 'rejected'}}), entry('child', {rootId: 'root', parentId: 'root', review}), entry('draft', {rootId: 'root', parentId: 'child'})];
  const groups = groupSpriteFamilies(records, {status: 'approved', query: 'vegetal', family: 'root'});
  assert.equal(groups.length, 1); assert.equal(groups[0].total, 3);
  assert.deepEqual(groups[0].members.map(r => r.id), ['child']);
  assert.deepEqual(groupSpriteFamilies(records, {status: 'approved', query: 'absent'}), []);
  assert.equal(groupSpriteFamilies([records[1]])[0].rootId, 'root');
});

test('family stacks follow the current sort and choose their first matching version as cover', () => {
  const records = [entry('root', {review: {...review, rating: 1}}), entry('other', {review: {...review, rating: 4}}), entry('child', {rootId: 'root', parentId: 'root', review})];
  const groups = groupSpriteFamilies(records, {sort: 'rating'});
  assert.deepEqual(groups.map(g => g.rootId), ['root', 'other']);
  assert.deepEqual(groups[0].members.map(r => r.id), ['child', 'root']);
});

test('concurrent review and profile writes preserve both metadata fields and the original pixels',async t=>{
  const {service,draw}=await setup(t),{record}=await draw();
  const gameplay=defaultGameplay('item');
  await Promise.all([service.updateReview({id:record.id,review}),service.updateGameplay({id:record.id,gameplay})]);
  const saved=await service.read(record.id);assert.deepEqual(saved.review,review);assert.deepEqual(saved.gameplay,gameplay);assert.deepEqual(saved.sprite,record.sprite);
});

test('variants transmit feedback, preserve originals, reset their rating and retain family lineage',async t=>{
  const {service,draw,directory,prompts}=await setup(t),{record}=await draw();
  await service.updateReview({id:record.id,review});
  const original=await readFile(path.join(directory,record.id+'.json'),'utf8');
  const {record:variant}=await draw({referenceId:record.id,variant:true});
  assert.notEqual(variant.id,record.id);assert.equal(variant.parentId,record.id);assert.equal(variant.rootId,record.id);assert.deepEqual(variant.review,emptyReview());
  assert.match(prompts.at(-1),/Contour bien lisible/);assert.match(prompts.at(-1),/Éclaircir les yeux/);
  assert.equal(await readFile(path.join(directory,record.id+'.json'),'utf8'),original);
  const {record:child}=await draw({referenceId:variant.id,variant:true});assert.equal(child.parentId,variant.id);assert.equal(child.rootId,record.id);
  await draw({referenceId:record.id,useFeedback:false});assert.doesNotMatch(prompts.at(-1),/Contour bien lisible|Éclaircir les yeux/);
  assert.throws(()=>validateDesignOptions({prompt:'test',size:16,model:DEFAULT_MODEL,variant:true},MODELS));
});

test('rejected and low-rated sprites cannot be automatically reused',async t=>{
  const {service,draw,reply}=await setup(t),{record}=await draw();reply({reuseId:record.id});
  for(const change of [{status:'rejected',rating:5},{status:'draft',rating:2}]){
    await service.updateReview({id:record.id,review:{...review,...change}});
    await assert.rejects(draw({allowReuse:true}),/Réutilisation non autorisée/);
  }
  await service.updateReview({id:record.id,review});assert.equal((await draw({allowReuse:true})).reused,true);
});
