import type { Road } from './types';
import { MathUtils } from 'three';

export function createRoadIndex(roads:Road[],natural:(x:number,z:number)=>number){
  type Segment={road:number;ax:number;az:number;ay:number;dx:number;dz:number;dy:number;length2:number;width:number};
  const cells=new Map<string,Segment[]>(),size=64;
  for(const [roadId,road] of roads.entries())for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],margin=road.width/2+30;
    const s={road:roadId,ax:a.x,az:a.z,ay:a.y,dx:b.x-a.x,dz:b.z-a.z,dy:b.y-a.y,length2:(b.x-a.x)**2+(b.z-a.z)**2,width:road.width};
    for(let x=Math.floor((Math.min(a.x,b.x)-margin)/size);x<=Math.floor((Math.max(a.x,b.x)+margin)/size);x++)
      for(let z=Math.floor((Math.min(a.z,b.z)-margin)/size);z<=Math.floor((Math.max(a.z,b.z)+margin)/size);z++){
        const key=x+','+z;const list=cells.get(key)??[];list.push(s);cells.set(key,list);
      }
  }
  function nearest(x:number,z:number){
    let distance=Infinity,height=natural(x,z),width=0;
    const candidates=new Map<number,{distance:number;height:number;width:number}>();
    for(const s of cells.get(Math.floor(x/size)+','+Math.floor(z/size))??[]){
      const t=MathUtils.clamp(((x-s.ax)*s.dx+(z-s.az)*s.dz)/(s.length2||1),0,1);
      const d=Math.hypot(x-s.ax-t*s.dx,z-s.az-t*s.dz);
      if(d<(candidates.get(s.road)?.distance??Infinity))candidates.set(s.road,{distance:d,height:s.ay+t*s.dy,width:s.width});
      if(d<distance){distance=d;height=s.ay+t*s.dy;width=s.width;}
    }
    let weight=0,total=0;
    for(const p of candidates.values()){
      const w=Math.exp(-2*(p.distance/Math.max(p.width/2,6))**2)*(1-MathUtils.smoothstep(p.distance,p.width/2+6,p.width/2+18));
      weight+=w;total+=w*p.height;
    }
    if(weight>1e-8)height=total/weight;
    return {distance,height,width};
  }
  function grade(x:number,z:number){
    const p=nearest(x,z),base=natural(x,z),edge=p.distance-p.width/2;
    if(edge>=28)return base;
    const blend=1-MathUtils.smoothstep(edge,8,28);
    return MathUtils.lerp(base,p.height,blend);
  }
  return {nearest,grade};
}
