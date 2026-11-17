import * as T from 'three';
import type { Road } from './types';
import { GALLERY, RIVER, isLand, lakeContains, landHeight, riverAt, waterLevel } from './geography';

type Kit={
  group:T.Group;roads:Road[];surface:Record<string,T.Material>;
  mat:(color:string,roughness?:number,metalness?:number)=>T.MeshStandardMaterial;
  glow:(color:string,intensity:number,night:number,base?:string)=>T.MeshStandardMaterial;
  cube:(m:T.Material,x:number,y:number,z:number,w:number,h:number,d:number,ry?:number,shadow?:boolean)=>void;
  geom:(g:T.BufferGeometry,m:T.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number,ry?:number,rz?:number,rx?:number,shadow?:boolean)=>void;
  collider:(x:number,z:number,hx:number,hz:number,height:number,rotation?:number)=>void;
  groundHeight:(x:number,z:number)=>number;
  lotClear:(x:number,z:number,w:number,d:number)=>boolean;
  roadClear:(x:number,z:number,margin:number)=>boolean;
  palm:(x:number,z:number,h:number,solid?:boolean)=>void;
  lamp:(x:number,z:number,rotation:number)=>void;
  tower:(x:number,z:number,base:number,w:number,d:number,h:number,skin:T.Material,id:number)=>void;
  podium:(x:number,z:number,w:number,d:number,h:number,skin:T.Material,accent:T.Material)=>void;
  fountain:(x:number,z:number,r:number)=>void;
  bench:(x:number,z:number,angle:number)=>void;
  lettering:(text:string,subtitle:string,fg:string,bg:string,x:number,y:number,z:number,w:number,h:number,yaw?:number)=>void;
};
export const reservedNorth=(x:number,z:number)=>
  (Math.abs(x-GALLERY.x)<GALLERY.width/2+20&&Math.abs(z-GALLERY.z)<GALLERY.depth/2+35)||
  (x>170&&x<610&&z> -1025&&z< -595)||Math.hypot((x-965)/365,(z+640)/275)<1.25;

export function developHighlands(k:Kit){
  const {group,roads,surface:s,cube,geom,collider,groundHeight:ground,lotClear,roadClear,palm,lamp,tower,podium,fountain,bench,lettering}=k;
  const silver=k.mat('#c3cbd0',.29,.55),blue=k.mat('#3c788a',.22,.5),sandstone=k.mat('#d2bea0'),white=k.mat('#e4e9e6');
  const neon=k.glow('#7deee7',.25,2.4),gold=k.glow('#efbd78',.24,2.5),violet=k.glow('#a6b7ff',.2,2);
  const cone=new T.ConeGeometry(1,1,4),cylinder=new T.CylinderGeometry(1,1,1,24),sphere=new T.SphereGeometry(1,14,10);
  let homes=0,shops=0,skyline=0,fixtures=0;
  // Sierra Verde's town is built around a connected, terraced street network.
  for(const [row,z] of [-925,-870,-770,-705].entries())for(const [col,x] of [265,320,425,510].entries()){
    if(!lotClear(x,z,24,24))continue;
    const y=ground(x,z),id=row*4+col,h=5+(id%3)*2;
    podium(x,z,23,24,3.5,id%2?s.cream:s.terra,neon);
    tower(x,z,y+4.1,19,20,h,id%2?s.ivory:s.aqua,id);
    geom(cone,id%2?s.terra:s.roof,x,y+h+6,z,17,4,17,Math.PI/4);
    for(const dx of [-9,9])palm(x+dx,z+18,6.8,false);
    cube(s.walk,x,y+.03,z-17,22,.1,9);homes++;
    if(row===1||row===2){
      lettering(['VERDE BAKERY','SIERRA COFFEE','THE GENERAL STORE','VISTA ATELIER'][col],'OPEN LATE','#fff0c6','#34524e',x,y+3.7,z+12.2,21,2,0);
      cube(id%2?s.terra:s.cream,x,y+3,z+14,22,.25,4);shops++;
    }
  }
  if(lotClear(470,-875,40,34)){
    const y=ground(470,-875);podium(470,-875,40,34,5,s.ivory,gold);tower(470,-875,y+5.5,27,25,13,s.cream,61);
    geom(cylinder,s.brass,470,y+22,-875,4,4,4);geom(cone,s.terra,470,y+25,-875,6,4,6,Math.PI/4);
    lettering('VERDE TOWN HALL','A HIGHER STATE OF MIND','#f8e2ab','#35564e',470,y+5.8,-857.8,34,3,0);shops++;
  }
  const plazaX=470,plazaZ=-720;
  if(lotClear(plazaX,plazaZ,35,35)){
    const y=ground(plazaX,plazaZ);cube(s.walk,plazaX,y+.025,plazaZ,54,.08,48);
    fountain(plazaX,plazaZ,6);for(const side of [-1,1]){bench(plazaX+side*14,plazaZ,0);palm(plazaX+side*21,plazaZ-13,8);palm(plazaX+side*21,plazaZ+13,8);}
  }
  // An open service station and a real pull-off overlook complement the town.
  if(lotClear(290,-595,58,34)){
    const x=290,z=-595,y=ground(x,z);cube(s.asphalt,x,y+.04,z,58,.12,34);
    podium(x,z-10,44,10,4.5,s.ivory,gold);cube(s.cream,x,y+5.3,z+5,44,.5,16);
    for(const dx of [-17,17])for(const dz of [0,10]){
      cube(s.brass,x+dx,y+2.5,z+dz,.35,5,.35);collider(x+dx,z+dz,.25,.25,5);
      cube(s.aqua,x+dx,y+1,z+dz,1.5,2,1);collider(x+dx,z+dz,.8,.5,2);
    }
    lettering('VERDE FUEL','COFFEE / SUPPLIES','#ffe1b1','#39534b',x,y+6,z+13,40,3,0);shops++;
  }
  lettering('SIERRA VERDE','TOWN / RIDGE / LAKE','#f9e3af','#314f49',590,ground(590,-757)+5,-757,25,3,Math.PI/2);
  for(const [x,z] of [[80,-980],[485,-1120],[585,-540]]){
    if(!lotClear(x,z,45,24))continue;
    const y=ground(x,z);cube(s.walk,x,y+.025,z,45,.1,24);
    for(let j=-2;j<=2;j++)bench(x+j*7,z-6,0);
    for(const dx of [-20,20]){palm(x+dx,z,8);lamp(x+dx,z+9,0);fixtures++;}
    lettering('VERDE VISTA','SCENIC OVERLOOK','#f1e2be','#39524b',x,y+3,z-10,23,2.4,0);
  }
  // Fine, slender towers and sculptural crowns frame the modern lake district.
  const sites:[number,number,number,number,number][]=[];
  for(let i=0;i<18;i++){
    const a=i*Math.PI/9;sites.push([965+Math.cos(a)*205,-640+Math.sin(a)*157,18,21,55+(i*23)%125]);
  }
  sites.push([1095,-900,34,38,188],[1170,-900,35,37,145],[705,-610,37,40,112],[1295,-720,22,28,134],[1045,-855,26,30,95]);
  sites.forEach(([x,z,w,d,h],i)=>{
    if(!lotClear(x,z,w+5,d+5))return;
    const y=ground(x,z),accent=[neon,gold,violet][i%3];
    podium(x,z,w+4,d+4,5,white,accent);
    if(i%3===0){
      let yy=y+5.5;
      for(let level=0;level<4;level++){
        const scale=1-level*.17;tower(x+level*1.1,z,yy,w*scale,d*scale,h/4,[silver,blue,white][i%3],70+i);yy+=h/4+.5;
      }
    }else tower(x,z,y+5.5,w,d,h,i%2?blue:silver,70+i);
    for(const side of [-1,1])cube(accent,x+side*(w/2+.28),y+h*.52,z,.16,h*.95,.25,0,false);
    geom(cone,silver,x,y+h+13,z,w*.36,15,d*.36,Math.PI/4);
    geom(cylinder,accent,x,y+h+28,z,.25,18,.25,0,0,0,false);
    collider(x,z,w/2,d/2,h+36);skyline++;
    if(h>140)lettering(i===18?'SILVER SPIRE':'AURORA RESIDENCES','SILVER LAKE','#dcfffa','#244651',x,y+6,z+d/2+2.3,w+3,2.8,0);
  });
  // A suspended ring landmark recalls the sculptural architecture of a future city.
  const ringX=1205,ringZ=-900;
  if(lotClear(ringX,ringZ,28,32)){
    const y=ground(ringX,ringZ);
    for(const side of [-1,1]){cube(silver,ringX+side*10,y+22,ringZ,4,44,7);collider(ringX+side*10,ringZ,2,3.5,44);}
    const ring=new T.TorusGeometry(1,.22,10,44);geom(ring,silver,ringX,y+49,ringZ,25,28,8);
    geom(new T.TorusGeometry(1,.035,5,44),neon,ringX,y+49,ringZ+2,25,28,8,0,0,0,false);
    skyline++;
  }
  // Promenade boardwalk, palms and small lit piers sit above the lake water.
  for(let i=0;i<100;i++){
    const a=i*Math.PI/50,x=965+Math.cos(a)*166,z=-640+Math.sin(a)*124;
    if(!isLand(x,z)||!roadClear(x,z,3))continue;
    const y=ground(x,z);cube(s.walk,x,y-.1,z,6,.25,6,a);
    if(i%3===0&&roadClear(x,z,5)){lamp(x,z,a);fixtures++;}
    if(i%6===0&&roadClear(x,z,7)){palm(x+Math.cos(a)*4,z+Math.sin(a)*4,8.5);bench(x,z,Math.PI/2-a);}
  }
  for(const z of [-675,-610]){
    const x=1130;if(!isLand(x,z)||!roadClear(x,z,9))continue;
    const y=ground(x,z);cube(s.wood,x-12,y+.1,z,25,.5,6);cube(neon,x-12,y+.4,z-3,25,.1,.1,0,false);
  }
  // Visible fountains above the lake use emissive jets rather than extra lights.
  for(let i=-4;i<=4;i++){
    const x=965+i*14,z=-640,h=7+(4-Math.abs(i))*2;
    geom(cylinder,neon,x,8+h/2,z,.12,h,.12,0,0,0,false);
    geom(sphere,neon,x,8+h,z,.3,.45,.3,0,0,0,false);
  }
  // River and lake water are at their own heights, not the ocean's datum.
  const waterUniform={clock:{value:0},color:{value:new T.Color('#348d9c')},glow:{value:new T.Color('#c9e1bd')}};
  const water=new T.ShaderMaterial({uniforms:waterUniform,side:T.DoubleSide,
    vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 p;uniform float clock;uniform vec3 color,glow;void main(){float rip=sin(p.x*.38+p.z*.14-clock*1.8)*sin(p.z*.24-clock);vec3 c=color*(.91+rip*.075);c+=glow*pow(max(0.,sin(p.z*.21+p.x*.03-clock*.5)),24.)*.13;vec3 view=normalize(cameraPosition-p);float fres=pow(1.-clamp(view.y,0.,1.),3.);c=mix(c,glow*.38,fres*.45);gl_FragColor=vec4(c,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
  const vertices:number[]=[],indices:number[]=[];
  for(let i=0;i<RIVER.points.length;i++){
    const p=RIVER.points[i],a=RIVER.points[Math.max(0,i-1)],b=RIVER.points[Math.min(i+1,RIVER.points.length-1)],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    for(const side of [-1,1])vertices.push(p[0]+side*dz/len*(RIVER.width/2+1),p[2],p[1]-side*dx/len*(RIVER.width/2+1));
    if(i>0){const n=i*2;indices.push(n-2,n-1,n,n,n-1,n+1);}
  }
  const riverGeometry=new T.BufferGeometry();riverGeometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));riverGeometry.setIndex(indices);riverGeometry.computeVertexNormals();
  const riverMesh=new T.Mesh(riverGeometry,water);riverMesh.name='Verde River water';group.add(riverMesh);
  const lakeShape=new T.Shape();
  for(let i=0;i<64;i++){const a=i*Math.PI/32,rx=150*(1+.08*Math.sin(a*3)+.035*Math.cos(a*5)),x=965+Math.cos(a)*rx,z=-640+Math.sin(a)*rx*110/150;i?lakeShape.lineTo(x,-z):lakeShape.moveTo(x,-z);}
  const lakeGeometry=new T.ShapeGeometry(lakeShape);lakeGeometry.rotateX(-Math.PI/2);lakeGeometry.translate(0,8,0);
  const lake=new T.Mesh(lakeGeometry,water);lake.name='Silver Lake water';group.add(lake);
  // A cable-stayed bridge crosses the river between the town and the lake.
  const bridge=roads.find(r=>r.name==='Verde Skyline Bridge')!;
  for(let i=1;i<bridge.points.length;i++){
    const a=bridge.points[i-1],b=bridge.points[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
    if(riverAt(b.x,b.z).distance>RIVER.width/2+10)continue;
    for(const side of [-1,1]){
      const x=b.x+side*dz/len*12,z=b.z-side*dx/len*12;
      const crossing=roads.some(r=>r!==bridge&&r.points.some(p=>Math.hypot(p.x-x,p.z-z)<r.width/2+4));
      if(crossing)continue;
      cube(silver,x,b.y+.65,z,.35,1.3,len+.12,yaw);collider(x,z,.2,len/2+.06,b.y-ground(x,z)+1.3,yaw);
      cube(neon,x,b.y+1.35,z,.1,.1,len+.15,yaw, false);
    }
  }
  const center=bridge.points.reduce((best,p)=>riverAt(p.x,p.z).distance<riverAt(best.x,best.z).distance?p:best,bridge.points[0]);
  const index=bridge.points.indexOf(center),a=bridge.points[Math.max(0,index-1)],b=bridge.points[Math.min(index+1,bridge.points.length-1)],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),nx=dz/len,nz=-dx/len;
  function cable(start:T.Vector3,end:T.Vector3){const vector=end.clone().sub(start);const mesh=new T.Mesh(new T.CylinderGeometry(.1,.1,vector.length(),6),gold);mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),vector.normalize());group.add(mesh);}
  for(const side of [-1,1]){
    const x=center.x+side*nx*13.7,z=center.z+side*nz*13.7,y=center.y;
    cube(silver,x,y+24,z,2.2,48,2.2);cube(gold,x,y+48,z,2.7,.5,2.7);collider(x,z,1.1,1.1,y-ground(x,z)+49);
    for(const offset of [-45,-30,-15,15,30,45]){
      const p=bridge.points[T.MathUtils.clamp(index+Math.round(offset/3.5),0,bridge.points.length-1)];
      cable(new T.Vector3(x,y+43,z),new T.Vector3(p.x+side*nx*12,p.y+.7,p.z+side*nz*12));
    }
  }
  // Smaller crossings also have real deck thickness and piers below the road.
  for(const road of roads)for(let i=1;i<road.points.length;i++){
    const p=road.points[i],a=road.points[i-1];
    if(riverAt(p.x,p.z).distance>RIVER.width/2+2||lakeContains(p.x,p.z))continue;
    const dx=p.x-a.x,dz=p.z-a.z,len=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
    cube(silver,(a.x+p.x)/2,(a.y+p.y)/2-.42,(a.z+p.z)/2,road.width+.6,.75,len+.1,yaw);
    if(i%7===0){const bottom=waterLevel(p.x,p.z)-3.8;cube(silver,p.x,(p.y+bottom)/2,p.z,2.2,Math.max(.1,p.y-bottom),2.2);}
  }
  lettering('VERDE SKYLINE BRIDGE','TOWN / SILVER LAKE','#e7ffed','#2a4c56',650,ground(650,-760)+5,-770,30,3,Math.PI/2);
  // Every authored road gets roadside fixtures. Crossings and runway remain clear.
  const occupied=new Set<string>();
  roads.forEach((road,roadId)=>{
    let travel=0;
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],p=road.points[i],dx=p.x-a.x,dz=p.z-a.z,len=Math.hypot(dx,dz);travel+=len;
      if(travel<42)continue;travel=0;
      if(road.name==='Runway 07'||road.name==='Grand Gallery Drive')continue;
      for(const side of [-1,1]){
        if((roadId+i)%2===0&&side<0)continue;
        const x=p.x+side*dz/len*(road.width/2+3),z=p.z-side*dx/len*(road.width/2+3),key=Math.round(x/12)+','+Math.round(z/12);
        if(occupied.has(key)||!isLand(x,z)||!roadClear(x,z,1.1)||Math.abs(x-GALLERY.x)<118&&Math.abs(z-GALLERY.z)<88)continue;
        occupied.add(key);lamp(x,z,Math.atan2(-side*dz,side*dx));fixtures++;
      }
    }
  });
  group.userData.northernDevelopment={homes,shops,lakeTowers:skyline,addedStreetlights:fixtures,riverLength:RIVER.points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-RIVER.points[i][0],p[1]-RIVER.points[i][1]),0)};
  return {update:(time:number,setting:string)=>{waterUniform.clock.value=time;waterUniform.color.value.set(setting==='night'?'#153e51':setting==='twilight'?'#35677f':'#388f9b');waterUniform.glow.value.set(setting==='night'?'#70b7d3':'#e8d8b3');}};
}
