import assert from 'node:assert/strict';
import { Driving, ChaseCamera } from '../src/driving.ts';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import type { World } from '../src/types.ts';

const world:World={group:new Group(),bounds:{minX:-1e5,maxX:1e5,minZ:-1e5,maxZ:1e5},colliders:[],roads:[],groundHeight:()=>0,update(){}};
const forward={forward:true,backward:false,left:false,right:false,handbrake:false};
const orbit={yaw:0,pitch:0.34,distance:9.5};

for(const hz of [60,90,120,144,165]){
  const drive=new Driving(world);
  for(let i=0;i<480;i++)drive.step(1/60,forward);
  const camera=new PerspectiveCamera(55,16/9,0.2,1800),chase=new ChaseCamera(camera,world);
  const direction=new Vector3(),angles:number[]=[];
  let oldZ=drive.state.position.z,stalls=0;
  for(let i=0;i<hz*3;i++){
    drive.step(1/hz,forward);
    const state=drive.renderState();
    chase.update(1/hz,state,orbit);
    if(i<hz*2)continue;
    camera.getWorldDirection(direction);
    angles.push(Math.atan2(direction.y,Math.hypot(direction.x,direction.z)));
    if(Math.abs(state.position.z-oldZ)<1e-8)stalls++;
    oldZ=state.position.z;
  }
  const jitter=angles.slice(2).map((angle,i)=>Math.abs(angle-2*angles[i+1]+angles[i]));
  const rmsDegrees=Math.sqrt(jitter.reduce((sum,x)=>sum+x*x,0)/jitter.length)*180/Math.PI;
  assert.equal(stalls,0,`${hz} Hz must not repeat car poses while moving`);
  assert.ok(rmsDegrees<0.001,`${hz} Hz camera jitter ${rmsDegrees} degrees`);
  console.log(`PASS ${hz} Hz: no repeated poses, camera RMS jitter ${rmsDegrees.toFixed(8)} degrees`);
}

const variable=new Driving(world);
for(let i=0;i<240;i++)variable.step(1/60,forward);
let previousZ=variable.renderState().position.z;
for(let i=0;i<300;i++){
  variable.step([1/90,1/144,1/50,1/165,1/75][i%5],forward);
  const visual=variable.renderState();
  assert.ok(visual.position.z<previousZ,'Variable frame times must keep visual motion continuous');
  assert.ok(visual.position.distanceTo(variable.state.position)<0.7,'Rendering must stay within one physics step');
  previousZ=visual.position.z;
}
const physical=JSON.stringify(variable.state);
for(let i=0;i<20;i++)variable.renderState();
assert.equal(JSON.stringify(variable.state),physical,'Rendering or paused frames must not change physics');
variable.reset();
assert.ok(variable.renderState().position.equals(variable.state.position),'Reset must discard the old visual pose');
assert.equal(variable.renderState().speed,0);
variable.state.position.set(100,5,50);variable.state.heading=-2;
assert.ok(variable.renderState().position.equals(variable.state.position),'Teleport must snap, not sweep across the map');

const turn=new Driving(world);
for(let i=0;i<150;i++)turn.step(1/60,forward);
turn.state.heading=Math.PI-0.01;
let oldHeading=turn.renderState().heading,crossed=false;
for(let i=0;i<120;i++){
  turn.step(1/120,{...forward,left:true});
  const heading=turn.renderState().heading;
  assert.ok(Math.abs(heading)>2,'A turn through the angle wrap must not spin through zero');
  assert.ok(Math.abs(Math.atan2(Math.sin(heading-oldHeading),Math.cos(heading-oldHeading)))<0.05);
  if(turn.state.heading<0)crossed=true;
  oldHeading=heading;
}
assert.ok(crossed);
console.log('PASS variable frame times, pause, reset, teleport and heading-wrap presentation');
