import * as T from 'three';
import type { Collider, Lighting, Road, World } from './types';
import { CITY } from './city';
import { isLand, landHeight, MAINLAND, ISLAND, WATERS, DISTRICTS, RIVER, riverAt, waterLevel, insideGallery, GALLERY } from './geography';
import { createGrandGallery } from './gallery';
import { developHighlands, reservedNorth } from './highlands';
import { createRoadIndex } from './road-grading';
import { COUNTY_ROADS } from './county-roads';
import { SCENIC_STOPS } from './places';
import { renderRoadNetwork } from './roads';
import { createGrassMaterial, createGrassField } from './grass';
import { createNearbyLighting } from './visuals';
import type { Placement } from './assets';
import {dressDistricts,createAmbientLife} from './districts';
import { createBeachgoers } from './beachgoers';
import { createStuntArena, insideStunt, stuntGround, stuntSurface } from './stunt';

const tau = Math.PI * 2;
const clamp = T.MathUtils.clamp;
const smooth = (v: number) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
function noiseGenerator(seed: number) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}

export function createWorld(prebuilt?:T.Group): World {
  const group = new T.Group();
  if(prebuilt){group.userData={...prebuilt.userData};group.add(...prebuilt.children.slice());}
  const roads: Road[] = [];
  const colliders: Collider[] = [];
  const stops: (typeof SCENIC_STOPS[number] & { elevation: number })[] = [];
  let roadIndex:ReturnType<typeof createRoadIndex>|undefined;
  function baseGroundHeight(x:number,z:number) {
    if(!isLand(x,z))return waterLevel(x,z)-4;
    const height=roadIndex?.grade(x,z)??landHeight(x,z);
    for(const stop of stops){
      const edge=Math.max(Math.abs(x-stop.x)-stop.width/2,Math.abs(z-stop.z)-stop.depth/2);
      if(edge<6)return T.MathUtils.lerp(stop.elevation,height,T.MathUtils.smoothstep(edge,0,6));
    }
    return height;
  }
  const groundHeight=(x:number,z:number)=>stuntGround(x,z,baseGroundHeight(x,z));
  const random = noiseGenerator(27061);
  const dayGlow: { material: T.MeshStandardMaterial; day: number; night: number }[] = [];
  const mat = (color: T.ColorRepresentation, roughness = .78, metalness = 0) =>
    new T.MeshStandardMaterial({color, roughness, metalness});
  function glow(color: T.ColorRepresentation, intensity: number, night: number, base = color) {
    const m = new T.MeshStandardMaterial({color:base, emissive:color, emissiveIntensity:intensity, roughness:.47});
    m.name=`glow:${String(color)}:${String(base)}:${intensity}:${night}`;
    dayGlow.push({material:m, day:intensity, night}); return m;
  }
  function grainMaterial(base: string, spread: number, repeat: number) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d')!; const pixels = ctx.createImageData(256,256);
    const rgb = parseInt(base.replace('#',''),16);
    for (let i=0; i<pixels.data.length; i+=4) {
      const j = (random()-.5)*spread;
      pixels.data[i] = (rgb>>16)+j; pixels.data[i+1] = ((rgb>>8)&255)+j;
      pixels.data[i+2] = (rgb&255)+j; pixels.data[i+3]=255;
    }
    ctx.putImageData(pixels,0,0);
    const tex = new T.CanvasTexture(c); tex.colorSpace=T.SRGBColorSpace;
    tex.wrapS=tex.wrapT=T.RepeatWrapping; tex.repeat.setScalar(repeat); tex.anisotropy=4;
    return new T.MeshStandardMaterial({map:tex, roughness:1});
  }

  const surface = {
    asphalt:grainMaterial('#343a40',9,.13), sand:grainMaterial('#e6ce9d',23,.21),
    land:createGrassMaterial(), stone:mat('#d1bda0'), curb:mat('#dfd1b4'),
    walk:grainMaterial('#cfb8a4',14,.18), tile:mat('#b3a697'), white:mat('#f5dfaf'), yellow:mat('#d8ab52'),
    brass:mat('#bc8b44',.42,.35), black:mat('#343c42',.62,.23), dark:mat('#3c4c53'),
    cream:mat('#f5e1b9'), ivory:mat('#ede1cf'), shell:mat('#edbaa3'), terra:mat('#bc7c64'),
    aqua:mat('#8bb7ad'), green:mat('#547764'), inlay:mat('#678e89'), plinth:mat('#a17e70'),
    wood:mat('#95704e'), palm:mat('#91745a'), frond:mat('#436d42'), leaf:mat('#719258'), hedge:mat('#578166'),
    glass:mat('#436974',.26,.2), blueglass:mat('#5c9299',.26,.25), roof:mat('#7c817f'),
    amber:glow('#ffbd65',.18,2.4), mint:glow('#6de8d9',.14,2.1),
    pink:glow('#ff8e9a',.18,2.45), bulbs:glow('#fff1bc',.42,3),
    window:glow('#ffcd8a',.05,.84,'#95a29c'), lamp:glow('#ffe4a7',.45,2.5),
    foam:mat('#d2eee4'), pool:mat('#61c3c3',.22,.17), rock:mat('#a68f79'), grass:mat('#a3ad79')
  };
  Object.entries(surface).forEach(([key,value])=>{if(!value.name)value.name='surface:'+key;});
  const box = new T.BoxGeometry(1,1,1), cyl = new T.CylinderGeometry(1,1,1,20);
  const round = new T.SphereGeometry(1,14,10), tube = new T.CylinderGeometry(1,1,1,8);
  const palmTrunk = new T.CylinderGeometry(.74,1,1,9);
  const oval = new T.IcosahedronGeometry(1,1), bud = new T.IcosahedronGeometry(1,0);
  const shade = new T.ConeGeometry(1,1,8,1,false,Math.PI/8);
  const torus = new T.TorusGeometry(1,.055,6,36);
  const buckets = new Map<string,{g:T.BufferGeometry,m:T.Material, matrices:T.Matrix4[], shadow:boolean}>();
  const dummy = new T.Object3D();
  const paving:Collider[]=[];
  const placements:Placement[]=[];let resource:string|undefined;
  function geom(g:T.BufferGeometry,m:T.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number,ry=0,rz=0,rx=0,shadow=true) {
    if(prebuilt)return;
    if(insideStunt(x,z,1.5))return;
    // Spatial batches let the camera and shadow frusta discard distant blocks.
    const key=g.uuid+m.uuid+(shadow?'1':'0')+':'+Math.floor(x/120)+','+Math.floor(z/120)+':'+(resource??'');
    let b=buckets.get(key); if (!b) { b={g,m,matrices:[],shadow}; buckets.set(key,b); }
    dummy.position.set(x,y,z); dummy.rotation.set(rx,ry,rz,'YXZ'); dummy.scale.set(sx,sy,sz); dummy.updateMatrix(); b.matrices.push(dummy.matrix.clone());
  }
  function cube(m:T.Material,x:number,y:number,z:number,w:number,h:number,d:number,ry=0,shadow=true) {
    geom(box,m,x,y,z,w,h,d,ry,0,0,shadow);
    if(w>3&&d>3&&h<.8&&Math.abs(y-groundHeight(x,z))<1.2)paving.push({x,z,halfX:w/2,halfZ:d/2,height:h,rotation:ry});
  }
  function post(m:T.Material,x:number,z:number,r:number,h:number,base=groundHeight(x,z)) {
    geom(cyl,m,x,base+h/2,z,r,h,r);
  }
  function collider(x:number,z:number,hx:number,hz:number,height:number,rotation=0) { if(!insideStunt(x,z,1.5))colliders.push({x,z,halfX:hx,halfZ:hz,height,rotation}); }
  function grid(x1:number,x2:number,z1:number,z2:number,nx:number,nz:number,m:T.Material,yOffset=0) {
    if(prebuilt)return;
    const p:number[]=[],uv:number[]=[], idx:number[]=[];
    for(let j=0;j<=nz;j++) for(let i=0;i<=nx;i++) {
      // The arena has its own floor and ramps. Sampling its raised collision
      // surface on this coarse grid would slope adjacent terrain over the road.
      const x=x1+(x2-x1)*i/nx, z=z1+(z2-z1)*j/nz; p.push(x,baseGroundHeight(x,z)+yOffset,z); uv.push(x,z);
      if(i<nx&&j<nz&&isLand(x+(x2-x1)/nx/2,z+(z2-z1)/nz/2)&&!insideStunt(x+(x2-x1)/nx/2,z+(z2-z1)/nz/2)) { const a=j*(nx+1)+i; idx.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2); }
    }
    const g=new T.BufferGeometry(); g.setAttribute('position',new T.Float32BufferAttribute(p,3)); g.setAttribute('uv',new T.Float32BufferAttribute(uv,2)); g.setIndex(idx);g.computeVertexNormals();
    const mesh=new T.Mesh(g,m);mesh.name='Base terrain';mesh.receiveShadow=true;group.add(mesh);
  }
  // Road geometry carries continuous world-space UVs through the intersections.
  function road(coords:number[][],width:number,name?:string) {
    const pts:T.Vector3[]=[];
    for(let i=0;i<coords.length-1;i++){
      const [ax,az,ay]=coords[i], [bx,bz,by]=coords[i+1];
      const n=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/3.5));
      for(let j=0;j<n;j++){const x=ax+(bx-ax)*j/n,z=az+(bz-az)*j/n;pts.push(new T.Vector3(x,ay!==undefined&&by!==undefined?T.MathUtils.lerp(ay,by,j/n):landHeight(x,z),z));}
    }
    const [x,z,y]=coords[coords.length-1];pts.push(new T.Vector3(x,y??landHeight(x,z),z));roads.push({points:pts,width,name});
  }
  const outer:number[][]=[[-65,255],[-65,-255]];
  const arc=(cx:number,cz:number,start:number,end:number)=>{for(let i=1;i<=12;i++){const a=start+(end-start)*i/12;outer.push([cx+25*Math.cos(a),cz+25*Math.sin(a)]);}};
  arc(-40,-255,Math.PI,Math.PI*1.5);outer.push([155,-280]);arc(155,-255,Math.PI*1.5,tau);outer.push([180,255]);arc(155,255,0,Math.PI/2);outer.push([-40,280]);arc(-40,255,Math.PI/2,Math.PI);
  road(outer,18);for(const z of [-160,0,160]) road([[-65,z],[180,z]],15);road([[60,-160],[60,160]],15);
  // Palm Quarter adds 163 metres inland, increasing the bounded city area by 50%.
  const extension: number[][] = [[155,-280],[318,-280]];
  for(let i=1;i<=12;i++){const a=-Math.PI/2+i*Math.PI/24;extension.push([318+25*Math.cos(a),-255+25*Math.sin(a)]);}
  extension.push([343,255]);
  for(let i=1;i<=12;i++){const a=i*Math.PI/24;extension.push([318+25*Math.cos(a),255+25*Math.sin(a)]);}
  extension.push([155,280]);
  road(extension,18);
  for(const z of [-160,0,160])road([[180,z],[343,z]],15);
  for(const route of COUNTY_ROADS){
    const stop=SCENIC_STOPS.find(candidate=>candidate.name===route.name);
    if(stop){
      const access=createRoadIndex(roads.filter(candidate=>candidate.name===stop.road),landHeight).nearest(stop.from.x,stop.from.z);
      const distance=Math.hypot(stop.x-stop.from.x,stop.z-stop.from.z);
      const gradeLimit=Math.max(0,distance-7)*.10;
      const elevation=T.MathUtils.clamp(landHeight(stop.x,stop.z),access.height-gradeLimit,access.height+gradeLimit);
      const entry=1-7/distance;
      road([[stop.from.x,stop.from.z,access.height],[T.MathUtils.lerp(stop.from.x,stop.x,entry),T.MathUtils.lerp(stop.from.z,stop.z,entry),elevation],[stop.x,stop.z,elevation]],route.width,stop.name);
      stops.push({...stop,elevation});
    }else if(route.curve){
      const curve=new T.CatmullRomCurve3(route.points.map(p=>new T.Vector3(p[0],p[2]??landHeight(p[0],p[1]),p[1])),Boolean(route.closed),'centripetal');
      const points=curve.getSpacedPoints(Math.ceil(curve.getLength()/3.5));
      // Explicitly elevated causeways retain their spline profile; country roads follow terrain.
      points.forEach(p=>{if(!route.points.some(p=>p.length>2))p.y=landHeight(p.x,p.z);else p.y=Math.max(0,p.y);});
      roads.push({name:route.name,points,width:route.width});
    }else road(route.points,route.width,route.name);
  }
  roadIndex=createRoadIndex(roads,landHeight);
  for(let x=-88;x<1420;x+=160)for(let z=-1300;z<1100;z+=160)
    grid(x,x+160,z,z+160,z< -350||z>650?40:20,z< -350||z>650?40:20,surface.land,-.025);
  grid(-130,-86,-1220,1040,18,450,surface.sand,-.011);
  grid(-88,-75,-305,305,6,125,surface.walk,.014);
  for(let z=-303;z<305;z+=5)cube(surface.tile,-81.5,groundHeight(-81.5,z)+.034,z,12.1,.018,.045,0,false);
  function nearJoin(x:number,z:number) {
    return [-160,0,160].some(j=>Math.abs(z-j)<11.3&&[-65,60,180,343].some(i=>Math.abs(x-i)<11.3)) || (Math.abs(x-155)<11.3&&Math.abs(Math.abs(z)-280)<11.3);
  }
  if(!prebuilt)renderRoadNetwork(group,roads,roadIndex);

  function makeFrond(){
    const p:number[]=[],indices:number[]=[];
    const height=(t:number)=>2.1*Math.sin(Math.PI*t)-1.13*t*t;
    function tri(ax:number,ay:number,az:number,bx:number,by:number,bz:number,cx:number,cy:number,cz:number){
      const index=p.length/3;p.push(ax,ay,az,bx,by,bz,cx,cy,cz);indices.push(index,index+1,index+2);
    }
    for(let i=0;i<10;i++){
      const t=i/10,next=(i+1)/10;
      const x=t*5,xx=next*5,y=height(t),yy=height(next),rib=.085*(1-t)+.018;
      tri(x,y,-rib,xx,yy,0,x,y,rib);tri(x,y,rib,xx,yy,0,xx,yy,rib*.65);
      const width=.95*Math.pow(Math.sin((t*.87+.08)*Math.PI),.68);
      for(const s of [-1,1]){
        const sweep=.38+.38*t,tx=xx+sweep,ty=yy-.37*width;
        const mx=x+.47,my=y+.027,mz=s*width*.45;
        tri(x,y,0,mx,my,mz,tx,ty,s*width);
        tri(x,y,0,tx,ty,s*width,x+.36,height(t+.07),0);
      }
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  const frond=makeFrond();surface.frond.side=surface.leaf.side=T.DoubleSide;
  function palm(x:number,z:number,h:number,solid=true) {
    resource='palm';
    const y=groundHeight(x,z), skew=(random()-.5)*.16, yaw=random()*tau;
    geom(palmTrunk,surface.palm,x,y+h*.5,z,h*.034,h,h*.034,yaw,skew);
    const crownX=x-h*.5*Math.sin(skew)*Math.cos(yaw),crownZ=z+h*.5*Math.sin(skew)*Math.sin(yaw);
    for(let i=0;i<11;i++){
      const scale=(.81+random()*.23)*h/8.5;
      geom(frond,i%3===0?surface.leaf:surface.frond,crownX,y+h*.97,crownZ,scale,scale,scale,i*tau/11+yaw,(i%3)*.17-.11);
    }
    geom(bud,surface.palm,crownX,y+h-.18,crownZ,.43,.52,.43);
    if(!insideStunt(x,z,2))placements.push({id:'palm',x,y,z,height:h,rotation:yaw});
    if(solid)collider(x,z,.32,.32,h);resource=undefined;
  }
  const clearOfCrossStreet=(z:number)=>[-160,0,160].every(j=>Math.abs(z-j)>12);
  for(let z=-251;z<=252;z+=17.5){
    if(clearOfCrossStreet(z)&&clearOfCrossStreet(z+2)) {palm(-77,z,8.6+random()*2.3);palm(-53,z+2,9+random()*1.4);}
  }
  for(let z=-283;z<288;z+=18+random()*9){palm(-94-random()*6,z,5.8+random()*3);if(random()>.45)palm(-92,z+6,5.4+random());}
  for(let z=-245;z<245;z+=24){if(clearOfCrossStreet(z))palm(168,z,7.4+random()*1.8);}
  const boulder=new T.DodecahedronGeometry(1,0);
  function stone(x:number,z:number,s:number){resource='boulder';const y=groundHeight(x,z);placements.push({id:'boulder',x,y,z,height:s*1.1});geom(boulder,surface.rock,x,y+.34*s,z,s*1.6,s*.77,s*1.15,random()*tau,.16);collider(x,z,s,s*.8,s*1.1);resource=undefined;}
  for(let z=-302;z<305;z+=9+random()*13)if(z<-177||z>216)stone(-111+random()*3,z,1.1+random()*1.6);

  const canvasPlane = new T.PlaneGeometry(1,1);
  function lettering(text:string,subtitle:string,fg:string,bg:string,x:number,y:number,z:number,w:number,h:number,yaw=-Math.PI/2) {
    const c=document.createElement('canvas'); c.width=1024;c.height=256;
    const ctx=c.getContext('2d')!;ctx.fillStyle=bg;ctx.fillRect(0,0,1024,256);
    ctx.strokeStyle=fg;ctx.lineWidth=3;ctx.strokeRect(13,13,998,230);ctx.strokeRect(20,20,984,216);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=fg;ctx.font='bold 103px Georgia';
    ctx.fillText(text,512,subtitle?101:133,935);
    if(subtitle){ctx.font='bold 33px Arial';ctx.fillText(subtitle.split('').join(' '),512,183,918);}
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
    const m=new T.MeshStandardMaterial({map:tex,emissive:'#ffffff',emissiveMap:tex,emissiveIntensity:.26,roughness:.8});
    m.userData.glowDay=.26;m.userData.glowNight=1.2;
    dayGlow.push({material:m,day:.26,night:1.2});geom(canvasPlane,m,x,y,z,w,h,1,yaw,0,0,false);
  }
  const lightSources:{position:T.Vector3,color:T.Color,intensity:number,range?:number}[]=[];
  function lamp(x:number,z:number,rotation:number){
    const y=groundHeight(x,z);post(surface.black,x,z,.115,5.8);
    const dx=Math.sin(rotation),dz=Math.cos(rotation);
    cube(surface.brass,x+dx*.55,y+5.78,z+dz*.55,.18,.19,1.35,rotation);
    geom(cyl,surface.black,x+dx*1.15,y+5.65,z+dz*1.15,.53,.16,.53);
    geom(cyl,surface.lamp,x+dx*1.15,y+5.53,z+dz*1.15,.45,.09,.45,0,0,0,false);
    lightSources.push({position:new T.Vector3(x+dx*1.15,y+5.4,z+dz*1.15),color:new T.Color('#ffdaab'),intensity:100});
    collider(x,z,.18,.18,5.8);
  }
  for(let z=-245;z<250;z+=34){lamp(-75.6,z,Math.PI/2);if(clearOfCrossStreet(z))lamp(169,z,Math.PI/2);}
  for(const z of [-160,0,160])for(let x=-42;x<170;x+=34)if(!nearJoin(x,z))lamp(x,z+8.6,Math.PI);
  function rail(x:number,z:number,w:number,d:number,yaw:number,height=.85) {
    const y=groundHeight(x,z);cube(surface.cream,x,y+height*.46,z,w,height*.92,d,yaw);
    cube(surface.stone,x,y+height,z,w+.05,.1,d+.08,yaw);collider(x,z,w*.5,d*.5,height,yaw);
  }
  for(let z=-300;z<299;z+=5){
    if(Math.abs(z%56)>8)rail(-88,z,.34,5,0,.54);
  }
  // Low road-end walls and headland rocks ground the perimeter visually.
  // The former eastern city wall is opened to the county road network.

  for(let z=-296;z<=296;z+=8){
    if(Math.abs(z)<108)continue;
    rail(-115,z,.56,8,0,.48);
  }

  const fabrics=[mat('#df765e'),mat('#77a8a4'),mat('#e3ba64')];
  function umbrella(x:number,z:number,s:number,c:number){
    const y=groundHeight(x,z),yaw=random()*tau;
    geom(cyl,surface.wood,x,y+s*1.2,z,.055,2.4*s,.055);
    // Alternate triangular fabric panels around a broad octagonal parasol.
    for(let i=0;i<8;i++)geom(wedge,i%2===0?fabrics[c]:surface.ivory,x,y+2.03*s,z,s,s,s,i*tau/8+yaw,0,0,true);
    for(const delta of [-.83,.83]){
      cube(surface.wood,x+delta,y+.19*s,z+1.55*s,.62*s,.13*s,1.75*s,yaw*.12);
      cube(fabrics[c],x+delta,y+.28*s,z+1.55*s,.55*s,.09*s,1.65*s,yaw*.12);
    }
  }

  const wedge=new T.BufferGeometry();
  wedge.setAttribute('position',new T.Float32BufferAttribute([0,.72,0,1.58,0,0,1.117,0,1.117,1.58,0,0,1.58,-.13,0,1.117,-.13,1.117,1.58,0,0,1.117,-.13,1.117,1.117,0,1.117],3));
  wedge.computeVertexNormals();surface.ivory.side=T.DoubleSide;fabrics.forEach(m=>m.side=T.DoubleSide);
  for(let z=-169;z<207;z+=13+random()*5){umbrella(-104+random()*3,z,1+random()*.15,Math.floor(random()*3));if(random()>.36)umbrella(-108+random()*2,z+4,.87+random()*.15,Math.floor(random()*3));}
  // Two raised lifeguard huts break up the palm line on the public beach.
  for(const z of [-126,109]){
    const x=-95,y=groundHeight(x,z);
    for(const dx of [-1.65,1.65])for(const dz of [-1.7,1.7])post(surface.wood,x+dx,z+dz,.12,2,y);
    cube(surface.cream,x,y+1.65,z,5.1,.25,5);cube(surface.aqua,x+.3,y+2.63,z,3.7,1.78,3.5);
    cube(surface.glass,x-1.57,y+2.85,z,.075,.81,2.6);
    geom(shade,surface.shell,x+.2,y+3.94,z,3.2,1.13,3.1,Math.PI/8);collider(x,z,2.4,2.4,4);
    for(let j=0;j<4;j++) cube(surface.wood,x+2+j*.43,y+1.35-j*.32,z,1,.2,1.5);
  }
  const facadeSkins=[surface.cream,surface.shell,surface.aqua,surface.ivory,surface.terra];
  const neons=[surface.mint,surface.pink,surface.amber];
  const halfArch=new T.TorusGeometry(1,.08,7,30,Math.PI);
  const fountainJet=new T.CatmullRomCurve3([new T.Vector3(0,0,0),new T.Vector3(.38,1.32,0),new T.Vector3(.91,1.7,0),new T.Vector3(1.7,.05,0)]);
  const jetGeometry=new T.TubeGeometry(fountainJet,12,.044,5,false);
  const waterJets=glow('#abdcd9',.12,.68,'#badfda');
  const ripples:T.Mesh[]=[];
  const ringGeo=new T.TorusGeometry(1,.022,5,42);
  function fountain(x:number,z:number,r:number) {
    const y=groundHeight(x,z); geom(cyl,surface.stone,x,y+.25,z,r,.5,r);
    geom(cyl,surface.pool,x,y+.53,z,r*.92,.12,r*.92,0,0,0,false);
    geom(cyl,surface.ivory,x,y+.57,z,r*.25,.65,r*.25);
    geom(cyl,surface.brass,x,y+.95,z,r*.13,.33,r*.13);
    for(let j=0;j<9;j++)geom(jetGeometry,waterJets,x,y+.85,z,r*.41,r*.49,r*.41,j*tau/9,0,0,false);
    const ring=new T.Mesh(ringGeo,waterJets);ring.rotation.x=Math.PI/2;ring.position.set(x,y+.61,z);ring.userData.r=r;ripples.push(ring);group.add(ring);
    collider(x,z,r*.85,r*.85,1.4);
  }
  function bench(x:number,z:number,angle:number){
    resource='bench';placements.push({id:'bench',x,y:groundHeight(x,z),z,height:1,rotation:angle});
    const y=groundHeight(x,z);
    for(let i=0;i<4;i++)cube(surface.wood,x+Math.cos(angle)*(i-1.5)*.12,y+.5,z-Math.sin(angle)*(i-1.5)*.12,.105,.11,1.85,angle);
    for(const d of [-.64,.64])cube(surface.black,x+Math.sin(angle)*d,y+.25,z+Math.cos(angle)*d,.42,.48,.12,angle);resource=undefined;
  }
  resource=undefined;
  for(let z=-240;z<250;z+=24) bench(-85.6,z,0);
  function planter(x:number,z:number,r:number) {
    const y=groundHeight(x,z);geom(cyl,surface.cream,x,y+.27,z,r,.55,r);
    geom(round,surface.hedge,x,y+.66,z,r*.9,.55,r*.9);collider(x,z,r*.85,r*.85,.93);
  }
  // Main buildings have modeled plinths, floor bands and independent crowns.
  function tower(x:number,z:number,base:number,w:number,d:number,h:number,skin:T.Material,id:number) {
    const glass=id%3===1?surface.blueglass:surface.glass, accent=neons[id%3];
    cube(skin,x,base+h/2,z,w,h,d);
    const floors=Math.max(2,Math.floor((h-1)/3.6)), spacing=(h-1.2)/floors;
    for(let floor=0;floor<floors;floor++){
      const y=base+1.4+floor*spacing;
      for(const s of [-1,1]){
        cube(glass,x+s*(w/2+.035),y,z,.11,spacing*.66,d-.9);
        cube(glass,x,y,z+s*(d/2+.035),w-.9,spacing*.66,.11);
        if(floor%2===0||id%4===2){
          cube(skin,x+s*(w/2+.19),y-spacing*.36,z,.52,.19,d+.6);
          cube(skin,x,y-spacing*.36,z+s*(d/2+.18),w+.65,.19,.5);
        }
        const by=Math.ceil(d/4.8);
        for(let i=1;i<by;i++)if((i*7+floor*5+id*3)%9<2){
          cube(surface.window,x+s*(w/2+.104),y,z-d/2+i*d/by,.025,spacing*.53,d/by*.63,0,false);
        }
        for(let i=1;i<Math.ceil(w/5);i++)if((i*3+floor+id)%7<2)
          cube(surface.window,x-w/2+i*5,y,z+s*(d/2+.104),2.6,spacing*.53,.025,0,false);
      }
    }
    // Strong vertical silhouettes remain legible across the boulevard.
    const bays=Math.max(2,Math.ceil(d/7));
    for(let j=0;j<=bays;j++)for(const s of [-1,1]){
      const zz=z+(j/bays-.5)*(d-.7);
      cube(skin,x+s*(w/2+.19),base+h*.5,zz,.47,h+.3,.36);
      if(id%3===0&&j%2===0)cube(accent,x+s*(w/2+.44),base+h*.52,zz,.07,h*.9,.13,0,false);
    }
    for(const s of [-1,1])for(const dx of [-1,1])cube(skin,x+dx*(w/2-.38),base+h/2,z+s*(d/2+.13),.58,h+.45,.42);
    cube(skin,x,base+h+.12,z,w+.65,.34,d+.65);
    cube(accent,x,base+h+.36,z,w+.24,.13,d+.24,0,false);
    cube(surface.roof,x,base+h+.52,z,w-.41,.23,d-.41);
  }
  function podium(x:number,z:number,w:number,d:number,h:number,skin:T.Material,accent:T.Material) {
    const y=groundHeight(x,z);
    cube(surface.plinth,x,y+1.04,z,w+1.4,2.4,d+1.4);
    cube(skin,x,y+1.95,z,w+1.7,.4,d+1.7);
    cube(surface.glass,x,y+(h+2)/2,z,w-.4,h-2,d-.7);
    for(const side of [-1,1]){
      for(let i=0;i<=Math.round(d/6);i++)cube(skin,x+side*(w*.5-.23),y+h*.56,z-d/2+i*d/Math.round(d/6),.95,h*.8,1.05);
      for(let i=0;i<=Math.round(w/6);i++)cube(skin,x-w/2+i*w/Math.round(w/6),y+h*.56,z+side*(d*.5-.23),1.05,h*.8,.95);
    }
    cube(skin,x,y+h+.1,z,w+2.9,1,d+2.9);
    cube(accent,x,y+h+.64,z,w+2.92,.16,d+2.92,0,false);
    collider(x,z,w/2+.35,d/2+.35,h+1);
  }
  const hotels=[
    {x:-8,z:210,w:33,d:49,h:33,id:0,name:'MIRAFLOR',sub:'PALM TERRACES',fg:'#fee6aa',bg:'#31524a'},
    {x:-11,z:99,w:36,d:42,h:39,id:1,name:'THE NACRE',sub:'HOTEL & CASINO',fg:'#fff0cb',bg:'#7d4948'},
    {x:-5,z:42,w:32,d:35,h:55,id:2,name:'SOLENNE',sub:'SUN ROOM',fg:'#ffe791',bg:'#624d36'},
    {x:-9,z:-53,w:32,d:50,h:33,id:3,name:'CASA LUMA',sub:'OCEAN CLUB',fg:'#d2ffef',bg:'#31575b'},
    {x:-7,z:-115,w:30,d:42,h:46,id:4,name:'VELLORA',sub:'STARLIGHT LOUNGE',fg:'#f6d7c2',bg:'#4d465c'},
    {x:-8,z:-207,w:29,d:46,h:25,id:5,name:'ALBA',sub:'HEADLAND HOTEL',fg:'#f5e5b6',bg:'#4b675a'}
  ];
  for(const b of hotels){
    const {x,z,w,d,h,id,name,sub,fg,bg}=b,y=groundHeight(x,z),skin=facadeSkins[id%5],accent=neons[id%3];
    const front=x-w*.5, podiumH=5.8,base=y+podiumH+.8;
    cube(surface.tile,x-3,y+.045,z,w+22,.09,d+8);
    podium(x,z,w,d,podiumH,skin,accent);
    // A cantilevered entry canopy, warm downlights and a named entrance.
    cube(skin,front-2.15,y+4.11,z,5.4,.56,d*.58);
    cube(accent,front-2.15,y+4.45,z,5.43,.14,d*.59,0,false);
    lightSources.push({position:new T.Vector3(front-4.6,y+3.67,z),color:new T.Color('#ffbf8c'),intensity:80});
    for(const s of [-1,1]){
      post(surface.brass,front-4.4,z+s*d*.24,.16,4.08,y);planter(front-5,z+s*(d*.44),1.25);
    }
    for(let j=-2;j<=2;j++)geom(bud,surface.bulbs,front-4.6,y+3.84,z+j*2,.16,.07,.16,0,0,0,false);
    lettering(name,sub,fg,bg,front-2.02,y+7.28,z,Math.min(21,d*.65),3.75);
    if(id===0){ // Miraflor, a terraced resort with planted ledges and a rooftop pavilion.
      const shells=[{dx:0,w:.94,d:.9,h:.38},{dx:2,w:.78,d:.7,h:.35},{dx:4,w:.59,d:.49,h:.27}];let yy=base;
      for(const s of shells){tower(x+s.dx,z,yy,w*s.w,d*s.d,h*s.h,skin,id);yy+=h*s.h+.46;}
      for(let j=-2;j<=2;j++) {const zz=z+j*6;geom(round,surface.hedge,front+5,base+h*.38+.78,zz,1.1,.57,2.55);}
      geom(shade,surface.aqua,x+4,yy+2.1,z,6.4,4.2,6.4,Math.PI/8);
    }else if(id===1){ // The Nacre: fluted twin wings and a monumental pearl shell.
      for(const s of [-1,1]){tower(x+1,z+s*11,base,w*.75,15,h*(s<0?1:.81),skin,id);
        for(let j=0;j<4;j++)cube(surface.ivory,x-w*.37,y+14+j*.08,z+s*11+(j-1.5)*3,1.1,21+j*2,.55);}
      const shellX=front-2.05,cy=base+4.9;
      for(let j=0;j<=12;j++){
        const a=-1.03+j*2.06/12;
        geom(box,j%2?surface.ivory:surface.shell,shellX,cy+Math.cos(a)*5.8,z+Math.sin(a)*5.8,1,11.6,.74,0,0,-a);
      }
      geom(halfArch,surface.brass,shellX-.48,cy,z,10,10,1,-Math.PI/2);
      geom(round,surface.ivory,shellX-1.2,cy+.6,z,1.5,2.8,2.8);
    }else if(id===2){ // Solenne has a gilded, setback crown and sunray blade.
      tower(x+1,z,base,w*.73,d*.74,h*.79,skin,id);
      tower(x+1,z,base+h*.79+.35,w*.51,d*.5,h*.2,skin,id);
      for(let j=0;j<3;j++){cube(surface.brass,x+1,base+h+j*.67,z,w*(.44-j*.08),.71,d*(.44-j*.08));}
      post(accent,x+1,z,.13,7,base+h+1.45);
      cube(surface.brass,front-1.7,base+4.8,z+d*.24,.51,9.6,.56);
      geom(torus,accent,front-2,base+13,z+d*.24,4.2,4.2,.9,-Math.PI/2);
      for(let j=0;j<12;j++){const a=j*tau/12;geom(box,surface.brass,front-2,base+13+Math.sin(a)*3.2,z+d*.24+Math.cos(a)*3.2,2.1,.19,.25,-Math.PI/2,a);}
    }else if(id===3){ // Casa Luma: an ocean-liner curve, aqua glazing and wraparound balconies.
      const xx=x+2,r=w*.35;
      geom(cyl,surface.blueglass,xx,base+h*.47,z,r,h*.94,r*1.48);
      for(let j=0;j<=9;j++){geom(cyl,j%3===0?accent:skin,xx,base+j*h*.097,z,r+.69,.39,(r+.69)*1.48);}
      tower(x+5,z-8,base,14,d*.53,h*1.09,skin,id);
    }else if(id===4){ // Vellora: a needle-topped copper drum above an angular podium.
      tower(x+2,z,base,w*.76,d*.73,h*.66,skin,id);
      geom(cyl,surface.glass,x+2,base+h*.79,z,7,h*.26,7);
      for(let j=0;j<6;j++)geom(cyl,j===5?accent:surface.brass,x+2,base+h*.66+j*2.1,z,7.42,.25,7.42);
      geom(shade,surface.brass,x+2,base+h*.98,z,7.2,h*.16,7.2);post(accent,x+2,z,.12,3,base+h*1.05);
    }else{
      tower(x+3,z,base,w*.75,d*.82,h*.77,skin,id);
      for(const s of [-1,1])geom(round,surface.aqua,x+3,base+h*.77+.22,z+s*10,4.4,3,4.4);
    }
    collider(x+1,z,w*.43,d*.45,podiumH+h+2);
    if(id===0||id===1||id===3)fountain(front-12,z,3.5);
    // Boulevard blades face approaching traffic. A brass surround gives a visible edge from the promenade.
    const bladeX=-43,bladeZ=z+d*.37,bladeY=groundHeight(bladeX,bladeZ);
    post(surface.brass,bladeX,bladeZ,.37,7.4);
    cube(skin,bladeX,bladeY+8.05,bladeZ,6.6,3.6,.65);
    cube(accent,bladeX,bladeY+10,bladeZ,7.1,.15,.74,0,false);
    lettering(name,'',fg,bg,bladeX,bladeY+8.05,bladeZ+.34,6.5,2.57,0);
    lettering(name,'',fg,bg,bladeX,bladeY+8.05,bladeZ-.34,6.5,2.57,Math.PI);
    collider(bladeX,bladeZ,.36,.36,7.6);
    for(const s of [-1,1]){palm(-37,z+s*d*.54,7.9+random()*1.6);bench(front-7,z+s*8,0);}
  }
  // Smaller inland venues and residential blocks use a lower, varied street wall.
  const cityNames=['COVE MARKET','MIRA CINEMA','AZURE BATHS','PALMA CAFÉ','ARCADIA','LUZ GALLERY'];
  const smallRows=[-218,-110,-49,45,112,216];
  for(let row=0;row<smallRows.length;row++){
    const z=smallRows[row];
    for(let col=0;col<3;col++){
      const id=row*3+col, x=[34,97,145][col]+(row%2)*1.5,skin=facadeSkins[(id+2)%5],accent=neons[(id+1)%3];
      const w=col===0?17:23+id%4*1.3, d=26+(id*7)%14, y=groundHeight(x,z), height=10+(id*11)%23;
      podium(x,z,w,d,4.2,skin,accent);
      if(id%4===0){
        geom(cyl,surface.blueglass,x,y+5+height*.5,z,w*.4,height,w*.41);
        for(let j=0;j<height;j+=3)geom(cyl,skin,x,y+5+j,z,w*.43,.33,w*.44);
        geom(cyl,accent,x,y+5+height,z,w*.44,.26,w*.45);
      }else{
        tower(x,z,y+4.9,w*.87,d*.83,height,skin,id);
        if(id%3===1)tower(x+1,z+2,y+height+5.3,w*.63,d*.61,5.2,skin,id);
      }
      collider(x,z,w*.44,d*.45,height+6);
      if(col===1){
        lettering(cityNames[row],'',row%2?'#fae0b1':'#c2ede4',row%2?'#644c45':'#3c515d',x-w/2-.15,y+4.35,z,17,2.7);
        for(let k=-2;k<=2;k++)geom(box,k%2?surface.cream:surface.terra,x-w/2-1,y+2.87,z+k*1.78,2.6,.21,1.76,0,.12);
      }
    }
  }
  // A lower garden district gives the expanded city its own skyline and streets.
  const quarterNames=['PALM QUARTER','CITRUS COURT','THE ATELIER','SOL MARKET','GARDEN ARCADE','MESA HOUSE'];
  for(let row=0;row<smallRows.length;row++){
    const z=smallRows[row];
    for(const [column,x] of [226,292].entries()){
      const id=30+row*2+column,y=groundHeight(x,z),skin=facadeSkins[(row+column)%5];
      const w=column?38:34,d=34,h=12+(row%3)*5;
      podium(x,z,w,d,4.2,skin,neons[id%3]);
      tower(x,z,y+4.9,w*.76,d*.75,h,skin,id);
      collider(x,z,w*.5,d*.5,h+6);
      lettering(quarterNames[row],column?'GARDEN RESIDENCES':'SHOPS & COURTYARDS','#f8e4b7','#385952',x-w/2-.13,y+5.3,z,20,2.7);
      planter(x-w/2-3,z-11,1.3);planter(x-w/2-3,z+11,1.3);
      bench(x-w/2-4,z,0);
      for(const side of [-1,1])palm(x+side*(w/2-2),z+23,7+random());
    }
    fountain(260,z,3.3);
  }
  for(let z=-245;z<250;z+=25)if(clearOfCrossStreet(z)){palm(331,z,8+random());lamp(332.5,z,Math.PI/2);}
  for(const z of [-160,0,160])for(let x=207;x<331;x+=28){lamp(x,z+9,Math.PI);palm(x,z-11,7.6);}
  lettering('PALM QUARTER','GARDENS · MARKET · RESIDENCES','#ffe3a3','#37534c',263,9,170,21,3.7,0);
  const beachgoers=createBeachgoers(groundHeight);group.add(beachgoers.group);
  const stunt=createStuntArena();group.add(stunt.group);colliders.push(...stunt.colliders);lightSources.push(...stunt.lights);
  const gallery=createGrandGallery();group.add(gallery.group);colliders.push(...gallery.colliders);lightSources.push(...gallery.lights);
  // County scenery uses the same spatially culled batches as the original city.
  function lotClear(x:number,z:number,w:number,d:number){
    if(!isLand(x,z)||insideGallery(x,z,25))return false;
    const radius=Math.hypot(w,d)/2,p=roadIndex!.nearest(x,z);
    return p.distance>p.width/2+radius+2&&[[-1,-1],[1,-1],[1,1],[-1,1]].every(([a,b])=>isLand(x+a*w/2,z+b*d/2));
  }
  const roadClear=(x:number,z:number,margin:number)=>{const p=roadIndex!.nearest(x,z);return p.distance>p.width/2+margin;};
  const highlands=developHighlands({group,roads,surface,mat,glow,cube,geom,collider,groundHeight,lotClear,roadClear,palm,lamp,tower,podium,fountain,bench,lettering});
  const cityConcrete=mat('#bac2c2'),citySilver=mat('#a6b3b9'),cityDark=mat('#576875');
  for(const [column,x] of [615,800].entries())for(const [row,z] of [-180,-10,170].entries()){
    if(!lotClear(x,z,50,70))continue;
    const y=groundHeight(x,z),id=40+column*3+row;
    podium(x,z,50,70,5.8,cityConcrete,neons[id%3]);
    for(const dx of [-12,12])for(const dz of [-18,18]){
      const height=50+((id*19+dx*2+dz*3+200)%70);
      tower(x+dx,z+dz,y+6.4,20,28,height,[cityConcrete,citySilver,cityDark][(id+Math.abs(dx+dz))%3],id);
      collider(x+dx,z+dz,10,14,height+7);
      if(id===44&&dx===12&&dz===18){tower(x+dx,z+dz,y+height+6.7,12,18,22,citySilver,id);post(surface.amber,x+dx,z+dz,.17,14,y+height+29);}
    }
    lettering(['CROWN EXCHANGE','NORTHSTAR PLAZA','VESPER CENTRE'][row],'DOWNTOWN', '#e9f2ef','#283f4a',x-25.3,y+4.5,z,30,3.2);
    for(const side of [-1,1]){planter(x-29,z+side*24,1.7);bench(x-31,z+side*9,0);}
  }
  // Downtown arterials carry palms, traffic signals and lit shop fronts.
  for(const z of [-260,-100,80,260])for(let x=520;x<880;x+=36){
    const p=roadIndex!.nearest(x,z+14);if(p.distance>p.width/2+1)palm(x,z+14,8+random()*2);
    const q=roadIndex!.nearest(x,z-12);if(q.distance>q.width/2+1)lamp(x,z-12,0);
  }
  for(const x of [560,720,880])for(const z of [-260,-100,80,260]){
    const y=groundHeight(x+12,z+12);
    post(surface.black,x+12,z+12,.12,5.5,y);
    cube(surface.black,x+12,y+5.5,z+6,.22,.24,12);
    cube(surface.black,x+12,y+5.1,z+1,.55,1.1,.35);
    geom(round,surface.mint,x+12,y+4.9,z+.78,.12,.12,.07,0,0,0,false);
  }
  // Low canal-side villas, private moorings and neighbourhood bridges.
  for(const x of [975,1125,1225])for(const [row,z] of [-185,-25,145,330].entries()){
    if(!lotClear(x,z,24,32))continue;
    const y=groundHeight(x,z),skin=facadeSkins[row%5];
    podium(x,z,24,32,3.8,skin,surface.mint);tower(x,z,y+4.3,19,26,5+row*1.5,skin,row);
    geom(shade,surface.terra,x,y+12+row,z,15,3.5,18,Math.PI/4);
    cube(surface.pool,x+18,y+.05,z,9,.12,18);palm(x-17,z-13,7.6);palm(x-17,z+13,8.2);
  }
  for(let z=-120;z<440;z+=12)for(const x of [1061,1099]){
    if([-100,80,260,400].some(v=>Math.abs(z-v)<14))continue;
    const p=roadIndex!.nearest(x,z);if(p.distance<p.width/2+4)continue;
    const y=landHeight(x,z);cube(surface.stone,x,y-.1,z,1.1,6,12.1);cube(surface.cream,x,y+1,z,.45,.9,12);
    collider(x,z,.45,6,y-groundHeight(x,z)+1.5);
  }
  for(const z of [-50,170,330]){
    geom(round,surface.ivory,1080,-.15,z,3.1,.85,7.5,0,0,0,false);
    cube(surface.wood,1080,.55,z,4,.12,8);cube(surface.glass,1080,1.4,z-1,2.7,1.5,3);
  }
  // Airport runway, terminal, control tower, hangars and parked light aircraft.
  const airportY=groundHeight(245,430);
  podium(245,430,120,32,5.2,surface.ivory,surface.mint);
  lettering('COAST AIRFIELD','TERMINAL 01','#f5e6b5','#304b58',245,airportY+6.5,413.7,66,5,Math.PI);
  cube(cityConcrete,440,airportY+12,430,8,24,8);cube(surface.glass,440,airportY+26,430,16,6,16);
  cube(surface.white,440,airportY+29.3,430,17,.5,17);collider(440,430,8,8,30);
  for(const x of [110,250,390]){
    const y=groundHeight(x,610);podium(x,610,70,30,9,citySilver,surface.amber);
    cube(surface.dark,x,y+4.5,594.6,55,7,.2);
  }
  // Low-profile runway markers keep the edges legible from the cockpit at night.
  const runwayEdge=glow('#afd5fb',.2,1.8,'#a0b7ca');
  for(let x=110;x<=410;x+=15)for(const side of [-1,1]){
    const z=520+side*17.8,y=groundHeight(x,z);
    cube(cityDark,x,y+.07,z,.5,.14,.46,0,false);
    cube(runwayEdge,x,y+.17,z,.24,.11,.23,0,false);
  }
  function plane(x:number,z:number){
    const y=groundHeight(x,z);
    geom(cyl,surface.ivory,x,y+2,z,1,17,1,0,Math.PI/2);
    cube(surface.ivory,x,y+2,z,3,.18,18);cube(surface.ivory,x+6,y+3,z,4,.17,7);
    cube(surface.terra,x+6,y+3.3,z,3,3,.18);cube(surface.glass,x-5,y+2.7,z,2,.55,1.4);
    for(const side of [-1,1])geom(round,surface.black,x+3,y+.5,z+side*2,.5,.5,.24);
    collider(x,z,8.5,9,4);
  }
  plane(170,470);plane(320,470);
  // Southport is distinct from the resort: steel sheds, container rows and gantry cranes.
  const containers=[mat('#af5d48'),mat('#477b87'),mat('#d0a34e'),mat('#698a6a')];
  for(const x of [955,1000])for(const z of [540,585,740,795,850]){
    if(!lotClear(x,z,18,34))continue;
    const y=groundHeight(x,z);
    for(let level=0;level<2;level++)cube(containers[(Math.abs(x+z)+level)%4],x,y+1.5+level*3,z,15,2.8,30);
    for(let d=-12;d<=12;d+=3)cube(surface.dark,x-7.55,y+2.9,z+d,.08,5.5,.1);
    collider(x,z,7.7,15,6);
  }
  for(const z of [550,800]){
    const x=1040,y=groundHeight(x,z);
    for(const side of [-1,1])cube(surface.brass,x+side*7,y+11,z,1.1,22,1.1);
    cube(surface.brass,x+8,y+22,z,36,1.4,2);cube(surface.black,x+23,y+15,z,.12,14,.12);
    collider(x-7,z,.7,.7,22);collider(x+7,z,.7,.7,22);
  }
  podium(970,850,70,42,13,cityDark,surface.amber);
  lettering('SOUTHPORT','CONTAINER TERMINAL','#f3d89e','#34444c',970,15,828.7,52,5,Math.PI);
  geom(round,surface.terra,1160,0,800,19,4,48,0,0,0,false);
  cube(surface.ivory,1160,7,815,16,12,15);cube(surface.glass,1160,12,810,17,3,2);
  for(let i=0;i<6;i++)cube(containers[i%4],1150+(i%2)*18,5.4,775+Math.floor(i/2)*18,16,4,16);
  // Tropical island resort reached by the elevated causeway.
  for(const [i,x] of [140,220,300].entries()){
    const z=935,y=groundHeight(x,z);if(!lotClear(x,z,24,18))continue;
    podium(x,z,24,18,3.6,facadeSkins[i],surface.mint);
    geom(shade,surface.terra,x,y+6,z,18,5,14,Math.PI/4);
    palm(x-18,z,8);palm(x+18,z,8.5);
  }
  lettering('ISLA LUZ','TAKE THE LONG WAY','#f6e1a7','#335952',340,5,940,18,3,-Math.PI/2);
  // Pine country, winding roads and the white hillside landmark.
  const pine=mat('#45694d');
  for(let i=0;i<290;i++){
    const x=80+random()*1200,z=-1180+random()*760,p=roadIndex!.nearest(x,z);
    if(!isLand(x,z)||reservedNorth(x,z)||p.distance<p.width/2+10)continue;
    const y=groundHeight(x,z),h=7+random()*8;
    resource='fir';placements.push({id:'fir',x,y,z,height:h});
    geom(tube,surface.wood,x,y+h*.35,z,.25,h*.7,.25);
    for(let k=0;k<3;k++)geom(shade,pine,x,y+h*(.48+k*.18),z,h*(.28-k*.06),h*.5,h*(.28-k*.06),random()*tau);
    if(p.distance<60)collider(x,z,.3,.3,h);resource=undefined;
  }
  for(let i=0;i<120;i++){
    const x=250+random()*1000,z=-1150+random()*650;
    if(isLand(x,z)&&!reservedNorth(x,z)&&roadIndex!.nearest(x,z).distance>24)stone(x,z,1.5+random()*3);
  }
  const hillSignCanvas=document.createElement('canvas');hillSignCanvas.width=2048;hillSignCanvas.height=256;
  const hillCtx=hillSignCanvas.getContext('2d')!;hillCtx.font='900 210px Barlow, Arial';hillCtx.fillStyle='#fff4de';hillCtx.textAlign='center';hillCtx.fillText('SIERRA',1024,220);
  const hillTexture=new T.CanvasTexture(hillSignCanvas);hillTexture.colorSpace=T.SRGBColorSpace;
  const hillLetters=new T.Mesh(new T.PlaneGeometry(90,13),new T.MeshStandardMaterial({map:hillTexture,transparent:true,alphaTest:.15,side:T.DoubleSide,roughness:.8}));
  hillLetters.position.set(470,groundHeight(470,-680)+12,-680);group.add(hillLetters);
  podium(1285,-480,38,24,5,surface.cream,surface.amber);
  lettering('SIERRA MOTOR INN','FUEL · FOOD · LAKE ROAD','#f5dfaf','#5c5346',1265,groundHeight(1265,-480)+7,-480,20,3,-Math.PI/2);
  // Freeway signs and guardrails on the raised island causeway.
  for(const [x,z,text] of [[490,-120,'DOWNTOWN'],[890,-420,'SIERRA / LAKE'],[810,650,'AIRFIELD / PORT']] as [number,number,string][]){
    const freeway=roads[9],i=freeway.points.reduce((best,p,index)=>p.distanceToSquared(new T.Vector3(x,p.y,z))<freeway.points[best].distanceToSquared(new T.Vector3(x,p.y,z))?index:best,0);
    const p=freeway.points[i],next=freeway.points[(i+1)%freeway.points.length],dx=next.x-p.x,dz=next.z-p.z,l=Math.hypot(dx,dz)||1,yaw=Math.atan2(dx,dz);
    cube(surface.black,p.x,p.y+7,p.z,34,.3,.3,yaw);
    for(const side of [-1,1]){const xx=p.x+side*dz/l*17,zz=p.z-side*dx/l*17,q=roadIndex!.nearest(xx,zz);if(q.distance<q.width/2+1)continue;post(surface.black,xx,zz,.14,7,p.y);collider(xx,zz,.18,.18,p.y-groundHeight(xx,zz)+7);}
    lettering(text,'CROSSTOWN · EXIT 01','#eef5df','#285b50',p.x,p.y+7.5,p.z,24,3.2,yaw);
  }
  for(const r of roads.filter(r=>r.name==='Isla Luz Causeway'||r.name==='Harbour Bridge'))for(let i=1;i<r.points.length;i+=3){
    const a=r.points[i-1],b=r.points[i],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);
    if(isLand(b.x,b.z))continue;
    for(const side of [-1,1]){
      const x=b.x+side*dz/l*(r.width/2+.6),z=b.z-side*dx/l*(r.width/2+.6),y=b.y;
      cube(surface.cream,x,y+.6,z,.35,1.2,10,Math.atan2(dx,dz));
      collider(x,z,.18,5,y-groundHeight(x,z)+1.2,Math.atan2(dx,dz));
    }
    if(!isLand(b.x,b.z))cube(cityConcrete,b.x,(b.y-3.5)/2,b.z,2.4,b.y+3.5,2.4);
  }
  // Coast and lake barriers keep water edges legible while leaving every bridge open.
  const shores=[MAINLAND,ISLAND,...WATERS.map(w=>w.polygon??(w.shape==='ellipse'?Array.from({length:48},(_,i)=>[w.x+Math.cos(i*tau/48)*w.rx,w.z+Math.sin(i*tau/48)*w.rz]):[[w.x-w.rx,w.z-w.rz],[w.x+w.rx,w.z-w.rz],[w.x+w.rx,w.z+w.rz],[w.x-w.rx,w.z+w.rz]]))];
  for(const polygon of shores)for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],steps=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/9);
    for(let j=0;j<steps;j++){
      const x=T.MathUtils.lerp(a[0],b[0],j/steps),z=T.MathUtils.lerp(a[1],b[1],j/steps),p=roadIndex!.nearest(x,z);
      if(insideStunt(x,z,4)||riverAt(x,z).distance<RIVER.width/2+6||p.distance<p.width/2+10)continue;
      const y=landHeight(x,z);geom(boulder,surface.rock,x,y+.3,z,2.2,1.1,2,random()*tau);
      collider(x,z,1.6,1.6,y-groundHeight(x,z)+1.7);
    }
  }
  // Pergolas overlooking the water, with unobstructed road-side sea views.
  for(const z of [-192,64,236]){
    const x=-83.5,y=groundHeight(x,z);
    for(const xx of [-2.1,2.1])for(const zz of [-3,3]){post(surface.cream,x+xx,z+zz,.17,3.25,y);collider(x+xx,z+zz,.17,.17,3.3);}
    for(let i=0;i<10;i++)cube(surface.wood,x,y+3.3,z-3.25+i*.72,4.95,.17,.24);
    for(const xx of [-2.05,2.05])cube(surface.wood,x+xx,y+3.14,z,.21,.24,7.1);
  }
  // Low flowering plantings, agave, grasses and planting islands add detail below windshield level.
  const flowers=[mat('#cf8a7d'),mat('#b59ead'),mat('#dfbf83')];
  for(let z=-250;z<250;z+=8.8){
    if(!clearOfCrossStreet(z))continue;
    const x=-50+random()*1.25,y=groundHeight(x,z);
    geom(oval,surface.hedge,x,y+.47,z,1.1,.57,1.44,random()*tau);
    for(let j=0;j<4;j++)geom(bud,flowers[(j+Math.floor(Math.abs(z)))%3],x+(random()-.5)*1.5,y+.78+random()*.12,z+(random()-.5)*1.8,.15,.11,.15,0,0,0,false);
  }
  for(let z=-296;z<=297;z+=3+random()*5){
    const x=-91-random()*3,y=groundHeight(x,z);
    for(let j=0;j<3;j++)geom(shade,surface.grass,x+(random()-.5)*.7,y+.22,z+(random()-.5)*.7,.09,.53,.09,random()*tau,(random()-.5)*.7,0,false);
  }

  // Distant sails retain the ocean's scale even with a low camera.
  const sail=new T.BufferGeometry();sail.setAttribute('position',new T.Float32BufferAttribute([0,0,0,0,8,0,0,.15,3.5],3));sail.computeVertexNormals();
  const sailCloth=mat('#eee3c5');sailCloth.side=T.DoubleSide;
  for(const [x,z,s] of [[-234,25,.85],[-283,-128,1],[-199,180,.68],[-395,257,.78]]){
    geom(round,surface.cream,x,-.32,z,.84*s,.4*s,3.46*s,0,0,0,false);
    geom(tube,surface.wood,x,3.4*s-.35,z,.05,7.6*s,.05,0,0,0,false);
    geom(sail,sailCloth,x,-.02,z,s,s,s,0,0,0,false);
  }
  // A tightly tessellated coastal strip carries tiny crests; the open sea can use large triangles.
  const oceanUniforms={
    clock:{value:0}, shallows:{value:new T.Color('#6dc6bb')},deep:{value:new T.Color('#317f8b')},
    fogColor:{value:new T.Color('#d4c1ac')},surf:{value:new T.Color('#f1e7cb')},glint:{value:new T.Color('#ffd79c')},power:{value:1}
  };
  const ocean=new T.ShaderMaterial({
    uniforms:oceanUniforms,side:T.DoubleSide,
    vertexShader:`
      uniform float clock;
      varying vec3 worldP;
      void main(){
        vec3 p=position; float d=p.x> -108.?30.:max(0.,-117.-p.x);
        float wave=sin(.72*p.x+.034*p.z+clock*1.63+sin(p.z*.15)*.28)*.034;
        wave+=sin(p.x*.22+p.z*.041+clock*.91)*.048;
        p.y+=wave*smoothstep(0.,8.,d);
        worldP=p; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
    fragmentShader:`
      uniform float clock,power;uniform vec3 shallows,deep,surf,glint,fogColor;
      varying vec3 worldP;
      float wave(vec2 p){return sin(p.x*.76+p.y*.14+clock*1.6+sin(p.y*.121)*.7)+.56*sin(p.x*1.21-p.y*.32+clock*1.14)+.33*sin(p.x*2.47+p.y*.49+clock*1.91);}
      void main(){
        vec2 p=worldP.xz;float head=smoothstep(200.,278.,-p.y);
        float shore=-117.6-3.25*head+sin(p.y*.13)*.23,dist=max(0.,shore-p.x);if(p.x> -108.)dist=30.;
        float camD=distance(worldP,cameraPosition);
        float nearDetail=1.-smoothstep(70.,250.,camD);
        float w=wave(p),w2=wave(p+vec2(1.25,2.9));
        vec3 v=normalize(cameraPosition-worldP);
        vec3 n=normalize(vec3(.051*w,1.,.04*w2));
        vec3 sun=normalize(vec3(-.9,.24,-.36));
        float sheen=pow(max(0.,dot(n,normalize(v+sun))),77.);
        vec3 c=mix(shallows,deep,smoothstep(1.,66.,dist));
        c*=.88+.08*w*(.45+.55*nearDetail)+.06*sin(p.x*.19+p.y*.038);
        c+=glint*(.54*sheen+.21*pow(sheen,3.))*power;
        float shorePhase=dist*.95+clock*1.04+sin(p.y*.14)*.47+.17*sin(p.y*.41);
        float waveBand=pow(.5+.5*cos(shorePhase),8.);
        float slowWash=1.-smoothstep(.25,2.4,dist);
        float foam=(waveBand*exp(-dist*.18)+slowWash*.44)*(.73+.27*sin(p.y*1.11+p.x*1.5+clock));
        c=mix(c,surf,clamp(foam*.93,0.,.93));
        float mist=smoothstep(160.,1250.,camD)*.96;
        gl_FragColor=vec4(mix(c,fogColor,mist),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  function seaPatch(x1:number,x2:number,z1:number,z2:number,nx:number,nz:number) {
    const g=new T.PlaneGeometry(x2-x1,z2-z1,nx,nz);g.rotateX(-Math.PI/2);g.translate((x1+x2)/2,-.535,(z1+z2)/2);
    const mesh=new T.Mesh(g,ocean);group.add(mesh);
  }
  seaPatch(-178,-108,-1350,1250,48,250);seaPatch(-1600,-178,-1600,1600,45,67);
  seaPatch(-178,1600,-1600,1400,80,110);
  const scenicAsphalt=surface.asphalt.clone();
  scenicAsphalt.name='Scenic stop asphalt';scenicAsphalt.color.set('#eff3f5');
  for(const stop of stops){
    const {x,z,elevation:y,width,depth,color}=stop;
    const accent=mat(color),accessX=stop.from.x-x,accessZ=stop.from.z-z;
    const westEntry=Math.abs(accessX)>Math.abs(accessZ);
    const farX=westEntry?-Math.sign(accessX):0,farZ=westEntry?0:-Math.sign(accessZ);
    const acrossX=farZ,acrossZ=-farX;
    const far=westEntry?width/2:depth/2,across=westEntry?depth/2:width/2;
    const yaw=Math.atan2(-farX,-farZ);
    const borderX=x+farX*(far-.4),borderZ=z+farZ*(far-.4);
    const span=across*2;
    cube(scenicAsphalt,x,y-.038,z,width,.14,depth,0,false);
    cube(surface.stone,borderX,y+.32,borderZ,span,.69,.46,yaw);
    cube(accent,borderX,y+.69,borderZ,span,.11,.51,yaw);
    colliders.push({x:borderX,z:borderZ,halfX:span/2,halfZ:.26,rotation:yaw,baseY:y,height:.75});
    for(const lane of [-1,1]){
      const offset=lane*across*.55;
      const lx=x+acrossX*offset+farX*(far-3.1),lz=z+acrossZ*offset+farZ*(far-3.1);
      cube(accent,lx,y+.043,lz,.12,.017,4.4,yaw,false);
      const postX=borderX+acrossX*lane*across*.80,postZ=borderZ+acrossZ*lane*across*.80;
      geom(cyl,surface.dark,postX,y+.53,postZ,.11,1.06,.11);
      geom(cyl,surface.lamp,postX,y+1.03,postZ,.16,.11,.16,0,0,0,false);
      lightSources.push({position:new T.Vector3(postX,y+1.22,postZ),color:new T.Color(color),intensity:14,range:13});
    }
    const signX=borderX+acrossX*across*.53,signZ=borderZ+acrossZ*across*.53;
    geom(cyl,surface.dark,signX,y+.92,signZ,.09,1.8,.09);
    lettering(stop.name.toUpperCase(),stop.district.toUpperCase(),'#f8edcf','#173c40',signX,y+1.66,signZ,4.6,1.25,yaw);
    const seatX=borderX-acrossX*across*.52-farX*.95,seatZ=borderZ-acrossZ*across*.52-farZ*.95;
    cube(surface.wood,seatX,y+.52,seatZ,2.25,.13,.45,yaw);
    cube(surface.stone,seatX,y+.24,seatZ,1.67,.46,.39,yaw);
    colliders.push({x:seatX,z:seatZ,halfX:1.125,halfZ:.225,rotation:yaw,baseY:y,height:.59});
    for(const side of [-1,1]){
      const bedX=x+acrossX*side*(across+1.8)+farX*2.8,bedZ=z+acrossZ*side*(across+1.8)+farZ*2.8;
      if(!lotClear(bedX,bedZ,2.8,2.8))continue;
      const base=groundHeight(bedX,bedZ);
      if(stop.id==='sierra-vista'){
        cube(surface.stone,bedX,base+.32,bedZ,2.4,.85,2.4,yaw);
        const h=4.6;
        post(surface.wood,bedX,bedZ,.14,h,base);
        for(let tier=0;tier<3;tier++)geom(shade,surface.green,bedX,base+2.3+tier*.85,bedZ,2.8-tier*.58,2.15,2.8-tier*.58);
        collider(bedX,bedZ,1.2,1.2,.8,yaw);
      }else if(stop.id==='lake-overlook'){
        cube(surface.cream,bedX,base+.39,bedZ,2.85,.95,2.2,yaw);
        for(const offset of [-.7,0,.7])geom(oval,surface.green,bedX+acrossX*offset,base+1,bedZ+acrossZ*offset,1.12,.74,1.06);
        collider(bedX,bedZ,1.43,1.1,.9,yaw);
      }else{
        for(const offset of [-.94,.94]){
          const bx=bedX+acrossX*offset,bz=bedZ+acrossZ*offset;
          post(surface.cream,bx,bz,.12,2.65,base);collider(bx,bz,.13,.13,2.7);
        }
        for(let row=-2;row<=2;row++)cube(surface.wood,bedX+farX*row*.48,base+2.7,bedZ+farZ*row*.48,2.65,.14,.22,yaw);
        cube(surface.walk,bedX,base+.045,bedZ,2.8,.14,2.8,yaw,false);
      }
    }
    const route=roads.find(r=>r.name===stop.road)!;
    // Two-sided direction blade is set beyond the shoulder and faces along the road.
    const a=route.points.reduce((best,p)=>Math.hypot(p.x-stop.from.x,p.z-stop.from.z)<Math.hypot(best.x-stop.from.x,best.z-stop.from.z)?p:best);
    const i=route.points.indexOf(a),b=route.points[Math.min(i+1,route.points.length-1)],q=route.points[Math.max(0,i-1)];
    const dx=b.x-q.x,dz=b.z-q.z,l=Math.hypot(dx,dz)||1;
    for(const direction of [-1,1]){
      const u=(route.width/2+3.6)*direction;
      const xx=a.x+dz/l*u+dx/l*direction*11,zz=a.z-dx/l*u+dz/l*direction*11;
      if(!lotClear(xx,zz,2.7,1))continue;
      const base=groundHeight(xx,zz),face=Math.atan2(dx,dz);
      post(surface.dark,xx,zz,.077,2.9,base);
      lettering(stop.name.toUpperCase(),'SCENIC PULL-OFF','#fff2db','#234743',xx+dx/l*.025,base+2.55,zz+dz/l*.025,5.3,1.28,face);
      lettering(stop.name.toUpperCase(),'SCENIC PULL-OFF','#fff2db','#234743',xx-dx/l*.025,base+2.55,zz-dz/l*.025,5.3,1.28,face+Math.PI);
      break;
    }
  }
  for(const [key,b] of buckets){
    const instances=new T.InstancedMesh(b.g,b.m,b.matrices.length);
    b.matrices.forEach((m,i)=>instances.setMatrixAt(i,m));instances.castShadow=b.shadow;instances.receiveShadow=true;
    instances.userData.resource=key.split(':').at(-1)||undefined;instances.computeBoundingSphere();group.add(instances);
  }
  dressDistricts(group,colliders,roads,groundHeight,placements);
  const ambientLife=createAmbientLife(group,groundHeight);
  if(prebuilt){
    const materials=new Map<string,T.Material>(Object.values(surface).map(m=>[m.name,m]));dayGlow.forEach(d=>{if(d.material.name)materials.set(d.material.name,d.material);});
    const restored=new Set<T.Material>();
    const restore=(m:T.Material)=>{const replacement=materials.get(m.name);if(replacement)return replacement;if(m instanceof T.MeshStandardMaterial&&m.userData.glowDay!==undefined&&!restored.has(m)){restored.add(m);dayGlow.push({material:m,day:m.userData.glowDay,night:m.userData.glowNight});}return m;};
    group.traverse(o=>{if(o instanceof T.Mesh){if(Array.isArray(o.material))o.material=o.material.map(restore);else o.material=restore(o.material);}});
  }
  const meadow=createGrassField(group,colliders,groundHeight,(x,z,margin)=>roadIndex!.clear(x,z,margin),paving,prebuilt?group.getObjectByName('County grass meadows') as T.Group:undefined);
  const palettes={
    golden:['#6dc8bb','#317c88','#d6c4aa','#eee9d0','#ffdba1'],
    twilight:['#609198','#3c657e','#9493aa','#d1c7c4','#d99caa'],
    night:['#38636b','#233f56','#384e64','#9aaeb4','#99b7ce']
  };
  const nearbyLighting=createNearbyLighting(group,lightSources);
  const remotePositions:T.Vector3[]=[];
  let last:Lighting|undefined;
  function update(time:number,lighting:Lighting,carPosition:T.Vector3){
    meadow.update(time,carPosition);ambientLife.update(time,lighting);
    stunt.update(lighting);
    gallery.lighting(lighting);highlands.update(time,lighting);
    beachgoers.update(time);
    oceanUniforms.clock.value=time;
    for(const [i,r] of ripples.entries()){
      const phase=(time*.36+i*.27)%1;
      r.scale.setScalar(r.userData.r*(.29+phase*.57));r.position.y=groundHeight(r.position.x,r.position.z)+.62+Math.sin(phase*Math.PI)*.025;
    }
    nearbyLighting.update(time,lighting,carPosition,insideGallery(carPosition.x,carPosition.z,10));
    if(last===lighting)return;
    last=lighting;const lightAmount=lighting==='night'?1:lighting==='twilight'?.58:0;
    dayGlow.forEach(({material,day,night})=>{material.emissiveIntensity=T.MathUtils.lerp(day,night,lightAmount);});
    const p=palettes[lighting];
    [oceanUniforms.shallows,oceanUniforms.deep,oceanUniforms.fogColor,oceanUniforms.surf,oceanUniforms.glint].forEach((u,i)=>u.value.set(p[i]));
    oceanUniforms.power.value=lighting==='night'?.23:lighting==='twilight'?.6:1.1;
  }
  group.userData.cityArea={original:CITY.originalArea,current:CITY.area,ratio:CITY.area/CITY.originalArea};
  group.userData.districts=DISTRICTS;
  group.userData.lightSources=lightSources.length;group.userData.placements=placements;
  return {group,roads,colliders,visualHeight:(x,z)=>{if(insideGallery(x,z))return GALLERY.floor+.08;const p=roadIndex!.nearest(x,z);return stuntSurface(x,z,p.distance<=p.width/2+.3?p.height+.06:groundHeight(x,z));},setQuality:(quality)=>{meadow.setQuality(quality);nearbyLighting.setQuality(quality);ambientLife.setQuality(quality);},dynamicColliders:gallery.dynamicColliders,remotePositions,stepEnvironment:(dt,p)=>gallery.step(dt,p,remotePositions),loadAssets:gallery.loadAssets,groundHeight,surfaceHeight:(x,z)=>{if(insideGallery(x,z))return GALLERY.floor+.08;const p=roadIndex!.nearest(x,z);return stuntSurface(x,z,p.distance<=p.width/2+0.3?p.height:groundHeight(x,z));},update,bounds:CITY};
}



