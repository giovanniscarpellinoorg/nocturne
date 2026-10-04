// Shared geometry for movement, interaction prompts and saved gathering sites.
export const fieldSize={width:1000,height:600};
export const fieldExit={id:'exit',kind:'exit',x:105,y:460,radius:48,label:'Revenir au refuge'};
export const encounterSite={id:'encounter',kind:'encounter',x:800,y:240,radius:55,label:'Examiner la découverte'};
export const homeSites=[
 {id:'inn',kind:'building',x:390,y:360,radius:58,label:'Entrer à l’auberge',rect:{x:305,y:250,w:170,h:84}},
 {id:'garden',kind:'building',x:230,y:435,radius:55,label:'S’occuper du jardin',rect:{x:165,y:345,w:125,h:65}},
 {id:'workshop',kind:'building',x:675,y:430,radius:58,label:'Ouvrir l’atelier',rect:{x:610,y:320,w:135,h:80}},
 {id:'beacon',kind:'building',x:785,y:300,radius:55,label:'Rejoindre le fanal',rect:{x:756,y:198,w:57,h:75}},
 {id:'trail',kind:'trail',x:105,y:460,radius:48,label:'Choisir une expédition'},
 {id:'hearth',kind:'hearth',x:505,y:360,radius:48,label:'Se reposer près du feu'},
];
export const residentSite=(id,index)=>({id,kind:'resident',x:360+(index%5)*68,y:455+Math.floor(index/5)*36,radius:37});
export function nearSite(position,site){return Boolean(position)&&Number.isFinite(position.x)&&Number.isFinite(position.y)&&Math.hypot(position.x-site.x,position.y-site.y)<=site.radius;}
export function fieldNodes(trip){
 if(trip?.fieldVersion!==1)return [];
 const spots=[[315,295],[565,475],[735,360]],total=trip.yield;
 return [...spots.map(([x,y],i)=>({id:'supply-'+i,kind:'supply',x,y,radius:43,resource:trip.resource,amount:Math.floor(total/3)+(i<total%3?1:0)})).filter(n=>n.amount>0),{id:'cache',kind:'supply',x:885,y:410,radius:43,resource:'embers',amount:1}];
}
export function fieldObstacles(trip){return trip?[
 {x:410,y:225,w:70,h:130},{x:615,y:340,w:40,h:70},{x:820,y:470,w:90,h:34},
 ]:homeSites.filter(s=>s.rect).map(s=>s.rect);}
function blocked(x,y,obstacles,radius=10){return x<42||x>958||y<200||y>555||obstacles.some(r=>x>r.x-radius&&x<r.x+r.w+radius&&y>r.y-radius&&y<r.y+r.h+radius);}
export function movementVector(keys){const x=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('q')||keys.has('a')||keys.has('arrowleft')),y=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('z')||keys.has('w')||keys.has('arrowup')),length=Math.hypot(x,y)||1;return {x:x/length,y:y/length};}
export function newFieldPlayer(){return {x:510,y:480,dx:0,dy:1,stamina:100,dash:0,cooldown:0,ward:0,wardCooldown:0,hurt:0,moving:false,sprinting:false};}
export function stepField(player,input,dt,obstacles=[]){
 dt=Math.max(0,Math.min(dt,.05));const p={...player};for(const k of ['dash','cooldown','ward','wardCooldown','hurt'])p[k]=Math.max(0,p[k]-dt);
 const length=Math.hypot(input.x,input.y),x=length?input.x/length:0,y=length?input.y/length:0;
 if(input.dodge&&p.cooldown===0&&p.stamina>=25&&!p.hurt){p.dash=.18;p.cooldown=.85;p.stamina-=25;if(length){p.dx=x;p.dy=y;}}
 if(input.lantern&&p.wardCooldown===0&&p.stamina>=20){p.ward=.7;p.wardCooldown=1.2;p.stamina-=20;}
 p.sprinting=Boolean(input.sprint&&length&&p.stamina>0&&!p.dash&&!p.hurt);
 p.stamina=Math.max(0,Math.min(100,p.stamina+(p.sprinting?-23:p.dash?0:18)*dt));
 const speed=p.dash?410:p.hurt?65:p.sprinting?190:118,vx=p.dash?p.dx:x,vy=p.dash?p.dy:y;
 if(length&&!p.dash){p.dx=x;p.dy=y;}
 // Substeps stop a dash tunnelling through a wall, while sliding along it.
 const steps=Math.max(1,Math.ceil(speed*dt/4));let moved=false;
 for(let i=0;i<steps;i++){const nx=p.x+vx*speed*dt/steps,ny=p.y+vy*speed*dt/steps;if(!blocked(nx,p.y,obstacles)){moved||=nx!==p.x;p.x=nx;}if(!blocked(p.x,ny,obstacles)){moved||=ny!==p.y;p.y=ny;}}
 p.moving=moved;return p;
}
export function nearestSite(player,sites){return sites.filter(s=>nearSite(player,s)).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0]??null;}
export function stepWisp(wisp,player,dt,time){
 const w={...wisp};w.flee=Math.max(0,(w.flee??0)-dt);const distance=Math.hypot(w.x-player.x,w.y-player.y);
 if(player.ward>0&&distance<145)w.flee=3;
 const target=w.flee?{x:w.homeX,y:w.homeY}:distance<170?player:{x:w.homeX+Math.sin(time*.6+w.phase)*45,y:w.homeY+Math.cos(time*.8+w.phase)*35};
 const d=Math.hypot(target.x-w.x,target.y-w.y),speed=w.flee?105:distance<170?72:25;
 if(d>1){w.x+=(target.x-w.x)/d*Math.min(d,speed*dt);w.y+=(target.y-w.y)/d*Math.min(d,speed*dt);}
 w.hit=!w.flee&&!player.hurt&&!player.dash&&player.ward===0&&Math.hypot(w.x-player.x,w.y-player.y)<22;
 if(w.hit)w.flee=2;
 return w;
}
