export const PROTOCOL = 1;
export type Pose = {x:number;y:number;z:number;heading:number;speed:number;steering:number;throttle:number;braking:boolean;airborne:boolean;pitch:number;verticalSpeed:number;seq:number;epoch:number};
export type Turn = {direction:'left'|'right';distance:number;x:number;y:number;z:number;heading:number;signX:number;signY:number;signZ:number};
export type Track = {id:string;name:string;closed:boolean;points:number[][];width:number;turns?:Turn[];checkpointSpacing?:number};
export type Gate = {x:number;y:number;z:number;dx:number;dz:number;width:number;distance?:number};
export type Racer = {next:number;penalty:number;finished:number|null;dnf:boolean;spawned:boolean};
export type Race = {track:string;phase:'ready'|'staging'|'countdown'|'racing'|'results';ready:string[];startAt:number;deadline:number;racers:Record<string,Racer>};
export type Member = {id:string;role:'host'|'guest';pose:Pose;connected:boolean};
export type RoomView = {code:string;instance:string;lighting:'golden'|'twilight'|'night';players:Member[];race:Race|null;serverTime:number;closed:boolean};
export type Credentials = {code:string;instance:string;id:string;token:string;mapVersion:string;protocol:number};
export const emptyPose = ():Pose=>({x:-65,y:0,z:210,heading:0,speed:0,steering:0,throttle:0,braking:false,airborne:false,pitch:0,verticalSpeed:0,seq:0,epoch:0});
export function validCode(code:unknown):code is string{return typeof code==='string'&&/^\d{3}$/.test(code);}
export function validPose(p:any):p is Pose {
  return p&&['x','y','z','heading','speed','steering','throttle','pitch','verticalSpeed','seq','epoch'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k]))&&p.x>=-150&&p.x<=1450&&p.z>=-1320&&p.z<=1120&&p.y>=-30&&p.y<=250&&Math.abs(p.speed)<=70&&Math.abs(p.verticalSpeed)<=100&&Math.abs(p.heading)<=Math.PI*2&&Math.abs(p.steering)<=2&&p.throttle>=0&&p.throttle<=1&&Math.abs(p.pitch)<=Math.PI&&Number.isSafeInteger(p.seq)&&p.seq>=0&&Number.isSafeInteger(p.epoch)&&p.epoch>=0&&typeof p.braking==='boolean'&&typeof p.airborne==='boolean';
}
const gateCache=new WeakMap<Track,Gate[]>();
export function gatesFor(track:Track):Gate[]{let gates=gateCache.get(track);if(!gates){gates=buildGates(track);gateCache.set(track,gates);}return gates;}
function buildGates(track:Track):Gate[]{
  if(track.turns?.length){
    const lengths=[0];for(let i=1;i<track.points.length;i++){const a=track.points[i-1],b=track.points[i];lengths.push(lengths.at(-1)!+Math.hypot(b[0]-a[0],b[2]-a[2]));}
    const total=lengths.at(-1)!,spacing=track.checkpointSpacing??80,targets:number[]=[];
    for(let s=spacing;s<total-12;s+=spacing)targets.push(s);
    for(const turn of track.turns)if(turn.distance+22<total-12)targets.push(turn.distance+22);
    targets.sort((a,b)=>a-b);
    // Keep gates far enough apart for high-speed network snapshots.
    const spaced:number[]=[];for(const s of targets)if(!spaced.length||s-spaced.at(-1)!>=12)spaced.push(s);while(spaced.length&&total-spaced.at(-1)!<12)spaced.pop();spaced.push(total);
    return spaced.map(distance=>{let i=1;while(i<lengths.length-1&&lengths[i]<distance)i++;const a=track.points[i-1],b=track.points[i],length=lengths[i]-lengths[i-1],t=(distance-lengths[i-1])/length;return {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,z:a[2]+(b[2]-a[2])*t,dx:(b[0]-a[0])/length,dz:(b[2]-a[2])/length,width:track.width,distance};});
  }
  const points=track.points,result:Gate[]=[];let distance=0,target=80;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[2]-a[2]);if(length<.001)continue;
    while(target<=distance+length){const f=(target-distance)/length;result.push({x:a[0]+(b[0]-a[0])*f,y:a[1]+(b[1]-a[1])*f,z:a[2]+(b[2]-a[2])*f,dx:(b[0]-a[0])/length,dz:(b[2]-a[2])/length,width:track.width});target+=80;}distance+=length;
  }
  const a=points[points.length-2],b=points[points.length-1],length=Math.hypot(b[0]-a[0],b[2]-a[2]);
  if(result.length&&Math.hypot(result.at(-1)!.x-b[0],result.at(-1)!.z-b[2])<10)result.pop();
  result.push({x:b[0],y:b[1],z:b[2],dx:(b[0]-a[0])/length,dz:(b[2]-a[2])/length,width:track.width});return result;
}
export function spawnFor(track:Track,slot:number,gate?:Gate):Pose {
  const a=track.points[0],b=track.points[1],len=Math.hypot(b[0]-a[0],b[2]-a[2]),dx=gate?.dx??(b[0]-a[0])/len,dz=gate?.dz??(b[2]-a[2])/len;
  return {...emptyPose(),x:(gate?.x??a[0])-dx*7-dz*(slot?2.5:-2.5),y:gate?.y??a[1],z:(gate?.z??a[2])-dz*7+dx*(slot?2.5:-2.5),heading:Math.atan2(-dx,-dz)};
}
export function crosses(a:Pose,b:Pose,g:Gate){
  const before=(a.x-g.x)*g.dx+(a.z-g.z)*g.dz,after=(b.x-g.x)*g.dx+(b.z-g.z)*g.dz;
  if(before>=0||after<0||after<=before)return false;
  const f=-before/(after-before),x=a.x+(b.x-a.x)*f,z=a.z+(b.z-a.z)*f,y=a.y+(b.y-a.y)*f;
  return Math.abs((x-g.x)*-g.dz+(z-g.z)*g.dx)<=g.width/2+1&&Math.abs(y-g.y)<5;
}
