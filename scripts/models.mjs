import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const MODEL_ENDPOINT='https://ollama.com/v1/models';
export const validModelName=value=>typeof value==='string'&&value.length<=160&&/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(value);
export function parseModels(data){
  if(!data||!Array.isArray(data.data)||data.data.length>2000)throw Error('Catalogue invalide');
  const models=[...new Set(data.data.filter(m=>m?.object==='model'&&validModelName(m.id)).map(m=>m.id))].sort((a,b)=>a.localeCompare(b));
  if(!models.length)throw Error('Catalogue vide');
  return models;
}

export function createModelCatalog({directory,fetcher=fetch,fallback,now=Date.now}){
  let cached=null,pending=null,lastFailure=null,loaded=false;
  const file=path.join(directory,'cloud-models.json');
  async function get({refresh=false}={}){
    if(pending)return pending;
    pending=load(refresh).finally(()=>{pending=null;});return pending;
  }
  async function load(refresh){
    if(!loaded){loaded=true;try{const saved=JSON.parse(await readFile(file,'utf8'));if(Number.isFinite(saved.updatedAt)&&saved.updatedAt<=now()){cached={models:parseModels({data:saved.models.map(id=>({id,object:'model'}))}),updatedAt:saved.updatedAt};}}catch{}}
    if(!refresh&&cached&&lastFailure===null&&now()-cached.updatedAt<300000)return result();
    if(lastFailure!==null&&now()-lastFailure<30000)return result(true);
    try{
      const response=await fetcher(MODEL_ENDPOINT,{redirect:'error',signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error('Catalogue indisponible');
      const raw=await response.text();if(raw.length>500000)throw Error('Catalogue trop long');
      cached={models:parseModels(JSON.parse(raw)),updatedAt:now()};lastFailure=null;
      try{await mkdir(directory,{recursive:true,mode:0o700});const tmp=file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(cached),{mode:0o600});await rename(tmp,file);}catch{/* The in-memory catalogue remains usable if disk caching fails. */}
      return result();
    }catch{lastFailure=now();return result(true);}
  }
  function result(stale=false){return {models:[...(cached?.models??fallback)],source:cached?MODEL_ENDPOINT:'fallback',updatedAt:cached?new Date(cached.updatedAt).toISOString():null,stale,error:stale?(cached?'Ollama est inaccessible : dernière liste conservée.':'Ollama est inaccessible : liste de secours limitée. Réessaie dans 30 secondes.'):null};}
  return {get};
}
