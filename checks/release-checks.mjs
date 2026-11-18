import assert from 'node:assert/strict';
import {readFile,stat,readdir,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url)),dist=resolve(root,'dist');
const read=path=>readFile(resolve(root,path),'utf8');
async function walk(path){const files=[];for(const entry of await readdir(path,{withFileTypes:true})){const next=resolve(path,entry.name);files.push(...(entry.isDirectory()?await walk(next):[next]));}return files;}
const html=await read('index.html'),main=(await Promise.all(['src/main.ts','src/opening.ts','src/multiplayer-game.ts'].map(read))).join('\n');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'Unique UI identifiers');
for(const match of main.matchAll(/\$\(\s*['"]([^'"]+)['"]/g))assert.ok(ids.includes(match[1]),'UI element '+match[1]);
const manifest=JSON.parse(await read('public/assets/manifest.json')),urls=new Set(['/assets/manifest.json','/world/metadata.json','/world/county.json.gz','/assets/car/sunspoke-gt-low.glb','/assets/car/sunspoke-gt-high.glb']);
for(const entry of manifest.models){
  const names=[];
  for(const level of ['low','medium','high']){
    const url=entry.lods[level];urls.add(url);const buffer=await readFile(resolve(dist,'.'+url));
    const json=JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString());
    names.push(json.nodes.filter(n=>n.mesh!==undefined).map(n=>n.name).sort());
  }
  assert.deepEqual(names[0],names[1],entry.id+' medium LOD parts');assert.deepEqual(names[0],names[2],entry.id+' high LOD parts');
}
for(const entry of manifest.materials)for(const field of ['baseColor','normal','roughness'])urls.add(entry[field]);
for(const entry of manifest.environments)urls.add(entry.url);
for(const url of urls){assert.ok(url.startsWith('/')&&!url.startsWith('//'),'Locally bundled URL '+url);assert.ok((await stat(resolve(dist,'.'+url))).size>0,'Built asset '+url);}
const files=await walk(dist),sizes=new Map(await Promise.all(files.map(async path=>[path,(await stat(path)).size])));
const initial=new Set(files.filter(path=>/[/\\](fonts|gallery)[/\\]/.test(path)));
for(const path of files)if(/[/\\]index\.html$/.test(path)||/[/\\]assets[/\\][^/\\]+\.(js|css)$/.test(path)&&!/[\/\\]qa-/.test(path)||/[/\\]home[/\\]/.test(path)||path.endsWith('boot-manifest.json'))initial.add(path);
for(const url of ['/assets/manifest.json','/assets/car/sunspoke-gt-low.glb'])initial.add(resolve(dist,'.'+url));
for(const id of ['palm','bench','boulder'])initial.add(resolve(dist,'.'+manifest.models.find(m=>m.id===id).lods.low));
for(const entry of manifest.materials)for(const field of ['baseColor','normal','roughness'])initial.add(resolve(dist,'.'+entry[field]));
initial.add(resolve(dist,'.'+manifest.environments.find(e=>e.id==='golden').url));
const sum=paths=>[...paths].reduce((total,path)=>total+sizes.get(path),0);
const boot=JSON.parse(await read('dist/boot-manifest.json'));
assert.equal(boot.totalBytes,boot.assets.reduce((total,asset)=>total+sizes.get(resolve(dist,'.'+asset.url)),0),'Startup manifest matches built files');
const report={build:'sunspoke-gt',files:files.length,modelDesigns:manifest.models.length,modelLevels:manifest.models.length*3,initialLowAssetBytes:sum(initial),startupDataBytes:boot.totalBytes,startupDataFiles:boot.assets.length,fullBuiltBytes:sum(files),budgetBytes:{initial:25000000,full:120000000},scope:'Static byte accounting for a fresh Low-quality start; not a browser network waterfall or FPS measurement.'};
assert.ok(report.initialLowAssetBytes<=report.budgetBytes.initial,JSON.stringify(report));assert.ok(report.fullBuiltBytes<=report.budgetBytes.full);
const baseURL=process.argv.find(arg=>arg.startsWith('--http='))?.slice(7);
if(baseURL){
  for(let start=0;start<files.length;start+=12)await Promise.all(files.slice(start,start+12).map(async path=>{
    const pathname=path.slice(dist.length+1).replaceAll('\\','/'),response=await fetch(new URL(pathname,baseURL),{method:'HEAD'});
    assert.equal(response.status,200,'HTTP '+pathname);assert.equal(Number(response.headers.get('content-length')),sizes.get(path),'HTTP size '+pathname);
    if(path.endsWith('.js'))assert.ok(response.headers.get('content-type').includes('javascript'));
    if(path.endsWith('.glb'))assert.ok(response.headers.get('content-type').includes('model/gltf-binary'));
  }));
  report.http={baseURL,successfulBuiltFiles:files.length};
}
await mkdir(resolve(root,'.cache'),{recursive:true});await writeFile(resolve(root,'.cache/release-report.json'),JSON.stringify(report,null,2)+'\n');
console.log('PASS UI wiring, local built assets, consistent LOD parts and download budgets',JSON.stringify(report));
