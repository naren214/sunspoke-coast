import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const temporary = await mkdtemp(join(tmpdir(), 'sunspoke-world-'));
const outfile = join(temporary, 'world-check.mjs');
try {
  await build({ stdin: { contents: `
    import assert from 'node:assert/strict';
    import { InstancedMesh, Vector3, Raycaster } from 'three';
    import { createWorld } from './src/world.ts';
    import { validateRoads,validateConnectivity } from './src/qa.ts';
    import { Driving } from './src/driving.ts';
    import { CITY } from './src/city.ts';
    import { COUNTY_ROADS } from './src/county-roads.ts';
    globalThis.document = { createElement() { return { width:0, height:0, getContext() {
      return new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},
        {get:(target,key)=>key in target ? target[key] : ()=>{}});
    } }; } };
    const world=createWorld(), b=world.bounds;
    world.group.updateMatrixWorld(true);
    const terrain=world.group.children.filter(o=>o.name==='Base terrain'||o.name==='Road underlay');
    for(const z of [-90,-45,0,45,90]){
      const ray=new Raycaster(new Vector3(-65,20,z),new Vector3(0,-1,0));
      const hits=ray.intersectObjects(terrain,false);
      assert.ok(hits.length&&hits.every(hit=>hit.point.y<=world.groundHeight(-65,z)+0.03), 'Compound terrain and sidewalk underlay must stay below the beachfront asphalt');
    }
    const asphalt=world.group.children.filter(o=>o.name==='Road asphalt');
    let surfaceSamples=0;const covers=[];
    for(const road of world.roads)for(let i=2;i<road.points.length-2;i+=20){
      const p=road.points[i],ray=new Raycaster(new Vector3(p.x,p.y+60,p.z),new Vector3(0,-1,0));
      const top=ray.intersectObjects(asphalt,false)[0],under=ray.intersectObjects(terrain,false)[0];
      if(top&&under&&under.point.y>top.point.y+0.015)covers.push({road:road.name,x:p.x,z:p.z,overlap:under.point.y-top.point.y});
      surfaceSamples++;
    }
    console.log(JSON.stringify({surfaceSamples,overlaps:covers.slice(0,10)}));
    assert.equal(covers.length,0,'County terrain and sidewalks must not cover the drivable asphalt');
    assert.equal((b.maxX-b.minX)*(b.maxZ-b.minZ),CITY.area);
    assert.equal(world.roads.length,9+COUNTY_ROADS.length);
    assert.ok(world.roads.some(r=>r.points.some(p=>p.x>340)));
    const crowd=world.group.getObjectByName('Adult beachgoers');
    assert.equal(crowd.userData.adults,84);
    assert.ok(crowd.userData.walkers>0 && crowd.userData.bikini>0 && crowd.userData.thong>0);
    assert.ok(world.group.getObjectByName('RAMP TIME welcome arch'));
    assert.equal(world.surfaceHeight(-101,14),5.1);
    assert.equal(world.groundHeight(-101,0),-2.5);
    const forward={forward:true,backward:false,left:false,right:false,handbrake:false};
    const entry=new Driving(world);entry.state.position.set(-46,0,0);entry.state.heading=Math.PI/2;
    for(let i=0;i<600&&entry.state.position.x>-71;i++)entry.step(1/60,forward);
    for(let i=0;i<180;i++)entry.step(1/60,{...forward,forward:false,brake:true});
    assert.ok(entry.state.position.x<-76&&entry.state.position.x>-91,'City entrance must lead through the arch into the return lane');
    const flight=new Driving(world);flight.state.position.set(-101,0.1,82);
    for(let i=0;i<600&&!flight.state.airborne;i++)flight.step(1/60,forward);
    const launchSpeed=flight.state.speed,launchHeading=flight.state.heading;
    for(let i=0;i<30;i++)flight.step(1/60,{...forward,left:true,handbrake:true});
    assert.ok(flight.state.airborne&&Math.abs(flight.state.heading-launchHeading)<1e-8,'No tire steering force while airborne');
    assert.ok(flight.state.speed>launchSpeed*0.97,'Airborne brakes must not erase launch momentum');
    function jump(start,hz=60){
      const drive=new Driving(world);drive.state.position.set(-101,0.1,start);
      let launch,land,peak=0,airFrames=0;
      for(let i=0;i<hz*15;i++){
        const wasAir=drive.state.airborne;
        drive.step(1/hz,{...forward,forward:!launch,brake:Boolean(land)});
        if(!wasAir&&drive.state.airborne&&!launch)launch={z:drive.state.position.z,speed:drive.state.speed,y:drive.state.position.y};
        if(drive.state.airborne){airFrames++;peak=Math.max(peak,drive.state.position.y);}
        if(wasAir&&!drive.state.airborne&&!land)land={z:drive.state.position.z,y:drive.state.position.y,speed:drive.state.speed};
        if(land&&drive.state.speed<0.01)break;
      }
      return {drive,launch,land,peak,airFrames};
    }
    const successful=jump(82);
    assert.ok(successful.launch&&successful.land&&successful.airFrames>30,'Launch must produce sustained flight');
    assert.ok(successful.peak>successful.launch.y+0.5);
    assert.ok(successful.land.z < -12 && successful.land.y>=0.1,'Clear the water and land on the far side');
    assert.ok(successful.drive.state.position.z>-95,'Brake to a stop inside the compound');
    const undershoot=jump(40);
    assert.ok(undershoot.land&&undershoot.land.y===-2.5,'Slow launch must fall into the recessed gap, not snap onto the landing');
    undershoot.drive.reset();
    assert.ok(!undershoot.drive.state.airborne&&undershoot.drive.state.verticalSpeed===0&&undershoot.drive.state.position.x===-65);
    const jump30=jump(82,30),jump120=jump(82,120);
    assert.ok(jump30.drive.state.position.distanceTo(jump120.drive.state.position)<0.02,'Jump physics must be independent of render frequency');
    console.log('PASS real takeoff, airborne arc, landing, braking, undershoot, reset and frame-rate independent jump');
    console.log(JSON.stringify({launch:successful.launch,landing:successful.land,peakHeight:successful.peak,airSeconds:successful.airFrames/60,stop:successful.drive.state.position.toArray()}));
    for(const time of [0,0.1,50]) {
      world.update(time,'golden',new Vector3(-65,0,110));
      crowd.traverse(o=>{if(o instanceof InstancedMesh)assert.ok(Array.from(o.instanceMatrix.array).every(Number.isFinite));});
    }
    console.log('PASS county footprint, expanded road network and animated adult beach crowd');
    const connectivity=validateConnectivity(world);console.log(JSON.stringify({connectivity}));assert.ok(connectivity.passed,'Every district must be reachable from the starting road network');
    const result=validateRoads(world);
    console.log(JSON.stringify({passed:result.passed,roadCount:result.roadCount,probes:result.probes,failedProbes:result.failedProbes,lengthM:result.routes.reduce((sum,r)=>sum+r.lengthM,0),laps:result.routes.filter(r=>r.continuousLap).map(r=>({road:r.road,...r.continuousLap})),innerLap:result.innerLap,districtLap:result.districtLap,expandedLap:result.expandedLap,failures:result.failures}));
    assert.ok(result.passed,'Every road probe and all four continuous laps must pass');
  `, loader: 'js', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
    bundle: true, platform: 'node', format: 'esm', outfile });
  const result = spawnSync(process.execPath, [outfile], { encoding: 'utf8', timeout: 120000 });
  process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await unlink(outfile).catch(() => {}); await rmdir(temporary); }
