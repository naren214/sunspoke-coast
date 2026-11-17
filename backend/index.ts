import {DurableObject} from 'cloudflare:workers';
import {RoomEngine,RoomError} from '../shared/room.ts';
import {PROTOCOL,validCode,type Track} from '../shared/protocol.ts';
import catalog from '../shared/tracks.json';
const tracks=catalog.tracks as Track[];
interface Env {ROOMS:DurableObjectNamespace<CoastRoom>;ALLOWED_ORIGINS:string;}
const json=(value:unknown,status=200)=>Response.json(value,{status});
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const origin=request.headers.get('Origin')??'',allowed=env.ALLOWED_ORIGINS.split(',').includes(origin)||/^http:\/\/(localhost|127\.0\.0\.1):(417[3-9]|418\d|419[0-3]|5173)$/.test(origin);
    if(!allowed)return json({error:'This game origin is not allowed.'},403);
    const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin','Cache-Control':'no-store'};
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    try{
      const path=new URL(request.url).pathname;
      if(request.method==='GET'&&path==='/health')return new Response(JSON.stringify({ok:true,protocol:PROTOCOL,mapVersion:catalog.mapVersion}),{headers:{...cors,'Content-Type':'application/json'}});
      if(request.method==='POST'&&(!request.headers.get('Content-Type')?.startsWith('application/json')||Number(request.headers.get('Content-Length'))>4096))throw new RoomError('Expected a small JSON request.');
      let response:Response;
      if(request.method==='POST'&&(path==='/rooms'||/^\/rooms\/\d{3}\/join$/.test(path))){
        const ip=request.headers.get('CF-Connecting-IP')??'local';
        const limit=await env.ROOMS.get(env.ROOMS.idFromName('limit:'+ip)).fetch('https://room.internal/limit');
        if(!limit.ok)throw new RoomError('Too many room attempts. Try again in a minute.',429);
      }
      if(request.method==='POST'&&path==='/rooms'){
        const body=await request.text();if(body.length>4096)throw new RoomError('Request too large.');
        response=json({error:'All room codes are busy. Try again shortly.'},503);
        for(let attempt=0;attempt<32;attempt++){
          const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000).padStart(3,'0');
          const r=await env.ROOMS.get(env.ROOMS.idFromName('room:'+code)).fetch('https://room.internal/create?code='+code,{method:'POST',body});
          if(r.status!==409){response=r;break;}
        }
      }else{
        const match=path.match(/^\/rooms\/(\d{3})\/(join|socket)$/);if(!match||!validCode(match[1]))throw new RoomError('Room not found.',404);
        const route=match[2];if(route==='join'&&request.method!=='POST'||route==='socket'&&request.method!=='GET')throw new RoomError('Method not allowed.',405);
        response=await env.ROOMS.get(env.ROOMS.idFromName('room:'+match[1])).fetch(new Request('https://room.internal/'+route,request));
      }
      if(response.status===101)return response;
      const headers=new Headers(response.headers);for(const [k,v]of Object.entries(cors))headers.set(k,v);return new Response(response.body,{status:response.status,headers});
    }catch(error){return new Response(JSON.stringify({error:error instanceof RoomError?error.message:'The room server could not complete the request.'}),{status:error instanceof RoomError?error.status:500,headers:{...cors,'Content-Type':'application/json'}});}
  }
};
export class CoastRoom extends DurableObject<Env>{
  engine?:RoomEngine;
  ready:Promise<void>;
  constructor(ctx:DurableObjectState,env:Env){super(ctx,env);this.ready=ctx.blockConcurrencyWhile(async()=>{const data=await ctx.storage.get<any>('room');if(data)this.engine=new RoomEngine(data,tracks);});}
  async save(){if(this.engine)await this.ctx.storage.put('room',this.engine.data);}
  broadcast(){if(!this.engine)return;const message=JSON.stringify({type:'room',room:this.engine.view(Date.now())});for(const ws of this.ctx.getWebSockets()){if(ws.deserializeAttachment()?.id)try{ws.send(message);}catch{}}}
  async fetch(request:Request){
    await this.ready;const url=new URL(request.url),now=Date.now();this.engine?.tick(now);
    try{
      if(url.pathname==='/limit'){
        const attempts=(await this.ctx.storage.get<number[]>('attempts')??[]).filter(t=>now-t<60000);if(attempts.length>=10)return json({error:'Rate limited.'},429);
        attempts.push(now);await this.ctx.storage.put('attempts',attempts);await this.ctx.storage.setAlarm(now+60000);return json({ok:true});
      }
      if(url.pathname==='/create'||url.pathname==='/join'){
        const raw=await request.text();if(raw.length>4096)throw new RoomError('Request too large.');let body:any;try{body=JSON.parse(raw);}catch{throw new RoomError('Invalid JSON.');}
        if(body.protocol!==PROTOCOL||body.mapVersion!==catalog.mapVersion)throw new RoomError('Game versions differ. Both players must refresh.',412);
        if(url.pathname==='/create'){
          if(this.engine&&!this.engine.data.closed){await this.save();return json({error:'Code occupied.'},409);}
          this.engine=RoomEngine.create(url.searchParams.get('code')!,catalog.mapVersion,tracks,now,body.pose);
          if(['golden','twilight','night'].includes(body.lighting))this.engine.data.lighting=body.lighting;
        }else if(!this.engine||this.engine.data.closed)throw new RoomError('Room expired or code not found.',404);
        const credentials=url.pathname==='/create'?this.engine!.credentials(this.engine!.data.players[0]):this.engine!.add('guest',now);
        await this.save();await this.ctx.storage.setAlarm(now+15000);this.broadcast();return json(credentials);
      }
      if(url.pathname==='/socket'&&request.headers.get('Upgrade')?.toLowerCase()==='websocket'){
        if(!this.engine||this.engine.data.closed)throw new RoomError('Room expired.',404);
        const pair=new WebSocketPair();this.ctx.acceptWebSocket(pair[1]);pair[1].serializeAttachment({connectedAt:now});await this.ctx.storage.setAlarm(now+5000);return new Response(null,{status:101,webSocket:pair[0]});
      }
      throw new RoomError('Not found.',404);
    }catch(error){await this.save();return json({error:error instanceof RoomError?error.message:'Room request failed.'},error instanceof RoomError?error.status:500);}
  }
  async webSocketMessage(ws:WebSocket,data:string|ArrayBuffer){
    await this.ready;
    try{
      if(typeof data!=='string'||data.length>4096)throw new RoomError('Message too large.');const message=JSON.parse(data),attachment=ws.deserializeAttachment();
      if(!attachment?.id){
        if(message.type!=='auth'||!this.engine)throw new RoomError('Authentication required.',401);
        const id=this.engine.connect(message.credentials,Date.now());
        for(const old of this.ctx.getWebSockets())if(old!==ws&&old.deserializeAttachment()?.id===id){old.serializeAttachment({});old.close(4000,'Session resumed elsewhere.');}
        ws.serializeAttachment({id});await this.save();this.broadcast();return;
      }
      this.engine!.receive(attachment.id,message,Date.now());await this.save();
      if(message.type==='ping')ws.send(JSON.stringify({type:'pong',sent:message.sent,serverTime:Date.now()}));
      else this.broadcast();
      if(this.engine!.data.closed)for(const client of this.ctx.getWebSockets())client.close(1000,'Host left.');
    }catch(error){try{ws.send(JSON.stringify({type:'error',message:error instanceof RoomError?error.message:'Invalid room message.'}));if(!(error instanceof RoomError)||[401,410,429].includes(error.status))ws.close(4001,'Session ended.');}catch{}}
  }
  async webSocketClose(ws:WebSocket){try{ws.close(1000,'Connection closed.');}catch{}await this.ready;const id=ws.deserializeAttachment()?.id;if(id)this.engine?.disconnect(id,Date.now());await this.save();this.broadcast();}
  async webSocketError(ws:WebSocket){await this.webSocketClose(ws);}
  async alarm(){
    await this.ready;if(!this.engine){await this.ctx.storage.deleteAll();return;}
    const now=Date.now();this.engine.tick(now);
    for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment();if(!a?.id&&now-a?.connectedAt>5000)ws.close(4001,'Authentication timeout.');else if(a?.id&&!this.engine.data.players.find(p=>p.id===a.id)?.connected)ws.close(4001,'Session timed out.');}
    await this.save();this.broadcast();if(this.engine.data.closed){for(const ws of this.ctx.getWebSockets())ws.close(1000,'Room expired.');}else await this.ctx.storage.setAlarm(now+5000);
  }
}
