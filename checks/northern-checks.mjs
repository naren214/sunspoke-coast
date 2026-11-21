import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtemp, unlink, rmdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const temporary=await mkdtemp(join(tmpdir(),'sunspoke-north-'));
const outfile=join(temporary,'north-check.mjs');
try{
  await build({stdin:{contents:`
    import assert from 'node:assert/strict';
    import {PerspectiveCamera,Raycaster,Vector3} from 'three';
    import {createWorld} from './src/world.ts';
    import {Driving,ChaseCamera} from './src/driving.ts';
    import {driveRoad} from './src/qa.ts';
    import {GALLERY,RIVER,riverAt,isLand,waterLevel} from './src/geography.ts';
    globalThis.document={createElement(){return {width:0,height:0,getContext(){return new Proxy({createLinearGradient:()=>({addColorStop(){}}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>k in o?o[k]:()=>{}});}};}};
    const world=createWorld(),gallery=world.group.getObjectByName('NAREN Grand Drive-in Gallery');
    const stats=world.group.userData.northernDevelopment;
    assert.ok(stats.homes>=16&&stats.shops>=8&&stats.lakeTowers>=10&&stats.addedStreetlights>=600);
    assert.ok(stats.riverLength>1000&&RIVER.width>=50);
    assert.ok(world.group.getObjectByName('Verde River water')&&world.group.getObjectByName('Silver Lake water'));
    const bridge=world.roads.find(r=>r.name==='Verde Skyline Bridge');
    for(const p of bridge.points)if(riverAt(p.x,p.z).distance<RIVER.width/2)assert.ok(p.y>=waterLevel(p.x,p.z)+5.5,'Bridge must clear the river');
    assert.equal(gallery.userData.artworks,8);assert.equal(world.dynamicColliders.length,4);
    console.log('PASS town, modern lake skyline, river, bridge clearance and county lighting',JSON.stringify(stats));
    const input={forward:true,backward:false,left:false,right:false,handbrake:false};
    const highway=world.roads.find(r=>r.name==='Sierra Coast Highway');
    const galleryApproach=world.roads.find(r=>r.name==='Gallery Sierra Approach');
    for(const [cx,cz] of [[210,-1060],[480,-1060],[480,-1350]]){
      const center=world.surfaceHeight(cx,cz);
      for(const dx of [-5,0,5])for(const dz of [-5,0,5]){
        assert.ok(Math.abs(world.surfaceHeight(cx+dx,cz+dz)-center)<.025,'A junction landing must be flat across both lanes at '+[cx,cz]);
      }
    }
    for(const [road,inTransition] of [
      [highway,()=>true],
      [world.roads.find(r=>r.name==='Verde North Approach'),()=>true],
      [world.roads.find(r=>r.name==='Isla Verde Causeway'),()=>true],
      [galleryApproach,p=>p.x<=675]
    ])for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i];
      if(!inTransition(a)||!inTransition(b))continue;
      const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
      for(const lane of [-road.width/4,0,road.width/4]){
        const x=dz/length*lane,z=-dx/length*lane;
        const grade=(world.surfaceHeight(b.x+x,b.z+z)-world.surfaceHeight(a.x+x,a.z+z))/length;
        assert.ok(Math.abs(grade)<.18,road.name+' has an abrupt lane grade: '+grade);
      }
    }
    const islandLoop=world.roads.find(r=>r.name==='Isla Verde Waterfront Loop');
    for(const p of islandLoop.points)assert.ok(Math.abs(world.surfaceHeight(p.x,p.z)-14)<.025,'Island loop follows its flat road deck');
    world.group.updateMatrixWorld(true);
    const roadMeshes=world.group.children.filter(o=>o.name==='Road asphalt'||o.name==='Base terrain');
    for(let i=1;i<bridge.points.length;i++){
      const a=bridge.points[i-1],b=bridge.points[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
      for(const t of [.15,.85])for(const lane of [-5.5,0,5.5]){
        const x=a.x+t*dx+dz/len*lane,z=a.z+t*dz-dx/len*lane,y=world.surfaceHeight(x,z);
        const ray=new Raycaster(new Vector3(x,y+.8,z),new Vector3(0,-1,0),0,1);
        const top=ray.intersectObjects(world.group.children,false)[0];
        assert.ok(top&&Math.abs(top.point.y-y-.06)<.08,'Bridge structure stays below visible pavement at '+[x,z]);
      }
    }
    const sierraCrossings=[
      {from:[-65,-235],to:[-65,-278],lanes:[-4.5,0,4.5]},
      {from:[190,-1057.8],to:[232,-1062],lanes:[-4.5,0,4.5]},
      {from:[458,-1066],to:[501,-1051],lanes:[-4.5,0,4.5]},
      {from:[609,-977],to:[629,-943],lanes:[-4.5,0,4.5]},
      {from:[617,-987],to:[630,-944],lanes:[0]}
    ];
    for(const {from,to,lanes} of sierraCrossings)for(const lane of lanes)for(const reverse of [false,true]){
      const dx=to[0]-from[0],dz=to[1]-from[1],length=Math.hypot(dx,dz),direction=reverse?-1:1;
      const start=reverse?to:from,x=start[0]+dz/length*lane,z=start[1]-dx/length*lane;
      const car=new Driving(world),entry=new Vector3(x,world.surfaceHeight(x,z),z);
      car.teleport(entry,Math.atan2(-dx*direction,-dz*direction),true);
      // Build up approach speed through the real throttle while holding the start position.
      for(let i=0;i<1000&&car.state.speed<40;i++){
        car.step(1/60,input);
        car.state.position.copy(entry);
      }
      assert.ok(car.state.speed>=40,'Reach 144 km/h at the junction approach');
      let progress=0;
      for(let i=0;i<100&&progress<length;i++){
        car.step(1/60,input);
        const {position,speed,airborne}=car.state;
        assert.ok(!airborne&&speed>=40,'Stay grounded and keep speed through the Sierra Verde junction');
        if(i%10===0){
          const ray=new Raycaster(new Vector3(position.x,position.y+5,position.z),new Vector3(0,-1,0));
          const top=ray.intersectObjects(roadMeshes,false)[0];
          assert.ok(top?.object.name==='Road asphalt'&&Math.abs(top.point.y-position.y-.06)<.03,'Visible asphalt follows the drivable height');
        }
        progress=((position.x-x)*dx+(position.z-z)*dz)*direction/length;
      }
      assert.ok(progress>=length,'Complete the Sierra Verde junction crossing');
    }
    console.log('PASS coast-to-Sierra lane grades, asphalt clearance and 26 crossings at 144 km/h or faster');
    const far=new Vector3(-65,0,210),front=-910,rear=-1050;
    const step=(position,seconds)=>{for(let i=0;i<seconds*60;i++)world.stepEnvironment(1/60,position);};
    step(far,4);assert.ok(gallery.userData.doors.every(d=>d.open===0));
    const portal=new Vector3(930,24.08,front);
    step(portal,1);assert.equal(gallery.userData.doors[1].open,1);
    step(portal,10);assert.equal(gallery.userData.doors[1].open,1,'Occupancy must prevent closing onto a car');
    step(far,5);assert.ok(gallery.userData.doors.every(d=>d.open===0));
    console.log('PASS sensor opening, occupancy hold and delayed closure');
    const blocked=new Driving({...world,stepEnvironment:undefined});blocked.state.position.set(930,24.08,-890);
    for(let i=0;i<240;i++)blocked.step(1/60,input);
    assert.ok(blocked.state.position.z>front+2.4,'Closed door is a physical obstacle');
    function traverse(start,heading,hz=60){
      step(far,5);
      const d=new Driving(world);d.state.position.set(930,world.surfaceHeight(930,start),start);d.state.heading=heading;
      let airborne=false,minSpeed=Infinity;
      for(let i=0;i<hz*12;i++){
        d.step(1/hz,input);airborne ||=d.state.airborne;
        if(d.state.position.z<front-5&&d.state.position.z>rear+5)minSpeed=Math.min(minSpeed,d.state.speed);
        if(heading===0?d.state.position.z<rear-25:d.state.position.z>front+25)break;
      }
      assert.ok(heading===0?d.state.position.z<rear-25:d.state.position.z>front+25,'Car must pass through both doors and the interior');
      assert.ok(!airborne&&minSpeed>3,'Interior floor is continuous and clear');
      return d;
    }
    const north=traverse(-855,0),south=traverse(-1080,Math.PI);
    const north30=traverse(-855,0,30),north120=traverse(-855,0,120);
    // Compare at a common duration so different render frequencies cannot hide timing errors.
    function fixed(hz){step(far,5);const d=new Driving(world);d.state.position.set(930,world.surfaceHeight(930,-855),-855);for(let i=0;i<hz*7;i++)d.step(1/hz,input);return d.state.position.clone();}
    assert.ok(fixed(30).distanceTo(fixed(120))<.02);
    console.log('PASS physical closed-door collision and bidirectional drive-through at 30/60/120 Hz',JSON.stringify({north:north.state.position.toArray(),south:south.state.position.toArray()}));
    const routes=[];
    for(const name of ['Sierra Coast Highway','Verde North Approach','Verde South Approach','Verde Bridge Approach','Isla Verde Causeway','Verde Skyline Bridge','Gallery Lake Approach','Grand Gallery Drive','Gallery Sierra Approach','Silver East Promenade']){
      const road=world.roads.find(r=>r.name===name);
      for(const reverse of [false,true]){
        step(far,5);const result=driveRoad(world,{...road,points:reverse?[...road.points].reverse():road.points});
        assert.ok(result.passed,name+' must be drivable in both directions: '+JSON.stringify(result));routes.push({name,reverse,seconds:result.seconds});
      }
    }
    console.log('PASS continuous Sierra, bridge, lakefront and gallery-access traversals',JSON.stringify(routes));
    const car=new Driving(world);car.state.position.set(930,24.08,-980);
    const camera=new PerspectiveCamera(55,16/9,.2,1800),chase=new ChaseCamera(camera,world);
    for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const pitch of [.14,.6,1.1]){
      for(let i=0;i<60;i++)chase.update(1/60,car.state,{yaw,pitch,distance:16});
      assert.ok(camera.position.y<24+GALLERY.clearance-.3&&camera.position.y>24.5,'Camera must remain inside the hall');
      assert.ok(camera.position.toArray().every(Number.isFinite));
    }
    const before=JSON.stringify(gallery.userData.doors);for(let i=0;i<120;i++)car.renderState();
    assert.equal(JSON.stringify(gallery.userData.doors),before,'Pause/render-only frames do not advance doors');
    const recovery=new Driving(world);recovery.state.position.set(930,24.08,-980);
    for(let i=0;i<120;i++)recovery.step(1/60,{...input,forward:false});
    recovery.state.position.set(940,24.08,-980);recovery.reset();assert.ok(Math.abs(recovery.state.position.x-930)<.1&&Math.abs(recovery.state.position.z+980)<.1,'Overhead roof must not prevent interior reset positions');
    console.log('PASS interior camera orbit and paused door state');
    for(const setting of ['golden','twilight','night'])world.update(3,setting,car.state.position);
    assert.equal(world.group.userData.lightSources>800,true);
    console.log('PASS all three lighting presets update the gallery, river and streetlights');
  `,loader:'js',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,platform:'node',format:'esm',outfile});
  const result=spawnSync(process.execPath,[outfile],{encoding:'utf8',timeout:120000});
  process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');
  if(result.error)throw result.error;
  if(result.status)process.exitCode=result.status;
  const credits=JSON.parse(await readFile(new URL('../public/gallery/credits.json',import.meta.url),'utf8'));
  const entries=Array.isArray(credits)?credits:credits.images??credits.assets;
  assert.ok(entries?.length===8,'Eight local gallery assets must have credits');
  for(const art of entries){
    const filename=art.file??art.filename??art.src?.split('/').at(-1);
    assert.ok((await stat(new URL('../public/gallery/'+filename,import.meta.url))).size>1000);
  }
  console.log('PASS eight bundled image files and attribution records');
}finally{await unlink(outfile).catch(()=>{});await rmdir(temporary);}
