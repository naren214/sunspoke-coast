import {Group,ObjectLoader} from 'three';
import type {GameDownloads} from './downloads';

export async function loadBakedWorld(progress:(fraction:number,label:string)=>void,downloads?:GameDownloads){
  try{
    progress(.08,'Loading the county');
    const metadata=downloads?downloads.json('/world/metadata.json'):await fetch('/world/metadata.json',{cache:'no-store'}).then(r=>r.json());
    const bytes=downloads?downloads.buffer('/world/county.json.gz'):await fetch('/world/county.json.gz?v='+encodeURIComponent(metadata.fingerprint)).then(r=>{if(!r.ok)throw new Error('County cache unavailable');return r.arrayBuffer();});
    const header=new Uint8Array(bytes),stream=new Blob([bytes]).stream();
    const object=await new Response(header[0]===31&&header[1]===139?stream.pipeThrough(new DecompressionStream('gzip')):stream).json();
    progress(.24,'Preparing roads and landscapes');
    const group=await new ObjectLoader().parseAsync(object) as Group;
    progress(.36,'Building the coast');return group;
  }catch(error){console.warn('Using the locally generated county fallback',error);progress(.2,'Building the county');return undefined;}
}
