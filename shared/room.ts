import {PROTOCOL,emptyPose,validPose,gatesFor,spawnFor,crosses} from './protocol.ts';
import type {Pose,Track,RoomView,Credentials,Member,Race} from './protocol.ts';
type Player=Member&{token:string;seen:number;poseTime:number;disconnectedAt:number|null;window:number;messages:number};
export type RoomData={code:string;instance:string;mapVersion:string;lighting:RoomView['lighting'];players:Player[];race:Race|null;closed:boolean};
export class RoomError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status;}}
export class RoomEngine {
  data:RoomData;tracks:Track[];
  constructor(data:RoomData,tracks:Track[]){this.data=data;this.tracks=tracks;}
  static create(code:string,mapVersion:string,tracks:Track[],now=Date.now(),pose?:Pose){
    const room=new RoomEngine({code,instance:crypto.randomUUID(),mapVersion,lighting:'golden',players:[],race:null,closed:false},tracks);
    room.add('host',now,pose);return room;
  }
  add(role:'host'|'guest',now:number,pose?:Pose){
    if(this.data.closed)throw new RoomError('Room expired. Create a new code.',404);
    if(this.data.players.length>=2)throw new RoomError('Room is full.',409);
    const p:Player={id:crypto.randomUUID(),token:crypto.randomUUID()+crypto.randomUUID(),role,pose:pose&&validPose(pose)?{...pose}:emptyPose(),connected:false,seen:now,poseTime:now,disconnectedAt:now,window:now,messages:0};
    if(role==='guest'){const host=this.data.players[0];p.pose={...host.pose,x:host.pose.x+5,speed:0,throttle:0,braking:true,epoch:1,seq:0};}
    this.data.players.push(p);return this.credentials(p);
  }
  credentials(p:Player):Credentials{return {code:this.data.code,instance:this.data.instance,id:p.id,token:p.token,mapVersion:this.data.mapVersion,protocol:PROTOCOL};}
  verify(c:any,now:number){
    this.tick(now);
    if(this.data.closed||c?.instance!==this.data.instance)throw new RoomError('Room expired.',404);
    if(c.protocol!==PROTOCOL||c.mapVersion!==this.data.mapVersion)throw new RoomError('Game versions differ. Both players must refresh.',409);
    const p=this.data.players.find(p=>p.id===c.id&&p.token===c.token);if(!p)throw new RoomError('Session expired. Join again.',401);return p;
  }
  connect(c:any,now:number){const p=this.verify(c,now);p.connected=true;p.disconnectedAt=null;p.seen=now;return p.id;}
  disconnect(id:string,now:number){const p=this.data.players.find(p=>p.id===id);if(p){p.connected=false;p.disconnectedAt=now;}}
  leave(id:string){const p=this.data.players.find(p=>p.id===id);if(!p)return;if(p.role==='host')this.data.closed=true;else{this.dnf(id);if(this.data.race&&['ready','staging'].includes(this.data.race.phase))this.data.race=null;this.data.players=this.data.players.filter(p=>p.id!==id);}}
  tick(now:number){
    for(const p of [...this.data.players]){
      if(p.connected&&now-p.seen>15000)this.disconnect(p.id,now);
      if(p.disconnectedAt!==null&&now-p.disconnectedAt>=30000)this.leave(p.id);
    }
    const race=this.data.race;if(!race)return;
    if(race.phase==='countdown'&&now>=race.startAt)race.phase='racing';
    if((race.phase==='racing'||race.phase==='countdown')&&now>race.deadline){for(const r of Object.values(race.racers))if(r.finished===null)r.dnf=true;race.phase='results';}
    this.finishRace();
  }
  dnf(id:string){const r=this.data.race?.racers[id];if(r)r.dnf=true;this.finishRace();}
  finishRace(){const race=this.data.race;if(race&&['racing','countdown'].includes(race.phase)&&Object.values(race.racers).every(r=>r.dnf||r.finished!==null))race.phase='results';}
  receive(id:string,message:any,now:number){
    this.tick(now);if(this.data.closed)throw new RoomError('Host left. Returning to solo.',410);
    const p=this.data.players.find(p=>p.id===id);if(!p||!p.connected)throw new RoomError('Session disconnected.',401);
    if(now-p.window>1000){p.window=now;p.messages=0;}if(++p.messages>45)throw new RoomError('Too many updates.',429);p.seen=now;
    if(message.type==='ping')return;
    if(message.type==='leave'){this.leave(id);return;}
    if(message.type==='snapshot'){
      const next=message.pose as Pose;if(!validPose(next)||next.seq<=p.pose.seq||next.epoch!==p.pose.epoch)return;
      const previous=p.pose,delta=Math.hypot(next.x-previous.x,next.z-previous.z);
      const race=this.data.race,active=race&&['racing','countdown','staging'].includes(race.phase);
      if(active&&delta>Math.max(20,70*(now-p.poseTime)/1000+4))return;
      if(race&&['staging','countdown'].includes(race.phase)){p.pose={...p.pose,seq:next.seq};return;}
      p.pose={...next};p.poseTime=now;
      if(race?.phase==='racing'){
        const racer=race.racers[id],track=this.tracks.find(t=>t.id===race.track)!;
        if(racer&&!racer.dnf&&racer.finished===null){const gates=gatesFor(track),gate=gates[racer.next];if(gate&&crosses(previous,next,gate)){
          racer.next++;if(racer.next===gates.length){racer.finished=now-race.startAt;race.deadline=Math.min(race.deadline,now+120000);this.finishRace();}
        }}
      }return;
    }
    if(message.type==='lighting'){if(p.role!=='host')throw new RoomError('Only the host changes shared lighting.',403);if(['golden','twilight','night'].includes(message.value))this.data.lighting=message.value;return;}
    if(message.type==='select'){
      if(p.role!=='host')throw new RoomError('Only the host selects races.',403);
      if(!this.tracks.some(t=>t.id===message.track))throw new RoomError('Unknown race.');
      this.data.race={track:message.track,phase:'ready',ready:[],startAt:0,deadline:0,racers:{}};return;
    }
    const race=this.data.race;
    if(message.type==='free'){if(p.role!=='host')throw new RoomError('Only the host ends the race.',403);this.data.race=null;return;}
    if(message.type==='ready'&&race?.phase==='ready'){
      if(!race.ready.includes(id))race.ready.push(id);
      if(this.data.players.length===2&&this.data.players.every(p=>p.connected&&race.ready.includes(p.id))){
        race.phase='staging';const track=this.tracks.find(t=>t.id===race.track)!;
        this.data.players.forEach((member,i)=>{race.racers[member.id]={next:0,penalty:0,finished:null,dnf:false,spawned:false};member.pose={...spawnFor(track,i),seq:member.pose.seq,epoch:member.pose.epoch+1};});
      }return;
    }
    if(message.type==='spawned'&&race?.phase==='staging'){
      if(race.racers[id])race.racers[id].spawned=true;
      if(Object.values(race.racers).length===2&&Object.values(race.racers).every(r=>r.spawned)){race.phase='countdown';race.startAt=now+3000;race.deadline=race.startAt+900000;}return;
    }
    if(message.type==='reset'){
      if(race?.phase==='staging'||race?.phase==='countdown')return;
      if(race?.phase==='racing'){
        const track=this.tracks.find(t=>t.id===race.track)!,racer=race.racers[id];if(!racer||racer.finished!==null||racer.dnf)return;
        racer.penalty+=5000;const gate=racer.next?gatesFor(track)[racer.next-1]:undefined;
        p.pose={...spawnFor(track,p.role==='host'?0:1,gate),seq:p.pose.seq,epoch:p.pose.epoch+1};
      }else if(validPose(message.pose)){p.pose={...message.pose,epoch:p.pose.epoch+1,seq:p.pose.seq};}
    }
  }
  view(now:number):RoomView{return {code:this.data.code,instance:this.data.instance,lighting:this.data.lighting,players:this.data.players.map(({id,role,pose,connected})=>({id,role,pose:{...pose},connected})),race:this.data.race?structuredClone(this.data.race):null,serverTime:now,closed:this.data.closed};}
}
