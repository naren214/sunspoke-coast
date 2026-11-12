import assert from 'node:assert/strict';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { ChaseCamera, Driving } from '../src/driving.ts';
import type { DriveInput } from '../src/driving.ts';
import type { Collider, World } from '../src/types.ts';
import { VEHICLE } from '../src/vehicle.ts';

const idle: DriveInput = { forward: false, backward: false, left: false, right: false, handbrake: false };
const forward = { ...idle, forward: true }, backward = { ...idle, backward: true };
const orbit = { yaw: 0, pitch: 0.34, distance: 9.5 };

function makeWorld(colliders: Collider[] = [], groundHeight: World['groundHeight'] = () => 0): World {
  return { group: new Group(), colliders, groundHeight, update() {},
    roads: [{ width: 16, points: [new Vector3(-65, 0, -280), new Vector3(-65, 0, 280)] }] };
}

function run(drive: Driving, seconds: number, input = idle, hz = 60) {
  for (let i = 0; i < Math.round(seconds * hz); i++) drive.step(1 / hz, input);
}

function test(name: string, check: () => void) {
  check();
  console.log('PASS', name);
}

function motionStep(drive: Driving, input: DriveInput) {
  const before = drive.state.position.clone();
  drive.step(1 / 60, input);
  const velocity = drive.state.position.clone().sub(before).multiplyScalar(60);
  const { heading } = drive.state;
  const lateral = Math.abs(velocity.x * Math.cos(heading) - velocity.z * Math.sin(heading));
  const longitudinal = Math.abs(-velocity.x * Math.sin(heading) - velocity.z * Math.cos(heading));
  return { lateral, angle: Math.atan2(lateral, longitudinal) * 180 / Math.PI, speed: velocity.length() };
}

test('city steering turns promptly and recentres after releasing the key', () => {
  const drive = new Driving(makeWorld());
  run(drive, 1, forward);
  run(drive, 0.2, { ...idle, left: true });
  assert.ok(drive.state.steering > 0.4, `steering response ${drive.state.steering}`);
  run(drive, 0.2, { ...idle, left: true });
  assert.ok(drive.state.heading > 0.65, `city turn angle ${drive.state.heading}`);
  run(drive, 0.3, idle);
  assert.ok(Math.abs(drive.state.steering) < 0.03);
});

test('left and right inputs apply five times the bicycle-model turn rate', () => {
  for (const left of [true, false]) {
    const drive = new Driving(makeWorld());
    run(drive, 0.8, forward);
    const before = drive.state.heading;
    drive.step(1 / 60, { ...forward, left, right: !left });
    const rate = (drive.state.heading - before) * 60;
    const baseline = drive.state.speed * Math.tan(drive.state.steering) / VEHICLE.wheelbase;
    assert.ok(Math.abs(rate / baseline - 5) < 0.02);
  }
});

test('traction limits drift and eases throttle in medium and high-speed corners', () => {
  for (const accelerationSeconds of [3, 8]) {
    const drive = new Driving(makeWorld());
    run(drive, accelerationSeconds, forward);
    let peakAngle = 0, peakLateral = 0;
    for (let i = 0; i < 72; i++) {
      const motion = motionStep(drive, { ...forward, left: true });
      peakAngle = Math.max(peakAngle, motion.angle);
      peakLateral = Math.max(peakLateral, motion.lateral);
    }
    assert.ok(peakAngle < (accelerationSeconds === 8 ? 1.5 : 2), `sideslip ${peakAngle}`);
    assert.ok(peakLateral < 0.8, `lateral speed ${peakLateral}`);
    assert.ok(drive.state.throttle < 0.35, `corner throttle ${drive.state.throttle}`);
    console.log(`  ${accelerationSeconds}s launch: ${peakAngle.toFixed(3)} degrees, ${peakLateral.toFixed(3)} m/s lateral`);
  }
});

test('rapid steering reversals stay planted at high speed', () => {
  const drive = new Driving(makeWorld());
  run(drive, 8, forward);
  let peakAngle = 0;
  for (const [seconds, left] of [[0.6, true], [1.2, false], [1.2, true], [0.6, false]] as const) {
    for (let i = 0; i < seconds * 60; i++) {
      const motion = motionStep(drive, { ...forward, left, right: !left });
      peakAngle = Math.max(peakAngle, motion.angle);
    }
  }
  assert.ok(peakAngle < 1.5, `slalom sideslip ${peakAngle}`);
});

test('handbrake allows a slide and grip recovers smoothly after release', () => {
  const drive = new Driving(makeWorld());
  run(drive, 6, forward);
  let peakAngle = 0, previousLateral = 0, largestDrop = 0;
  for (let i = 0; i < 42; i++) {
    const motion = motionStep(drive, { ...forward, left: true, handbrake: true });
    peakAngle = Math.max(peakAngle, motion.angle);
    previousLateral = motion.lateral;
  }
  let recoveredAngle = 0;
  for (let i = 0; i < 30; i++) {
    const motion = motionStep(drive, forward);
    largestDrop = Math.max(largestDrop, previousLateral - motion.lateral);
    previousLateral = motion.lateral;
    recoveredAngle = motion.angle;
  }
  assert.ok(peakAngle > 5, `handbrake sideslip ${peakAngle}`);
  assert.ok(recoveredAngle < 2, `recovered sideslip ${recoveredAngle}`);
  assert.ok(largestDrop < 1, `single-frame lateral drop ${largestDrop}`);
});

test('coasting through a turn cannot add kinetic speed', () => {
  const drive = new Driving(makeWorld());
  run(drive, 6, forward);
  let previousSpeed = Infinity;
  for (let i = 0; i < 90; i++) {
    const motion = motionStep(drive, { ...idle, left: true });
    assert.ok(motion.speed <= previousSpeed + 1e-7);
    previousSpeed = motion.speed;
  }
});

test('accelerates from rest, brakes before reverse, and coasts to rest', () => {
  const drive = new Driving(makeWorld());
  run(drive, 3, forward);
  assert.ok(drive.state.speed > 14 && drive.state.position.z < 190);
  drive.step(1 / 60, backward);
  assert.ok(drive.state.braking && drive.state.speed > 0);
  run(drive, 3.5, backward);
  assert.ok(drive.state.speed < -4);
  const previousZ = drive.state.position.z;
  run(drive, 0.5, backward);
  assert.ok(drive.state.position.z > previousZ);
  run(drive, 20);
  assert.equal(Math.abs(drive.state.speed), 0);
});

test('steers left moving forward and reverses its yaw response while backing up', () => {
  const a = new Driving(makeWorld()), b = new Driving(makeWorld());
  run(a, 1.7, forward); run(b, 1.7, backward);
  run(a, 0.25, { ...forward, left: true });
  run(b, 0.25, { ...backward, left: true });
  assert.ok(a.state.heading > 0.3 && a.state.position.x < -65.3);
  assert.ok(b.state.heading < -0.3 && b.state.position.x < -65.1);
});

test('handbrake reduces speed and adds slip during a turn', () => {
  const drive = new Driving(makeWorld());
  run(drive, 2.5, forward);
  const initialSpeed = drive.state.speed;
  run(drive, 0.65, { ...forward, left: true, handbrake: true });
  assert.ok(drive.state.braking && drive.state.slip > 0.45);
  assert.ok(drive.state.speed < initialSpeed - 2);
});

test('30 Hz and 120 Hz inputs produce the same 60 Hz simulation', () => {
  const a = new Driving(makeWorld()), b = new Driving(makeWorld());
  for (const drive of [a, b]) {
    const hz = drive === a ? 30 : 120;
    run(drive, 3, forward, hz);
    run(drive, 0.8, { ...forward, right: true }, hz);
    run(drive, 0.5, backward, hz);
  }
  assert.ok(a.state.position.distanceTo(b.state.position) < 1e-7);
  assert.ok(Math.abs(a.state.speed - b.state.speed) < 1e-7);
});

test('high-speed collision stops the full car footprint at a six-centimetre wall', () => {
  const drive = new Driving(makeWorld([{ x: -65, z: 40, halfX: 30, halfZ: 0.03, height: 3 }]));
  let peak = 0;
  for (let i = 0; i < 900; i++) {
    drive.step(1 / 60, forward);
    peak = Math.max(peak, drive.state.speed);
    assert.ok(drive.state.position.z >= 40.03 + VEHICLE.halfLength - 0.00001);
  }
  // The contact skin may permit one acceleration tick before the next contact.
  assert.ok(peak > 27 && Math.abs(drive.state.speed) < 0.2);
  assert.ok(drive.state.position.z < 40.03 + VEHICLE.halfLength + 0.01);
  drive.reset();
  assert.ok(drive.state.position.z > 44.7 && drive.state.position.z < 80);
  assert.equal(drive.state.speed, 0);
});

test('a glancing strike slides along a rotated façade', () => {
  const drive = new Driving(makeWorld([{ x: -65, z: 150, halfX: 80, halfZ: 0.08, rotation: 0.57, height: 12 }]));
  run(drive, 8, forward);
  assert.ok(drive.state.position.x > -64);
  const zFromWall = Math.sin(0.57) * (drive.state.position.x + 65) + Math.cos(0.57) * (drive.state.position.z - 150);
  assert.ok(zFromWall >= 0.08 + VEHICLE.halfWidth * Math.sin(0.57) + VEHICLE.halfLength * Math.cos(0.57) - 0.01);
});

test('city bounds hold and reset returns to a clear road', () => {
  const drive = new Driving(makeWorld());
  run(drive, 42, forward);
  assert.ok(drive.state.position.z >= -310 + VEHICLE.halfLength && drive.state.position.z < -307);
  drive.reset();
  assert.ok(Math.abs(drive.state.position.x + 65) < 0.001);
  assert.ok(drive.state.position.z >= -286 && drive.state.position.z < -260);
  run(drive, 1, backward);
  assert.ok(drive.state.speed < -1);
});

test('camera boom retracts before façades and clears low railings', () => {
  const wall = { x: -65, z: 215, halfX: 5, halfZ: 0.2, height: 9 };
  for (const height of [wall.height, 0.5]) {
    const world = makeWorld([{ ...wall, height }]);
    const camera = new PerspectiveCamera(55, 1.6, 0.2, 1200);
    new ChaseCamera(camera, world).update(1 / 60, new Driving(world).state, orbit);
    assert.ok(height > 1 ? camera.position.z < 214.6 : camera.position.z > 218);
    assert.ok(camera.position.y > 1.2);
  }
});

test('free orbit keeps the camera above terrain across a crest', () => {
  const world = makeWorld([], (x) => x > -62 && x < -58 ? 5 : 0);
  const camera = new PerspectiveCamera();
  const drive = new Driving(world);
  new ChaseCamera(camera, world).update(1 / 60, drive.state, { ...orbit, yaw: Math.PI / 2 });
  assert.ok(camera.position.x > -60);
  assert.ok(camera.position.y > world.groundHeight(camera.position.x, camera.position.z) + 0.4);
  const pivot = drive.state.position.clone().add(new Vector3(0, 1.35, -0.72));
  const rayAtCrest = pivot.clone().lerp(camera.position, 0.5);
  assert.ok(rayAtCrest.y > world.groundHeight(rayAtCrest.x, rayAtCrest.z));
});


