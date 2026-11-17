import type {Pose} from './protocol.ts';
export class PoseBuffer {
  samples:{pose:Pose;time:number}[]=[];
  push(pose:Pose,time:number){const last=this.samples.at(-1);if(last&&(pose.epoch<last.pose.epoch||pose.epoch===last.pose.epoch&&pose.seq<=last.pose.seq))return;if(last&&pose.epoch!==last.pose.epoch)this.samples=[];this.samples.push({pose:{...pose},time});if(this.samples.length>32)this.samples.shift();}
  sample(serverTime:number):Pose|undefined {
    if(!this.samples.length)return;const target=serverTime-100;
    while(this.samples.length>2&&this.samples[1].time<=target)this.samples.shift();
    const a=this.samples[0],b=this.samples[1];
    if(b&&target>=a.time&&target<=b.time){const f=(target-a.time)/Math.max(1,b.time-a.time),out={...b.pose};for(const key of ['x','y','z','speed','steering','throttle','pitch','verticalSpeed'] as const)out[key]=a.pose[key]+(b.pose[key]-a.pose[key])*f;const angle=Math.atan2(Math.sin(b.pose.heading-a.pose.heading),Math.cos(b.pose.heading-a.pose.heading));out.heading=a.pose.heading+angle*f;return out;}
    const last=this.samples.at(-1)!,out={...last.pose},dt=Math.min(200,Math.max(0,target-last.time))/1000;
    out.x-=Math.sin(out.heading)*out.speed*dt;out.z-=Math.cos(out.heading)*out.speed*dt;if(out.airborne)out.y+=out.verticalSpeed*dt;return target<a.time?{...a.pose}:out;
  }
  clear(){this.samples=[];}
}
