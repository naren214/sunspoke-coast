import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {WebSocket} from 'ws';
const base=process.argv[2]??'http://127.0.0.1:8787',origin=process.argv[3]??'http://127.0.0.1:4173',catalog=JSON.parse(await readFile(new URL('../shared/tracks.json',import.meta.url),'utf8'));
const post=async(path,body)=>{const r=await fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.headers.get('access-control-allow-origin'),origin);return {status:r.status,data:await r.json()};};
const input={protocol:1,mapVersion:catalog.mapVersion};
const host=(await post('/rooms',input));assert.equal(host.status,200,JSON.stringify(host));const h=host.data;
const guest=await post('/rooms/'+h.code+'/join',input);assert.equal(guest.status,200,JSON.stringify(guest));const g=guest.data;
assert.equal((await post('/rooms/'+h.code+'/join',input)).status,409);
const clients=[];
function connect(credentials){return new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace(/^http/,'ws')+'/rooms/'+credentials.code+'/socket',{headers:{Origin:origin}});clients.push(ws);ws.rooms=[];ws.on('error',reject);ws.on('open',()=>ws.send(JSON.stringify({type:'auth',credentials})));ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='room'){ws.room=m.room;ws.rooms.push(m.room);resolve(ws);}else if(m.type==='error')reject(Error(m.message));});setTimeout(()=>reject(Error('WebSocket welcome timed out')),10000).unref();});}
async function until(test){const start=Date.now();while(!test()){if(Date.now()-start>10000)throw Error('Network condition timed out');await new Promise(r=>setTimeout(r,30));}}
try{
 const a=await connect(h),b=await connect(g);await until(()=>a.room.players.filter(p=>p.connected).length===2);
 a.send(JSON.stringify({type:'lighting',value:'night'}));await until(()=>b.room.lighting==='night');
 const p=a.room.players.find(p=>p.id===h.id).pose;a.send(JSON.stringify({type:'snapshot',pose:{...p,x:-64,z:209,seq:p.seq+1}}));await until(()=>b.room.players.find(p=>p.id===h.id).pose.x===-64);
 a.send(JSON.stringify({type:'select',track:'airport'}));await until(()=>b.room.race?.phase==='ready');a.send(JSON.stringify({type:'ready'}));b.send(JSON.stringify({type:'ready'}));await until(()=>b.room.race?.phase==='staging');a.send(JSON.stringify({type:'spawned'}));b.send(JSON.stringify({type:'spawned'}));await until(()=>b.room.race?.phase==='countdown');
 a.send(JSON.stringify({type:'free'}));await until(()=>!b.room.race);
 b.close();await until(()=>a.room.players.some(p=>p.id===g.id&&!p.connected));const resumed=await connect(g);await until(()=>a.room.players.filter(p=>p.connected).length===2);assert.equal(a.room.players.length,2);
 a.send(JSON.stringify({type:'leave'}));await until(()=>resumed.room.closed);
 assert.equal((await fetch(base+'/health',{headers:{Origin:'https://wrong.example'}})).status,403);
 console.log('PASS two real WebSocket clients: create/join/full, movement, lighting, ready/countdown, free roam, reconnect, host leave, origin restrictions');
}finally{for(const ws of clients)ws.terminate();}
