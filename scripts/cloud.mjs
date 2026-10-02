import {readFile,writeFile,mkdir,rename,chmod} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {dayKey,prompt,validateBlueprint,validateDungeon,hash} from '../dist/core.mjs';
export const DEFAULT_MODEL='glm-5.3-flash';
export const MODELS=[DEFAULT_MODEL,'gemma4:31b'];
export class PublicError extends Error{constructor(status,message){super(message);this.status=status}}
export const privateDirectory=fileURLToPath(new URL('../../../work/nocturne-secrets/',import.meta.url));
const cacheDirectory=fileURLToPath(new URL('../../../work/nocturne-cache/',import.meta.url));
export function parseBlueprint(text){if(typeof text!=='string'||text.length>50000)throw Error('Réponse trop volumineuse ou vide');const clean=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');const blueprint=validateBlueprint(JSON.parse(clean));if(new Set(blueprint.items.map(i=>i.effect)).size!==3)throw Error('Les trois objets doivent avoir des effets distincts');return blueprint}
export function createCloud({secretDir=privateDirectory,cacheDir=cacheDirectory,fetcher=fetch,environmentKey=process.env.OLLAMA_API_KEY}={}){
 let active=null,lastAttempt=0;
 const keyFile=path.join(secretDir,'ollama-api-key'),configFile=path.join(secretDir,'settings.json');
 async function readKey(){if(environmentKey)return environmentKey;try{return (await readFile(keyFile,'utf8')).trim()}catch{return null}}
 async function model(){try{const value=JSON.parse(await readFile(configFile,'utf8')).model;return MODELS.includes(value)?value:DEFAULT_MODEL}catch{return DEFAULT_MODEL}}
 async function status(){return {configured:Boolean(await readKey()),model:await model(),busy:Boolean(active),provider:'Ollama Cloud'}}
 async function configure({key,model:selected}){if(typeof key!=='string'||key.length<20||key.length>256||/[\s\p{Cc}]/u.test(key)||!MODELS.includes(selected))throw new PublicError(400,'Clé ou modèle invalide.');await mkdir(secretDir,{recursive:true,mode:0o700});await chmod(secretDir,0o700);await writeFile(keyFile+'.tmp',key,{mode:0o600});await chmod(keyFile+'.tmp',0o600);await rename(keyFile+'.tmp',keyFile);await writeFile(configFile,JSON.stringify({model:selected}),{mode:0o600});return {configured:true,model:selected}}
 async function cached(date=dayKey()){try{const value=validateDungeon(JSON.parse(await readFile(path.join(cacheDir,`${date}.json`),'utf8')));return value.date===date?value:null}catch{return null}}
 async function generate(){const existing=await cached();if(existing)return existing;if(active)return active;const key=await readKey();if(!key)throw new PublicError(503,'Ajoutez votre clé dans le Codex, rubrique Ollama Cloud.');if(Date.now()-lastAttempt<20000)throw new PublicError(429,'Attendez quelques secondes avant de réessayer.');lastAttempt=Date.now();active=generateOnce(key).finally(()=>active=null);return active}
 async function generateOnce(key){const date=dayKey(),selected=await model();let blueprint,lastIssue='';
  for(let attempt=0;attempt<2;attempt++){
   let response;try{response=await fetcher('https://ollama.com/api/chat',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:selected,stream:false,...(selected===DEFAULT_MODEL?{think:'low'}:{}),messages:[{role:'system',content:'Tu produis uniquement des données JSON pour un jeu. Aucun markdown, aucune explication, aucun code exécutable. Respecte les clés, les limites et les valeurs du schéma fourni.'},{role:'user',content:prompt(date)+(lastIssue?'\nTa dernière proposition a été rejetée : '+lastIssue+'. Corrige le format et respecte exactement le schéma.':'')}],options:{temperature:.75,num_predict:4500}}),signal:AbortSignal.timeout(65000)})}catch{throw new PublicError(502,'Ollama Cloud est momentanément injoignable. Votre donjon actuel est conservé.')}
   if(response.status===401||response.status===403)throw new PublicError(401,'Ollama a refusé la clé. Vérifiez-la dans le Codex.');if(response.status===429)throw new PublicError(429,'Votre quota Ollama est atteint ou le service est occupé. Réessayez plus tard.');if(!response.ok)throw new PublicError(502,'Ollama Cloud n’a pas pu générer ce donjon. Réessayez plus tard.');
   let data;try{const text=await response.text();if(text.length>150000)throw Error();data=JSON.parse(text)}catch{throw new PublicError(502,'Réponse Ollama illisible. Votre donjon actuel est conservé.')}
   try{if(data.done===false||data.done_reason==='length')throw Error('réponse incomplète');blueprint=parseBlueprint(data.message?.content);break}catch(e){lastIssue=e.message.slice(0,200)}
  }
  if(!blueprint)throw new PublicError(422,'Le modèle n’a pas produit un donjon valide après deux essais. Votre donjon actuel est conservé.');
  const result=validateDungeon({version:1,date,seed:hash(date+JSON.stringify(blueprint)),source:`ollama-cloud:${selected}`,blueprint});await mkdir(cacheDir,{recursive:true,mode:0o700});const target=path.join(cacheDir,`${date}.json`);await writeFile(target+'.tmp',JSON.stringify(result,null,2),{mode:0o600});await rename(target+'.tmp',target);return result;
 }
 return {status,configure,cached,generate};
}
