import type {Track,Turn} from './protocol.ts';

// Each straight follows an existing Crown Street or Downtown Avenue. The
// repeated central street is intentional: checkpoint order separates passes.
export const SWITCHBACK_ANCHORS:number[][]=[
  [560,210],[560,80],[720,80],[720,-100],[560,-100],[560,-260],
  [880,-260],[880,-100],[720,-100],[720,80],[880,80],[880,260],
  [560,260],[560,210],
];

export function buildSwitchbacks(height:(x:number,z:number)=>number):Track{
  const points:number[][]=[],turns:Turn[]=[];let distance=0;
  const push=(x:number,z:number)=>{const last=points.at(-1);if(last){const d=Math.hypot(x-last[0],z-last[2]);if(d<.001)return;distance+=d;}points.push([x,height(x,z),z].map(n=>Math.round(n*1000)/1000));};
  const straight=(x:number,z:number)=>{const a=points.at(-1)!;const n=Math.ceil(Math.hypot(x-a[0],z-a[2])/3);for(let j=1;j<=n;j++)push(a[0]+(x-a[0])*j/n,a[2]+(z-a[2])*j/n);};
  push(...SWITCHBACK_ANCHORS[0] as [number,number]);
  for(let i=1;i<SWITCHBACK_ANCHORS.length-1;i++){
    const a=SWITCHBACK_ANCHORS[i-1],b=SWITCHBACK_ANCHORS[i],c=SWITCHBACK_ANCHORS[i+1];
    const al=Math.hypot(b[0]-a[0],b[1]-a[1]),bl=Math.hypot(c[0]-b[0],c[1]-b[1]);
    const incoming=[(b[0]-a[0])/al,(b[1]-a[1])/al],outgoing=[(c[0]-b[0])/bl,(c[1]-b[1])/bl],radius=12;
    const enter=[b[0]-incoming[0]*radius,b[1]-incoming[1]*radius],exit=[b[0]+outgoing[0]*radius,b[1]+outgoing[1]*radius];
    const center=[enter[0]+outgoing[0]*radius,enter[1]+outgoing[1]*radius],start=Math.atan2(enter[1]-center[1],enter[0]-center[0]);
    const cross=incoming[0]*outgoing[1]-incoming[1]*outgoing[0],sweep=Math.sign(cross)*Math.PI/2;
    straight(enter[0],enter[1]);let apexDistance=0;
    for(let j=1;j<=12;j++){const angle=start+sweep*j/12;push(center[0]+radius*Math.cos(angle),center[1]+radius*Math.sin(angle));if(j===6)apexDistance=distance;}
    const apex=points[points.length-7];
    const outside=cross>0?1:-1,signX=b[0]-incoming[0]*15+incoming[1]*12*outside,signZ=b[1]-incoming[1]*15-incoming[0]*12*outside;
    turns.push({direction:cross>0?'right':'left',distance:apexDistance,x:apex[0],y:apex[1],z:apex[2],heading:Math.atan2(-incoming[0],-incoming[1]),signX,signY:height(signX,signZ),signZ});
  }
  const finish=SWITCHBACK_ANCHORS.at(-1)!;straight(finish[0],finish[1]);
  return {id:'downtown-switchbacks',name:'Downtown Switchbacks',closed:true,width:18,points,turns,checkpointSpacing:60};
}
