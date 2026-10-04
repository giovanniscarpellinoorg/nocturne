import {validateScene} from './scene.mjs';
import {SceneRun} from './scene-run.mjs';
import {GameAnimations} from './game-animations.mjs';

export function validateLevel(value){
  if(!value||value.version!==1||typeof value.title!=='string'||!value.title.trim()||value.title.length>80||!Array.isArray(value.rooms)||value.rooms.length<2||value.rooms.length>5)throw Error('Niveau invalide');
  const rooms=value.rooms.map(room=>({...room,...validateScene(room.plan,room.assets)}));
  if(!rooms[0].plan.heroId||rooms.some(r=>r.plan.heroId!==rooms[0].plan.heroId))throw Error('Le niveau doit conserver le même héros');
  if(!rooms.at(-1).assets.some(a=>a.gameplay.type==='boss'))throw Error('Le niveau doit se terminer par un boss');
  return {...value,rooms};
}

// The same player and inventory travel through each saved room in order.
export class LevelRun extends SceneRun {
  constructor(value,onEvent=()=>{}){
    const level=validateLevel(value);
    super(level.rooms[0]);
    this.level=level;this.onEvent=onEvent;
    this.stages=[this,...level.rooms.slice(1).map(room=>new SceneRun(room))].map(stage=>({scene:stage.scene,props:stage.sceneProps,items:stage.sceneItems,room:stage.room}));
    this.rooms=this.stages.map((stage,id)=>({...stage.room,id,x:id,y:0,visited:id===0}));
    this.sceneAssets=new Map(level.rooms.flatMap(r=>r.assets).map(a=>[a.id,a]));
    this.totalItems=this.stages.reduce((n,stage)=>n+stage.items.length,0);
  }
  finishRoom(){
    if(this.roomId===this.rooms.length-1)return super.finishRoom();
    this.roomId++;const stage=this.stages[this.roomId];
    this.scene=stage.scene;this.sceneProps=stage.props;this.sceneItems=stage.items;
    this.room.visited=true;this.dungeon.blueprint.theme=this.scene.plan.theme;
    Object.assign(this.player,{x:120,y:320,inv:1,cool:0,dash:0});
    this.bullets=[];this.particles=[];this.transition=.4;this.animations=new GameAnimations();
    this.onEvent('room',this.room.name);
  }
}
