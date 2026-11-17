import * as T from 'three';
import {RoomSession,RemoteVehicle} from './multiplayer';
import {gatesFor,spawnFor} from '../shared/protocol';
import type {Pose,Track} from '../shared/protocol';
import catalog from '../shared/tracks.json';
import type {World,Lighting,Quality,Car} from './types';
import {Driving} from './driving';
import {CountyAtlas} from './atlas';
import {createContactShadows} from './visuals';
import {turnGuidance} from '../shared/navigation';
import {createTurnMarkers} from './turn-markers';
const $=<E extends HTMLElement>(id:string)=>document.getElementById(id) as E;
const label=(id:string,text:string)=>{const node=$(id);if(node.textContent!==text)node.textContent=text;};
const colorCar=(car:Car,color:number)=>car.group.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if((m.name==='paint'||m.name==='side_paint')&&m instanceof T.MeshStandardMaterial)m.color.setHex(color);});
export class MultiplayerGame {
  session:RoomSession;remote:RemoteVehicle;private epoch=0;private initialGuest=false;private stageAck='';private checkpoint=new T.Group();private trackLine?:T.Line;
  private trackId='';private stoppedRace='';private shadow:ReturnType<typeof createContactShadows>;private lastConnected=false;
  private turnMarkers?:ReturnType<typeof createTurnMarkers>;
  constructor(private opts:{world:World;scene:T.Scene;drive:Driving;car:Car;atlas:CountyAtlas;paused:()=>boolean;lighting:()=>Lighting;light:(value:Lighting)=>void;beginRace:()=>boolean;teleported:()=>void;toast:(text:string)=>void}){
    const {scene,world}=opts;this.remote=new RemoteVehicle(scene,world);this.shadow=createContactShadows(scene,world,false);this.shadow.shadow.visible=false;
    this.session=new RoomSession(()=>this.pose(),()=>{const remote=this.session.remote();world.remotePositions?.splice(0,world.remotePositions.length,...(remote?[new T.Vector3(remote.x,remote.y,remote.z)]:[]));if(opts.paused()||!this.canDrive())world.stepEnvironment?.(.05,opts.drive.state.position);},opts.lighting);
    this.session.onChange=()=>this.changed();this.session.onError=text=>{$('room-status').textContent=text;opts.toast(text);};
    const request=async(action:()=>Promise<void>)=>{($('room-create') as HTMLButtonElement).disabled=true;($('room-join') as HTMLButtonElement).disabled=true;try{await action();}catch(error){this.session.status=error instanceof Error?error.message:'Could not connect.';this.changed();}finally{this.changed();}};
    $('room-create').onclick=()=>void request(()=>this.session.enter());
    $('room-join').onclick=()=>void request(()=>this.session.enter(($('room-code') as HTMLInputElement).value.trim()));
    $('room-code').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('room-join').click();}});
    $('room-copy').onclick=async()=>{const code=this.session.credentials?.code;if(!code)return;try{await navigator.clipboard.writeText(code);opts.toast('Room code copied: '+code);}catch{($('room-code') as HTMLInputElement).select();opts.toast('Select and copy the room code.');}};
    $('room-leave').onclick=()=>this.session.leave();
    $('race-track').innerHTML='<option value="">Choose a race</option>'+catalog.tracks.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
    $('race-track').onchange=()=>{const track=($('race-track') as HTMLSelectElement).value;if(track)this.session.send({type:'select',track});};
    $('race-ready').onclick=()=>this.session.send({type:'ready'});
    $('race-rematch').onclick=()=>this.session.send({type:'select',track:this.session.view?.race?.track});
    $('race-free').onclick=()=>this.session.send({type:'free'});
    const material=new T.MeshBasicMaterial({color:'#f1cd8c',transparent:true,opacity:.8,depthWrite:false});
    for(const side of [-1,1]){const post=new T.Mesh(new T.BoxGeometry(.18,6,.18),material);post.position.set(side*8,3,0);this.checkpoint.add(post);}
    const beam=new T.Mesh(new T.BoxGeometry(16,.18,.18),material);beam.position.y=6;this.checkpoint.add(beam);this.checkpoint.visible=false;scene.add(this.checkpoint);
  }
  async init(){await this.session.init();this.changed();}
  private pose():Pose{
    const s=this.opts.drive.state,p=this.opts.paused()||!this.canDrive();return {x:s.position.x,y:s.position.y,z:s.position.z,heading:Math.atan2(Math.sin(s.heading),Math.cos(s.heading)),speed:p?0:s.speed,steering:s.steering,throttle:p?0:s.throttle,braking:p||s.braking,airborne:s.airborne,pitch:s.pitch,verticalSpeed:p?0:s.verticalSpeed,seq:0,epoch:this.epoch};
  }
  private changed(){
    const session=this.session,view=session.view,c=session.credentials,mine=view?.players.find(p=>p.id===c?.id),host=mine?.role==='host';
    $('room-status').textContent=session.status;const busy=Boolean(c)||/Creating|Joining/.test(session.status);
    ($('room-create') as HTMLButtonElement).disabled=busy||!session.url;($('room-join') as HTMLButtonElement).disabled=busy||!session.url;
    ($('room-code') as HTMLInputElement).readOnly=Boolean(c);if(c)($('room-code') as HTMLInputElement).value=c.code;
    $('room-copy').hidden=!c;$('room-leave').hidden=!c;$('race-controls').hidden=!session.connected;
    $('room-leave').textContent=host?'Close room for both':'Leave room';
    document.querySelectorAll<HTMLButtonElement>('#lighting button').forEach(b=>{b.disabled=Boolean(c)&&Boolean(mine)&&!host;});
    if(view&&mine&&session.connected){
      colorCar(this.opts.car,host?0x143c40:0xc9684d);colorCar(this.remote.car,host?0xc9684d:0x143c40);
      if(this.opts.lighting()!==view.lighting)this.opts.light(view.lighting);
      if(mine.pose.epoch!==this.epoch||!this.lastConnected){
        this.epoch=mine.pose.epoch;
        const p=mine.pose;this.opts.drive.teleport(new T.Vector3(p.x,p.y,p.z),p.heading,true);this.opts.teleported();
        if(!host&&!this.initialGuest&&!view.race){this.initialGuest=true;const safe=this.opts.drive.findRoadSpawn(new T.Vector3(p.x,p.y,p.z));this.opts.drive.teleport(safe.point,safe.heading,true);session.send({type:'reset',pose:this.pose()});}
      }
      const race=view.race;
      if(race?.phase==='racing'&&race.racers[mine.id]&&race.racers[mine.id].finished!==null){const key=view.instance+':'+race.startAt;if(key!==this.stoppedRace){this.stoppedRace=key;const s=this.opts.drive.state;this.opts.drive.teleport(s.position.clone(),s.heading);}}
      ($('race-track') as HTMLSelectElement).disabled=!host;($('race-track') as HTMLSelectElement).value=race?.track??'';
      $('race-ready').hidden=race?.phase!=='ready';($('race-ready') as HTMLButtonElement).disabled=view.players.filter(p=>p.connected).length<2||Boolean(race?.ready.includes(mine.id));
      $('race-ready').textContent=race?.ready.includes(mine.id)?'Ready · waiting':'Ready to race';
      $('race-rematch').hidden=!(host&&race?.phase==='results');$('race-free').hidden=!(host&&race);
      if(race?.phase==='staging'&&this.stageAck!==race.track+':'+mine.pose.epoch&&this.opts.beginRace()){this.stageAck=race.track+':'+mine.pose.epoch;session.send({type:'spawned'});}
    }else if(!c){this.epoch=0;this.initialGuest=false;this.lastConnected=false;this.opts.world.remotePositions?.splice(0);this.remote.root.visible=false;this.shadow.shadow.visible=false;colorCar(this.opts.car,0x143c40);}
    this.lastConnected=session.connected;
  }
  setLighting(value:Lighting){if(this.session.connected)this.session.send({type:'lighting',value});}
  quality(value:Quality){this.remote.quality(value);}
  canDrive(){const race=this.session.view?.race,id=this.session.credentials?.id;if(!race||id&&race.phase==='racing'&&!race.racers[id])return true;return !['staging','countdown'].includes(race.phase)&&!(id&&race.phase==='racing'&&(race.racers[id]?.finished!==null||race.racers[id]?.dnf));}
  reset(){
    if(!this.session.connected)return false;
    if(!this.session.view?.race||['ready','results'].includes(this.session.view.race.phase))this.opts.drive.reset();
    this.session.send({type:'reset',pose:this.pose()});return true;
  }
  update(time:number){
    const session=this.session,view=session.view,remote=session.remote(),race=view?.race,id=session.credentials?.id;
    this.remote.update(remote,time,this.opts.lighting());this.shadow.shadow.visible=Boolean(remote);
    if(remote)this.shadow.update({position:new T.Vector3(remote.x,remote.y,remote.z),heading:remote.heading} as any);
    this.opts.atlas.updatePlayers(this.opts.drive.renderState(),remote);
    const track=catalog.tracks.find(t=>t.id===race?.track) as Track|undefined;
    if(this.trackId!==(track?.id??'')){
      this.turnMarkers?.dispose();this.turnMarkers=undefined;
      this.trackId=track?.id??'';if(this.trackLine){this.opts.scene.remove(this.trackLine);this.trackLine.geometry.dispose();(this.trackLine.material as T.Material).dispose();this.trackLine=undefined;}
      if(track){const geometry=new T.BufferGeometry().setFromPoints(track.points.map(([x,y,z])=>new T.Vector3(x,y+.2,z)));this.trackLine=new T.Line(geometry,new T.LineBasicMaterial({color:'#e3bd79',transparent:true,opacity:.6}));this.opts.scene.add(this.trackLine);}
      this.opts.atlas.setRaceRoute(track?.points);
      if(track?.turns?.length)this.turnMarkers=createTurnMarkers(this.opts.scene,track);
    }
    $('turn-hud').hidden=true;
    this.checkpoint.visible=false;let text='';
    if(race&&track&&id){const racer=race.racers[id],gates=gatesFor(track);
      if(track.turns?.length){
        const active=['countdown','racing'].includes(race.phase),hint=racer&&racer.finished===null&&!racer.dnf?turnGuidance(track,this.opts.drive.state.position,racer.next):undefined;
        this.turnMarkers!.root.visible=race.phase!=='results'&&(!active||Boolean(hint));this.turnMarkers!.setCurrent(hint?.index??0,active);
        if(active&&hint){
          const speed=Math.abs(this.opts.drive.state.speed),close=hint.distance<=Math.max(90,(speed*speed-(45/3.6)**2)/16+20),fast=speed*3.6>55;
          $('turn-hud').hidden=false;$('turn-hud').dataset.warning=String(close&&fast||hint.offRoute);
          $('turn-arrow').textContent=hint.offRoute?'!':hint.turn.direction==='left'?'↰':'↱';
          $('turn-direction').textContent=hint.offRoute?'Return to the route':`${close&&fast?'Brake · ':''}${hint.turn.direction==='left'?'Left':'Right'} turn`;
          $('turn-distance').textContent=hint.offRoute?'Follow the next checkpoint':`${hint.distance<=12?'Turn now':hint.distance+' m'} · Corner ${hint.index+1}/${track.turns.length} · 45 km/h`;
        }
      }
      if(race.phase==='ready')text='Ready for '+track.name;
      else if(race.phase==='staging')text='Moving to the starting grid…';
      else if(race.phase==='countdown')text=String(Math.max(1,Math.ceil((race.startAt-session.now())/1000)))+' · '+track.name;
      else if(race.phase==='racing'){
        const gate=gates[racer?.next??0];if(gate&&racer?.finished===null&&!racer.dnf){this.checkpoint.visible=true;this.checkpoint.position.set(gate.x,gate.y,gate.z);this.checkpoint.rotation.y=Math.atan2(gate.dx,gate.dz);this.checkpoint.scale.x=track.width/16;}
        const ranking=Object.entries(race.racers).sort(([,a],[,b])=>b.next-a.next||a.penalty-b.penalty),place=ranking.findIndex(([key])=>key===id)+1;
        text=!racer?'Spectating · join the next race':racer.finished!==null?'Finished · waiting for friend':racer.dnf?'Did not finish':`${place}/2 · Checkpoint ${Math.min(racer.next+1,gates.length)}/${gates.length} · ${((session.now()-race.startAt+racer.penalty)/1000).toFixed(1)} s${racer.penalty?' · +'+racer.penalty/1000+' s':''}`;
      }else{
        const results=Object.entries(race.racers).sort(([,a],[,b])=>(a.dnf||a.finished===null?Infinity:a.finished+a.penalty)-(b.dnf||b.finished===null?Infinity:b.finished+b.penalty));
        const times=results.map(([key,r])=>(key===id?'You':'Friend')+': '+(r.dnf||r.finished===null?'DNF':((r.finished+r.penalty)/1000).toFixed(2)+' s'));
        const a=results[0]?.[1],b=results[1]?.[1],tie=a&&b&&a.finished!==null&&b.finished!==null&&!a.dnf&&!b.dnf&&Math.abs(a.finished+a.penalty-b.finished-b.penalty)<50;
        text=(tie?'Draw':a?.dnf||a?.finished===null?'Race ended':results[0][0]===id?'You win':'Friend wins')+' · '+times.join(' · ');
      }
    }
    $('race-status').textContent=text;$('race-hud').textContent=text;$('race-hud').hidden=!race;
  }
}
