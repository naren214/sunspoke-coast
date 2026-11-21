import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const inputs=['world','city','grass','roads','geography','county-roads','places','road-grading','highlands','stunt','beachgoers','gallery','gallery-catalog','visuals','districts'];
const hash=createHash('sha256').update(await readFile(new URL(import.meta.url)));
for(const file of inputs)hash.update(await readFile(new URL('../src/'+file+'.ts',import.meta.url)));
for(const file of ['switchback-route','protocol'])hash.update(await readFile(new URL('../shared/'+file+'.ts',import.meta.url)));
const fingerprint=hash.digest('hex'),out=new URL('../public/world/',import.meta.url);
try{const existing=JSON.parse(await readFile(new URL('metadata.json',out),'utf8'));if(existing.fingerprint===fingerprint){await stat(new URL('county.json.gz',out));await stat(new URL('../shared/tracks.json',import.meta.url));console.log('County bake is current');process.exit(0);}}catch{}
await mkdir(new URL('../.cache/',import.meta.url),{recursive:true});await mkdir(out,{recursive:true});
const runner=new URL('../.cache/bake-world-runner.mjs',import.meta.url);
await build({stdin:{contents:`
import{createCanvas,GlobalFonts,ImageData}from'@napi-rs/canvas';
import{Box3,Float32BufferAttribute,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,Vector3}from'three';
import{mergeGeometries}from'three/addons/utils/BufferGeometryUtils.js';import{createWorld}from'./src/world.ts';
import{buildSwitchbacks}from'./shared/switchback-route.ts';
import{writeFileSync}from'node:fs';import{gzipSync}from'node:zlib';
const canvas=createCanvas(1,1);globalThis.HTMLCanvasElement=canvas.constructor;globalThis.ImageData=ImageData;
globalThis.document={createElement(){return createCanvas(1,1);},createElementNS(){return createCanvas(1,1);}};
for(const[name,path]of[['Barlow','public/fonts/barlow.ttf'],['Baskervville','public/fonts/baskervville.ttf']])GlobalFonts.registerFromPath(path,name);
const start=performance.now(),world=createWorld(),baked=new Group();baked.name='Prebuilt county';
const coast=world.roads[0].points;let nearest=0;coast.forEach((p,i)=>{if(Math.hypot(p.x+65,p.z-210)<Math.hypot(coast[nearest].x+65,coast[nearest].z-210))nearest=i;});
const loop=[...coast.slice(nearest),...coast.slice(1,nearest+1)];
const tracks=[{id:'beachfront',name:'Beachfront Circuit',closed:true,width:18,points:loop},{id:'silver-lake',name:'Silver Lake Circuit',closed:true,width:17,points:world.roads.find(r=>r.name==='Silver Lake Circuit').points},{id:'airport',name:'Airport Sprint',closed:false,width:34,points:[{x:110,z:520,y:world.surfaceHeight(110,520)},{x:410,z:520,y:world.surfaceHeight(410,520)}]}].map(track=>({...track,points:track.points.filter((p,i)=>i===0||i===track.points.length-1||i%3===0).map(p=>[p.x,p.y,p.z].map(n=>Math.round(n*1000)/1000))}));
tracks.push(buildSwitchbacks((x,z)=>world.surfaceHeight(x,z)));
writeFileSync('shared/tracks.json',JSON.stringify({mapVersion:'${fingerprint}:rooms-v1',tracks}));
baked.userData={roadImprovements:world.group.userData.roadImprovements};
for(const child of world.group.children.slice())if(child instanceof InstancedMesh||child.name==='Base terrain'||child.name==='Beach boardwalk'||child.name.startsWith('Road ')||child.name==='Raised road curbs'||child.name==='County grass meadows')baked.add(child);
world.group.updateMatrixWorld(true);baked.updateMatrixWorld(true);
const mergeBuckets=new Map(),staticInstances=baked.children.filter(child=>child instanceof InstancedMesh&&!child.userData.resource&&!child.instanceColor&&!Array.isArray(child.material)&&!child.material.transparent&&!Object.keys(child.geometry.morphAttributes).length);
const mergeSources=new Set();let mergedInstanceCount=0;
// These surfaces have identical lighting parameters and never receive
// replacement textures at runtime. Store each original solid color per vertex.
const solidSurfaces=new Set(['tile','white','yellow','dark','shell','aqua','green','inlay','plinth','palm','frond','leaf','hedge','roof','foam','rock','grass'].map(name=>'surface:'+name));
const solidMaterial=new MeshStandardMaterial({name:'Baked solid scenery',roughness:.78,metalness:0,vertexColors:true});
function attributeLayout(geometry){return 'index:'+Boolean(geometry.index)+'|'+Object.keys(geometry.attributes).sort().map(name=>{const attribute=geometry.attributes[name];return name+':'+attribute.itemSize+':'+attribute.normalized+':'+attribute.array.constructor.name;}).join('|');}
for(let i=0;i<staticInstances.length;i++){
  const source=staticInstances[i],cell=source.userData.worldCell??'unbatched-'+i;
  const original=source.material,layout=attributeLayout(source.geometry);
  const solid=solidSurfaces.has(original.name)&&original.type==='MeshStandardMaterial'&&original.roughness===.78&&original.metalness===0
    &&original.opacity===1&&!original.vertexColors&&!original.map&&!original.alphaMap&&!original.alphaHash
    &&original.alphaTest===0&&original.emissive.getHex()===0&&original.side===solidMaterial.side
    &&!source.geometry.hasAttribute('color')&&source.count*source.geometry.getAttribute('position').count<=3000;
  const material=solid?solidMaterial:original;
  const key=[cell,material.uuid,source.castShadow,source.receiveShadow,source.renderOrder,layout].join('|');
  const bucket=mergeBuckets.get(key)??{cell,material,solid,castShadow:source.castShadow,receiveShadow:source.receiveShadow,renderOrder:source.renderOrder,sources:[]};
  bucket.sources.push(source);mergeBuckets.set(key,bucket);
}
const tiles=new Map();let mergedBatches=0,mergedVertices=0,mergedGroups=0;
function tileFor(cell){let tile=tiles.get(cell);if(!tile){tile=new Group();tile.name='County tile '+cell;tile.userData.worldCell=cell;tiles.set(cell,tile);baked.add(tile);}return tile;}
function includeTileBounds(tile,bounds){const values=tile.userData.worldBounds,aggregate=values?new Box3(new Vector3(values[0],values[1],values[2]),new Vector3(values[3],values[4],values[5])):new Box3();aggregate.union(bounds);tile.userData.worldBounds=[aggregate.min.x,aggregate.min.y,aggregate.min.z,aggregate.max.x,aggregate.max.y,aggregate.max.z];}
for(const bucket of mergeBuckets.values()){
  if(bucket.sources.length<2)continue;
  const transformed=[];let instances=0;
  for(const source of bucket.sources){
    const instance=new Matrix4(),matrix=new Matrix4();
    for(let i=0;i<source.count;i++){
      source.getMatrixAt(i,instance);
      matrix.multiplyMatrices(source.matrixWorld,instance);
      const geometry=source.geometry.clone().applyMatrix4(matrix);
      if(bucket.solid){
        const color=source.material.color,colors=new Float32Array(geometry.getAttribute('position').count*3);
        for(let j=0;j<colors.length;j+=3){colors[j]=color.r;colors[j+1]=color.g;colors[j+2]=color.b;}
        geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
      }
      transformed.push(geometry);instances++;
    }
  }
  const geometry=mergeGeometries(transformed,false);
  for(const part of transformed)part.dispose();
  if(!geometry)throw Error('Could not safely merge static geometry in county tile '+bucket.cell);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new Mesh(geometry,bucket.material);
  mesh.name='County static '+bucket.cell+': '+(bucket.material.name||'scenery');
  mesh.castShadow=bucket.castShadow;mesh.receiveShadow=bucket.receiveShadow;mesh.renderOrder=bucket.renderOrder;
  mesh.frustumCulled=true;mesh.userData.worldCell=bucket.cell;
  const tile=tileFor(bucket.cell);tile.add(mesh);
  includeTileBounds(tile,new Box3().copy(geometry.boundingBox).applyMatrix4(mesh.matrix));
  mergedBatches+=bucket.sources.length;mergedInstanceCount+=instances;
  mergedVertices+=geometry.getAttribute('position').count;mergedGroups++;
  for(const source of bucket.sources)mergeSources.add(source);
}
baked.remove(...mergeSources);
// Put unmerged static instance batches under the same cullable cell groups.
// Without this, eligible batches were culled but most original batches stayed
// at the county root and were submitted on every frame from every district.
for(let i=0;i<staticInstances.length;i++){
  const source=staticInstances[i];if(mergeSources.has(source))continue;
  const cell=source.userData.worldCell??'unbatched-'+i,tile=tileFor(cell);
  source.computeBoundingBox();source.updateMatrix();
  includeTileBounds(tile,new Box3().copy(source.boundingBox).applyMatrix4(source.matrix));
  tile.add(source);
}
const rendering={cellSize:120,sourceBatches:staticInstances.length,mergedBatches,mergedInstances:mergedInstanceCount,mergedVertices,outputBatches:staticInstances.length-mergedBatches+mergedGroups,tiles:tiles.size};
baked.userData.rendering=rendering;
console.log('Static scenery geometry',JSON.stringify(rendering));
const data=baked.toJSON();
for(const geometry of data.geometries??[])for(const[name,attribute]of Object.entries(geometry.data?.attributes??{})){const precision=name==='color'?10000:name==='uv'?10:100;attribute.array=attribute.array.map(v=>Math.round(v*precision)/precision);}
function compact(object){for(const key of ['instanceMatrix','instanceColor'])if(object[key]?.array)object[key].array=object[key].array.map(v=>Math.round(v*10000)/10000);for(const child of object.children??[])compact(child);}
compact(data.object);
const json=JSON.stringify(data),bytes=gzipSync(json,{level:9});
writeFileSync('public/world/county.json.gz',bytes);console.log(JSON.stringify({staticObjects:baked.children.length,compressedBytes:bytes.length,jsonBytes:json.length,bakeSeconds:(performance.now()-start)/1000}));
`,resolveDir:root,loader:'js'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:fileURLToPath(runner)});
const result=spawnSync(process.execPath,[fileURLToPath(runner)],{cwd:root,stdio:'inherit',timeout:180000});if(result.error)throw result.error;if(result.status)process.exit(result.status);
await writeFile(new URL('metadata.json',out),JSON.stringify({fingerprint,format:'three-object-json+gzip',version:1},null,2));
