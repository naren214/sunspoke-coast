import * as T from 'three';
import type { Collider, Lighting } from './types';

export const STUNT = {
  minX: -114, maxX: -75, minZ: -98, maxZ: 98,
  laneX: -101, halfWidth: 6, base: 0.1,
  takeoffStart: 34, lip: 14, rise: 5,
  landingStart: -12, landingEnd: -44, landingRise: 2.4,
};
export const insideStunt = (x: number, z: number, margin = 0) =>
  x > STUNT.minX - margin && x < STUNT.maxX + margin && z > STUNT.minZ - margin && z < STUNT.maxZ + margin;

export function stuntGround(x: number, z: number, original: number) {
  if (!insideStunt(x, z)) return original;
  return x > -109 && x < -93 && z > -12 && z < 14 ? -2.5 : STUNT.base;
}
export function stuntSurface(x: number, z: number, ground: number) {
  if (Math.abs(x - STUNT.laneX) > STUNT.halfWidth) return ground;
  if (z >= STUNT.lip && z <= STUNT.takeoffStart)
    return STUNT.base + (STUNT.takeoffStart - z) / (STUNT.takeoffStart - STUNT.lip) * STUNT.rise;
  if (z <= STUNT.landingStart && z >= STUNT.landingEnd)
    return STUNT.base + (z - STUNT.landingEnd) / (STUNT.landingStart - STUNT.landingEnd) * STUNT.landingRise;
  return ground;
}

export function createStuntArena() {
  const group = new T.Group(); group.name = 'RAMP TIME stunt compound';
  const colliders: Collider[] = [];
  const standard = (color: string, metalness = 0) => new T.MeshStandardMaterial({ color, roughness: 0.7, metalness });
  const concrete = standard('#e0cfad'), asphalt = standard('#34454a'), gold = standard('#deb660', 0.55);
  asphalt.side=T.DoubleSide;
  const teal = standard('#226e70'), white = standard('#fff0ca'), black = standard('#202f36');
  const glow = new T.MeshStandardMaterial({ color: '#ffd9a1', emissive: '#ffc86d', emissiveIntensity: 0.35 });
  const water = new T.MeshStandardMaterial({ color: '#368d98', roughness: 0.25, metalness: 0.2 });
  const unit = new T.BoxGeometry(1, 1, 1);
  function box(m: T.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
    const mesh = new T.Mesh(unit, m); mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
  }
  function wall(x: number, z: number, w: number, d: number, h = 2.6) {
    box(concrete, x, STUNT.base + h / 2, z, w, h, d);
    box(teal, x, STUNT.base + h * 0.68, z, w + 0.03, 0.19, d + 0.03);
    box(gold, x, STUNT.base + h, z, w + 0.12, 0.14, d + 0.12);
    colliders.push({ x, z, halfX: w / 2, halfZ: d / 2, height: h + 0.15 });
  }
  function floor(x0: number, x1: number, z0: number, z1: number, y = STUNT.base) {
    const g = new T.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2);
    const mesh = new T.Mesh(g, asphalt); mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    mesh.receiveShadow = true; group.add(mesh);
  }
  floor(-114, -109, -98, 98); floor(-93, -75, -98, 98);
  floor(-109, -93, -98, -12); floor(-109, -93, 14, 98);
  floor(-109, -93, -12, 14, -2.5);
  box(water, -101, -2.4, 1, 16, 0.08, 26);
  // A broad city-side apron connects the arch to the boulevard junction.
  floor(-75, -65, -7, 7, 0.055);
  wall(-114, 0, 0.7, 196); wall(-94.5, -98, 39, 0.7); wall(-94.5, 98, 39, 0.7);
  wall(-75, -60, 0.7, 76, 3.1); wall(-75, 60, 0.7, 76, 3.1);

  function ramp(z0: number, z1: number, h0: number, h1: number, name: string) {
    const x0 = STUNT.laneX - STUNT.halfWidth, x1 = STUNT.laneX + STUNT.halfWidth;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([
      x0,h0,z0, x1,h0,z0, x0,h1,z1, x1,h0,z0, x1,h1,z1, x0,h1,z1,
      x0,0.1,z0, x0,h0,z0, x0,h1,z1, x0,0.1,z0, x0,h1,z1, x0,0.1,z1,
      x1,0.1,z0, x1,h1,z1, x1,h0,z0, x1,0.1,z0, x1,0.1,z1, x1,h1,z1,
      x0,0.1,z1, x0,h1,z1, x1,h1,z1, x0,0.1,z1, x1,h1,z1, x1,0.1,z1,
    ],3)); g.computeVertexNormals();
    const mesh = new T.Mesh(g, asphalt); mesh.name = name; mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    const length = Math.abs(z1-z0), slope = (h1-h0)/(z1-z0);
    for (const side of [-1,1]) {
      const stripe=box(gold, STUNT.laneX+side*5.5, (h0+h1)/2+0.025, (z0+z1)/2, 0.18,0.035,Math.hypot(length,h1-h0));
      stripe.rotation.x = -Math.atan(slope);
    }
    for(let z=Math.min(z0,z1)+2;z<Math.max(z0,z1);z+=3) {
      const height=h0+(z-z0)*slope;
      for(const side of [-1,1]) {
        const rail=box(teal,STUNT.laneX+side*6.3,height+0.28,z,0.35,0.55,3.05);
        rail.rotation.x=-Math.atan(slope);
        // Side faces retain a grounded car without obstructing the launch lane.
        colliders.push({x:STUNT.laneX+side*6.3,z,halfX:0.175,halfZ:1.5,height:height+0.7});
      }
    }
  }
  ramp(34,14,0.1,5.1,'Takeoff ramp');
  ramp(-44,-12,0.1,2.5,'Landing ramp');
  // Front wall catches an undershoot; a car above it clears the landing lip.
  colliders.push({x:-101,z:-11.9,halfX:6,halfZ:0.1,height:5});
  box(teal,-101,0.05,-12.05,12,4.9,0.18);
  for(const z of [-11.5,13.5])for(let x=-108;x<-94;x+=1.4)
    box(Math.round((x+108)/1.4)%2?black:gold,x,0.13,z,0.7,0.06,0.6);
  // Arrows lead from the entrance down the return lane to the run-up.
  for(let z=-78;z<85;z+=11) {
    box(white,-82,0.13,z,0.12,0.025,3.5);
    if(z>40)box(gold,-101,0.13,z,0.13,0.025,3.8);
  }
  function chevron(x:number,z:number,y:number) {
    for(const side of [-1,1]){
      const strip=box(white,x+side*0.9,y,z,0.15,0.035,2.6);strip.rotation.y=side*Math.PI/4;
      strip.rotation.x=-Math.atan((stuntSurface(x,z+0.1,0.1)-stuntSurface(x,z-0.1,0.1))/0.2);
    }
  }
  for(const z of [45,55,65,75])chevron(-101,z,0.14);
  for(const z of [18,23,28])chevron(-101,z,stuntSurface(-101,z,0.1)+0.06);

  function sign(text:string,sub:string,x:number,y:number,z:number,w:number,h:number,yaw:number) {
    const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=512;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#153d44';ctx.fillRect(0,0,2048,512);
    ctx.strokeStyle='#e4bc70';ctx.lineWidth=12;ctx.strokeRect(22,22,2004,468);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffe3a5';ctx.font='900 245px Barlow, Arial';
    ctx.fillText(text,1024,sub?217:270,1910);
    if(sub){ctx.font='600 55px Barlow, Arial';ctx.fillText(sub,1024,410,1880);}
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const m=new T.MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:'#ffffff',emissiveIntensity:0.35,roughness:0.7});
    litSigns.push(m);
    const mesh=new T.Mesh(new T.PlaneGeometry(w,h),m);mesh.position.set(x,y,z);mesh.rotation.y=yaw;group.add(mesh);return mesh;
  }
  const litSigns:T.MeshStandardMaterial[]=[];
  // Two massive towers and a curved crown form the beach-city welcome arch.
  for(const side of [-1,1]) {
    const z=side*21;
    box(concrete,-75,8,z,4.6,16,4.8);box(teal,-75,8,z,4.75,12,3.7);
    box(gold,-75,1,z,5.3,1.8,5.4);box(gold,-75,16,z,5.4,0.7,5.4);
    box(glow,-72.54,9,z,0.08,11,0.28);
    colliders.push({x:-75,z,halfX:2.4,halfZ:2.6,height:16.4});
  }
  const shape=new T.Shape();
  shape.moveTo(-23,14.5);shape.lineTo(-23,19);
  shape.quadraticCurveTo(0,31,23,19);shape.lineTo(23,14.5);
  shape.quadraticCurveTo(0,22,-23,14.5);
  const crown=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:3,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:0.16,bevelThickness:0.16}),gold);
  crown.rotation.y=Math.PI/2;crown.position.x=-76.5;crown.castShadow=true;group.add(crown);
  box(teal,-75,15.5,0,3.8,5.8,32);
  sign('RAMP TIME','WELCOME TO THE COAST JUMP',-72.96,15.5,0,31,5.4,Math.PI/2).name='RAMP TIME welcome arch';
  sign('RAMP TIME','NORTHBOUND JUMP · BUILD SPEED',-77.04,15.5,0,31,5.4,-Math.PI/2);
  sign('70+ KM/H','STRAIGHT AHEAD · R TO RESET',-101,3.7,82,10,2.5,0);
  sign('LANDING','BRAKE THEN FOLLOW THE RETURN LANE',-101,4.6,-91,15,3,0);
  sign('RAMP TIME','TURN TOWARD THE BEACH',-52,4.5,9,10,2.7,0);
  sign('RAMP TIME','TURN TOWARD THE BEACH',-52,4.5,8.95,10,2.7,Math.PI);
  sign('RUN-UP →','FOLLOW THE RETURN LANE',-75.5,2.2,45,17,2.1,-Math.PI/2);
  box(black,-52,1.6,9,0.22,3.2,0.22);
  colliders.push({x:-52,z:9,halfX:0.15,halfZ:0.15,height:3.2});
  // Poles sit outside every road's travel envelope.
  for(const z of [-91,82])for(const x of [-111,-90]){
    box(black,x,3.5,z,0.18,7,0.18);box(glow,x,7,z,0.8,0.15,0.8);
    colliders.push({x,z,halfX:0.12,halfZ:0.12,height:7});
  }
  group.userData={name:'RAMP TIME',gapMetres:26,takeoffHeight:5,entrance:[-75,0],runup:[-101,82],heading:0};
  const lights=[
    {position:new T.Vector3(-90,6.8,82),color:new T.Color('#ffdfaa'),intensity:150},
    {position:new T.Vector3(-90,6.8,-91),color:new T.Color('#ffdfaa'),intensity:150},
    {position:new T.Vector3(-112,1.8,0),color:new T.Color('#78d8e2'),intensity:100},
  ];
  let previous:Lighting|undefined;
  function update(lighting:Lighting){if(previous===lighting)return;previous=lighting;
    glow.emissiveIntensity=lighting==='night'?2.5:lighting==='twilight'?1.3:0.35;
    litSigns.forEach(m=>m.emissiveIntensity=lighting==='night'?0.85:0.35);
  }
  return {group,colliders,lights,update};
}
