let session;
export async function request(path,{method='GET',body,retry=true}={}){
 try{
  if(method!=='GET'&&!session){const r=await fetch('/api/session',{cache:'no-store'});if(!r.ok)throw Error('Le serveur local doit être redémarré.');session=(await r.json()).token}
  const response=await fetch(path,{method,cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','X-Nocturne-Token':session},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(155000)});
  if(response.status===403&&method!=='GET'&&retry){session=null;return request(path,{method,body,retry:false})}
  let data;try{data=await response.json()}catch{throw Error('Le serveur local ne répond pas comme prévu.')}
  if(!response.ok){const e=new Error(data.error||'Cette opération a échoué.');e.status=response.status;throw e}return data;
 }catch(e){if(e.name==='TimeoutError'||e.name==='AbortError')throw Error('La génération prend trop de temps. Le serveur peut encore terminer son travail : attendez avant de réessayer.');if(e instanceof TypeError)throw Error('Le serveur local est inaccessible. Vérifiez qu’il est démarré.');throw e}
}
