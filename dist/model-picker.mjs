import {request} from './cloud-ui.mjs';
export function chooseModel(models,current,preferred){return [current,preferred,...models].find(id=>models.includes(id))??'';}
export function updateModelPicker(select,state){
  let preferred;try{preferred=localStorage.getItem('nocturne:model');}catch{}
  const models=state.models??[],selected=chooseModel(models,select.dataset.loaded?select.value:preferred,state.model);
  if(JSON.stringify([...select.options].map(o=>o.value))!==JSON.stringify(models))select.replaceChildren(...models.map(id=>new Option(id,id)));
  select.value=selected;
  if(!select.dataset.loaded){select.addEventListener('change',()=>{try{localStorage.setItem('nocturne:model',select.value);}catch{}});select.dataset.loaded='true';}
  const message=document.querySelector('#models-message');if(message)message.textContent=state.catalog?.error??`${models.length} modèles cloud disponibles · liste Ollama.`;
}
export function bindModelRefresh(refreshStatus){
  const button=document.querySelector('#refresh-models');button.addEventListener('click',async()=>{button.disabled=true;try{await request('/api/models?refresh=1');await refreshStatus();}catch(e){document.querySelector('#models-message').textContent=e.message;}finally{button.disabled=false;}});
}
