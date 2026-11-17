export type DownloadAsset={url:string;bytes:number;label:string;type:string};
export type BootManifest={version:string;assets:DownloadAsset[];totalBytes:number};
export type DownloadState={loaded:number;total:number;completed:number;files:number;percent:number;label:string};
type RecordEntry={asset:DownloadAsset;loaded:number;complete:boolean;bytes?:ArrayBuffer;objectURL?:string};

// Keep startup downloads in one place. Three.js reuses these exact bytes via
// its URL resolver instead of issuing a second set of network requests.
export class GameDownloads {
  private entries=new Map<string,RecordEntry>();private aborter=new AbortController();private stopped=false;
  private timer?:ReturnType<typeof setTimeout>;private timeoutError?:Error;
  constructor(private changed:(state:DownloadState)=>void,private request:typeof fetch=(url,options)=>globalThis.fetch(url,options),private idleMs=45000){}
  private touch(){clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timeoutError=Error('The download stopped responding. Check your connection and retry.');this.aborter.abort(this.timeoutError);},this.idleMs);}
  private key(url:string){return url.split(/[?#]/,1)[0];}
  state(label='Loading game data'):DownloadState{
    const entries=[...this.entries.values()],total=entries.reduce((n,e)=>n+e.asset.bytes,0),loaded=entries.reduce((n,e)=>n+e.loaded,0),completed=entries.filter(e=>e.complete).length;
    return {loaded,total,completed,files:entries.length,percent:completed===entries.length&&entries.length>0?100:Math.min(99,Math.floor(loaded/Math.max(1,total)*100)),label};
  }
  async preload(manifest:BootManifest){
    if(!Array.isArray(manifest.assets)||!manifest.assets.length||typeof manifest.version!=='string'||!manifest.version)throw Error('The download list is unavailable. Please reload.');
    for(const asset of manifest.assets){if(typeof asset.url!=='string'||!asset.url.startsWith('/')||asset.url.startsWith('//')||asset.url.includes('..')||/[?#]/.test(asset.url)||this.entries.has(asset.url)||!Number.isSafeInteger(asset.bytes)||asset.bytes<=0)throw Error('Invalid game download list.');this.entries.set(asset.url,{asset,loaded:0,complete:false});}
    if(this.state().total!==manifest.totalBytes)throw Error('The game download list changed. Please reload.');
    this.changed(this.state());this.touch();let cursor=0;
    const worker=async()=>{while(cursor<manifest.assets.length&&!this.stopped){const asset=manifest.assets[cursor++],entry=this.entries.get(asset.url)!;
      const response=await this.request(asset.url+'?v='+encodeURIComponent(manifest.version),{cache:'force-cache',signal:this.aborter.signal});
      if(this.stopped||this.aborter.signal.aborted)throw this.aborter.signal.reason;
      this.touch();
      if(!response.ok)throw Error('Could not download '+asset.label.toLowerCase()+'. Check your connection and retry.');
      const encoded=Boolean(response.headers.get('Content-Encoding')),chunks:Uint8Array[]=[];let received=0;
      if(response.body){const reader=response.body.getReader();while(true){const {done,value}=await reader.read();if(this.stopped||this.aborter.signal.aborted)throw this.aborter.signal.reason;if(done)break;this.touch();chunks.push(value);received+=value.byteLength;
        // Fetch may decode an encoded response. Do not invent wire-byte counts
        // when its decoded stream cannot be compared with the file-size list.
        if(!encoded)entry.loaded=Math.min(asset.bytes,received);if(!this.stopped)this.changed(this.state(asset.label));
      }}else{const bytes=new Uint8Array(await response.arrayBuffer());chunks.push(bytes);received=bytes.byteLength;}
      if(received===0)throw Error('An empty game file was received. Please retry.');
      if(!encoded&&received!==asset.bytes)throw Error('A game file changed during download. Please reload to get the latest version.');
      const bytes=new Uint8Array(received);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      entry.bytes=bytes.buffer;entry.loaded=asset.bytes;entry.complete=true;if(!this.stopped)this.changed(this.state(asset.label));
    }};
    try{await Promise.all(Array.from({length:4},worker));}catch(error){this.stopped=true;this.aborter.abort();throw this.timeoutError??error;}finally{clearTimeout(this.timer);}
  }
  buffer(url:string):ArrayBuffer{const entry=this.entries.get(this.key(url));if(!entry?.bytes)throw Error('The game file is not ready: '+url);return entry.bytes;}
  json<T=any>(url:string):T{return JSON.parse(new TextDecoder().decode(this.buffer(url)));}
  resource(url:string){const entry=this.entries.get(this.key(url));if(!entry?.bytes)return url;return entry.objectURL??=URL.createObjectURL(new Blob([entry.bytes],{type:entry.asset.type}));}
  release(){this.stopped=true;this.aborter.abort();clearTimeout(this.timer);for(const entry of this.entries.values())if(entry.objectURL)URL.revokeObjectURL(entry.objectURL);this.entries.clear();}
}
