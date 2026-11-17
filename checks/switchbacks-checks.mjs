import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),output=fileURLToPath(new URL('../.cache/switchbacks-check.mjs',import.meta.url));
await build({stdin:{resolveDir:root,loader:'ts',contents:`
import assert from 'node:assert/strict';import{createCanvas,GlobalFonts}from'@napi-rs/canvas';import{Vector3,Scene}from'three';
import{createWorld}from'./src/world';import{createRoadIndex}from'./src/road-grading';import{driveRoad}from'./src/qa';
import{gatesFor}from'./shared/protocol';import{turnGuidance}from'./shared/navigation';import{createTurnMarkers}from'./src/turn-markers';import catalog from'./shared/tracks.json';
globalThis.document={createElement:()=>createCanvas(1,1)};GlobalFonts.registerFromPath('public/fonts/barlow.ttf','Barlow');
const world=createWorld(),index=createRoadIndex(world.roads,world.groundHeight),track=catalog.tracks.find(t=>t.id==='downtown-switchbacks');assert.ok(track);assert.equal(track.turns.length,12);assert.equal(track.closed,true);
const distances=[0];for(let i=1;i<track.points.length;i++){const a=track.points[i-1],b=track.points[i];const d=Math.hypot(a[0]-b[0],a[2]-b[2]);assert.ok(d>0&&d<3.1);distances.push(distances.at(-1)+d);}
assert.ok(distances.at(-1)>2200&&distances.at(-1)<2300);assert.deepEqual(track.points[0],track.points.at(-1));
let laneProbes=0;for(const [x,y,z]of track.points){const near=index.nearest(x,z);assert.ok(near.distance+2.8<=near.width/2,'Race footprint must stay inside the existing road');assert.ok(Math.abs(y-world.surfaceHeight(x,z))<.01);laneProbes++;}
const gates=gatesFor(track);for(let i=1;i<gates.length;i++)assert.ok(gates[i].distance-gates[i-1].distance>=11.99,'Avoid checkpoint skips at high speed');
const nextAt=s=>{const i=gates.findIndex(g=>g.distance>s);return i<0?gates.length:i;};
const at=s=>{let i=1;while(distances[i]<s)i++;const a=track.points[i-1],b=track.points[i],f=(s-distances[i-1])/(distances[i]-distances[i-1]);return {x:a[0]+(b[0]-a[0])*f,z:a[2]+(b[2]-a[2])*f};};
for(const [i,turn]of track.turns.entries()){const s=turn.distance-40,hint=turnGuidance(track,at(s),nextAt(s));assert.equal(hint.index,i);assert.equal(hint.turn.direction,turn.direction);assert.ok(hint.distance>=38&&hint.distance<=42);}
const repeated=[];for(let i=0;i<track.points.length;i++){const p=track.points[i];if(Math.abs(p[0]-720)<.001&&Math.abs(p[2]+10)<2)if(!repeated.length||distances[i]-repeated.at(-1)>100)repeated.push(distances[i]);}
assert.equal(repeated.length,2);assert.equal(turnGuidance(track,{x:720,z:-10},nextAt(repeated[0])).index,2);assert.equal(turnGuidance(track,{x:720,z:-10},nextAt(repeated[1])).index,8);
assert.ok(turnGuidance(track,{x:1200,z:500},0).offRoute);
const scene=new Scene(),markers=createTurnMarkers(scene,track);assert.equal(markers.root.children.length,12);markers.setCurrent(2,true);assert.deepEqual(markers.root.children.flatMap((g,i)=>g.visible?[i]:[]),[2,3]);markers.dispose();assert.ok(!scene.children.length);
const lap=driveRoad(world,{points:track.points.map(p=>new Vector3(...p)),width:track.width});assert.ok(lap.passed,JSON.stringify(lap));
console.log('PASS Downtown Switchbacks: 12 rounded turns, existing-road clearance, ordered checkpoints, repeated-street guidance, chevron selection/disposal and continuous keyboard-driven lap',JSON.stringify({laneProbes,meters:Math.round(distances.at(-1)),gates:gates.length,lap}));
`},bundle:true,platform:'node',format:'esm',packages:'external',outfile:output});
const result=spawnSync(process.execPath,[output],{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:1e6});process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');if(result.error)throw result.error;process.exit(result.status??1);
