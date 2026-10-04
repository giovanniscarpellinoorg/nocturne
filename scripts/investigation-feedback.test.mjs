import test from 'node:test';
import assert from 'node:assert/strict';
import {InvestigationRun,sampleInvestigation} from '../dist/investigation-core.mjs';
import {actionFeedback} from '../dist/investigation-feedback.mjs';
const fresh=()=>new InvestigationRun(sampleInvestigation(),7);
function resolve(run,action,payload={}){const before=run.save();assert.equal(run.act(action,payload).ok,true);const after=run.save(),feedback=actionFeedback(before,run,action,payload);assert.deepEqual(run.save(),after,'feedback must never mutate the run or draw another token');return feedback;}

test('test feedback shows the exact drawn token, equation, spent action and real clues',()=>{
 const run=fresh();run.chaos=[2,-2];const failed=resolve(run,'investigate');
 assert.deepEqual(failed.test,{label:'Enquête',skill:3,token:-2,difficulty:2,success:false,total:1});
 assert.equal(failed.modal,true);assert.ok(failed.events.includes('Aucun indice découvert.'));assert.equal(failed.changes.length,0);assert.match(failed.cost,/1 action/);
 const success=resolve(run,'investigate');assert.equal(success.test.token,2);assert.equal(success.test.total,5);assert.ok(success.changes.some(c=>c.target==='clues'&&c.label==='+1 indice(s)'));
 assert.equal(run.chaos.length,0);assert.equal(run.actions,1);
});
test('card tests retain their bonus, target, cost and damage',()=>{
 const run=fresh();run.act('move',{to:'archives'});run.chaos=[0];
 let card=run.hand.find(c=>c.startsWith('blade'));if(!card){card=run.deck.find(c=>c.startsWith('blade'));run.deck.splice(run.deck.indexOf(card),1);run.hand.push(card);}
 const target=run.here[0].id,feedback=resolve(run,'play',{card,target});
 assert.equal(feedback.test.skill,5);assert.equal(feedback.test.total,5);assert.match(feedback.context,/veilleur/);assert.match(feedback.cost,/1 ressource/);assert.ok(feedback.events.some(e=>e.includes('2 dégât(s)')));assert.ok(feedback.events.some(e=>e.includes('vaincu')));
});
test('draw feedback identifies the new card, and never calls a full hand a successful draw',()=>{
 const run=fresh(),next=run.deck.at(-1),feedback=resolve(run,'draw');assert.deepEqual(feedback.drawn,[{key:'card.'+next.slice(0,-2),name:run.name('cards',next.slice(0,-2))}]);assert.equal(feedback.modal,true);
 while(run.hand.length<8)run.draw();const full=resolve(run,'draw');assert.deepEqual(full.drawn,[]);assert.equal(full.artKey,null);assert.ok(full.events.some(e=>e.includes('Main pleine')));
});
test('capped journals keep movement consequences and equipment gets explicit feedback',()=>{
 const run=fresh();for(let i=0;i<65;i++)run.note('Ancien événement '+i);
 const moved=resolve(run,'move',{to:'archives'});assert.ok(moved.events.some(e=>e.includes('apparaît')));assert.ok(moved.events.some(e=>e.includes('rejoins')));assert.ok(moved.events.every(e=>!e.startsWith('Ancien événement')));
 let card=run.hand.find(c=>c.startsWith('lantern'));if(!card){card=run.deck.find(c=>c.startsWith('lantern'));run.deck.splice(run.deck.indexOf(card),1);run.hand.push(card);}
 const equipped=resolve(run,'play',{card});assert.equal(equipped.equipped,true);assert.ok(equipped.events.some(e=>e.includes('Équipement placé')));assert.ok(equipped.changes.some(e=>e.label==='−2 ressource(s)'));
});
test('end of round describes attacks, encounter, new hand and actual net counters',()=>{
 const run=fresh();run.act('move',{to:'archives'});run.encounters=['whisper'];const feedback=resolve(run,'end');
 assert.equal(feedback.modal,true);assert.equal(feedback.test,null);assert.equal(feedback.round,2);assert.equal(feedback.drawn.length,1);
 assert.ok(feedback.events.some(e=>e.includes('attaque')));assert.ok(feedback.events.some(e=>e.includes('Murmures')));
 for(const target of ['life','sanity','doom-count','resources'])assert.ok(feedback.changes.some(c=>c.target===target));
 const fatal=fresh();fatal.doom=13;const ended=resolve(fatal,'end');assert.equal(ended.outcome,'lost');assert.deepEqual(ended.drawn,[]);
});
