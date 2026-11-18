import * as T from 'three';
import {PROTOCOL,validCode} from '../shared/protocol';
import type {Pose,RoomView,Credentials} from '../shared/protocol';
import {PoseBuffer} from '../shared/interpolation';
import catalog from '../shared/tracks.json';
import {createCar} from './car';
import { GT_FRIEND_PAINT } from './gt-model';
import type {World,Quality,Lighting} from './types';

export class RoomSession {
  credentials?:Credentials;view?:RoomView;status='Solo driving';url='';connected=false;buffer=new PoseBuffer();
  onChange=()=>{};onError=(message:string)=>{};
  private socket?:WebSocket;private retry?:ReturnType<typeof setTimeout>;private timer?:ReturnType<typeof setInterval>;
  private lastPing=0;private offset=0;private bestRtt=Infinity;private retries=0;private lostAt=0;private generation=0;private seq=0;
  constructor(private pose:()=>Pose,private backgroundStep:()=>void,private lighting:()=>Lighting=()=>'golden'){}
  async init(){
    const configured=(import.meta as any).env.VITE_MULTIPLAYER_URL;
    let stored='';try{stored=(await fetch('/multiplayer-config.json',{cache:'no-store'}).then(r=>r.json())).url??'';}catch{}
    this.url=(configured||stored||(['localhost','127.0.0.1'].includes(location.hostname)?'http://127.0.0.1:8787':'')).replace(/\/$/,'');
    if(this.url&&!/^https:\/\//.test(this.url)&&!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(this.url))this.url='';
    if(!this.url){this.status='Online server is not connected yet. Solo driving works.';this.onChange();return;}
    try{const saved=JSON.parse(sessionStorage.getItem('sunspoke-room')??'null');if(saved?.mapVersion===catalog.mapVersion&&saved.protocol===PROTOCOL){this.credentials=saved;this.connect();}}catch{}
    this.onChange();
  }
  async enter(code?:string){
    if(this.credentials)throw Error('Leave your current room first.');if(!this.url)throw Error('Online server is not connected yet.');
    if(code!==undefined&&!validCode(code))throw Error('Enter exactly three digits.');
    const generation=++this.generation;this.status=code?'Joining room…':'Creating room…';this.onChange();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(this.url+(code?'/rooms/'+code+'/join':'/rooms'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocol:PROTOCOL,mapVersion:catalog.mapVersion,pose:this.pose(),lighting:this.lighting()}),signal:controller.signal});
      const data=await response.json();if(!response.ok)throw Error(data.error??'Could not join the room.');if(generation!==this.generation)return;
      this.credentials=data;this.seq=0;this.retries=0;this.lostAt=0;this.bestRtt=Infinity;this.offset=0;
      try{sessionStorage.setItem('sunspoke-room',JSON.stringify(data));}catch{}this.connect();
    }finally{clearTimeout(timeout);}
  }
  private connect(){
    if(!this.credentials)return;const current=this.credentials,ws=new WebSocket(this.url.replace(/^http/,'ws')+'/rooms/'+current.code+'/socket');this.socket=ws;this.status=this.lostAt?'Reconnecting…':'Connecting…';this.onChange();
    ws.onopen=()=>{if(ws!==this.socket||!this.credentials){ws.close();return;}ws.send(JSON.stringify({type:'auth',credentials:current}));};
    ws.onmessage=event=>{
      if(ws!==this.socket||!this.credentials)return;
      try{const message=JSON.parse(event.data);
        if(message.type==='error'){this.onError(message.message);if(/expired|versions differ|Host left|Session ended/i.test(message.message))this.leave(false);return;}
        if(message.type==='pong'){const rtt=Date.now()-message.sent;if(rtt<this.bestRtt){this.bestRtt=rtt;this.offset=message.serverTime+rtt/2-Date.now();}return;}
        if(message.type!=='room')return;
        const room=message.room as RoomView;if(room.instance!==current.instance)return;
        if(room.closed){this.status='Host left. Back to solo.';this.leave(false);return;}
        this.view=room;const mine=room.players.find(p=>p.id===current.id);if(!mine){this.onError('Session expired. Join again.');this.leave(false);return;}
        this.seq=Math.max(this.seq,mine.pose.seq);if(!this.connected){this.connected=true;this.lostAt=0;this.retries=0;this.offset=room.serverTime-Date.now();this.startTimer();}
        const remote=room.players.find(p=>p.id!==current.id);if(remote?.connected)this.buffer.push(remote.pose,room.serverTime);else this.buffer.clear();
        this.status='Room '+room.code+' · '+room.players.length+'/2'+(remote?.connected?' · connected':' · waiting for friend');this.onChange();
      }catch{this.onError('Invalid response from the room server.');}
    };
    ws.onerror=()=>{if(ws!==this.socket)return;this.status='Connection interrupted';this.onChange();};
    ws.onclose=()=>{
      if(ws!==this.socket||!this.credentials)return;this.connected=false;clearInterval(this.timer);this.lostAt||=Date.now();this.status='Reconnecting…';this.onChange();
      if(Date.now()-this.lostAt>=30000){this.leave(false);this.onError('Room connection expired. Solo driving is still available.');return;}
      this.retry=setTimeout(()=>this.connect(),Math.min(8000,1000*2**this.retries++));
    };
  }
  private startTimer(){
    clearInterval(this.timer);this.lastPing=0;
    this.timer=setInterval(()=>{this.backgroundStep();if(!this.connected)return;const now=Date.now();if(now-this.lastPing>=5000){this.lastPing=now;this.send({type:'ping',sent:now});}const pose=this.pose();pose.seq=++this.seq;this.send({type:'snapshot',pose});},50);
  }
  now(){return Date.now()+this.offset;}
  remote(){return this.buffer.sample(this.now());}
  send(message:unknown){if(this.socket?.readyState===WebSocket.OPEN){if((message as any).type==='snapshot'&&this.socket.bufferedAmount>8192)return;this.socket.send(JSON.stringify(message));};}
  leave(notify=true){
    if(notify)this.send({type:'leave'});this.generation++;clearTimeout(this.retry);clearInterval(this.timer);this.credentials=undefined;this.view=undefined;this.connected=false;const ws=this.socket;this.socket=undefined;ws?.close();this.buffer.clear();
    try{sessionStorage.removeItem('sunspoke-room');}catch{}this.status='Solo driving';this.onChange();
  }
}

export class RemoteVehicle {
  car=createCar({color:GT_FRIEND_PAINT,label:'Friend Sunspoke GT'});root=new T.Group();loaded=false;
  constructor(scene:T.Scene,private world:World){
    this.root.add(this.car.group);this.root.visible=false;
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#173b41dd';ctx.fillRect(0,0,256,64);ctx.fillStyle='#fff1d4';ctx.font='32px Barlow,Arial';ctx.textAlign='center';ctx.fillText('Friend',128,43);
    const sprite=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(canvas),depthTest:false}));sprite.scale.set(3.4,.85,1);sprite.position.y=3;this.car.group.add(sprite);scene.add(this.root);
  }
  quality(next:Quality){this.car.setQuality(next);}
  update(pose:Pose|undefined,time:number,lighting:Lighting){
    this.root.visible=Boolean(pose);if(!pose)return;
    if(!this.loaded){this.loaded=true;void this.car.loadAssets(undefined,true);}
    const {x,y,z,heading,pitch}=pose;this.car.group.position.set(x,y,z);
    if(!pose.airborne)this.car.group.position.y+=(this.world.visualHeight?.(x,z)??y)-(this.world.surfaceHeight??this.world.groundHeight)(x,z);
    this.car.group.rotation.set(pitch,heading,0,'YXZ');this.car.update(pose.speed,pose.steering,pose.throttle,pose.braking,time,lighting==='night'?1:lighting==='twilight'?.5:0);
  }
}
