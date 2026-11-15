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
    import { InstancedMesh, Vector3 } from 'three';
    import { createWorld } from './src/world.ts';
    import { validateRoads } from './src/qa.ts';
    globalThis.document = { createElement() { return { width:0, height:0, getContext() {
      return new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},
        {get:(target,key)=>key in target ? target[key] : ()=>{}});
    } }; } };
    const world=createWorld(), b=world.bounds;
    assert.equal((b.maxX-b.minX)*(b.maxZ-b.minZ)/202120,1.5);
    assert.equal(world.roads.length,9);
    assert.ok(world.roads.some(r=>r.points.some(p=>p.x>340)));
    const crowd=world.group.getObjectByName('Adult beachgoers');
    assert.equal(crowd.userData.adults,84);
    assert.ok(crowd.userData.walkers>0 && crowd.userData.bikini>0 && crowd.userData.thong>0);
    for(const time of [0,0.1,50]) {
      world.update(time,'golden',new Vector3(-65,0,110));
      crowd.traverse(o=>{if(o instanceof InstancedMesh)assert.ok(Array.from(o.instanceMatrix.array).every(Number.isFinite));});
    }
    console.log('PASS 1.5x city footprint, connected inland roads and animated adult beach crowd');
    const result=validateRoads(world);
    console.log(JSON.stringify(result));
    assert.ok(result.passed,'Every road probe and all four continuous laps must pass');
  `, loader: 'js', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
    bundle: true, platform: 'node', format: 'esm', outfile });
  const result = spawnSync(process.execPath, [outfile], { encoding: 'utf8', timeout: 60000 });
  process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await unlink(outfile).catch(() => {}); await rmdir(temporary); }
