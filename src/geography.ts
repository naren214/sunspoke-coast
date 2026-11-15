import { MathUtils } from 'three';

export const MAINLAND = [[-116,-350],[-105,-490],[-112,-620],[-105,-760],[-116,-900],[-100,-1020],[-40,-1120],[55,-1180],[240,-1195],[440,-1180],[620,-1200],[820,-1160],[990,-1130],[1120,-1080],[1230,-980],[1300,-900],[1350,-800],[1350,-650],[1328,-480],[1345,-340],[1330,-180],[1300,-40],[1280,100],[1290,230],[1328,360],[1350,470],[1320,600],[1305,730],[1320,840],[1300,940],[1120,955],[930,940],[760,960],[675,845],[620,750],[560,755],[485,747],[410,735],[350,750],[270,742],[200,750],[120,715],[35,655],[-55,615],[-98,550],[-114,465],[-116,350]];
export const ISLAND = [[20,875],[120,845],[310,860],[410,925],[365,995],[100,1000],[10,950]];
const lakeOutline=Array.from({length:48},(_,i)=>{const a=i*Math.PI/24,r=1+0.08*Math.sin(a*3)+0.035*Math.cos(a*5);return [965+Math.cos(a)*150*r,-640+Math.sin(a)*110*r];});
export const WATERS: {name:string;x:number;z:number;rx:number;rz:number;shape:string;polygon?:number[][]}[] = [
  {name:'Silver Lake',x:965,z:-640,rx:150,rz:110,shape:'ellipse',polygon:lakeOutline},
  {name:'Canal',x:1080,z:155,rx:18,rz:295,shape:'box'},
  {name:'Port Basin',x:1165,z:700,rx:80,rz:190,shape:'box'},
];
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
  if(!inPolygon(x,z,MAINLAND)&&!inPolygon(x,z,ISLAND))return false;
  return !WATERS.some(w=>w.polygon?inPolygon(x,z,w.polygon):w.shape==='ellipse'?((x-w.x)/w.rx)**2+((z-w.z)/w.rz)**2<1:Math.abs(x-w.x)<w.rx&&Math.abs(z-w.z)<w.rz);
}
export function landHeight(x:number,z:number){
  const smooth=(v:number)=>MathUtils.smoothstep(v,0,1);
  const coast=MathUtils.lerp(-0.55,6*smooth((-z-200)/78),smooth((x+122)/36));
  const north=smooth((-z-360)/350);
  const hill=76*Math.exp(-(((x-520)/280)**2)-((z+865)/260)**2)+93*Math.exp(-(((x-1160)/245)**2)-((z+1040)/180)**2);
  return coast+north*hill+3*smooth((x-390)/180)*(1-north);
}
export const naturalHeight=(x:number,z:number)=>isLand(x,z)?landHeight(x,z):-3.5;
