import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {rasterizeCommands} from '../dist/drawing-tools.mjs';
import {normalizeSprite,validateSprite} from '../dist/pixels.mjs';
import {createDesigner} from './designer.mjs';
import {PublicError,DEFAULT_MODEL} from './cloud.mjs';

const commands=[
 {outil:'rectangle',x:-4,y:-2,largeur:72,hauteur:68,couleur:'#102030'},
 {outil:'ellipse',x:-8,y:38,largeur:80,hauteur:40,couleur:'#0E2A3A'},
 {outil:'ligne',de:[-10,20],vers:[70,58],couleur:'#FFEEDD'},
 {outil:'polygone',points:[[-9,10],[30,-8],[72,30],[30,70]],couleur:'#ABCDFF80'},
 {outil:'ellipse',x:55,y:50,largeur:22,hauteur:25,couleur:'#00000000'},
 {outil:'pixel',x:64,y:64,couleur:'#FFFFFF'},
];
const meta={name:'Illustration',description:'Formes aux bords.',width:64,height:64};

test('clipping matches cropping a larger canvas for every tool, without distorting shapes or erasers',()=>{
 const input=structuredClone(commands),shift=p=>[p[0]+64,p[1]+64];
 const translated=commands.map(c=>({...c,...('x' in c?{x:c.x+64,y:c.y+64}:{}),...(c.de?{de:shift(c.de),vers:shift(c.vers)}:{}),...(c.points?{points:c.points.map(shift)}:{})}));
 const expected=rasterizeCommands(translated,192,192).pixels.filter(p=>p.x>=64&&p.x<128&&p.y>=64&&p.y<128).map(p=>({...p,x:p.x-64,y:p.y-64}));
 const clipped=rasterizeCommands(commands,64,64,{clip:true});
 assert.deepEqual(clipped.pixels,expected);assert.deepEqual(commands,input);
 assert.equal(clipped.stats.clipping.count,6);assert.ok(clipped.stats.clipping.discardedPixels>0);
 assert.throws(()=>rasterizeCommands(commands,64,64),/hors/);
 const result=normalizeSprite({...meta,commands},64,{clipCommands:true});
 assert.equal(result.drawing.clip,true);
 assert.deepEqual(validateSprite({...meta,...result.drawing}),result.sprite);
 assert.deepEqual(validateSprite(result.sprite),result.sprite);
});

test('clipping rejects malformed, extreme or entirely invisible drawings',()=>{
 for(const change of [{x:1e9},{x:-65},{x:.5},{largeur:1e9},{hauteur:0},{couleur:'red'},{outil:'code'}])assert.throws(()=>rasterizeCommands([{...commands[0],...change}],64,64,{clip:true}));
 assert.throws(()=>normalizeSprite({...meta,commands:[commands.at(-1)]},64,{clipCommands:true}),/pixels/);
 const valid={...commands[0],x:2,y:3,largeur:4,hauteur:5};
 assert.deepEqual(rasterizeCommands([valid],64,64,{clip:true}),rasterizeCommands([valid],64,64));
});

test('card generation with the reported ellipse saves and reloads on the first response',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'nocturne-clipping-'));t.after(()=>rm(directory,{recursive:true,force:true}));let calls=0;
 const designer=createDesigner({directory,PublicError,defaultModel:DEFAULT_MODEL,fetcher:async()=>{calls++;return new Response(JSON.stringify({done:true,message:{content:JSON.stringify({...meta,commands})}}));}});
 const result=await designer.generate({prompt:'Illustration de carte',model:DEFAULT_MODEL,size:64,method:'tools',assetType:'art'},'fake-test-key');
 assert.equal(calls,1);assert.equal(result.record.drawing.clip,true);assert.equal(result.diagnostics.clipping.count,6);
 assert.deepEqual((await designer.read(result.record.id)).sprite,result.record.sprite);
 const log=await designer.readLog(result.diagnosticId);assert.ok(log.events.some(e=>e.stage==='commands_clipped'));assert.equal(log.status,'success');
});
