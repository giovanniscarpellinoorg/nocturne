import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {illustrationKeys,artBrief} from '../dist/investigation-core.mjs';
import {validLogId} from './designer-logs.mjs';

export function createIllustrationBatches({directory,investigations,illustrations,designer,PublicError}){
 const active=new Set(),stops=new Set();
 const save=async job=>{await mkdir(directory,{recursive:true,mode:0o700});const file=path.join(directory,job.id+'.json'),tmp=file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(job),{mode:0o600});await rename(tmp,file);};
 async function read(id){
  if(!validLogId(id))throw new PublicError(404,'Série d’illustrations introuvable.');let job;try{job=JSON.parse(await readFile(path.join(directory,id+'.json'),'utf8'));}catch{throw new PublicError(404,'Série d’illustrations introuvable.');}
  if(job.status==='running'&&!active.has(id)){job.status='interrupted';job.message='Serveur arrêté : les illustrations terminées sont conservées. Tu peux reprendre la suite.';}
  if(active.has(id)&&job.currentChild){try{job.stage=(await illustrations.read(job.currentChild)).stage;}catch{}}
  job.stopRequested=stops.has(id);return job;
 }
 async function create(options){
  if(!options||Object.keys(options).some(k=>!['id','model','mode'].includes(k))||!['missing','all'].includes(options.mode??'missing'))throw new PublicError(400,'Options de série invalides.');
  const record=await investigations.read(options.id),mode=options.mode??'missing';
  const items=illustrationKeys.map(key=>{const [kind,id]=key.split('.'),entry=key==='investigator'?record.story.investigator:record.story[{location:'locations',enemy:'enemies',card:'cards'}[kind]].find(e=>e.id===id);return {key,name:entry.name,status:mode==='missing'&&record.art[key]?'skipped':'pending'};});
  const job={id:randomUUID(),investigationId:record.id,title:record.story.title,model:options.model,mode,createdAt:new Date().toISOString(),status:items.every(i=>i.status==='skipped')?'success':'running',items};await save(job);return job;
 }
 async function resume(id){const job=await read(id);if(active.has(id))throw new PublicError(409,'Cette série est déjà en cours.');if(job.status==='success')throw new PublicError(400,'Toutes les illustrations sont terminées.');for(const item of job.items)if(!['success','skipped'].includes(item.status)){item.status='pending';delete item.error;}job.status='running';delete job.message;delete job.currentChild;delete job.stage;await save(job);return job;}
 async function stop(id){const job=await read(id);if(!active.has(id))return job;stops.add(id);return {...job,stopRequested:true};}
 async function run(job,secret){
  active.add(job.id);
  try{
   for(const item of job.items){
    if(['success','skipped'].includes(item.status))continue;
    if(stops.has(job.id)){job.status='stopped';break;}
    const record=await investigations.read(job.investigationId);
    // A drawing assigned while the series was running should also be kept.
    if(job.mode==='missing'&&record.art[item.key]){item.status='skipped';await save(job);continue;}
    item.status='running';job.currentKey=item.key;job.stage='Préparation';delete job.currentChild;await save(job);
    try{
     if(!item.spriteId){
      if(item.key.startsWith('card.')){
       job.stage='Dessin de la carte';await save(job);
       const result=await designer.generate({model:job.model,prompt:artBrief(record.story,item.key),size:64,method:'tools',assetType:'art',allowReuse:false,useFeedback:true},secret);
       item.spriteId=result.record.id;item.diagnosticId=result.diagnosticId;await save(job);
      }else{
       const child=await illustrations.create({id:record.id,key:item.key,model:job.model,prompt:artBrief(record.story,item.key)});job.currentChild=child.id;await save(job);
       const result=await illustrations.run(child,secret);item.spriteId=result.spriteId;item.diagnosticId=result.diagnosticId;await save(job);
       if(result.status!=='success')throw new PublicError(result.errorStatus??422,result.error??'Illustration rejetée.');
      }
     }
     await investigations.assignArt({id:record.id,key:item.key,spriteId:item.spriteId});item.status='success';delete item.error;
    }catch(e){item.status='error';item.error=String(e.message).split(secret).join('[REDACTED]').slice(0,1000);if([401,403,429].includes(e.status)||!e.status||e.status>=500){job.status='partial';job.message='Série interrompue : '+item.error;await save(job);break;}}
    await save(job);
   }
   if(job.status==='running')job.status=job.items.some(i=>i.status==='error')?'partial':'success';
  }catch(e){job.status='partial';job.message=String(e.message).split(secret).join('[REDACTED]').slice(0,1000);}
  finally{delete job.currentChild;delete job.currentKey;delete job.stage;job.updatedAt=new Date().toISOString();try{await save(job);}finally{active.delete(job.id);stops.delete(job.id);}}
  return job;
 }
 return {create,read,resume,run,stop,current:()=>[...active][0]??null};
}
