import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Box3,Mesh,Vector3,Material} from 'three';
import {createCar} from '../src/car.ts';
import {VEHICLE} from '../src/vehicle.ts';

globalThis.document={createElement(){return {width:0,height:0,getContext(){return new Proxy({},{get:()=>()=>{}});}};}} as unknown as Document;
// Real local GLBs are decoded through the production loader. This only supplies
// browser URL resolution and ProgressEvent for Node's fetch implementation.
globalThis.ProgressEvent=class{type:string;init:unknown;constructor(type:string,init:unknown){this.type=type;this.init=init;}} as unknown as typeof ProgressEvent;
const server=createServer(async(req,res)=>{
  try{const file=new URL('../public'+req.url,import.meta.url);const body=await readFile(file);res.writeHead(200,{'Content-Type':'model/gltf-binary','Content-Length':body.length});res.end(body);}
  catch{res.writeHead(404);res.end();}
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();assert.ok(address&&typeof address!=='string');
const origin='http://127.0.0.1:'+address.port;
const OriginalRequest=globalThis.Request;
globalThis.Request=class extends OriginalRequest{constructor(input:RequestInfo|URL,init?:RequestInit){super(typeof input==='string'?new URL(input,origin):input,init);}} as typeof Request;
try{
  const car=createCar(),signature=car.group.getObjectByName('NAREN rear calligraphy');assert.ok(signature instanceof Mesh);
  const signatureMaterial=signature.material;
  const oldPositions=signature.geometry.attributes.position,oldUvs=signature.geometry.attributes.uv;
  const originalUvCorners=Array.from({length:oldPositions.count},(_,i)=>({p:new Vector3(oldPositions.getX(i),oldPositions.getY(i),oldPositions.getZ(i)),u:oldUvs.getX(i),v:oldUvs.getY(i)}));
  const progress:number[]=[];await car.loadAssets((loaded)=>progress.push(loaded));
  assert.equal(car.group.userData.assetStatus,'optimized-local-glb');assert.deepEqual(progress,[1,2]);
  const counts:Record<string,number>={};
  for(const quality of ['low','medium','high'] as const){
    car.setQuality(quality);car.group.updateMatrixWorld(true);
    const bounds=new Box3().setFromObject(car.group),size=bounds.getSize(new Vector3());
    assert.ok(size.x<=VEHICLE.halfWidth*2+.002&&size.z<5&&size.y>1.65&&size.y<1.75&&bounds.min.y>=-.002);
    let triangles=0;car.group.traverse(object=>{if(object instanceof Mesh){triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;assert.ok(Array.from(object.geometry.attributes.position.array).every(Number.isFinite));}});counts[quality]=triangles;
    assert.equal((signature as Mesh).material,signatureMaterial,'The real calligraphy material must survive LOD changes');
    const position=signature.geometry.attributes.position,uv=signature.geometry.attributes.uv;
    for(const corner of originalUvCorners){
      let best=0,distance=Infinity;for(let i=0;i<position.count;i++){const d=new Vector3(position.getX(i),position.getY(i),position.getZ(i)).distanceTo(corner.p);if(d<distance){best=i;distance=d;}}
      assert.ok(distance<.00001&&Math.abs(uv.getX(best)-corner.u)<.00001&&Math.abs(uv.getY(best)-corner.v)<.00001,'Exported GLB must preserve signature UV orientation');
    }
  }
  assert.ok(counts.low<35000&&counts.high<50000&&counts.low<counts.high);
  car.setQuality('low');
  for(let i=0;i<120;i++)car.update(14,.2,.7,i>60,i/60,1);
  car.group.traverse(object=>{assert.ok(object.position.toArray().every(Number.isFinite));assert.ok([object.rotation.x,object.rotation.y,object.rotation.z].every(Number.isFinite));});
  const wheels=car.group.children.filter(object=>object.name.startsWith('wheel_'));assert.equal(wheels.length,4);
  assert.ok(wheels.some(wheel=>Math.abs(wheel.rotation.y)>.1));
  const friend=createCar({color:0xc9684d,label:'Friend Cayenne'});await friend.loadAssets();friend.setQuality('low');
  const localMeshes:Mesh[]=[],friendMeshes:Mesh[]=[];car.group.traverse(o=>{if(o instanceof Mesh)localMeshes.push(o);});friend.group.traverse(o=>{if(o instanceof Mesh)friendMeshes.push(o);});
  assert.equal(localMeshes.length,friendMeshes.length);for(let i=0;i<localMeshes.length;i++){assert.equal(localMeshes[i].geometry,friendMeshes[i].geometry,'Cars share cached immutable GLB geometry');assert.notEqual(localMeshes[i].material,friendMeshes[i].material,'Each car keeps its own materials');}
  const paint=friendMeshes.flatMap(o=>Array.isArray(o.material)?o.material:[o.material]).find(m=>m.name==='paint') as any;assert.equal(paint.color.getHex(),0xc9684d);
  const hostSteer=wheels[0].rotation.y;friend.update(12,-.5,.5,true,2,1);assert.equal(wheels[0].rotation.y,hostSteer,'Remote animation must not change local pivots');
  console.log('PASS two differently colored Cayennes share geometry with independent materials and wheel animation');
  console.log('PASS real car GLB loading, preserved bounds/materials, animated pivots and Low/High geometry budgets',JSON.stringify(counts));
}finally{globalThis.Request=OriginalRequest;server.close();}
