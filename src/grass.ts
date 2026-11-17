import * as T from 'three';
import type { Collider, Quality } from './types';
import { CITY } from './city';
import { insideGallery, isLand } from './geography';
import { insideStunt } from './stunt';

function seeded(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

export function createGrassMaterial(){
  const random=seeded(684217),canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d')!,pixels=ctx.createImageData(512,512);
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    const i=(y*512+x)*4,grain=random()-.5;
    const patch=Math.sin(x*.049+Math.sin(y*.031))*Math.sin(y*.057)*7;
    pixels.data[i]=66+grain*26+patch;pixels.data[i+1]=103+grain*35+patch;pixels.data[i+2]=45+grain*19+patch*.6;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  for(let i=0;i<14000;i++){
    const x=random()*512,y=random()*512;
    ctx.strokeStyle=['#7b9c50','#416f38','#8aa85b','#567d3e'][i%4];ctx.lineWidth=.5+random()*.8;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(random()-.5)*3,y-2-random()*7);ctx.stroke();
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.setScalar(.125);texture.anisotropy=4;
  const material=new T.MeshStandardMaterial({map:texture,roughness:1});material.name='County meadow grass';
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vMeadowWorld;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMeadowWorld=(modelMatrix*vec4(transformed,1.)).xz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vMeadowWorld;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float meadow=sin(vMeadowWorld.x*.031+sin(vMeadowWorld.y*.018))*sin(vMeadowWorld.y*.027);
      float fineMeadow=sin(vMeadowWorld.x*.103+vMeadowWorld.y*.061)*.035;
      diffuseColor.rgb*=mix(vec3(.84,.91,.79),vec3(1.12,1.08,.94),.5+.5*meadow)+fineMeadow;`);
  };
  material.customProgramCacheKey=()=> 'sunspoke-meadow-v1';
  return material;
}

export function createGrassField(group:T.Group,colliders:Collider[],ground:(x:number,z:number)=>number,roadClear:(x:number,z:number,margin:number)=>boolean,paving:Collider[],cached?:T.Group){
  if(cached)return hydrateGrassField(cached);
  const root=new T.Group();root.name='County grass meadows';group.add(root);
  const random=seeded(103721),size=48,buckets=new Map<string,{x:number;z:number;matrices:T.Matrix4[]}>();
  // A small spatial mask keeps blades off building pads, pools, plazas and paths.
  const masks=new Map<string,Collider[]>(),maskSize=48;
  for(const b of [...colliders.filter(b=>(b.baseY??ground(b.x,b.z))<ground(b.x,b.z)+2),...paving]){
    const c=Math.cos(b.rotation??0),s=Math.sin(b.rotation??0),rx=Math.abs(c)*b.halfX+Math.abs(s)*b.halfZ+2,rz=Math.abs(s)*b.halfX+Math.abs(c)*b.halfZ+2;
    for(let x=Math.floor((b.x-rx)/maskSize);x<=Math.floor((b.x+rx)/maskSize);x++)for(let z=Math.floor((b.z-rz)/maskSize);z<=Math.floor((b.z+rz)/maskSize);z++){
      const key=x+','+z,list=masks.get(key)??[];list.push(b);masks.set(key,list);
    }
  }
  const blocked=(x:number,z:number)=>{
    for(const b of masks.get(Math.floor(x/maskSize)+','+Math.floor(z/maskSize))??[]){
      const c=Math.cos(b.rotation??0),s=Math.sin(b.rotation??0),dx=x-b.x,dz=z-b.z;
      if(Math.abs(dx*c-dz*s)<b.halfX+1.4&&Math.abs(dx*s+dz*c)<b.halfZ+1.4)return true;
    }
    return false;
  };
  const positions:number[]=[],indices:number[]=[];
  // Six tapered blades per tuft. Opaque geometry avoids transparent overdraw.
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3,dx=Math.cos(a)*.10,dz=Math.sin(a)*.10,bx=Math.cos(a+.8)*.13,bz=Math.sin(a+.8)*.13,n=positions.length/3;
    positions.push(bx-dx,0,bz-dz,bx+dx,0,bz+dz,bx+dx*.3,.57,bz+dz*.3,bx+dx*.7,1,bz+dz*.7);
    indices.push(n,n+1,n+2,n+1,n+3,n+2);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.setAttribute('color',new T.Float32BufferAttribute(positions.map((_,i)=>.65+.35*positions[Math.floor(i/3)*3+1]),3));
  const wind={value:0},range={value:85},material=new T.MeshLambertMaterial({color:'#74934f',side:T.DoubleSide,vertexColors:true});
  material.name='Wind grass blades';
  material.onBeforeCompile=shader=>{
    shader.uniforms.grassClock=wind;shader.uniforms.grassRange=range;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float grassClock;uniform float grassRange;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 grassWorld=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;
      float grassFade=1.-smoothstep(grassRange-25.,grassRange,distance(grassWorld,cameraPosition));
      float tip=position.y*position.y;
      transformed.x+=sin(grassWorld.x*.34+grassWorld.z*.21+grassClock*1.5)*.17*tip;
      transformed.z+=cos(grassWorld.z*.27+grassClock*1.1)*.10*tip;
      transformed.y*=grassFade;`);
  };
  material.customProgramCacheKey=()=> 'sunspoke-wind-grass-v1';
  const dummy=new T.Object3D();let count=0;
  for(let z=CITY.minZ+6;z<CITY.maxZ-4;z+=3.6)for(let x=-84;x<CITY.maxX-4;x+=3.6){
    const xx=x+(random()-.5)*2.9,zz=z+(random()-.5)*2.9;
    if(xx< -75&&zz> -315&&zz<315)continue;
    if(!isLand(xx,zz)||insideGallery(xx,zz,8)||insideStunt(xx,zz,6)||!roadClear(xx,zz,4.2)||blocked(xx,zz))continue;
    const y=ground(xx,zz),neighbor=ground(xx+.7,zz+.7);
    if(y<-.2||Math.abs(y-neighbor)>1.2)continue;
    dummy.position.set(xx,y-.015,zz);dummy.rotation.set(0,random()*Math.PI*2,0);
    const scale=.7+random()*.8,urban=zz> -400||insideGallery(xx,zz,60);
    dummy.scale.set(scale,urban?.16+random()*.17:.26+random()*.36,scale);dummy.updateMatrix();
    const key=Math.floor(xx/size)+','+Math.floor(zz/size);
    let bucket=buckets.get(key);if(!bucket){bucket={x:(Math.floor(xx/size)+.5)*size,z:(Math.floor(zz/size)+.5)*size,matrices:[]};buckets.set(key,bucket);}
    bucket.matrices.push(dummy.matrix.clone());count++;
  }
  const color=new T.Color(),meshes:{mesh:T.InstancedMesh;x:number;z:number;full:number}[]=[];
  for(const b of buckets.values()){
    // Low/Medium draw a uniformly shuffled subset, rather than half of a patch.
    for(let i=b.matrices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[b.matrices[i],b.matrices[j]]=[b.matrices[j],b.matrices[i]];}
    const mesh=new T.InstancedMesh(geometry,material,b.matrices.length);mesh.name='Grass patch';
    b.matrices.forEach((matrix,i)=>{mesh.setMatrixAt(i,matrix);color.setHSL(.24+random()*.055,.27+random()*.12,.25+random()*.13);mesh.setColorAt(i,color);});
    mesh.castShadow=false;mesh.receiveShadow=true;mesh.computeBoundingSphere();
    if(mesh.boundingSphere)mesh.boundingSphere.radius+=.6;
    root.add(mesh);meshes.push({mesh,x:b.x,z:b.z,full:b.matrices.length});
    mesh.userData.patch={x:b.x,z:b.z,full:b.matrices.length};
  }
  let quality:Quality='low';
  const presets={low:{range:80,density:.38},medium:{range:115,density:.68},high:{range:155,density:1}};
  function setQuality(next:Quality){quality=next;range.value=presets[next].range;meshes.forEach(b=>{b.mesh.count=Math.ceil(b.full*presets[next].density);});root.userData.quality=next;}
  function update(time:number,position:T.Vector3){
    wind.value=time;const reach=presets[quality].range+size*.72;
    for(const b of meshes)b.mesh.visible=(b.x-position.x)**2+(b.z-position.z)**2<reach*reach;
  }
  root.userData={tufts:count,chunks:meshes.length,trianglesPerTuft:12,quality:'low',spacing:3.6};
  setQuality('low');update(0,new T.Vector3(-65,0,210));
  return {update,setQuality};
}

function hydrateGrassField(root:T.Group){
  const wind={value:0},range={value:80},meshes=root.children as T.InstancedMesh[],material=meshes[0]?.material as T.MeshLambertMaterial;
  if(material){material.onBeforeCompile=shader=>{
    shader.uniforms.grassClock=wind;shader.uniforms.grassRange=range;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float grassClock;uniform float grassRange;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 grassWorld=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;
      float fade=1.-smoothstep(grassRange-25.,grassRange,distance(grassWorld,cameraPosition));float tip=position.y*position.y;
      transformed.x+=sin(grassWorld.x*.34+grassWorld.z*.21+grassClock*1.5)*.17*tip;
      transformed.z+=cos(grassWorld.z*.27+grassClock*1.1)*.10*tip;transformed.y*=fade;`);
  };material.customProgramCacheKey=()=> 'sunspoke-baked-wind-grass-v1';}
  const presets={low:{range:80,density:.38},medium:{range:115,density:.68},high:{range:155,density:1}};let quality:Quality='low';
  function setQuality(next:Quality){quality=next;range.value=presets[next].range;for(const mesh of meshes)mesh.count=Math.ceil((mesh.userData.patch?.full??mesh.instanceMatrix.count)*presets[next].density);root.userData.quality=next;}
  function update(time:number,p:T.Vector3){wind.value=time;const reach=presets[quality].range+35;for(const mesh of meshes){const patch=mesh.userData.patch;mesh.visible=patch?(patch.x-p.x)**2+(patch.z-p.z)**2<reach*reach:true;}}
  setQuality('low');update(0,new T.Vector3(-65,0,210));return {update,setQuality};
}
