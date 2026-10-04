import {locationRules} from './investigation-core.mjs';

// Positions use a fixed tabletop coordinate system; connections always come
// from the same graph that validates movement in the game engine.
export const boardSize={width:1000,height:540};
export const boardLayout={station:{x:10,y:160},archives:{x:380,y:10},quay:{x:380,y:310},lighthouse:{x:750,y:160}};
export const boardCard={width:240,height:220};
// Fit the whole graph, including its cards, in the space left by the hand/HUD.
export function fitBoard(width,height){
 const scale=Math.max(0,Math.min(width/boardSize.width,height/boardSize.height));
 return {scale,width:boardSize.width*scale,height:boardSize.height*scale};
}
export function boardState(run){
 const places=run.record.story.locations.map(place=>({
  ...place,...boardLayout[place.id],current:place.id===run.location,
  adjacent:locationRules[run.location].links.includes(place.id),
  locked:place.id==='lighthouse'&&run.clues<6,
  visited:run.visited.includes(place.id),clues:run.remaining[place.id],difficulty:locationRules[place.id].difficulty,
  reason:place.id===run.location?null:run.reason('move',{to:place.id}),
  enemies:run.enemies.filter(e=>e.location===place.id).map(e=>({...e,name:run.name('enemies',e.type)})),
  connections:locationRules[place.id].links.map(id=>run.name('locations',id)),
 }));
 const edges=[];
 for(const place of places)for(const otherId of locationRules[place.id].links){
  if(edges.some(e=>e.from===otherId&&e.to===place.id))continue;
  const other=places.find(p=>p.id===otherId),left=place.x<other.x?place:other,right=left===place?other:place;
  edges.push({from:place.id,to:other.id,label:`${place.name} ↔ ${other.name}`,locked:place.locked||other.locked,adjacent:place.current||other.current,
   x1:left.x+boardCard.width,y1:left.y+boardCard.height/2,x2:right.x,y2:right.y+boardCard.height/2});
 }
 return {places,edges};
}
