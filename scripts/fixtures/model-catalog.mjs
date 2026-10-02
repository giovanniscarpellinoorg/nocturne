export const modelFetcher=async()=>new Response(JSON.stringify({data:['glm-5.3-flash','gemma4:31b'].map(id=>({id,object:'model'}))}));
