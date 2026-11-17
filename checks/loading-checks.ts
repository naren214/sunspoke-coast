import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {gzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {GameDownloads} from '../src/downloads';
import {OpeningScreen} from '../src/opening';
import {DefaultLoadingManager,FileLoader} from 'three';
import {AssetLibrary} from '../src/assets';
import type {BootManifest,DownloadState} from '../src/downloads';

const payload=Buffer.from(JSON.stringify({message:'Coast ready',roads:53}));
let active=0,peak=0,requests=0;
const server=createServer((req,res)=>{
  requests++;active++;peak=Math.max(peak,active);res.on('close',()=>active--);
  const url=new URL(req.url!,'http://test');
  assert.equal(url.searchParams.get('v'),'test-version');
  if(url.pathname==='/missing'){res.writeHead(404);res.end();return;}
  if(url.pathname==='/stall'){res.writeHead(200);res.write('a');return;}
  if(url.pathname==='/empty'){res.writeHead(200);res.end();return;}
  if(url.pathname==='/truncated'){res.writeHead(200);res.end('abc');return;}
  const bytes=url.pathname==='/encoded'?gzipSync(payload):payload;
  res.writeHead(200,{'Content-Type':'application/json',...(url.pathname==='/encoded'?{'Content-Encoding':'gzip'}:{})});
  res.write(bytes.subarray(0,5));setTimeout(()=>res.end(bytes.subarray(5)),35);
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
const request:typeof fetch=(url,options)=>fetch(base+url,options);
const manifest=(paths:string[],bytes=payload.length):BootManifest=>({version:'test-version',totalBytes:bytes*paths.length,assets:paths.map(url=>({url,bytes,label:'Test coast file',type:'application/json'}))});

try{
  const states:DownloadState[]=[],downloads=new GameDownloads(s=>states.push({...s}),request);
  await downloads.preload(manifest(['/chunked','/encoded']));
  assert.ok(states.some(s=>s.loaded>0&&s.loaded<s.total),'Real streamed intermediate progress');
  assert.ok(states.every((s,i)=>i===0||s.loaded>=states[i-1].loaded),'Monotonic asset progress');
  assert.ok(states.filter(s=>s.percent===100).every(s=>s.completed===s.files),'100% requires every file');
  assert.equal(states.at(-1)!.loaded,payload.length*2);
  assert.equal(states.at(-1)!.percent,100);
  assert.deepEqual(downloads.json('/chunked'),{message:'Coast ready',roads:53});
  assert.equal(downloads.buffer('/chunked?v=ignored').byteLength,payload.length);
  const before=requests,blob=downloads.resource('/chunked');
  assert.equal(downloads.resource('/chunked'),blob,'Reuse one Blob URL');
  assert.deepEqual(await (await fetch(blob)).json(),downloads.json('/chunked'));
  assert.equal(requests,before,'Consumers reuse received bytes without another server request');
  assert.equal(downloads.resource('/deferred.glb'),'/deferred.glb','Deferred assets remain normal URLs');
  assert.equal(downloads.resource('data:image/png;base64,x'),'data:image/png;base64,x');
  downloads.release();await assert.rejects(fetch(blob),'Release revokes temporary Blob URLs');

  peak=0;const concurrent=new GameDownloads(()=>{},request);
  await concurrent.preload(manifest(Array.from({length:9},(_,i)=>'/file-'+i)));
  assert.ok(peak<=4&&peak>1,'Downloads use at most four concurrent requests');concurrent.release();
  for(const [path,pattern] of [['/missing',/Could not download/],['/empty',/empty game file/],['/truncated',/changed during download/]] as const){
    const failing=new GameDownloads(()=>{},request);
    await assert.rejects(failing.preload(manifest([path])),pattern);failing.release();
  }
  const stalled=new GameDownloads(()=>{},request,60);
  await assert.rejects(stalled.preload(manifest(['/stall'])),/stopped responding/);stalled.release();
  let lateUpdates=0;const aborted=new GameDownloads(()=>lateUpdates++,request);
  await assert.rejects(aborted.preload(manifest(['/missing','/stall'])),/Could not download/);
  const settledUpdates=lateUpdates;await new Promise(resolve=>setTimeout(resolve,80));
  assert.equal(lateUpdates,settledUpdates,'Failed parallel downloads cannot update the UI later');aborted.release();
  const invalid=new GameDownloads(()=>{},()=>{throw Error('Invalid manifest reached the network');});
  await assert.rejects(invalid.preload(manifest(['/duplicate','/duplicate'])),/Invalid game download list/);invalid.release();
  const mismatched=new GameDownloads(()=>{},request);await assert.rejects(mismatched.preload({...manifest(['/chunked']),totalBytes:1}),/list changed/);mismatched.release();

  // Exercise the actual opening controller, without claiming a browser render.
  class Node {
    textContent='';hidden=false;disabled=false;open=false;onclick?:()=>void;dataset:Record<string,string>={};style:Record<string,string>={};attributes=new Map<string,string>();classes=new Set<string>();
    classList={toggle:(name:string,on:boolean)=>on?this.classes.add(name):this.classes.delete(name)};
    setAttribute(name:string,value:string){this.attributes.set(name,value);}
  }
  const nodes=new Map<string,Node>(),steps=['download','prepare','ready'].map(value=>{const n=new Node();n.dataset.loadStep=value;return n;});
  const node=(id:string)=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)!;};
  const listeners=new Map<string,Function>();let reloads=0,frameId=0;const frames=new Map<number,FrameRequestCallback>();
  Object.assign(globalThis,{
    document:{getElementById:node,querySelectorAll:()=>steps,addEventListener:(type:string,callback:Function)=>listeners.set(type,callback)},
    location:{reload:()=>reloads++},requestAnimationFrame:(callback:FrameRequestCallback)=>{frames.set(++frameId,callback);return frameId;},cancelAnimationFrame:(id:number)=>frames.delete(id)
  });
  const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(f=>f(0));};
  node('drive').disabled=true;node('load-retry').hidden=true;
  const screen=new OpeningScreen();screen.downloads(states.at(-1)!);flush();
  assert.equal(node('loading-percent').textContent,'100%');assert.equal(node('drive').disabled,true,'Download completion does not enable Drive');
  screen.stage('Preparing the first view');assert.equal(node('opening').dataset.stage,'prepare');assert.equal(node('drive').disabled,true);
  screen.downloads(states.at(-1)!);screen.ready();
  assert.equal(frames.size,0);assert.equal(node('drive').disabled,false);assert.equal(node('opening').dataset.preview,'live');assert.equal(node('opening').attributes.get('aria-busy'),'false');
  assert.equal(node('loading-progress').attributes.get('aria-valuenow'),'100');assert.equal(node('drive-label').textContent,'Drive the coast');
  screen.fail(Error('Connection lost'));assert.equal(node('drive').disabled,true);assert.equal(node('load-retry').hidden,false);assert.equal(node('loading-status').textContent,'Connection lost');
  node('load-retry').onclick!();assert.equal(reloads,1);
  node('home-controls').open=true;listeners.get('keydown')!({key:'Escape'});assert.equal(node('home-controls').open,false);

  const baseURL=process.argv.find(arg=>arg.startsWith('--http='))?.slice(7);
  let productionFiles=0,productionBytes=0;
  if(baseURL){
    const response=await fetch(new URL('boot-manifest.json',baseURL));assert.equal(response.status,200);const catalog=await response.json() as BootManifest;
    let realRequests=0;const actual=new GameDownloads(()=>{},(url,options)=>{realRequests++;return fetch(new URL(String(url),baseURL),options);});await actual.preload(catalog);
    for(const asset of catalog.assets){assert.equal(actual.buffer(asset.url).byteLength,asset.bytes,asset.url);productionFiles++;productionBytes+=asset.bytes;}
    assert.equal(productionBytes,catalog.totalBytes);assert.equal(actual.json('/world/metadata.json').fingerprint,JSON.parse(await readFile('public/world/metadata.json','utf8')).fingerprint);
    assert.equal(new Uint8Array(actual.buffer('/assets/car/cayenne-low.glb'))[0],103);
    Object.assign(globalThis,{ProgressEvent:class extends Event{loaded:number;total:number;lengthComputable:boolean;constructor(type:string,init:ProgressEventInit){super(type);Object.assign(this,init);}}});
    DefaultLoadingManager.setURLModifier(url=>actual.resource(url));
    try{
      const library=new AssetLibrary(actual);await library.init();assert.equal(library.errors.length,0);assert.equal(library.manifest.models.length,29);
      const carBytes=await new FileLoader().setResponseType('arraybuffer').loadAsync('/assets/car/cayenne-low.glb') as ArrayBuffer;
      assert.equal(carBytes.byteLength,actual.buffer('/assets/car/cayenne-low.glb').byteLength);assert.equal(realRequests,catalog.assets.length,'Actual Three.js file loader reuses prefetched bytes');
    }finally{DefaultLoadingManager.setURLModifier(url=>url);}
    actual.release();
  }
  console.log('PASS loading: streamed/encoded downloads, byte counts, four-worker limit, asset reuse, missing/empty/changed/stalled files, abort cleanup, manifest validation, preparation/Drive gate, error/retry, Escape and ARIA. '+JSON.stringify({productionFiles,productionBytes}));
}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
