import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {createCloud,PublicError} from './cloud.mjs';
const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const types={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
export function createServer({cloud=createCloud()}={}){const token=randomBytes(32).toString('hex');const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};return http.createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');try{
 const port=req.socket.localPort,allowed=[`127.0.0.1:${port}`,`localhost:${port}`];if(!allowed.includes(req.headers.host)){json(res,403,{error:'Hôte non autorisé.'});return}const url=new URL(req.url,`http://${req.headers.host}`);
 if(url.pathname.startsWith('/api/')){
  if(req.method==='POST'){const supplied=Buffer.from(String(req.headers['x-nocturne-token']||'')),expected=Buffer.from(token);if(req.headers.origin!==`http://${req.headers.host}`||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)||!req.headers['content-type']?.startsWith('application/json'))throw new PublicError(403,'Requête locale non autorisée.');let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw new PublicError(413,'Requête trop volumineuse.')}let body;try{body=JSON.parse(raw)}catch{throw new PublicError(400,'Requête JSON invalide.')}
   if(url.pathname==='/api/config'){json(res,200,await cloud.configure(body));return}if(url.pathname==='/api/generate'){json(res,200,await cloud.generate(body));return}
  }else if(req.method==='GET'){
   if(url.pathname==='/api/session'){json(res,200,{token});return}if(url.pathname==='/api/status'){json(res,200,await cloud.status());return}if(url.pathname==='/api/daily'){const value=await cloud.cached();json(res,value?200:404,value||{error:'Aucun donjon IA disponible pour aujourd’hui.'});return}
  }throw new PublicError(404,'Opération inconnue.');
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return}const name=url.pathname==='/'?'/index.html':url.pathname==='/codex'?'/codex.html':decodeURIComponent(url.pathname);if(name.split('/').some(part=>part.startsWith('.'))){res.writeHead(404).end();return}const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(404).end();return}const type=types[path.extname(file)];if(!type){res.writeHead(404).end();return}const data=await readFile(file);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
 }catch(e){if(e instanceof PublicError){json(res,e.status,{error:e.message});return}json(res,req.url?.startsWith('/api/')?500:404,{error:req.url?.startsWith('/api/')?'Une erreur locale est survenue.':'Fichier introuvable.'})}})}
if(process.argv[1]===fileURLToPath(import.meta.url)){createServer().listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'))}
