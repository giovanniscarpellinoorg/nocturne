export function fitArena(width,height){const w=Math.max(0,Math.min(width,height*1.6));return {width:w,height:w/1.6};}
export function setupFullscreen({surface,space,viewport,canvas,button,onExit=()=>{},onError=()=>{},doc=document,win=window}){
  let expanded=false,wasActive=false,pending=false;
  const active=()=>doc.fullscreenElement===surface||expanded;
  function resize(){
    if(active()){const size=fitArena(space.clientWidth,space.clientHeight);viewport.style.width=size.width+'px';viewport.style.height=size.height+'px';}
    else{viewport.style.width='';viewport.style.height='';}
  }
  function sync(){
    const enabled=active();button.textContent=enabled?'Quitter le plein écran':'Plein écran';button.setAttribute('aria-pressed',String(enabled));
    surface.classList.toggle('is-expanded',expanded);doc.body.classList.toggle('game-expanded',expanded);
    resize();if(wasActive&&!enabled)onExit();wasActive=enabled;canvas.focus({preventScroll:true});
  }
  async function toggle(){
    if(pending)return;pending=true;button.disabled=true;
    try{
      if(expanded){expanded=false;sync();}
      else if(doc.fullscreenElement===surface)await doc.exitFullscreen();
      else if(surface.requestFullscreen&&doc.fullscreenEnabled!==false)await surface.requestFullscreen();
      else{expanded=true;sync();onError('Mode agrandi : le plein écran natif n’est pas disponible dans ce navigateur.');}
    }catch{onError('Le navigateur a refusé le plein écran. Réessaie avec le bouton.');}
    finally{pending=false;button.disabled=false;}
  }
  const escape=event=>{if(event.key==='Escape'&&expanded){event.preventDefault();event.stopImmediatePropagation();expanded=false;sync();}};
  button.addEventListener('click',toggle);doc.addEventListener('fullscreenchange',sync);win.addEventListener('keydown',escape);win.addEventListener('resize',resize);
  const observer=win.ResizeObserver?new win.ResizeObserver(resize):null;observer?.observe(space);
  sync();
  return {active,toggle,destroy(){observer?.disconnect();button.removeEventListener('click',toggle);doc.removeEventListener('fullscreenchange',sync);win.removeEventListener('keydown',escape);win.removeEventListener('resize',resize);doc.body.classList.remove('game-expanded');}};
}
