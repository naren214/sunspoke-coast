import { MathUtils } from 'three';

export const BEACH = { originalShoreX:-116, extension:68, inletDepth:8, inletOffset:27, inletScale:41, minZ:-350, northFullWidth:-160, southFullWidth:154, maxZ:350 };
export const BEACH_BOARDWALKS = [-148,149,225];
export const nearBeachBoardwalk=(z:number,margin:number)=>BEACH_BOARDWALKS.some(center=>Math.abs(z-center)<margin);
export function beachShoreX(z:number){
  const north=MathUtils.smoothstep(z,BEACH.minZ,BEACH.northFullWidth);
  const south=1-MathUtils.smoothstep(z,BEACH.southFullWidth,BEACH.maxZ);
  const inlet=BEACH.inletDepth*(.5+.5*Math.cos((z+BEACH.inletOffset)/BEACH.inletScale));
  return BEACH.originalShoreX-(BEACH.extension-inlet)*north*south;
}
export const beachShoreShader=`
  float beachShoreX(float z){
    float north=smoothstep(${BEACH.minZ.toFixed(1)},${BEACH.northFullWidth.toFixed(1)},z);
    float south=1.-smoothstep(${BEACH.southFullWidth.toFixed(1)},${BEACH.maxZ.toFixed(1)},z);
    float inlet=${BEACH.inletDepth.toFixed(1)}*(.5+.5*cos((z+${BEACH.inletOffset.toFixed(1)})/${BEACH.inletScale.toFixed(1)}));
    return ${BEACH.originalShoreX.toFixed(1)}-(${BEACH.extension.toFixed(1)}-inlet)*north*south;
  }
`;
const beachCoast=Array.from({length:69},(_,i)=>{
  const z=BEACH.maxZ-(i+1)*10;
  return [beachShoreX(z),z];
});
export const MAINLAND = [[-116,-350],[-105,-490],[-112,-620],[-105,-760],[-116,-900],[-100,-1020],[-40,-1120],[55,-1180],[240,-1195],[440,-1180],[620,-1200],[820,-1160],[990,-1130],[1120,-1080],[1230,-980],[1300,-900],[1350,-800],[1350,-650],[1328,-480],[1345,-340],[1330,-180],[1300,-40],[1280,100],[1290,230],[1328,360],[1350,470],[1320,600],[1305,730],[1320,840],[1300,940],[1120,955],[930,940],[760,960],[675,845],[620,750],[560,755],[485,747],[410,735],[350,750],[270,742],[200,750],[120,715],[35,655],[-55,615],[-98,550],[-114,465],[-116,350],...beachCoast];
export const ISLAND = [[20,875],[120,845],[310,860],[410,925],[365,995],[100,1000],[10,950]];
export const VERDE_ISLAND = [[306,-1360],[325,-1450],[370,-1538],[490,-1570],[620,-1538],[663,-1430],[640,-1350],[554,-1315],[430,-1312],[355,-1326]];
export const LAND_OUTLINES = [MAINLAND, ISLAND, VERDE_ISLAND];
const lakeOutline=Array.from({length:48},(_,i)=>{const a=i*Math.PI/24,r=1+0.08*Math.sin(a*3)+0.035*Math.cos(a*5);return [965+Math.cos(a)*150*r,-640+Math.sin(a)*110*r];});
export const WATERS: {name:string;x:number;z:number;rx:number;rz:number;shape:string;polygon?:number[][]}[] = [
  {name:'Silver Lake',x:965,z:-640,rx:150,rz:110,shape:'ellipse',polygon:lakeOutline},
  {name:'Canal',x:1080,z:155,rx:18,rz:295,shape:'box'},
  {name:'Port Basin',x:1165,z:700,rx:80,rz:190,shape:'box'},
];
// A mountain-fed river empties through Silver Lake into the eastern sea.
export const RIVER = {name:'Verde River',width:56,points:[
  [730,-1120,27],[730,-1010,24],[715,-890,20],[715,-790,16],
  [750,-700,11],[825,-640,8],[965,-640,8],[1110,-640,8],
  [1205,-600,5],[1280,-570,2],[1360,-550,-.535]
]};
export function riverAt(x:number,z:number){
  let distance=Infinity,height=0;
  for(let i=1;i<RIVER.points.length;i++){
    const a=RIVER.points[i-1],b=RIVER.points[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);
    const d=Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
    if(d<distance){distance=d;height=MathUtils.lerp(a[2],b[2],t);}
  }
  return {distance,height};
}
export const GALLERY = {x:930,z:-980,width:210,depth:140,floor:24,clearance:24};
export const insideGallery=(x:number,z:number,margin=0)=>Math.abs(x-GALLERY.x)<GALLERY.width/2+margin&&Math.abs(z-GALLERY.z)<GALLERY.depth/2+margin;
export const lakeContains=(x:number,z:number)=>inPolygon(x,z,lakeOutline);
export const waterLevel=(x:number,z:number)=>lakeContains(x,z)?8:riverAt(x,z).distance<RIVER.width/2?riverAt(x,z).height:-.535;
export const DISTRICTS=[
  {name:'SUNSPOKE BEACH',x:15,z:80,color:'#debe8b'},
  {name:'PALM QUARTER',x:255,z:-60,color:'#8fac9d'},
  {name:'CROWN DOWNTOWN',x:630,z:80,color:'#a5afbc'},
  {name:'CANAL GARDENS',x:1170,z:65,color:'#7caeac'},
  {name:'SOUTHPORT',x:945,z:650,color:'#b5a88e'},
  {name:'COAST AIRFIELD',x:240,z:550,color:'#abb3ad'},
  {name:'ISLA LUZ',x:225,z:930,color:'#d3cfa5'},
  {name:'SIERRA VERDE',x:490,z:-850,color:'#85a47c'},
  {name:'SILVER LAKE',x:965,z:-640,color:'#77abb9'},
  {name:'ISLA VERDE',x:480,z:-1430,color:'#b0c49d'},
];
export function inPolygon(x:number,z:number,p:number[][]){
  let inside=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++){
    const a=p[i],b=p[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function isLand(x:number,z:number){
  if(!LAND_OUTLINES.some(outline=>inPolygon(x,z,outline)))return false;
  if(riverAt(x,z).distance<RIVER.width/2)return false;
  return !WATERS.some(w=>w.polygon?inPolygon(x,z,w.polygon):w.shape==='ellipse'?((x-w.x)/w.rx)**2+((z-w.z)/w.rz)**2<1:Math.abs(x-w.x)<w.rx&&Math.abs(z-w.z)<w.rz);
}
export function landHeight(x:number,z:number){
  if(z < -1300 && inPolygon(x,z,VERDE_ISLAND)){
    let shoreDistance=Infinity;
    for(let i=0;i<VERDE_ISLAND.length;i++){
      const [ax,az]=VERDE_ISLAND[i], [bx,bz]=VERDE_ISLAND[(i+1)%VERDE_ISLAND.length];
      const dx=bx-ax,dz=bz-az;
      const t=MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);
      shoreDistance=Math.min(shoreDistance,Math.hypot(x-ax-t*dx,z-az-t*dz));
    }
    return MathUtils.lerp(1.1,14,MathUtils.smoothstep(shoreDistance,0,23));
  }
  const smooth=(v:number)=>MathUtils.smoothstep(v,0,1);
  let coast=MathUtils.lerp(-0.55,6*smooth((-z-172)/76),smooth((x+122)/36));
  if(x<-100&&z>BEACH.minZ&&z<BEACH.maxZ){
    const shore=beachShoreX(z);
    const sandGrade=MathUtils.lerp(-.50,.38,MathUtils.smoothstep(x-shore,0,28));
    const extent=MathUtils.smoothstep(BEACH.originalShoreX-shore,0,22);
    coast=MathUtils.lerp(coast,sandGrade,extent*MathUtils.smoothstep(-100-x,0,24));
  }
  const north=smooth((-z-360)/350);
  const hill=76*Math.exp(-(((x-520)/280)**2)-((z+865)/260)**2)+93*Math.exp(-(((x-1160)/245)**2)-((z+1040)/180)**2);
  let y=coast+north*hill+3*smooth((x-390)/180)*(1-north);
  // Terraced town and lakefront building pads blend back into the hills.
  const pad=(cx:number,cz:number,hx:number,hz:number,level:number,feather:number)=>{
    const d=Math.max(Math.abs(x-cx)-hx,Math.abs(z-cz)-hz);
    y=MathUtils.lerp(y,level,1-MathUtils.smoothstep(d,0,feather));
  };
  pad(390,-815,200,170,28,80);
  const lakeDistance=Math.hypot((x-965)/340,(z+640)/260);
  y=MathUtils.lerp(y,10,1-MathUtils.smoothstep(lakeDistance,.88,1.18));
  pad(GALLERY.x,GALLERY.z,116,84,GALLERY.floor,40);
  const river=riverAt(x,z),bank=1-MathUtils.smoothstep(river.distance,RIVER.width/2+18,RIVER.width/2+65);
  y=MathUtils.lerp(y,Math.max(y,river.height+6),bank);
  return y;
}
export const naturalHeight=(x:number,z:number)=>isLand(x,z)?landHeight(x,z):-3.5;
