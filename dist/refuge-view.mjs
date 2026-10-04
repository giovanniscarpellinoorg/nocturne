import {paintSprite} from './pixels.mjs';
import {gameAnimationFrame} from './game-animations.mjs';

// Scenery and silhouettes keep the first day playable before any AI drawings.
// Assigned notebook drawings take their place; no premade sprite bank is used.
export function drawLandscape(canvas,place='village'){
 canvas.width=1500;canvas.height=850;const c=canvas.getContext('2d');
 const gradient=c.createLinearGradient(0,0,0,850);gradient.addColorStop(0,'#172c3d');gradient.addColorStop(.45,'#405658');gradient.addColorStop(1,'#172e2d');c.fillStyle=gradient;c.fillRect(0,0,1500,850);
 for(let i=0;i<80;i++){c.fillStyle=`rgba(221,235,210,${.15+(i%4)*.12})`;c.fillRect((i*173)%1500,(i*71)%350,i%3===0?2:1,2);}
 const hill=(y,color,seed)=>{c.fillStyle=color;c.beginPath();c.moveTo(0,850);c.lineTo(0,y);for(let x=0;x<=1500;x+=30)c.lineTo(x,y+Math.sin(x/190+seed)*35+Math.sin(x/81)*9);c.lineTo(1500,850);c.closePath();c.fill();};
 hill(330,'#314b4d',2);hill(390,'#294744',4);hill(490,'#213f38',5);
 function tree(x,y,h,color){c.fillStyle=color;c.fillRect(x-3,y-h*.6,6,h*.65);for(let i=0;i<3;i++){c.beginPath();c.moveTo(x,y-h+i*h*.17);c.lineTo(x-h*(.19+i*.025),y-h*.4+i*h*.18);c.lineTo(x+h*(.19+i*.025),y-h*.4+i*h*.18);c.closePath();c.fill();}}
 for(let i=0;i<45;i++)tree(i*37,470+(i%5)*12,100+(i*29)%130,'#203c39');
 c.fillStyle='#3b5140';c.beginPath();c.ellipse(760,715,660,260,-.05,0,Math.PI*2);c.fill();
 c.strokeStyle='#70806635';c.lineWidth=55;c.lineCap='round';c.beginPath();c.moveTo(570,510);c.bezierCurveTo(700,620,890,650,660,850);c.stroke();c.lineWidth=35;c.beginPath();c.moveTo(670,680);c.bezierCurveTo(750,630,900,550,1110,540);c.stroke();
 if(place==='river'){c.strokeStyle='#78a9ac66';c.lineWidth=100;c.beginPath();c.moveTo(1000,430);c.bezierCurveTo(350,540,850,650,400,900);c.stroke();}
 if(place==='quarry'){for(let i=0;i<18;i++){c.fillStyle=i%3?'#485451':'#825c42';c.fillRect(120+(i*83)%1100,440+(i*37)%310,50+i%5*20,35+i%4*15);}}
 for(let i=0;i<50;i++){const x=(i*137)%1500,y=530+(i*83)%310;if(x<160||x>1350)tree(x,y,220+(i*19)%150,'#142d2d');else{c.fillStyle=i%3?'#87946544':'#c4ad6e55';c.fillRect(x,y,3,6);}}
 const glow=c.createRadialGradient(755,610,0,755,610,260);glow.addColorStop(0,'#dcad5530');glow.addColorStop(1,'#dcad5500');c.fillStyle=glow;c.fillRect(450,350,600,500);
}
export function fallbackArt(canvas,key,level=1){
 canvas.width=128;canvas.height=128;const c=canvas.getContext('2d');c.clearRect(0,0,128,128);
 const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
 const polygon=(points,color)=>{c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
 if(key.startsWith('resident.')){
  const id=key.split('.')[1],colors={mara:'#829369',abel:'#9e7960',sile:'#728792',brume:'#d4a670'};
  const coat=colors[id]??'#819d8c';
  if(id==='brume'){polygon([[27,94],[40,55],[51,30],[60,53],[76,49],[91,30],[91,76],[100,99],[72,111],[42,110]],coat);polygon([[24,98],[8,71],[12,110],[44,115]],'#d6c595');rect(49,69,5,5,'#182c2e');rect(78,69,5,5,'#182c2e');rect(60,83,10,6,'#39463c');}
  else{rect(44,101,15,24,'#233333');rect(70,101,14,24,'#233333');polygon([[41,59],[82,59],[96,99],[77,111],[43,110],[31,97]],coat);rect(43,21,41,40,'#c7b193');polygon([[39,28],[45,15],[79,14],[88,31],[79,32],[73,22],[47,34],[41,54]],id==='sile'?'#cad0b5':'#4a4639');rect(51,37,5,5,'#263334');rect(70,37,5,5,'#263334');rect(44,60,37,9,'#435e55');rect(33,70,10,31,coat);rect(84,70,10,31,coat);rect(32,101,12,10,'#c7b193');rect(83,101,12,10,'#c7b193');if(id==='sile'){rect(88,93,11,17,'#d9b05e');rect(90,97,7,8,'#f5e1a0');}}
  return;
 }
 if(key==='building.garden'){polygon([[8,95],[80,74],[123,99],[49,123]],'#665640');for(let i=0;i<5;i++){rect(24+i*15,95-i*2,4,13,'#87a16d');rect(20+i*15,94-i*2,12,4,level?'#9da962':'#5e7251');}rect(9,83,3,20,'#8a7d5c');rect(109,86,3,23,'#8a7d5c');rect(9,88,103,3,'#8a7d5c');return;}
 if(key==='building.beacon'){polygon([[42,121],[49,39],[77,39],[88,121]],'#5b6662');rect(45,32,38,20,'#a08850');rect(51,34,26,17,level?'#f1d28a':'#526154');polygon([[39,31],[64,9],[91,31]],'#4d6d69');rect(52,65,6,8,'#213e3b');rect(59,98,15,23,'#243c38');return;}
 const inn=key==='building.inn',h=inn?65:49,y=115-h;
 rect(18,y,81,h,'#9d9879');polygon([[99,y],[116,y-12],[116,103],[99,115]],'#626f5e');polygon([[9,y],[57,y-38],[109,y],[99,y+7],[57,y-23],[18,y+8]],'#4d6768');polygon([[57,y-38],[74,y-47],[124,y-11],[109,y]],'#60777a');rect(81,y-42,10,25,'#8b8b71');rect(27,y+19,17,21,level?'#e5c57c':'#425850');rect(69,y+19,17,21,level?'#daba6d':'#425850');rect(34,y+19,3,21,'#737455');rect(76,y+19,3,21,'#737455');rect(48,88,18,27,'#344e48');rect(61,101,2,3,'#edce81');rect(16,114,85,5,'#59624b');
 if(level>1){rect(5,83,16,31,'#a3a082');polygon([[0,82],[12,69],[26,82]],'#657d74');rect(9,90,6,12,'#dec278');}if(level>2){rect(38,45,36,5,'#9bad83');rect(49,30,16,14,'#e4ca8b');}
}
export function createRefugeArt(){
 const animated=new Set();let world=null,last=0;
 function setWorld(value){world=value;for(const item of animated)if(!item.canvas.isConnected)animated.delete(item);}
 function canvas(key){const canvas=document.createElement('canvas'),asset=world.art[key];canvas.setAttribute('aria-hidden','true');
  if(asset){paintSprite(canvas,asset.sprite);if(asset.animation)animated.add({canvas,animation:asset.animation,index:-1,started:performance.now()});}
  else if(key.startsWith('location.'))drawLandscape(canvas,key.split('.')[1]);else fallbackArt(canvas,key,world.buildings[key.split('.')[1]]??1);
  return canvas;
 }
 function tick(time){if(time-last>80&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches){last=time;for(const entry of animated){if(!entry.canvas.isConnected){animated.delete(entry);continue;}const index=gameAnimationFrame(entry.animation,(time-entry.started)/1000);if(index!==entry.index){paintSprite(entry.canvas,entry.animation.frames[index].sprite);entry.index=index;}}}requestAnimationFrame(tick);}
 requestAnimationFrame(tick);return {setWorld,canvas};
}
