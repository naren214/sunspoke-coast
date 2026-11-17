import {Group,ObjectLoader} from 'three';

export async function loadBakedWorld(progress:(fraction:number,label:string)=>void){
  try{
    progress(.08,'Loading the county');
    const metadata=await fetch('/world/metadata.json',{cache:'no-store'}).then(r=>r.json());
    const response=await fetch('/world/county.json.gz?v='+encodeURIComponent(metadata.fingerprint));if(!response.ok||!response.body)throw new Error('County cache unavailable');
    const bytes=await response.arrayBuffer(),header=new Uint8Array(bytes),stream=new Blob([bytes]).stream();
    const object=await new Response(header[0]===31&&header[1]===139?stream.pipeThrough(new DecompressionStream('gzip')):stream).json();
    progress(.24,'Preparing roads and landscapes');
    const group=await new ObjectLoader().parseAsync(object) as Group;
    progress(.36,'Building the coast');return group;
  }catch(error){console.warn('Using the locally generated county fallback',error);progress(.2,'Building the county');return undefined;}
}
