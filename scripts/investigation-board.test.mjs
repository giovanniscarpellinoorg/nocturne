import test from 'node:test';
import assert from 'node:assert/strict';
import {InvestigationRun,sampleInvestigation,locationRules} from '../dist/investigation-core.mjs';
import {boardState,boardLayout,boardCard,boardSize,fitBoard} from '../dist/investigation-board.mjs';

test('tabletop draws exactly the movement graph, once per bidirectional connection',()=>{
 const run=new InvestigationRun(sampleInvestigation(),1),before=run.save(),board=boardState(run);
 const expected=new Set(Object.entries(locationRules).flatMap(([from,rule])=>rule.links.map(to=>[from,to].sort().join(':'))));
 assert.equal(board.edges.length,expected.size);
 assert.deepEqual(new Set(board.edges.map(e=>[e.from,e.to].sort().join(':'))),expected);
 assert.deepEqual(run.save(),before);
 assert.equal(board.places.filter(p=>p.current).length,1);
 for(const edge of board.edges){assert.ok(edge.x2>edge.x1);assert.ok(edge.y1>=0&&edge.y2<=boardSize.height);}
 for(const p of Object.values(boardLayout)){assert.ok(p.x>=0&&p.x+boardCard.width<=boardSize.width);assert.ok(p.y>=0&&p.y+boardCard.height<=boardSize.height);}
});

test('the whole board fits both the width and remaining viewport height without losing a location',()=>{
 for(const [width,height]of [[900,340],[1360,540],[640,290],[340,240],[1920,700],[0,0]]){
  const fit=fitBoard(width,height);
  assert.ok(fit.width<=width+1e-9&&fit.height<=height+1e-9);
  assert.equal(fit.width,boardSize.width*fit.scale);
  assert.equal(fit.height,boardSize.height*fit.scale);
  for(const p of Object.values(boardLayout)){
   assert.ok((p.x+boardCard.width)*fit.scale<=width+1e-9);
   assert.ok((p.y+boardCard.height)*fit.scale<=height+1e-9);
  }
 }
});

test('pawn, destination controls, locked routes and distant enemies follow saved gameplay',()=>{
 const run=new InvestigationRun(sampleInvestigation(),1);
 assert.deepEqual(boardState(run).places.filter(p=>p.adjacent&&!p.reason).map(p=>p.id).sort(),['archives','quay']);
 assert.equal(boardState(run).edges.filter(e=>e.locked).length,2);
 assert.ok(run.act('move',{to:'archives'}).ok);
 let board=boardState(run);assert.equal(board.places.find(p=>p.current).id,'archives');assert.ok(board.places.find(p=>p.id==='lighthouse').reason);
 const enemy=run.here[0];assert.ok(enemy);assert.equal(board.places.find(p=>p.current).enemies[0].id,enemy.id);
 run.clues=6;board=boardState(run);assert.equal(board.edges.filter(e=>e.locked).length,0);assert.equal(board.places.find(p=>p.id==='lighthouse').reason,null);
 run.actions=0;assert.ok(boardState(run).places.filter(p=>p.adjacent).every(p=>p.reason));
 run.actions=1;assert.ok(run.act('move',{to:'station'}).ok);board=boardState(run);
 assert.equal(board.places.find(p=>p.current).enemies.length,0);assert.ok(board.places.find(p=>p.id==='archives').enemies.some(e=>e.id===enemy.id));
 // Restore uses a valid clue total so this covers the real save contract too.
 run.clues=0;const restored=InvestigationRun.restore(run.save());assert.deepEqual(boardState(restored),boardState(run));
});
