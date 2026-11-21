import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const temporary=await mkdtemp(join(tmpdir(),'sunspoke-landscape-')),outfile=join(temporary,'landscape.mjs');
try{
  await build({stdin:{contents:`
    import assert from 'node:assert/strict';
    import {Vector3,Matrix4,Raycaster} from 'three';
    import {createWorld} from './src/world.ts';
    import {createRoadIndex} from './src/road-grading.ts';
    import {landHeight,isLand,insideGallery} from './src/geography.ts';
    import {insideStunt} from './src/stunt.ts';
    globalThis.document={createElement(){return {width:0,height:0,getContext(){return new Proxy({createLinearGradient:()=>({addColorStop(){}}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>k in o?o[k]:()=>{}});}};}};
    const start=performance.now(),world=createWorld(),constructionMs=performance.now()-start;
    const index=createRoadIndex(world.roads,landHeight),grass=world.group.getObjectByName('County grass meadows'),stats=world.group.userData.roadImprovements;
    console.log('Landscape',JSON.stringify({constructionMs:Math.round(constructionMs),grass:grass.userData,roads:stats}));
    assert.ok(grass.userData.tufts>40000&&grass.userData.chunks>400);
    assert.equal(stats.roads,world.roads.length);assert.equal(stats.styles.access,5);assert.ok(stats.junctions>40&&stats.crosswalks>60&&stats.arrows>100&&stats.reflectors>500&&stats.curbSegments>1000&&stats.airfieldMarkings>50);
    assert.equal(stats.styles.freeway,1);assert.equal(stats.styles.airfield,3);assert.equal(stats.styles.interior,1);
    const matrix=new Matrix4(),point=new Vector3();let checked=0,north=0,urban=0,island=0;
    for(const mesh of grass.children){
      assert.equal(mesh.castShadow,false);assert.ok(Array.from(mesh.geometry.attributes.color.array).every(v=>v>.5));
      for(let i=0;i<mesh.instanceMatrix.count;i++){
        mesh.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);
        assert.ok(point.toArray().every(Number.isFinite));
        assert.ok(isLand(point.x,point.z)&&!insideGallery(point.x,point.z,7.9)&&!insideStunt(point.x,point.z,5.9));
        assert.ok(index.clear(point.x,point.z,4.19),'No grass blades in driving lanes, shoulders or sidewalks');
        assert.ok(Math.abs(point.y-world.groundHeight(point.x,point.z)+.015)<.001,'Tufts follow the graded terrain');
        if(point.z< -500&&point.x<620)north++;if(point.x>400&&point.x<1000&&Math.abs(point.z)<400)urban++;if(point.z>845&&point.x<410)island++;checked++;
      }
    }
    assert.equal(checked,grass.userData.tufts);assert.ok(north>1000&&urban>500&&island>100);
    console.log('PASS all grass placements clear roads, water, gallery and stunt arena',JSON.stringify({checked,north,urban,island}));
    const terrain=world.group.children.filter(m=>m.name==='Base terrain');assert.ok(terrain.some(m=>m.material.name==='County meadow grass'));
    const samples=[];
    for(const quality of ['low','medium','high']){
      world.setQuality(quality);world.update(5,'golden',new Vector3(600,0,-850));
      samples.push({quality,visible:grass.children.filter(m=>m.visible).length,instances:grass.children.reduce((sum,m)=>sum+(m.visible?m.count:0),0)});
    }
    assert.ok(samples[0].instances<samples[1].instances&&samples[1].instances<samples[2].instances&&samples[0].visible<samples[2].visible);
    console.log('PASS three grass detail presets with distance culling',JSON.stringify(samples));
    world.group.updateMatrixWorld(true);
    const asphalt=world.group.children.filter(m=>m.name==='Road asphalt'),edges=world.group.children.filter(m=>m.name==='Road underlay'||m.name==='Raised road curbs');
    let roadSamples=0;const issues=[];
    for(const road of world.roads)for(let i=0;i<road.points.length-1;i+=28){
      const a=road.points[i],b=road.points[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
      for(const lane of [-.25,0,.25]){
        const x=a.x+dx*.08+dz/len*road.width*lane,z=a.z+dz*.08-dx/len*road.width*lane;
        if(insideGallery(x,z)||insideStunt(x,z,2))continue;
        const ray=new Raycaster(new Vector3(x,a.y+80,z),new Vector3(0,-1,0)),top=ray.intersectObjects(asphalt,false)[0],under=ray.intersectObjects(edges,false)[0];
        if(!top||under&&under.point.y>top.point.y+.025)issues.push({road:road.name,x,z,asphalt:top?.point.y,edge:under?.point.y});roadSamples++;
      }
    }
    console.log('Road surface coverage',JSON.stringify({roadSamples,issues:issues.slice(0,8)}));
    assert.equal(issues.length,0,'Asphalt covers lanes continuously and raised edges stay outside them');
    // At these cuts, coarse terrain triangles used to poke through the pavement.
    for(const [x,z] of [[1037,-249.2],[451.1,385.3],[483.9,272.3],[932.8,-1104.6],[655.3,-771.1],[767.6,-718.9]]){
      const surface=world.surfaceHeight(x,z),ray=new Raycaster(new Vector3(x,surface+10,z),new Vector3(0,-1,0));
      const top=ray.intersectObjects([...asphalt,...terrain],false)[0];
      assert.ok(top?.object.name==='Road asphalt'&&Math.abs(top.point.y-surface-.06)<.08,'Visible pavement matches the driving surface at '+[x,z]);
    }
    for(const name of ['Road lane paint and crossings','Road centre paint','Road reflective studs']){
      const mesh=world.group.getObjectByName(name);assert.ok(mesh&&Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));
    }
    console.log('PASS curved-road seams, lane coverage, sidewalk clearance and finite road geometry');
  `,loader:'js',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,platform:'node',format:'esm',outfile});
  const result=spawnSync(process.execPath,[outfile],{encoding:'utf8',timeout:120000});process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{await unlink(outfile).catch(()=>{});await rmdir(temporary);}
