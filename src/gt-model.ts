import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { VEHICLE } from './vehicle.ts';

export const GT_NAME = 'Sunspoke GT';
export const GT_PAINT = 0x098a7b;
export const GT_PAINTS = { teal: GT_PAINT, red: 0xd40000 } as const;
export const GT_FRIEND_PAINT = 0xc9684d;
export const GT_ORBIT = { yaw: 0, pitch: 0.25, distance: 7.35 };

type Profile = [number, number, number, number, number, number];
// Z, shoulder width, hood/deck crown, fender crest, belt height, sill height.
const bodyProfile: Profile[] = [
  [-2.37,.77,.62,.62,.51,.25], [-2.22,.92,.72,.73,.58,.24],
  [-1.86,.98,.78,.86,.67,.25], [-1.43,1.01,.80,.96,.73,.26],
  [-1.03,.98,.82,.90,.68,.27], [-.66,.93,.86,.86,.65,.25],
  [-.22,.92,.83,.86,.62,.25], [.31,.94,.81,.87,.63,.25],
  [.78,.99,.83,.94,.68,.26], [1.43,1.04,.87,1.01,.73,.26],
  [1.84,1.025,.85,.96,.69,.25], [2.15,.975,.845,.886,.64,.28],
  [2.31,.87,.856,.879,.58,.31],
];
const axles = [-VEHICLE.wheelbase/2, VEHICLE.wheelbase/2];

function profileAt(z: number) {
  const next = bodyProfile.findIndex(row => row[0] >= z);
  const i = next < 0 ? bodyProfile.length-2 : Math.max(0,next-1);
  const a = bodyProfile[i], b = bodyProfile[i+1];
  const before = bodyProfile[Math.max(0,i-1)], after = bodyProfile[Math.min(bodyProfile.length-1,i+2)];
  const span = b[0]-a[0], t = T.MathUtils.clamp((z-a[0])/span,0,1), t2 = t*t, t3 = t2*t;
  const values = a.slice(1).map((_, k) => {
    const n = k+1;
    const entry = span*(b[n]-before[n])/(b[0]-before[0]);
    const exit = span*(after[n]-a[n])/(after[0]-a[0]);
    return (2*t3-3*t2+1)*a[n]+(t3-2*t2+t)*entry+(-2*t3+3*t2)*b[n]+(t3-t2)*exit;
  });
  values[3] = Math.max(values[3],sideBottom(z,values[4])+.045);
  return values;
}

function crown(u:number, center:number, crest:number, belt:number) {
  const t = Math.abs(u);
  if (t < .78) {
    const s = T.MathUtils.smoothstep(t,.25,.78);
    return T.MathUtils.lerp(center,crest,s) - .019*Math.sin(s*Math.PI);
  }
  const s = (t-.78)/.22;
  return T.MathUtils.lerp(crest,belt,s*s*(1.45-.45*s));
}

function sideBottom(z:number,sill:number) {
  const axle = z < 0 ? axles[0] : axles[1];
  // A tall, long wheel opening accommodates the swept tire at full steering.
  const fraction = (z-axle)/.526;
  const arch = Math.sqrt(Math.max(0,1-fraction*fraction));
  return T.MathUtils.lerp(sill,.824,arch);
}

function surface(rows:number, columns:number, position:(u:number,v:number)=>T.Vector3, reverse=false) {
  const vertices:number[] = [], indices:number[] = [];
  for(let row=0;row<=rows;row++) {
    for(let col=0;col<=columns;col++) {
      vertices.push(...position(col/columns,row/rows).toArray());
      if(row===rows||col===columns) continue;
      const a=row*(columns+1)+col, b=a+columns+1;
      indices.push(...(reverse?[a,a+1,b,a+1,b+1,b]:[a,b,a+1,a+1,b,b+1]));
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

type Point = [number, number];
function panel(outline:Point[], project:(x:number,y:number)=>T.Vector3) {
  const shape = new T.Shape(outline.map(([x,y])=>new T.Vector2(x,y)));
  const outlineGeometry = new T.ShapeGeometry(shape);
  const corners=outlineGeometry.attributes.position, triangles=outlineGeometry.index!;
  const positions:number[]=[], normals:number[]=[];
  const steps=5;
  for(let i=0;i<triangles.count;i+=3){
    const a=triangles.getX(i), b=triangles.getX(i+1), c=triangles.getX(i+2);
    const point=(u:number,v:number)=>{
      const s=u/steps, t=v/steps;
      const x=corners.getX(a)*(1-s-t)+corners.getX(b)*s+corners.getX(c)*t;
      const y=corners.getY(a)*(1-s-t)+corners.getY(b)*s+corners.getY(c)*t;
      const p=project(x,y);
      const normal=project(x+.0001,y).sub(p).cross(project(x,y+.0001).sub(p)).normalize();
      positions.push(...p.toArray());
      normals.push(...normal.toArray());
    };
    for(let u=0;u<steps;u++){
      for(let v=0;v<steps-u;v++){
        point(u,v);point(u+1,v);point(u,v+1);
        if(u+v<steps-1){point(u+1,v);point(u+1,v+1);point(u,v+1);}
      }
    }
  }
  outlineGeometry.dispose();
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  return geometry;
}

export function buildGt(body:T.Group, group:T.Group, color:number) {
  const paint = new T.MeshPhysicalMaterial({
    name:'paint', color, metalness:.31, roughness:.29, clearcoat:1, clearcoatRoughness:.17,
    envMapIntensity:1.14, side:T.DoubleSide,
  });
  const graphite = new T.MeshStandardMaterial({name:'graphite',color:0x232d31,metalness:.32,roughness:.5,side:T.DoubleSide});
  const intake = new T.MeshStandardMaterial({name:'intake',color:0x081216,roughness:.65,side:T.DoubleSide});
  const alloy = new T.MeshStandardMaterial({name:'machined_alloy',color:0xa9b2b2,metalness:.73,roughness:.29});
  const wheelDark = new T.MeshStandardMaterial({name:'wheel_graphite',color:0x37444a,metalness:.66,roughness:.28,side:T.DoubleSide});
  const rubber = new T.MeshStandardMaterial({name:'tire_rubber',color:0x181b1f,roughness:.88});
  const glass = new T.MeshPhysicalMaterial({
    name:'solar_glass',color:0x152c34,metalness:.13,roughness:.14,clearcoat:.8,clearcoatRoughness:.11,
    opacity:.84,transparent:true,depthWrite:false,envMapIntensity:1.16,side:T.DoubleSide,
  });
  const leather = new T.MeshStandardMaterial({name:'saddle_leather',color:0xa36543,roughness:.72});
  const lens = new T.MeshStandardMaterial({name:'smoked_lens',color:0x131f27,metalness:.48,roughness:.15,side:T.DoubleSide});
  const tail = new T.MeshStandardMaterial({name:'rear_lights',color:0xdb1424,emissive:0xff1225,emissiveIntensity:.38,roughness:.26,side:T.DoubleSide});
  const lamps = new T.MeshStandardMaterial({name:'front_lights',color:0xdaf4fd,emissive:0xc9f4ff,emissiveIntensity:.85,roughness:.23,side:T.DoubleSide});
  const caliper = new T.MeshStandardMaterial({name:'brake_caliper',color:0xd0542f,metalness:.28,roughness:.32});
  const rotor = new T.MeshStandardMaterial({name:'brake_rotors',color:0x8b9598,metalness:.76,roughness:.45});
  const gold = new T.MeshStandardMaterial({name:'champagne_trim',color:0xb79461,metalness:.67,roughness:.32,side:T.DoubleSide});
  const mesh = (geometry:T.BufferGeometry, material:T.Material, x=0,y=0,z=0,parent=body) => {
    const item=new T.Mesh(geometry,material);
    item.position.set(x,y,z);
    item.castShadow=!material.transparent;
    item.receiveShadow=false;
    parent.add(item);
    return item;
  };
  const box = (w:number,h:number,d:number,r:number,m:T.Material,x=0,y=0,z=0,parent=body)=>
    mesh(new RoundedBoxGeometry(w,h,d,1,r),m,x,y,z,parent);
  const strip = (points:[number,number,number][],radius:number,m:T.Material,parent=body) =>
    mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),Math.max(6,points.length*3),radius,5,false),m,0,0,0,parent);

  const nose=-2.37, tailEnd=2.31;
  const hoof = (x:number,z:number,lift=.004)=>{
    const [w,c,f,b]=profileAt(z);
    return new T.Vector3(x,crown(x/w,c,f,b)+lift,z);
  };
  const upper = surface(110,32,(u,v)=>{
    const z=T.MathUtils.lerp(nose,tailEnd,v);
    const [w,c,f,b]=profileAt(z), across=2*u-1;
    return new T.Vector3(across*w,crown(across,c,f,b),z);
  });
  // Blend the shell and quarter-panel normals across their shared edge. A split
  // here makes the metallic paint reflect two unrelated bands of sky.
  function smoothBelt(geometry:T.BufferGeometry, rows:number,columns:number,sign:number,edge:number,inside:number){
    const normals=geometry.attributes.normal, normal=new T.Vector3();
    const belt=(z:number)=>{
      const [w,,,y]=profileAt(z);
      return new T.Vector3(sign*w,y,z);
    };
    for(let row=0;row<=rows;row++){
      const z=T.MathUtils.lerp(nose,tailEnd,row/rows);
      const forward=belt(z+.001).sub(belt(z-.001));
      const join=forward.cross(new T.Vector3(.68,-sign,0)).normalize();
      const boundary=row*(columns+1)+edge;
      normals.setXYZ(boundary,join.x,join.y,join.z);
      normal.fromBufferAttribute(normals,boundary+inside).lerp(join,.34).normalize();
      normals.setXYZ(boundary+inside,normal.x,normal.y,normal.z);
    }
  }
  smoothBelt(upper,110,32,-1,0,1);
  smoothBelt(upper,110,32,1,32,-1);
  mesh(upper,paint);

  for(const sign of [-1,1]){
    const quarter=surface(132,6,(u,v)=>{
      const z=T.MathUtils.lerp(nose,tailEnd,v), [w,, ,belt,sill]=profileAt(z);
      const base=sideBottom(z,sill);
      // Sculpted shoulder drop and tuck under the door.
      const tuck=.072+.037*(1-Math.min(1,Math.abs(z)/1.3));
      return new T.Vector3(sign*(w-.036*u-(tuck-.036)*u*u),T.MathUtils.lerp(belt,base,u),z);
    },sign<0);
    smoothBelt(quarter,132,6,sign,0,1);
    mesh(quarter,paint);
    // Wheel-well liners stay behind the arch and clear of the rotating tire.
    for(const axle of axles) {
      mesh(surface(24,2,(u,v)=>{
        const a=v*Math.PI;
        return new T.Vector3(sign*T.MathUtils.lerp(.64,.923,u),.34+Math.sin(a)*.479,axle+Math.cos(a)*.524);
      },sign>0),intake);
      const lip:[number,number,number][]=[];
      for(let step=0;step<=14;step++) {
        const z=axle+Math.cos(step/14*Math.PI)*.526;
        const [w,,,,sill]=profileAt(z);
        lip.push([sign*(w-.052),sideBottom(z,sill)+.013,z]);
      }
      strip(lip,.011,graphite);
    }
    const sill = box(.12,.095,1.69,.034,graphite,sign*.876,.235,.011);
    sill.rotation.y=sign*.027;
    const sideAccent = (z:number,t:number)=> {
      const [w,,,belt,sill]=profileAt(z);
      const tuck=.072+.037*(1-Math.min(1,Math.abs(z)/1.3));
      return new T.Vector3(sign*(w-.036*t-(tuck-.036)*t*t+.007),T.MathUtils.lerp(belt,sideBottom(z,sill),t),z);
    };
    mesh(panel([[-.91,.30],[-.68,.21],[-.47,.39],[-.66,.59],[-.89,.56]],sideAccent),intake);
    mesh(panel([[-.73,.31],[-.68,.29],[-.54,.39],[-.6,.45]],(z,t)=>sideAccent(z,t).add(new T.Vector3(sign*.003,0,0))),gold);
    const shutline = [[-.47,.12],[-.43,.67],[-.29,.87],[.54,.87],[.73,.70],[.67,.42],[.66,.16]]
      .map(([z,t])=>sideAccent(z,t).toArray() as [number,number,number]);
    strip(shutline,.0036,lens);
    const handle=sideAccent(.48,.25);
    box(.023,.025,.17,.009,graphite,handle.x,handle.y,handle.z);
    box(.15,.055,.16,.018,graphite,sign*.845,.951,-.48).rotation.z=sign*-.13;
    box(.27,.082,.18,.039,paint,sign*.904,1.005,-.492).rotation.y=sign*.2;
    box(.194,.049,.009,.012,alloy,sign*.927,1.005,-.399);
    // Swept headlamp pockets and paired optical elements follow the fender surface.
    const head = [
      [.48,-2.155],[.73,-2.205],[.905,-2.075],[.932,-1.868],[.785,-1.909],[.612,-2.035],
    ] as Point[];
    const lampPanel = (points:Point[],m:T.Material,lift:number)=>
      mesh(panel(points,(x,z)=>hoof(sign*x,z,lift)),m);
    lampPanel(head,lens,.012);
    lampPanel([[.507,-2.15],[.717,-2.189],[.875,-2.082],[.9,-2.04],[.728,-2.154],[.541,-2.122]],lamps,.022);
    lampPanel([[.755,-2.098],[.858,-2.044],[.881,-1.987],[.812,-1.994]],alloy,.024);
    lampPanel([[.683,-2.129],[.73,-2.106],[.769,-2.056],[.713,-2.075]],lamps,.025);
  }

  function endSurface(z:number, direction:number, u:number, v:number) {
    const [w,c,f,b,sill]=profileAt(z);
    return new T.Vector3(u*w*(.91+.09*v),T.MathUtils.lerp(sill,crown(u,c,f,b),v),z+direction*.057*(1-u*u)*(1-v));
  }
  for(const [z,direction] of [[nose,-1],[tailEnd,1]]) {
    mesh(surface(12,32,(u,v)=>endSurface(z,direction,2*u-1,v),direction>0),paint);
  }
  const fascia = (points:Point[],z:number,direction:number,m:T.Material,offset=.015)=>
    mesh(panel(points,(u,v)=>endSurface(z,direction,u,v).add(new T.Vector3(0,0,direction*offset))),m);
  fascia([[-.97,.54],[-.82,.78],[.82,.78],[.97,.54],[.86,.18],[-.86,.18]],nose,-1,intake);
  fascia([[-.89,.25],[-.71,.32],[.71,.32],[.89,.25],[.85,.19],[-.85,.19]],nose,-1,graphite,.026);
  for(const height of [.39,.48,.57,.66]){
    fascia([[-.77,height],[.77,height],[.76,height+.015],[-.76,height+.015]],nose,-1,lens,.027);
  }
  for(const sign of [-1,1]){
    fascia([[.63*sign,.61],[.86*sign,.63],[.81*sign,.32],[.60*sign,.33]],nose,-1,graphite,.034);
    fascia([[.69*sign,.64],[.715*sign,.66],[.651*sign,.35],[.624*sign,.34]],nose,-1,gold,.039);
  }
  box(1.52,.064,.21,.029,graphite,0,.237,-2.315);
  mesh(panel([[-.053,-2.175],[.053,-2.175],[.048,-2.09],[0,-2.047],[-.048,-2.09]],(x,z)=>hoof(x,z,.01)),gold);

  // The tapered tail panel floats between the light blades and lower diffuser.
  fascia([[-.985,.67],[-.86,.84],[-.48,.78],[.48,.78],[.86,.84],[.985,.67],[.87,.45],[-.87,.45]],tailEnd,1,lens,.028);
  for(const sign of [-1,1]) {
    fascia([[.26*sign,.66],[.72*sign,.70],[.93*sign,.78],[.91*sign,.68],[.73*sign,.61],[.29*sign,.56]],tailEnd,1,tail,.045);
    fascia([[.62*sign,.52],[.80*sign,.53],[.84*sign,.56],[.67*sign,.57]],tailEnd,1,tail,.042);
    // Tail lamp wraps around the quarter panel.
    strip([[sign*.841,.722,2.306],[sign*.9,.729,2.246],[sign*.941,.747,2.164]],.016,tail);
    box(.25,.107,.16,.034,wheelDark,sign*.60,.315,2.294);
    box(.187,.064,.012,.027,intake,sign*.60,.318,2.378);
  }
  fascia([[-.94,.39],[-.69,.38],[-.48,.31],[.48,.31],[.69,.38],[.94,.39],[.85,.02],[-.85,.02]],tailEnd,1,graphite,.019);
  const diffuser=box(1.59,.075,.28,.028,graphite,0,.265,2.217);
  diffuser.rotation.x=.10;
  for(const x of [-.37,-.19,.19,.37]) box(.025,.112,.24,.008,wheelDark,x,.292,2.233).rotation.x=.10;
  mesh(surface(6,28,(u,v)=>{
    const x=(2*u-1)*.871, edge=Math.abs(x)/.871;
    const z=2.098+v*.267-.066*edge*edge;
    return new T.Vector3(x,.852+.047*v+.028*edge*edge,z);
  }),paint);
  const signatureCanvas=document.createElement('canvas');
  signatureCanvas.width=1024;
  signatureCanvas.height=256;
  const ctx=signatureCanvas.getContext('2d')!;
  ctx.font='190px CoastSignature, cursive';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillStyle='#efc986';
  ctx.fillText('NAREN',512,138,920);
  const signatureMap=new T.CanvasTexture(signatureCanvas);
  signatureMap.colorSpace=T.SRGBColorSpace;
  const signature=mesh(new T.PlaneGeometry(.51,.12),new T.MeshStandardMaterial({
    name:'NAREN_calligraphy',map:signatureMap,emissiveMap:signatureMap,emissive:0xb48a42,emissiveIntensity:.27,
    alphaTest:.06,transparent:true,depthWrite:false,metalness:.25,roughness:.4,
  }),0,.669,2.408);
  signature.name='NAREN rear calligraphy';
  signature.renderOrder=4;

  // Continuous cabin surface with distinct windshield, roof, and fastback.
  const cabin=[
    [-.79,.68,.853,.62,.885],[-.55,.644,.864,.53,1.039],[-.22,.605,.877,.478,1.233],
    [.03,.603,.881,.463,1.299],[.44,.622,.889,.472,1.301],[.70,.65,.897,.502,1.244],
    [1.06,.682,.893,.568,1.088],[1.54,.719,.901,.663,.903],
  ];
  const cabinPoint=(a:number[], b:number[], u:number,v:number)=>{
    const [z,width,base,roofWidth,height]=a.map((value,i)=>T.MathUtils.lerp(value,b[i],v));
    const f=Math.abs(u), sign=Math.sign(u);
    const shoulder=T.MathUtils.smoothstep(f,.60,1);
    const x=sign*(roofWidth*Math.min(f/.60,1)+(width-roofWidth)*shoulder);
    return new T.Vector3(x,height-(height-base)*shoulder-.017*f*f,z);
  };
  for(let i=0;i<cabin.length-1;i++){
    const start=cabin[i],end=cabin[i+1],roof=i>=2&&i<=4;
    if(!roof) mesh(surface(7,24,(u,v)=>cabinPoint(start,end,2*u-1,v)),glass).renderOrder=2;
    else {
      mesh(surface(8,20,(u,v)=>cabinPoint(start,end,(2*u-1)*.61,v)),paint);
      for(const sign of [-1,1]){
        mesh(surface(6,9,(u,v)=>cabinPoint(start,end,sign*(.61+u*.39),v),sign<0),glass).renderOrder=2;
      }
    }
  }
  for(const i of [2,5]) {
    const row=cabin[i];
    const header:[number,number,number][]=[];
    for(let j=0;j<=8;j++)header.push(cabinPoint(row,row,(j/4-1)*.62,0).toArray() as [number,number,number]);
    strip(header,.012,graphite);
  }
  for(const sign of [-1,1]){
    const lower=cabin.map(row=>cabinPoint(row,row,sign,0).toArray() as [number,number,number]);
    const upper=cabin.slice(1,-1).map(row=>cabinPoint(row,row,sign*.63,0).toArray() as [number,number,number]);
    strip(lower,.022,graphite).renderOrder=3;
    strip(upper,.018,graphite).renderOrder=3;
    for(const i of [2,5]){
      const row=cabin[i];
      const a=cabinPoint(row,row,sign*.63,0).toArray() as [number,number,number];
      const b=cabinPoint(row,row,sign,0).toArray() as [number,number,number];
      strip([a,b],i===2?.026:.020,graphite).renderOrder=3;
    }
    box(.33,.12,.48,.058,leather,sign*.31,.836,.25);
    box(.31,.325,.14,.045,leather,sign*.31,1.006,.412).rotation.x=.19;
    box(.208,.11,.11,.038,leather,sign*.31,1.181,.448).rotation.x=.19;
  }
  box(1.18,.14,.32,.067,graphite,0,.874,-.38);
  box(.16,.15,.71,.041,graphite,0,.868,.02);
  const steeringPivot=new T.Group();
  steeringPivot.name='steering_wheel';
  steeringPivot.position.set(-.315,.965,-.248);
  steeringPivot.rotation.x=-.48;
  body.add(steeringPivot);
  mesh(new T.TorusGeometry(.112,.019,7,26),wheelDark,0,0,0,steeringPivot);
  box(.158,.035,.032,.011,graphite,0,0,0,steeringPivot);
  box(.038,.058,.032,.012,alloy,0,-.014,0,steeringPivot);

  const wheels:{pivot:T.Group;spin:T.Group;front:boolean}[]=[];
  for(const side of [-1,1]){
    for(const z of axles){
      const front=z<0, pivot=new T.Group(), spin=new T.Group();
      pivot.name=front?(side<0?'wheel_fl':'wheel_fr'):(side<0?'wheel_rl':'wheel_rr');
      spin.name=pivot.name+'_spin';
      pivot.position.set(side*(front?.825:.865),VEHICLE.wheelRadius,z);
      group.add(pivot);
      pivot.add(spin);
      const tire = [[.274,-.124],[.302,-.124],[.309,-.121],[.317,-.125],[.327,-.122],[.351,-.104],
        [.364,-.067],[VEHICLE.wheelRadius,-.039],[VEHICLE.wheelRadius,.039],[.364,.067],
        [.351,.104],[.327,.122],[.317,.125],[.309,.121],[.302,.124],[.274,.124]];
      mesh(new T.LatheGeometry(tire.map(p=>new T.Vector2(...p)),40),rubber,0,0,0,spin).rotation.z=Math.PI/2;
      const barrel=mesh(new T.CylinderGeometry(.277,.277,.21,36,1,true),wheelDark,0,0,0,spin);
      barrel.rotation.z=Math.PI/2;
      const face=side*.128;
      mesh(new T.TorusGeometry(.281,.009,7,40),alloy,face,0,0,spin).rotation.y=Math.PI/2;
      mesh(new T.CylinderGeometry(.224,.224,.014,32),rotor,side*.072,0,0,spin).rotation.z=Math.PI/2;
      mesh(new T.CylinderGeometry(.081,.081,.035,22),wheelDark,face*.92,0,0,spin).rotation.z=Math.PI/2;
      mesh(new T.CylinderGeometry(.047,.047,.007,16),gold,side*.144,0,0,spin).rotation.z=Math.PI/2;
      for(let spoke=0;spoke<5;spoke++){
        const angle=spoke*Math.PI*2/5;
        for(const fork of [-1,1]){
          const start=.068,end=.270,split=angle+fork*.238;
          const a=new T.Vector3(face*.86,Math.sin(angle)*start,Math.cos(angle)*start);
          const b=new T.Vector3(face,Math.sin(split)*end,Math.cos(split)*end);
          const mid=a.clone().lerp(b,.5);
          const branch=box(.027,.035,a.distanceTo(b),.009,alloy,mid.x,mid.y,mid.z,spin);
          branch.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),b.sub(a).normalize());
        }
        const lug=angle+.2;
        mesh(new T.CylinderGeometry(.009,.009,.008,6),alloy,side*.139,Math.sin(lug)*.062,Math.cos(lug)*.062,spin).rotation.z=Math.PI/2;
      }
      box(.06,.122,.068,.02,caliper,side*.093,.061,-.195,pivot).rotation.x=-.27;
      wheels.push({pivot,spin,front});
    }
  }
  const headlights:T.SpotLight[]=[];
  for(const side of [-1,1]){
    const light=new T.SpotLight(0xe5f5ff,0,58,.4,.7,2);
    light.position.set(side*.66,.62,-2.41);
    light.target.position.set(side*.78,.03,-25);
    body.add(light,light.target);
    headlights.push(light);
  }

  function batch(parent:T.Group) {
    const batches=new Map<T.Material,T.BufferGeometry[]>();
    for(const child of [...parent.children]){
      if(!(child instanceof T.Mesh)||child===signature) continue;
      child.updateMatrix();
      const geometry=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();
      geometry.deleteAttribute('uv');
      geometry.applyMatrix4(child.matrix);
      const parts=batches.get(child.material)??[];
      parts.push(geometry);
      batches.set(child.material,parts);
      child.removeFromParent();
      child.geometry.dispose();
    }
    for(const [material,parts] of batches){
      const merged=mergeGeometries(parts);
      if(!merged)throw Error('Could not batch GT material '+material.name);
      const item=mesh(mergeVertices(merged),material,0,0,0,parent);
      merged.dispose();
      if(material===glass)item.renderOrder=2;
      parts.forEach(part=>part.dispose());
    }
  }
  batch(body);
  batch(steeringPivot);
  for(const {pivot,spin} of wheels){batch(pivot);batch(spin);}
  return {paint,glass,tail,lamps,headlights,steeringPivot,wheels};
}
