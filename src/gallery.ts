import * as T from 'three';
import type { Collider, Lighting } from './types';
import { GALLERY, insideGallery } from './geography';
import { GALLERY_ART } from './gallery-catalog';

export function createGrandGallery(){
  const group=new T.Group();group.name='NAREN Grand Drive-in Gallery';
  const {x,z,width,depth,floor,clearance}=GALLERY;
  const colliders:Collider[]=[],dynamicColliders:Collider[]=[];
  const lights:{position:T.Vector3;color:T.Color;intensity:number;range:number}[]=[];
  const standard=(color:string,metalness=0)=>new T.MeshStandardMaterial({color,metalness,roughness:.4});
  const ivory=standard('#d9d6cc'),gold=standard('#b59a62',.7),dark=standard('#253740',.25);
  const glass=standard('#386775',.5),floorMat=standard('#344e59',.5);
  const warm=new T.MeshStandardMaterial({color:'#fff1cf',emissive:'#ffdfa0',emissiveIntensity:1.3});
  const aqua=new T.MeshStandardMaterial({color:'#a8fff0',emissive:'#5ef3d4',emissiveIntensity:1.4});
  const unit=new T.BoxGeometry(1,1,1),batches=new Map<T.Material,T.Matrix4[]>(),dummy=new T.Object3D();
  function box(m:T.Material,xx:number,yy:number,zz:number,w:number,h:number,d:number){
    dummy.position.set(xx,yy,zz);dummy.scale.set(w,h,d);dummy.rotation.set(0,0,0);dummy.updateMatrix();
    const list=batches.get(m)??[];list.push(dummy.matrix.clone());batches.set(m,list);
  }
  function solid(xx:number,zz:number,w:number,d:number,h:number,base=floor){colliders.push({x:xx,z:zz,halfX:w/2,halfZ:d/2,height:h,baseY:base});}
  function wall(xx:number,zz:number,w:number,d:number,h=clearance){box(dark,xx,floor+h/2,zz,w,h,d);solid(xx,zz,w,d,h);}
  function text(message:string,xx:number,yy:number,zz:number,w:number,h:number,yaw=0,color='#fce4ac'){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#182e38';ctx.fillRect(0,0,1024,128);
    ctx.font='600 68px Barlow,Arial';ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(message,512,64,980);
    const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
    const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex}));
    mesh.position.set(xx,yy,zz);mesh.rotation.y=yaw;group.add(mesh);
  }
  // A clear-span hall, rather than a solid building collider. Cars can explore
  // its 210 x 140 metre floor and leave through either sensor entrance.
  box(floorMat,x,floor+.005,z,width,.14,depth);
  wall(x-width/2,z,1.2,depth);wall(x+width/2,z,1.2,depth);
  for(const side of [-1,1]){
    const zz=z+side*depth/2;
    for(const wing of [-1,1])wall(x+wing*(width/4+7),zz,width/2-14,1.2);
    box(glass,x,floor+18,zz,28,12,1.2);solid(x,zz,28,1.2,12,floor+12);
    box(gold,x,floor+12.1,zz,30,.5,2.6);
    box(ivory,x,floor+clearance+1.5,zz+side*8,width+10,2,18);
    box(warm,x,floor+clearance+.4,zz+side*8,width+8,.12,17);
    text(side>0?'NAREN GRAND GALLERY':'THANKS FOR DROPPING IN',x,floor+20,zz+side*.7,116,7,side>0?0:Math.PI);
    text('SENSOR ENTRY  /  DRIVE STRAIGHT IN',x,floor+10.5,zz+side*1.4,24,2,side>0?0:Math.PI,'#afffe2');
    text('IMAGES & CREDITS: PAUSE MENU',x+side*47,floor+3,zz-side*.8,35,1.5,side>0?Math.PI:0);
  }
  // Gold fins and a stepped supertall crown make the gallery a visible landmark.
  box(dark,x,floor+clearance+.5,z,width+3,1.2,depth+3);solid(x,z,width+3,depth+3,1.2,floor+clearance-.1);
  for(const side of [-1,1])for(let zz=z-depth/2+6;zz<z+depth/2;zz+=12){
    box(glass,x+side*(width/2+.7),floor+12,zz,1,22,10);
    box(gold,x+side*(width/2+1.4),floor+13,zz-5,.55,26,.6);
    box(warm,x+side*(width/2+1.7),floor+13,zz-5,.12,25,.16);
  }
  for(const side of [-1,1])for(let xx=x-width/2+6;xx<x+width/2;xx+=12){
    if(Math.abs(xx-x)<19)continue;
    box(glass,xx,floor+12,z+side*(depth/2+.7),10,22,1);
    box(gold,xx-5,floor+13,z+side*(depth/2+1.4),.6,26,.55);
  }
  let base=floor+clearance+2;
  for(const [w,d,h] of [[112,80,36],[84,60,38],[56,42,35],[28,24,26]]){
    box(glass,x,base+h/2,z,w,h,d);
    for(let yy=base+3;yy<base+h;yy+=4)box(gold,x,yy,z,w+1,.28,d+1);
    for(const side of [-1,1]){box(warm,x+side*(w/2+.1),base+h/2,z,.16,h,d*.68);box(gold,x,base+h,z,w+3,.8,d+3);}
    base+=h;
  }
  box(gold,x,base+13,z,1.4,26,1.4);box(warm,x,base+26,z,2,2,2);
  // Coherent lighting and a tiled floor, with open circulation on either side.
  for(let xx=x-width/2+8;xx<x+width/2;xx+=12)box(gold,xx,floor+.08,z,.055,.015,depth-3);
  for(let zz=z-depth/2+8;zz<z+depth/2;zz+=12)box(gold,x,floor+.08,zz,width-3,.015,.055);
  for(const xx of [x-70,x,x+70])for(const zz of [z-45,z,z+45]){
    box(warm,xx,floor+23.6,zz,42,.14,.35);
    if(xx!==x)lights.push({position:new T.Vector3(x+(xx-x)*.55,floor+8,zz),color:new T.Color('#ffe0b6'),intensity:500,range:65});
  }
  for(const side of [-1,1]){
    box(aqua,x+side*13,floor+.1,z,.16,.035,depth-4);
    for(const dz of [-40,40]){
      box(ivory,x+side*77,floor+.7,z+dz,16,1.4,8);solid(x+side*77,z+dz,16,8,1.4);
      box(gold,x+side*77,floor+1.45,z+dz,17,.13,9);
      box(dark,x+side*77,floor+2.1,z+dz,12,1.3,5);
    }
  }
  const panels:{material:T.MeshBasicMaterial;art:typeof GALLERY_ART[number]}[]=[];
  GALLERY_ART.forEach((art,i)=>{
    const side=i%2===0?-1:1,xx=x+side*47,zz=z-46+Math.floor(i/2)*31,yaw=side<0?Math.PI/2:-Math.PI/2;
    wall(xx,zz,1.2,23,14);
    box(gold,xx-side*.67,floor+8,zz,.16,12,21);
    const aspect=art.width/art.height,w=aspect>1?19:Math.min(15,10*aspect),h=w/aspect;
    const material=new T.MeshBasicMaterial({color:'#f0eee3'});
    const frame=new T.Mesh(new T.PlaneGeometry(w,h),material);
    frame.position.set(xx-side*.78,floor+8,zz);frame.rotation.y=yaw;group.add(frame);panels.push({material,art});
    text(art.title,xx-side*.81,floor+1.3,zz,21,1.5,yaw);
    text(`${art.author} / ${art.license}`,xx-side*.82,floor+.55,zz,20,.6,yaw);
  });
  const doors=[-1,1].map(side=>{
    const zz=z+side*depth/2;
    const parts=[-1,1].map(direction=>{
      const root=new T.Group();root.position.set(x+direction*7,floor,zz);group.add(root);
      const pane=new T.Mesh(new T.BoxGeometry(13.9,9.2,.42),glass);pane.position.y=4.6;root.add(pane);
      const strip=new T.Mesh(new T.BoxGeometry(.18,9.2,.5),aqua);strip.position.set(-direction*6.7,4.6,0);root.add(strip);
      const rail=new T.Mesh(new T.BoxGeometry(13.9,.2,.52),gold);rail.position.y=4.6;root.add(rail);
      const volume:Collider={x:root.position.x,z:zz,halfX:6.95,halfZ:.24,height:9.2,baseY:floor};dynamicColliders.push(volume);
      return {root,volume,direction};
    });
    const indicator=new T.Mesh(new T.SphereGeometry(.48,10,8),aqua);indicator.position.set(x,floor+10,zz+side*1.5);group.add(indicator);
    return {z:zz,open:0,hold:0,parts,indicator};
  });
  for(const [m,matrices] of batches){
    const mesh=new T.InstancedMesh(unit,m,matrices.length);matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);
  }
  const status=()=>doors.map(d=>({z:d.z,open:d.open,hold:d.hold}));
  group.userData={floor,clearance,artworks:GALLERY_ART.length,doors:status(),inside:false};
  function step(dt:number,position:T.Vector3){
    for(const door of doors){
      const sensor=Math.abs(position.x-x)<32&&Math.abs(position.z-door.z)<62&&Math.abs(position.y-floor)<9;
      if(sensor)door.hold=2.5;else door.hold=Math.max(0,door.hold-dt);
      // Constant-speed sliding doors fully clear the 28m opening in 0.9s.
      door.open=T.MathUtils.clamp(door.open+(door.hold>0?1:-1)*dt/0.9,0,1);
      for(const part of door.parts){part.root.position.x=x+part.direction*(7+15*door.open);part.volume.x=part.root.position.x;}
      door.indicator.scale.setScalar(door.hold>0?1:.65);
    }
    group.userData.doors=status();group.userData.inside=insideGallery(position.x,position.z);
  }
  function lighting(setting:Lighting){warm.emissiveIntensity=setting==='night'?2:1.3;aqua.emissiveIntensity=setting==='night'?2.3:1.4;}
  async function loadAssets(){
    const loader=new T.TextureLoader();
    await Promise.all(panels.map(async({material,art})=>{
      const texture=await loader.loadAsync(art.src);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
      material.map=texture;material.color.set('#ffffff');material.needsUpdate=true;
    }));
    group.userData.assetsLoaded=panels.length;
  }
  return {group,colliders,dynamicColliders,lights,step,lighting,loadAssets};
}
