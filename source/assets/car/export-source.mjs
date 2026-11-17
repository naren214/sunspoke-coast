// Original Cayenne approximation authored in src/car.ts. No third-party model.
import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {Mesh} from 'three';
import {createCar} from '../../../src/car.ts';
globalThis.document={createElement(){return {width:0,height:0,getContext(){return new Proxy({},{get:()=>()=>{}});}};}};
const car=createCar(),materials=[],materialIds=new Map();let meshIndex=0;
function serialMaterial(material){
  if(materialIds.has(material))return materialIds.get(material);
  const id=materials.length;materialIds.set(material,id);
  materials.push({name:material.name||'car_material_'+id,color:material.color?.toArray()??[.5,.5,.5],metalness:material.metalness??0,roughness:material.roughness??.5,opacity:material.opacity,transparent:material.transparent,emissive:material.emissive?.toArray(),emissiveIntensity:material.emissiveIntensity??0,clearcoat:material.clearcoat??0});return id;
}
function node(object){
  if(object.isLight)return undefined;
  const value={name:object.name||'node',matrix:object.matrix.toArray(),children:[]};
  if(object instanceof Mesh){
    value.name='car_part_'+(meshIndex++).toString().padStart(3,'0');value.label=object.name;
    const geometry=object.geometry,p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
    value.mesh={positions:Array.from(p.array),normals:n?Array.from(n.array):undefined,uvs:uv?Array.from(uv.array):undefined,indices:geometry.index?Array.from(geometry.index.array):Array.from({length:p.count},(_,i)=>i),material:serialMaterial(object.material)};
  }
  value.children=object.children.map(node).filter(Boolean);return value;
}
car.group.updateMatrixWorld(true);const scene=node(car.group);
writeFileSync(new URL('./cayenne-source.json.gz',import.meta.url),gzipSync(JSON.stringify({description:'Original midnight-teal Cayenne approximation with NAREN signature; metres; forward -Z.',materials,scene}),{level:9}));
console.log('Wrote original car geometry source:',meshIndex,'parts');
