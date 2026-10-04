import {Run} from './engine.mjs';
import {validateScene,placementBox,sceneSpawn,sceneExit} from './scene.mjs';
import {dungeon} from './dungeon.mjs';
import {applyItem,itemLabel} from './assets.mjs';
import {createEnemy} from './enemies.mjs';
export class SceneRun extends Run {
  constructor(saved,onEvent=()=>{}){
    const checked=validateScene(saved.plan,saved.assets),map=new Map(checked.assets.map(a=>[a.id,a]));
    const d=structuredClone(dungeon);d.blueprint.title=checked.plan.title;d.blueprint.theme=checked.plan.theme;
    super(d,onEvent,checked.plan.heroId?map.get(checked.plan.heroId):null);
    this.scene=checked;this.sceneAssets=map;this.roomId=0;
    this.rooms=[{id:0,x:0,y:0,type:'combat',name:checked.plan.title,visited:true,cleared:false,claimed:true,enemies:[]}];
    this.sceneProps=[];this.sceneItems=[];
    for(const p of checked.plan.placements){
      const a=map.get(p.assetId),{type,stats}=a.gameplay;
      if(type==='enemy'||type==='boss')this.room.enemies.push(createEnemy(a,p.x,p.y));
      else if(type==='item')this.sceneItems.push({...p,assetId:a.id,claimed:false});
      else this.sceneProps.push({...placementBox(a,p),id:p.id,asset:true,assetId:a.id,destructible:type==='wall'&&stats.destructible,hp:stats.health??0,maxHp:stats.health??0,destroyed:false});
    }
    this.player.x=sceneSpawn.x;this.player.y=sceneSpawn.y;this.transition=0;
    this.room.cleared=this.room.enemies.length===0;
  }
  move(entity,dx,dy){
    if(this.scene){dx=Math.max(48+entity.r,Math.min(912-entity.r,entity.x+dx))-entity.x;dy=Math.max(48+entity.r,Math.min(552-entity.r,entity.y+dy))-entity.y;}
    const steps=this.scene?Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/8)):1;
    for(let i=0;i<steps;i++)super.move(entity,dx/steps,dy/steps);
  }
  get props(){return this.sceneProps?this.sceneProps.filter(p=>!p.destroyed):super.props;}
  get blocks(){return this.sceneProps?this.props.filter(p=>p.solid):super.blocks;}
  get pickups(){return this.sceneItems?this.sceneItems.filter(p=>!p.claimed):super.pickups;}
  adjacent(){return this.scene?[]:super.adjacent();}
  get bossProfile(){return this.scene?this.scene.assets.find(a=>a.gameplay.type==='boss')?.gameplay.stats??null:super.bossProfile;}
  get bossName(){return this.scene?this.scene.assets.find(a=>a.gameplay.type==='boss')?.sprite.name??'Gardien':super.bossName;}
  assetForEntity(e){return this.sceneAssets?(e===this.player?this.asset?.id:e.assetId):super.assetForEntity(e);}
  claimPlacedItem(item){
    if(!this.scene)return super.claimPlacedItem(item);
    if(item.claimed||!this.room.cleared)return;
    const a=this.sceneAssets.get(item.assetId);item.claimed=true;applyItem(this.player,a.gameplay.stats);
    const reward={name:a.sprite.name,effect:a.gameplay.stats.effect,label:itemLabel(a.gameplay.stats),assetId:a.id};this.inventory.push(reward);this.burst(item.x,item.y,'#e5c688',20);this.onEvent('asset-item',reward);
  }
  tick(dt,input){
    super.tick(dt,input);
    const open=this.room.cleared&&this.pickups.length===0,door=this.sceneAssets.get(this.scene.plan.exitId),key=`exit-${this.roomId}`;
    if(door)this.animations.pose(this,door.id,key,open);
    const animation=this.animations.animation(door,'open');
    const ready=!animation||this.animations.time-this.animations.states.get(key).started>=animation.frames.reduce((n,f)=>n+f.duration,0)/1000;
    if(this.state==='playing'&&open&&ready&&Math.hypot(this.player.x-sceneExit.x,this.player.y-sceneExit.y)<30)this.finishRoom();
  }
  finishRoom(){this.state='won';this.onEvent('won');}
}
