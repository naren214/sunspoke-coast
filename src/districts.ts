import * as T from 'three';
import type {World,Collider,Lighting,Quality} from './types';
import type {Placement} from './assets';
import {DISTRICTS,MAINLAND,ISLAND,WATERS,RIVER,riverAt,isLand,waterLevel,insideGallery} from './geography';
import {createRoadIndex} from './road-grading';
import {insideStunt} from './stunt';

export function districtAt(x:number,z:number){return DISTRICTS.reduce((best,d)=>(d.x-x)**2+(d.z-z)**2<(best.x-x)**2+(best.z-z)**2?d:best,DISTRICTS[0]);}

export function dressDistricts(group:T.Group,colliders:Collider[],roads:World['roads'],ground:World['groundHeight'],placements:Placement[]){
  const root=new T.Group();root.name='District gardens and foundations';group.add(root);
  const index=createRoadIndex(roads,ground),unit=new T.BoxGeometry(1,1,1),mat=new T.MeshStandardMaterial({color:'#b1aaa0',roughness:.92});
  mat.name='surface:stone';const matrices:T.Matrix4[]=[],dummy=new T.Object3D();
  const blocked=(x:number,z:number,w:number,d:number,margin=1)=>colliders.some(b=>{
    if(b.baseY!==undefined&&b.baseY>ground(b.x,b.z)+3)return false;
    const c=Math.cos(b.rotation??0),s=Math.sin(b.rotation??0),dx=x-b.x,dz=z-b.z;
    const halfX=(Math.abs(c)*w+Math.abs(s)*d)/2,halfZ=(Math.abs(s)*w+Math.abs(c)*d)/2;
    return Math.abs(dx*c-dz*s)<b.halfX+halfX+margin&&Math.abs(dx*s+dz*c)<b.halfZ+halfZ+margin;
  });
  const clear=(x:number,z:number,w:number,d:number)=>isLand(x,z)&&!insideGallery(x,z,25)&&!insideStunt(x,z,8)&&index.clear(x,z,Math.hypot(w,d)/2+3)&&!blocked(x,z,w,d)&&[[-1,-1],[1,-1],[1,1],[-1,1]].every(([a,b])=>isLand(x+a*w/2,z+b*d/2));
  function box(x:number,y:number,z:number,w:number,h:number,d:number,yaw=0){dummy.position.set(x,y,z);dummy.rotation.set(0,yaw,0);dummy.scale.set(w,h,d);dummy.updateMatrix();matrices.push(dummy.matrix.clone());}
  const foundationKeys=new Set<string>();
  for(const b of colliders.slice()){
    if(b.halfX<5||b.halfZ<5||b.height<5||b.baseY!==undefined)continue;
    const key=Math.round(b.x/5)+','+Math.round(b.z/5);if(foundationKeys.has(key))continue;foundationKeys.add(key);
    const y=ground(b.x,b.z);
    const c=Math.cos(b.rotation??0),s=Math.sin(b.rotation??0);
    for(const side of [-1,1])for(const axis of [0,1]){
      const dx=axis===0?side*b.halfX:0,dz=axis===1?side*b.halfZ:0;
      const x=b.x+dx*c+dz*s,z=b.z-dx*s+dz*c,edge=ground(x,z),height=Math.max(.35,y-edge+.25);
      if(index.clear(x,z,.7))box(x,Math.min(y,edge)+height/2-.08,z,axis===0?.35:b.halfX*2,height,axis===1?.35:b.halfZ*2,b.rotation??0);
    }
    // Shared roof equipment adds believable scale without another building mesh.
    if(b.height>14&&b.halfX>8&&b.halfZ>8)placements.push({id:'aircon',x:b.x-3,y:y+b.height+.1,z:b.z-3,height:1.2,rotation:Math.PI/2});
  }
  let homes=0,towers=0;
  for(const [i,[x,z]] of [[130,-670],[120,-790],[120,-900],[80,-1050],[150,-1140],[300,-1130],[420,-1130],[540,-1130],[90,-550],[240,-540],[360,-540],[450,-530],[645,-925],[650,-850],[650,-660],[520,-570]].entries()){
    if(!clear(x,z,16,14))continue;const height=7+(i%3)*1.4,y=ground(x,z),id=['house-a','house-g','house-n'][i%3];
    placements.push({id,x,y,z,height,size:[16,height,14],rotation:i%2?Math.PI:0});colliders.push({x,z,halfX:8,halfZ:7,height});homes++;
    box(x,y-.05,z,19,.15,17);
    for(const s of [-1,1])placements.push({id:'broadleaf',x:x+s*12,y:ground(x+s*12,z),z,height:5.5});
  }
  for(const [i,[x,z]] of [[590,-330],[760,-330],[875,-330],[1010,-890],[1150,-990],[1240,-840],[660,330],[780,340]].entries()){
    if(!clear(x,z,28,26))continue;const height=42+(i%4)*12,y=ground(x,z);
    placements.push({id:['tower-a','tower-c','tower-g','tower-m','tower-sky-a','tower-sky-c'][i%6],x,y,z,height,size:[28,height,26]});colliders.push({x,z,halfX:14,halfZ:13,height});box(x,y-.05,z,31,.15,29);towers++;
  }
  const furniture:Record<string,string[]> = {
    'SUNSPOKE BEACH':['bench','seating','trashcan'],
    'PALM QUARTER':['planter','bench','planter'],
    'CROWN DOWNTOWN':['seating','planter','trashcan'],
    'CANAL GARDENS':['bench','planter','seating'],
    'SOUTHPORT':['crate','barrel'],
    'COAST AIRFIELD':['crate','barrel'],
    'ISLA LUZ':['bench','picnic','trashcan'],
    'SIERRA VERDE':['bench','picnic','planter'],
    'SILVER LAKE':['seating','planter','bench'],
  };
  let props=0;
  roads.forEach((road,roadId)=>{
    if(road.name?.includes('Runway')||road.name==='Grand Gallery Drive')return;
    for(let i=12;i<road.points.length;i+=29){const a=road.points[i-1],p=road.points[i],dx=p.x-a.x,dz=p.z-a.z,len=Math.hypot(dx,dz)||1,side=i%2?1:-1,x=p.x+side*dz/len*(road.width/2+4.8),z=p.z-side*dx/len*(road.width/2+4.8);
      if(!clear(x,z,1.3,1.3))continue;
      const district=districtAt(x,z).name,options=furniture[district],id=options[(Math.floor(i/29)+roadId)%options.length];
      const height=id==='planter'?.7:id==='trashcan'?.9:1;
      placements.push({id,x,y:ground(x,z),z,height,rotation:Math.atan2(dx,dz)});props++;
      const actorX=x+side*dz/len*1.9,actorZ=z-side*dx/len*1.9;
      if(i%3===0&&district!=='SOUTHPORT'&&district!=='COAST AIRFIELD'&&clear(actorX,actorZ,2,2)){
        placements.push({id:i%2?'adult-man':'adult-woman',x:actorX,y:ground(actorX,actorZ),z:actorZ,height:1.75,rotation:Math.atan2(-dz,dx)});
      }
    }
  });
  for(const [x,z] of [[1080,-40],[1080,160],[1080,330],[1145,730],[1148,845]])placements.push({id:'boat-row-small',x,y:waterLevel(x,z)+.1,z,height:.85,rotation:.4});
  const mesh=new T.InstancedMesh(unit,mat,matrices.length);mesh.name='Terraced foundations';matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh);
  root.userData={newHomes:homes,newTowers:towers,streetProps:props,foundations:foundationKeys.size};
  // Sandy and planted banks hide coarse terrain edges without touching roads.
  const bankPositions:number[]=[],uv:number[]=[],indices:number[]=[];
  const outlines=[MAINLAND,ISLAND,...WATERS.filter(w=>w.polygon).map(w=>w.polygon!)];
  for(const outline of outlines)for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(!len)continue;
    let nx=dz/len,nz=-dx/len;const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;if(!isLand(mx+nx*6,mz+nz*6)){nx=-nx;nz=-nz;}
    const steps=Math.ceil(len/4);
    for(let j=0;j<steps;j++){
      const x0=a[0]+dx*j/steps,z0=a[1]+dz*j/steps,x1=a[0]+dx*(j+1)/steps,z1=a[1]+dz*(j+1)/steps;
      if(!index.clear((x0+x1)/2,(z0+z1)/2,10)||insideStunt(x0,z0,8)||riverAt(x0,z0).distance<RIVER.width/2+4)continue;
      const n=bankPositions.length/3;for(const[x,z,land]of[[x0+nx*5,z0+nz*5,1],[x0-nx*3,z0-nz*3,0],[x1+nx*5,z1+nz*5,1],[x1-nx*3,z1-nz*3,0]]){bankPositions.push(x,land?ground(x,z)+.02:waterLevel(x,z)-.4,z);uv.push(x,z);}indices.push(n,n+1,n+2,n+2,n+1,n+3);
    }
  }
  const bankGeometry=new T.BufferGeometry();bankGeometry.setAttribute('position',new T.Float32BufferAttribute(bankPositions,3));bankGeometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));bankGeometry.setIndex(indices);bankGeometry.computeVertexNormals();const bankMat=new T.MeshStandardMaterial({color:'#acb185',roughness:1,side:T.DoubleSide});bankMat.name='surface:sand';const banks=new T.Mesh(bankGeometry,bankMat);banks.name='Soft shoreline banks';banks.receiveShadow=true;root.add(banks);
  const reedsGeometry=new T.BufferGeometry();reedsGeometry.setAttribute('position',new T.Float32BufferAttribute([-.07,0,0,.07,0,0,.02,1.4,.12,0,0,-.07,0,0,.07,.1,1.2,0,-.05,0,-.05,.05,0,.05,-.08,1.1,.1],3));reedsGeometry.computeVertexNormals();
  const reedMatrices:T.Matrix4[]=[];
  for(let i=1;i<RIVER.points.length;i++){const a=RIVER.points[i-1],b=RIVER.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),steps=Math.ceil(len/7);
    for(let j=0;j<steps;j++)for(const side of [-1,1]){const x=a[0]+dx*j/steps+side*dz/len*(RIVER.width/2+3),z=a[1]+dz*j/steps-side*dx/len*(RIVER.width/2+3);if(!isLand(x,z)||!index.clear(x,z,5)||insideGallery(x,z,12))continue;dummy.position.set(x,ground(x,z),z);dummy.rotation.set(0,j*.73,0);dummy.scale.setScalar(.7+(j%4)*.2);dummy.updateMatrix();reedMatrices.push(dummy.matrix.clone());}
  }
  const reeds=new T.InstancedMesh(reedsGeometry,new T.MeshLambertMaterial({color:'#7f9056',side:T.DoubleSide}),reedMatrices.length);reedMatrices.forEach((m,i)=>reeds.setMatrixAt(i,m));reeds.name='Riverbank reeds';reeds.computeBoundingSphere();root.add(reeds);root.userData.reedClumps=reedMatrices.length;
  for(const district of DISTRICTS){
    let closest=roads[0],point=roads[0].points[0],best=Infinity;for(const road of roads)for(let i=8;i<road.points.length-1;i+=16){const p=road.points[i],d=(p.x-district.x)**2+(p.z-district.z)**2;if(d<best){best=d;closest=road;point=p;}}
    const at=closest.points.indexOf(point),next=closest.points[at+1],dx=next.x-point.x,dz=next.z-point.z,len=Math.hypot(dx,dz),x=point.x+dz/len*(closest.width/2+3.3),z=point.z-dx/len*(closest.width/2+3.3);if(!isLand(x,z)||!index.clear(x,z,1.5)||insideGallery(x,z,15)||insideStunt(x,z,10))continue;
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#142f34';ctx.fillRect(0,0,512,128);ctx.fillStyle=district.color;ctx.fillRect(0,0,11,128);
    ctx.textAlign='left';ctx.font='bold 35px Barlow,Arial';ctx.fillStyle='#f4edcc';ctx.fillText(district.name,31,55,454);
    ctx.fillStyle=district.color;ctx.font='23px Barlow,Arial';ctx.fillText(closest.name??'Coast Boulevard',31,96,454);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;const sign=new T.Mesh(new T.PlaneGeometry(5.5,1.35),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));sign.position.set(x,ground(x,z)+3.1,z);sign.rotation.y=Math.atan2(point.x-x,point.z-z);root.add(sign);const pole=new T.Mesh(new T.CylinderGeometry(.055,.055,3.1,6),new T.MeshStandardMaterial({color:'#667977',metalness:.4}));pole.position.set(x,ground(x,z)+1.55,z);root.add(pole);
  }
  return root;
}

export function createAmbientLife(group:T.Group,ground:World['groundHeight']){
  const root=new T.Group();root.name='Ambient coastal life';group.add(root);
  const ridgePositions:number[]=[],ridgeIndices:number[]=[];
  for(let i=0;i<=50;i++){const x=-450+i*43,top=75+Math.pow(.5+.5*Math.sin(i*.71),2)*155+Math.sin(i*.23)*25;ridgePositions.push(x,-.7,-1570,x,top,-1600);if(i){const n=i*2;ridgeIndices.push(n-2,n,n-1,n-1,n,n+1);}}
  const ridgeGeometry=new T.BufferGeometry();ridgeGeometry.setAttribute('position',new T.Float32BufferAttribute(ridgePositions,3));ridgeGeometry.setIndex(ridgeIndices);ridgeGeometry.computeVertexNormals();const ridge=new T.Mesh(ridgeGeometry,new T.MeshStandardMaterial({color:'#6b8177',roughness:1,side:T.DoubleSide}));ridge.name='Distant Sierra ridges';root.add(ridge);
  const cloth=new T.MeshStandardMaterial({color:'#e4c399',roughness:1,side:T.DoubleSide}),birds=new T.BufferGeometry();
  birds.setAttribute('position',new T.Float32BufferAttribute([-.6,0,.2,0,0,0,-.1,0,-.15,0,0,0,.6,0,.2,.1,0,-.15],3));birds.computeVertexNormals();const birdMat=new T.MeshBasicMaterial({color:'#d4d7cb',side:T.DoubleSide});const flock=new T.InstancedMesh(birds,birdMat,12);root.add(flock);
  const flags:T.Mesh[]=[];for(const [x,z]of [[-42,150],[455,-720],[1170,-780],[920,650],[250,405]]){const mesh=new T.Mesh(new T.PlaneGeometry(2.2,1.2,8,2),cloth);mesh.position.set(x,ground(x,z)+7,z);mesh.userData.base=Float32Array.from(mesh.geometry.attributes.position.array);root.add(mesh);flags.push(mesh);}
  const dummy=new T.Object3D();let quality:Quality='low';
  return {setQuality:(next:Quality)=>quality=next,update:(time:number,setting:Lighting)=>{
    flock.count=quality==='low'?6:12;flock.visible=setting!=='night';for(let i=0;i<12;i++){const a=time*.035+i*.51;dummy.position.set(400+Math.sin(a)*470,45+Math.sin(a*2+i)*9,-550+Math.cos(a)*450);dummy.rotation.set(0,-a,Math.sin(time*2+i)*.2);dummy.scale.setScalar(.7);dummy.updateMatrix();flock.setMatrixAt(i,dummy.matrix);}flock.instanceMatrix.needsUpdate=true;flock.computeBoundingSphere();
    for(const flag of flags){const attr=flag.geometry.attributes.position as T.BufferAttribute,base=flag.userData.base;for(let i=0;i<attr.count;i++)attr.setZ(i,Math.sin(base[i*3]*2+time*2)*.18*(base[i*3]+1.1)/2.2);attr.needsUpdate=true;flag.geometry.computeVertexNormals();}
  }};
}
