import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RoomEngine} from '../shared/room.ts';
import {PROTOCOL,validCode,validPose,emptyPose,gatesFor,crosses} from '../shared/protocol.ts';
import {PoseBuffer} from '../shared/interpolation.ts';
const catalog=JSON.parse(readFileSync(new URL('../shared/tracks.json',import.meta.url),'utf8'));
let now=100000;const create=()=>RoomEngine.create('007',catalog.mapVersion,catalog.tracks,now);
function pair(){const room=create(),host=room.credentials(room.data.players[0]),guest=room.add('guest',now);room.connect(host,now);room.connect(guest,now);return {room,host,guest};}
assert.ok(validCode('007')&&validCode('000')&&!validCode('7')&&!validCode('abc'));
assert.ok(validPose(emptyPose())&&!validPose({...emptyPose(),x:NaN})&&!validPose({...emptyPose(),seq:-1}));
console.log('PASS three-digit codes, leading zeros, finite bounded snapshots');
{
 const {room,host,guest}=pair();assert.throws(()=>room.add('guest',now),/full/);assert.throws(()=>room.connect({...guest,token:'wrong'},now),/expired/);assert.throws(()=>room.connect({...guest,mapVersion:'old'},now),/versions/);
 assert.ok(!JSON.stringify(room.view(now)).includes(host.token));assert.throws(()=>room.receive(guest.id,{type:'lighting',value:'night'},now),/host/);
 room.receive(host.id,{type:'lighting',value:'night'},now);assert.equal(room.view(now).lighting,'night');
 const original=room.data.players[0].pose;room.receive(host.id,{type:'snapshot',pose:{...original,x:9,seq:1}},now);room.receive(host.id,{type:'snapshot',pose:{...original,x:99,seq:0}},now);assert.equal(room.data.players[0].pose.x,9);
 room.disconnect(guest.id,now);room.connect(guest,now+1000);assert.equal(room.data.players.length,2);
 room.disconnect(guest.id,now+1000);room.data.players[0].seen=now+32000;room.tick(now+32000);assert.equal(room.data.players.length,1);assert.throws(()=>room.connect(guest,now+32000),/expired/);
 const next=room.add('guest',now+32000);assert.notEqual(next.id,guest.id);assert.throws(()=>RoomEngine.create('007',catalog.mapVersion,catalog.tracks,now).connect(host,now),/expired/);
 room.leave(host.id);assert.ok(room.view(now).closed);
 console.log('PASS atomic capacity, token privacy, versions, roles, stale frames, reconnects, expiry and room reuse');
}
for(const track of catalog.tracks){
 const {room,host,guest}=pair();room.receive(host.id,{type:'select',track:track.id},now);room.receive(host.id,{type:'ready'},now);assert.equal(room.data.race!.phase,'ready');room.receive(guest.id,{type:'ready'},now);assert.equal(room.data.race!.phase,'staging');
 const initialEpoch=room.data.players[0].pose.epoch;room.receive(host.id,{type:'spawned'},now);room.receive(guest.id,{type:'spawned'},now);assert.equal(room.data.race!.startAt,now+3000);
 room.receive(host.id,{type:'snapshot',pose:{...room.data.players[0].pose,x:0,seq:1}},now+500);assert.equal(room.data.players[0].pose.epoch,initialEpoch);
 now+=3100;room.receive(host.id,{type:'ping'},now);room.receive(guest.id,{type:'ping'},now);
 const samples=track.points.flatMap((point:number[],i:number)=>{if(!i)return [point];const a=track.points[i-1],n=Math.ceil(Math.hypot(point[0]-a[0],point[2]-a[2])/8);return Array.from({length:n},(_,j)=>point.map((v,k)=>a[k]+(v-a[k])*(j+1)/n));});
 let seq=1;for(const point of samples){
   now+=400;const p=room.data.players[0];room.receive(host.id,{type:'snapshot',pose:{...p.pose,x:point[0],y:point[1],z:point[2],seq:++seq,speed:20}},now);room.receive(guest.id,{type:'ping'},now);
 }
 assert.ok(room.data.race!.racers[host.id].finished!==null,track.id+' must finish every gate');
 room.receive(guest.id,{type:'reset'},now);assert.equal(room.data.race!.racers[guest.id].penalty,5000);assert.ok(room.data.players[1].pose.epoch>initialEpoch);
 now+=120001;room.data.players.forEach(p=>p.seen=now);room.tick(now);assert.equal(room.data.race!.phase,'results');assert.equal(room.data.race!.racers[guest.id].dnf,true);
 room.receive(host.id,{type:'select',track:track.id},now);assert.equal(room.data.race!.phase,'ready');room.receive(host.id,{type:'free'},now);assert.equal(room.data.race,null);
 console.log('PASS '+track.name+': ready, grid, countdown, ordered gates, finish, reset penalty, DNF and rematch');
}
{
 const gate=gatesFor(catalog.tracks[0])[0],a={...emptyPose(),x:gate.x-gate.dx*2,z:gate.z-gate.dz*2,y:gate.y},b={...a,x:gate.x+gate.dx*2,z:gate.z+gate.dz*2};assert.ok(crosses(a,b,gate));assert.ok(!crosses(b,a,gate)&&!crosses({...a,y:100},{...b,y:100},gate));
 const buffer=new PoseBuffer();buffer.push({...emptyPose(),x:0,seq:1,heading:Math.PI-.05},0);buffer.push({...emptyPose(),x:10,seq:2,heading:-Math.PI+.05},100);buffer.push({...emptyPose(),x:99,seq:1},150);assert.equal(buffer.samples.length,2);assert.equal(buffer.sample(150)!.x,5);assert.ok(Math.abs(Math.abs(buffer.sample(150)!.heading)-Math.PI)<.01);
 buffer.push({...emptyPose(),x:500,z:0,epoch:1,seq:3,speed:30},200);assert.equal(buffer.samples.length,1);assert.equal(buffer.sample(300)!.x,500);const late=buffer.sample(10000)!;assert.equal(late.z,-6);assert.deepEqual(late,buffer.sample(20000));
 console.log('PASS directional/elevated gates, missing/reordered frames, heading wrap, reset snaps and bounded extrapolation');
}
