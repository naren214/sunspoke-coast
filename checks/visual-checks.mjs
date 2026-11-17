import assert from 'node:assert/strict';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {loadImage} from '@napi-rs/canvas';
import {Box3,Mesh,MeshStandardMaterial,Vector3} from 'three';

const publicRoot=new URL('../public/',import.meta.url),manifest=JSON.parse(await readFile(new URL('assets/manifest.json',publicRoot),'utf8'));
assert.ok(manifest.models.length>=25&&manifest.materials.length===7&&manifest.environments.length===3);
const loader=new GLTFLoader().register(()=>({name:'HEADLESS_GEOMETRY_CHECK',loadMaterial:async()=>new MeshStandardMaterial()}));
let files=0,highTriangles=0,lowTriangles=0,decodedImages=0;
for(const model of manifest.models){
  assert.ok(model.source.startsWith('https://')&&model.author&&model.license.startsWith('CC0'));
  const geometryCounts={};
  for(const quality of ['low','medium','high']){
    const bytes=await readFile(new URL(model.lods[quality].slice(1),publicRoot));assert.equal(bytes.toString('utf8',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);
    const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),binary=bytes.subarray(28+jsonLength);
    for(const source of json.images??[]){assert.ok(source.bufferView!==undefined,'Images must be embedded locally');const view=json.bufferViews[source.bufferView],offset=view.byteOffset??0,img=await loadImage(binary.subarray(offset,offset+view.byteLength));assert.ok(img.width>0&&img.height>0);decodedImages++;}
    const data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),gltf=await loader.parseAsync(data,'');gltf.scene.updateMatrixWorld(true);
    const bounds=new Box3().setFromObject(gltf.scene),size=bounds.getSize(new Vector3());assert.ok(bounds.min.y>-.02&&size.y>.15&&size.toArray().every(Number.isFinite),model.id+' '+quality+' normalized bounds '+JSON.stringify({min:bounds.min.toArray(),size:size.toArray()}));
    let triangles=0;gltf.scene.traverse(o=>{if(o instanceof Mesh){assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});geometryCounts[quality]=triangles;files++;
  }
  assert.ok(geometryCounts.low<=geometryCounts.medium&&geometryCounts.medium<=geometryCounts.high);highTriangles+=geometryCounts.high;lowTriangles+=geometryCounts.low;
}
for(const material of manifest.materials)for(const key of ['baseColor','normal','roughness']){const file=new URL(material[key].slice(1),publicRoot);assert.ok((await stat(file)).size>1000);const img=await loadImage(await readFile(file));assert.ok(img.width>=512&&img.height>=512);decodedImages++;}
for(const environment of manifest.environments){const hdr=await readFile(new URL(environment.url.slice(1),publicRoot)),parsed=new HDRLoader().parse(hdr.buffer.slice(hdr.byteOffset,hdr.byteOffset+hdr.byteLength));assert.ok(parsed.width>=1024&&parsed.height>=512&&parsed.data.length===parsed.width*parsed.height*4);assert.ok(Array.from(parsed.data).every(Number.isFinite));}
console.log('PASS imported GLB and image decoding, 3 LODs, normalized bounds, PBR maps, HDR decoding and redistribution metadata',JSON.stringify({models:manifest.models.length,files,decodedImages,lowTriangles,highTriangles}));
const cache=JSON.parse(gunzipSync(await readFile(new URL('world/county.json.gz',publicRoot))));assert.ok(cache.object.children.length>2000);
await mkdir(new URL('../.cache/',import.meta.url),{recursive:true});const runner=new URL('../.cache/check-hydration.mjs',import.meta.url);
await build({stdin:{contents:`
import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{gunzipSync}from'node:zlib';
import{ObjectLoader,Group,Vector3,MeshStandardMaterial,InstancedMesh}from'three';
import{createWorld}from'./src/world.ts';import{createNearbyLighting,VISUAL_QUALITY}from'./src/visuals.ts';import{createGrandGallery}from'./src/gallery.ts';
globalThis.document={createElement(){return {width:0,height:0,getContext(){return new Proxy({createLinearGradient:()=>({addColorStop(){}}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>k in o?o[k]:()=>{}});}};}};
const json=JSON.parse(gunzipSync(readFileSync('public/world/county.json.gz')));json.images=[];json.textures=[];for(const m of json.materials)for(const key of ['map','emissiveMap','bumpMap','normalMap','roughnessMap','alphaMap'])delete m[key];
const group=await new ObjectLoader().parseAsync(json),roads=group.children.filter(o=>o.name==='Road asphalt'),original=roads[0].material;
const start=performance.now(),world=createWorld(group),hydrationMs=performance.now()-start;
assert.equal(world.roads.length,53);assert.equal(world.group.children.filter(o=>o.name==='Road asphalt').length,53);assert.equal(roads[0].material,original,'Unnamed asphalt materials must not become sign materials');
assert.equal(world.group.userData.roadImprovements.roads,53);assert.ok(world.group.userData.placements.length>500);
const grass=world.group.getObjectByName('County grass meadows');assert.ok(grass.userData.tufts>100000);for(const quality of ['low','medium','high']){world.setQuality(quality);world.update(5, 'night',new Vector3(930,24,-980));assert.equal(grass.userData.quality,quality);}
const gallery=world.group.getObjectByName('NAREN Grand Drive-in Gallery');let displays=0;gallery.traverse(o=>{if(o.userData.display){assert.ok(o.userData.width<=18&&o.userData.height<=10);displays++;}});assert.equal(displays,8);
const away=new Vector3(-65,0,210);world.remotePositions.push(new Vector3(930,24,-890));for(let i=0;i<65;i++)world.stepEnvironment(1/60,away);assert.ok(gallery.userData.doors.some(d=>d.open>.99),'A remote car must open the gallery while the local car is elsewhere');world.remotePositions.length=0;for(let i=0;i<240;i++)world.stepEnvironment(1/60,away);assert.ok(gallery.userData.doors.every(d=>d.open===0),'Doors close after the remote car leaves');
const board=gallery.getObjectByName('GRAND rooftop billboard');assert.ok(board&&board.children.length===2&&board.userData.width>=70&&board.userData.bottomY>board.userData.roofY);world.update(10,'golden',new Vector3(930,24,-890));const signDay=board.children[0].material.emissiveIntensity;world.update(11,'night',new Vector3(930,24,-890));assert.ok(board.children[0].material.emissiveIntensity>signDay);
const doorGlass=[];gallery.traverse(o=>{if(o.material?.transparent&&o.material?.opacity<.4)doorGlass.push(o);});assert.equal(doorGlass.length,4);
const lights=new Group(),sites=[0,1,2,3,4,5,6,7,8,9,10,11,12,13].map(i=>({position:new Vector3(i*14,5,0),color:{r:1,g:.8,b:.6},intensity:100}));
const pool=createNearbyLighting(lights,sites);let time=0;for(const quality of ['low','medium','high']){pool.setQuality(quality);for(let i=0;i<120;i++)pool.update(time+=1/60,'night',new Vector3(0,0,0),false);assert.equal(lights.children.filter(o=>o.visible).length,VISUAL_QUALITY[quality].lights);}
let old=lights.children[0].intensity;for(let i=0;i<120;i++){pool.update(time+=1/60,'night',new Vector3(180,0,0),false);const next=lights.children[0].intensity;assert.ok(Math.abs(next-old)<12,'Light changes must fade');old=next;}
console.log('PASS prebuilt hydration, material identity, gallery fit/doors, quality propagation and smooth light handoffs',JSON.stringify({hydrationMs:Math.round(hydrationMs),placements:world.group.userData.placements.length,grass:grass.userData.tufts,dressing:world.group.getObjectByName('District gardens and foundations').userData}));
`,resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'js'},bundle:true,platform:'node',format:'esm',outfile:fileURLToPath(runner)});
const result=spawnSync(process.execPath,[fileURLToPath(runner)],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:120000,maxBuffer:1e6});process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');if(result.error)throw result.error;assert.equal(result.status,0);
