export const videoFormats={vertical:{label:'Vertical 9:16',width:1080,height:1920},horizontal:{label:'Horizontal 16:9',width:1920,height:1080},square:{label:'Carré 1:1',width:1080,height:1080}};
export const sceneTypes=['title','diagram','chart','quote','summary'];
export const transitions=['fade','slide','zoom'];
const text=(value,label,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max||/\p{Cc}/u.test(value))throw Error(`${label} invalide`);return value.trim()};
const color=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);

export function validateVideoProject(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Projet vidéo invalide');
 if(value.version!==1)throw Error('Version vidéo invalide');
 if(!Object.hasOwn(videoFormats,value.format))throw Error('Format vidéo inconnu');
 if(!Number.isInteger(value.fps)||value.fps<12||value.fps>60)throw Error('FPS attendus entre 12 et 60');
 const project={version:1,title:text(value.title,'Titre',100),description:text(value.description,'Description',500),format:value.format,fps:value.fps,theme:validateTheme(value.theme)};
 if(!Array.isArray(value.scenes)||value.scenes.length<3||value.scenes.length>8)throw Error('Une vidéo doit contenir entre 3 et 8 scènes');
 project.scenes=value.scenes.map((scene,index)=>validateScene(scene,index));
 const duration=project.scenes.reduce((sum,scene)=>sum+scene.duration,0);
 if(duration<6||duration>90)throw Error('Durée totale attendue entre 6 et 90 secondes');
 return {...project,duration};
}
function validateTheme(value={}){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Thème invalide');const theme={background:value.background,foreground:value.foreground,accent:value.accent,muted:value.muted};if(!Object.values(theme).every(color))throw Error('Couleurs du thème invalides');return theme;}
function validateScene(scene,index){
 const fail=message=>{throw Error(`Scène ${index+1} : ${message}`)};
 if(!scene||typeof scene!=='object'||Array.isArray(scene)||!sceneTypes.includes(scene.type))fail('type inconnu');
 if(typeof scene.duration!=='number'||scene.duration<1.5||scene.duration>20)fail('durée attendue entre 1,5 et 20 secondes');
 if(!transitions.includes(scene.transition))fail('transition inconnue');
 let title;try{title=text(scene.title,'titre',120)}catch(e){fail(e.message)}
 const result={type:scene.type,duration:Math.round(scene.duration*10)/10,transition:scene.transition,title};
 if(scene.type==='title'||scene.type==='summary'){try{result.body=text(scene.body,'texte',500)}catch(e){fail(e.message)}}
 if(scene.type==='quote'){try{result.body=text(scene.body,'citation',350);result.source=text(scene.source,'source',100)}catch(e){fail(e.message)}}
 if(scene.type==='diagram'){
  if(!Array.isArray(scene.nodes)||scene.nodes.length<2||scene.nodes.length>6)fail('2 à 6 nœuds attendus');
  try{result.nodes=scene.nodes.map((node,i)=>({id:`n${i}`,label:text(node?.label,'libellé',80)}))}catch(e){fail(e.message)}
  if(!Array.isArray(scene.links)||scene.links.length<1||scene.links.length>8)fail('1 à 8 liens attendus');
  result.links=scene.links.map(link=>{if(!Array.isArray(link)||link.length!==2||!link.every(Number.isInteger)||link.some(i=>i<0||i>=result.nodes.length))fail('lien invalide');return link});
 }
 if(scene.type==='chart'){
  if(!Array.isArray(scene.values)||scene.values.length<2||scene.values.length>7)fail('2 à 7 valeurs attendues');
  try{result.values=scene.values.map(item=>({label:text(item?.label,'libellé',50),value:item?.value}))}catch(e){fail(e.message)}
  if(result.values.some(item=>typeof item.value!=='number'||!Number.isFinite(item.value)||item.value<0||item.value>1000000))fail('valeur de graphe invalide');
  result.unit=typeof scene.unit==='string'&&scene.unit.length<=20?scene.unit:'';
 }
 return result;
}

export const exampleVideo=validateVideoProject({version:1,title:'Pourquoi la Lune change-t-elle de forme ?',description:'Une courte explication du cycle lunaire.',format:'vertical',fps:30,theme:{background:'#101918',foreground:'#F2ECDD',accent:'#DFB77B',muted:'#8EA59B'},scenes:[
 {type:'title',duration:3,transition:'fade',title:'Les phases de la Lune',body:'Ce que nous voyons dépend de sa position autour de la Terre.'},
 {type:'diagram',duration:5,transition:'slide',title:'Trois acteurs, une seule lumière',nodes:[{label:'Soleil'},{label:'Terre'},{label:'Lune'}],links:[[0,1],[0,2],[2,1]]},
 {type:'chart',duration:5,transition:'zoom',title:'Un cycle régulier',unit:'jours',values:[{label:'Nouvelle lune',value:0},{label:'Premier quartier',value:7.4},{label:'Pleine lune',value:14.8},{label:'Dernier quartier',value:22.1}]},
 {type:'summary',duration:4,transition:'fade',title:'À retenir',body:'La Lune ne change pas de forme : seule sa partie éclairée visible depuis la Terre varie.'}
]});
