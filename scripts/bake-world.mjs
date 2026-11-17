import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const inputs=['world','grass','roads','geography','county-roads','road-grading','highlands','stunt','beachgoers','gallery','gallery-catalog','visuals','districts'];
const hash=createHash('sha256').update(await readFile(new URL(import.meta.url)));
for(const file of inputs)hash.update(await readFile(new URL('../src/'+file+'.ts',import.meta.url)));
const fingerprint=hash.digest('hex'),out=new URL('../public/world/',import.meta.url);
try{const existing=JSON.parse(await readFile(new URL('metadata.json',out),'utf8'));if(existing.fingerprint===fingerprint){await stat(new URL('county.json.gz',out));console.log('County bake is current');process.exit(0);}}catch{}
await mkdir(new URL('../.cache/',import.meta.url),{recursive:true});await mkdir(out,{recursive:true});
const runner=new URL('../.cache/bake-world-runner.mjs',import.meta.url);
await build({stdin:{contents:`
import{createCanvas,GlobalFonts,ImageData}from'@napi-rs/canvas';
import{Group,InstancedMesh}from'three';import{createWorld}from'./src/world.ts';
import{writeFileSync}from'node:fs';import{gzipSync}from'node:zlib';
const canvas=createCanvas(1,1);globalThis.HTMLCanvasElement=canvas.constructor;globalThis.ImageData=ImageData;
globalThis.document={createElement(){return createCanvas(1,1);},createElementNS(){return createCanvas(1,1);}};
for(const[name,path]of[['Barlow','public/fonts/barlow.ttf'],['Baskervville','public/fonts/baskervville.ttf']])GlobalFonts.registerFromPath(path,name);
const start=performance.now(),world=createWorld(),baked=new Group();baked.name='Prebuilt county';
baked.userData={roadImprovements:world.group.userData.roadImprovements};
for(const child of world.group.children.slice())if(child instanceof InstancedMesh||child.name==='Base terrain'||child.name.startsWith('Road ')||child.name==='Raised road curbs'||child.name==='County grass meadows')baked.add(child);
const data=baked.toJSON();
for(const geometry of data.geometries??[])for(const[name,attribute]of Object.entries(geometry.data?.attributes??{})){const precision=name==='normal'||name==='color'?100:name==='uv'?10:100;attribute.array=attribute.array.map(v=>Math.round(v*precision)/precision);}
function compact(object){for(const key of ['instanceMatrix','instanceColor'])if(object[key]?.array)object[key].array=object[key].array.map(v=>Math.round(v*10000)/10000);for(const child of object.children??[])compact(child);}
compact(data.object);
const json=JSON.stringify(data),bytes=gzipSync(json,{level:9});
writeFileSync('public/world/county.json.gz',bytes);console.log(JSON.stringify({staticObjects:baked.children.length,compressedBytes:bytes.length,jsonBytes:json.length,bakeSeconds:(performance.now()-start)/1000}));
`,resolveDir:root,loader:'js'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:fileURLToPath(runner)});
const result=spawnSync(process.execPath,[fileURLToPath(runner)],{cwd:root,stdio:'inherit',timeout:180000});if(result.error)throw result.error;if(result.status)process.exit(result.status);
await writeFile(new URL('metadata.json',out),JSON.stringify({fingerprint,format:'three-object-json+gzip',version:1},null,2));
