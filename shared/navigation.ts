import {gatesFor} from './protocol.ts';
import type {Track,Turn} from './protocol.ts';
type Index={distances:number[];gates:ReturnType<typeof gatesFor>};
const indexes=new WeakMap<Track,Index>();
export function turnGuidance(track:Track,position:{x:number;z:number},nextCheckpoint:number):{turn:Turn;index:number;distance:number;offRoute:boolean}|undefined{
  if(!track.turns?.length)return;
  let index=indexes.get(track);if(!index){const distances=[0];for(let i=1;i<track.points.length;i++){const a=track.points[i-1],b=track.points[i];distances.push(distances.at(-1)!+Math.hypot(b[0]-a[0],b[2]-a[2]));}index={distances,gates:gatesFor(track)};indexes.set(track,index);}
  const min=Math.max(0,(index.gates[nextCheckpoint-1]?.distance??0)-10),max=(index.gates[nextCheckpoint]?.distance??index.distances.at(-1)!)+8;
  let nearest=Infinity,progress=min;
  for(let i=1;i<track.points.length;i++){
    if(index.distances[i]<min||index.distances[i-1]>max)continue;
    const a=track.points[i-1],b=track.points[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);if(length<.001)continue;
    const t=Math.max(0,Math.min(1,((position.x-a[0])*dx+(position.z-a[2])*dz)/(length*length))),distance=Math.hypot(position.x-a[0]-t*dx,position.z-a[2]-t*dz);
    if(distance<nearest){nearest=distance;progress=Math.max(min,Math.min(max,index.distances[i-1]+t*length));}
  }
  const upcoming=track.turns.findIndex(turn=>turn.distance+15>=progress);if(upcoming<0)return;
  return {turn:track.turns[upcoming],index:upcoming,distance:Math.max(0,Math.round(track.turns[upcoming].distance-progress)),offRoute:nearest>25};
}
