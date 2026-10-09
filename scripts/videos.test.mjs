import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateVideoProject,exampleVideo} from '../dist/video-project.mjs';
import {createVideos} from './videos.mjs';
class PublicError extends Error{constructor(status,message){super(message);this.status=status}}
const directory=async t=>{const dir=await mkdtemp(path.join(tmpdir(),'nocturne-videos-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir};

test('video project validates the example and derives its duration',()=>{
 const project=validateVideoProject(exampleVideo);assert.equal(project.duration,17);assert.equal(project.scenes.length,4);assert.equal(project.scenes[1].nodes[2].id,'n2');
});

test('video project rejects executable or unbounded structures',()=>{
 assert.throws(()=>validateVideoProject({...exampleVideo,format:'webpage'}),/Format/);
 assert.throws(()=>validateVideoProject({...exampleVideo,scenes:exampleVideo.scenes.slice(0,2)}),/3 et 8/);
 const broken=structuredClone(exampleVideo);broken.scenes[1].links=[[0,99]];assert.throws(()=>validateVideoProject(broken),/lien invalide/);
});

test('generated storyboards are retried, saved and listed',async t=>{
 const dir=await directory(t);let calls=0;const fetcher=async()=>{calls++;const content=calls===1?'not json':JSON.stringify({...exampleVideo,title:'La lumière'});return new Response(JSON.stringify({done:true,message:{content}}))};
 const videos=createVideos({directory:dir,fetcher,PublicError});const result=await videos.generate({model:'model',subject:'La lumière',format:'vertical',audience:'élèves',tone:'simple'},'secret');
 assert.equal(calls,2);assert.equal(result.title,'La lumière');assert.equal((await videos.list())[0].id,result.id);assert.equal((await videos.read(result.id)).duration,17);
});

test('video generation rejects invalid options before contacting Ollama',async t=>{
 let called=false;const videos=createVideos({directory:await directory(t),fetcher:async()=>{called=true},PublicError});
 await assert.rejects(videos.generate({model:'m',subject:'',format:'vertical',audience:'',tone:''},'secret'),error=>error.status===400);assert.equal(called,false);
});
