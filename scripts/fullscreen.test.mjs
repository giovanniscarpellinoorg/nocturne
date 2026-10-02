import test from 'node:test';
import assert from 'node:assert/strict';
import {setupFullscreen,fitArena} from '../dist/fullscreen.mjs';

function element(){const e=new EventTarget();e.style={};e.classes=new Set();e.classList={toggle:(c,value)=>value?e.classes.add(c):e.classes.delete(c),remove:c=>e.classes.delete(c)};e.attributes={};e.setAttribute=(k,v)=>e.attributes[k]=v;e.focus=()=>{};return e;}
function fixture(native=true){
  const doc=new EventTarget(),win=new EventTarget(),surface=element(),space={clientWidth:1800,clientHeight:800},viewport=element(),button=element(),canvas=element();let exits=0,errors=[];
  doc.body=element();doc.fullscreenEnabled=native;doc.fullscreenElement=null;
  surface.requestFullscreen=async()=>{doc.fullscreenElement=surface;doc.dispatchEvent(new Event('fullscreenchange'));};
  doc.exitFullscreen=async()=>{doc.fullscreenElement=null;doc.dispatchEvent(new Event('fullscreenchange'));};
  const controller=setupFullscreen({doc,win,surface,space,viewport,button,canvas,onExit:()=>exits++,onError:message=>errors.push(message)});
  return {doc,win,surface,space,viewport,button,controller,exits:()=>exits,errors};
}
test('fullscreen preserves arena aspect ratio in wide and tall viewports',()=>{
  assert.deepEqual(fitArena(1920,900),{width:1440,height:900});assert.deepEqual(fitArena(800,1200),{width:800,height:500});
});
test('native fullscreen updates controls, resizes and pauses on exit without recreating the game',async()=>{
  const f=fixture();await f.controller.toggle();assert.equal(f.controller.active(),true);assert.equal(f.button.attributes['aria-pressed'],'true');assert.equal(f.viewport.style.width,'1280px');
  f.space.clientHeight=500;f.win.dispatchEvent(new Event('resize'));assert.equal(f.viewport.style.height,'500px');
  await f.controller.toggle();assert.equal(f.controller.active(),false);assert.equal(f.exits(),1);assert.equal(f.viewport.style.width,'');assert.equal(f.button.disabled,false);f.controller.destroy();
});
test('denied fullscreen leaves normal play usable; unsupported browsers can exit expanded mode with Escape',async()=>{
  const denied=fixture();denied.surface.requestFullscreen=async()=>{throw Error('denied');};await denied.controller.toggle();assert.equal(denied.controller.active(),false);assert.equal(denied.button.disabled,false);assert.equal(denied.errors.length,1);denied.controller.destroy();
  const fallback=fixture(false);await fallback.controller.toggle();assert.equal(fallback.surface.classes.has('is-expanded'),true);assert.equal(fallback.errors.length,1);
  const escape=new Event('keydown',{cancelable:true});Object.defineProperty(escape,'key',{value:'Escape'});fallback.win.dispatchEvent(escape);assert.equal(fallback.controller.active(),false);assert.equal(fallback.exits(),1);assert.equal(fallback.doc.body.classes.has('game-expanded'),false);fallback.controller.destroy();
});
