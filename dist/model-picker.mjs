import {request} from './cloud-ui.mjs';
export function chooseModel(models,current,preferred){return [current,preferred,...models].find(id=>models.includes(id))??'';}
export function updateModelPicker(select,state){
  const preferenceKey=select.dataset.preferenceKey??'nocturne:model';
  let preferred;try{preferred=localStorage.getItem(preferenceKey)??localStorage.getItem('nocturne:model');}catch{}
  const models=state.models??[],selected=chooseModel(models,select.dataset.loaded?select.value:preferred,state.model);
  if(JSON.stringify([...select.options].map(o=>o.value))!==JSON.stringify(models))select.replaceChildren(...models.map(id=>new Option(id,id)));
  select.value=selected;
  if(!select.dataset.loaded){select.addEventListener('change',()=>{try{localStorage.setItem(preferenceKey,select.value);}catch{}});select.dataset.loaded='true';}
  const message=document.querySelector(select.dataset.messageTarget??'#models-message');if(message)message.textContent=state.catalog?.error??`${models.length} modèles cloud disponibles · liste Ollama.`;
}
export function bindModelRefresh(refreshStatus,{buttonSelector='#refresh-models',messageSelector='#models-message'}={}){
  const button=document.querySelector(buttonSelector);button.addEventListener('click',async()=>{button.disabled=true;try{await request('/api/models?refresh=1');await refreshStatus();}catch(e){document.querySelector(messageSelector).textContent=e.message;}finally{button.disabled=false;}});
}
