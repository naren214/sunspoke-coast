import { Vector3 } from 'three';
import { Driving } from './driving';
import type { Road, World } from './types';
import { VEHICLE } from './vehicle.ts';

const forward = { forward: true, backward: false, left: false, right: false, handbrake: false };
const frames = 48;
const round = (v: number) => Math.round(v * 1000) / 1000;

function trial(world: World, x: number, z: number, heading: number) {
  const drive = new Driving(world);
  drive.state.position.set(x, world.groundHeight(x, z), z);
  drive.state.heading = heading;
  for (let i = 0; i < frames; i++) drive.step(1 / 60, forward);
  const dx = drive.state.position.x - x, dz = drive.state.position.z - z;
  return {
    along: -dx * Math.sin(heading) - dz * Math.cos(heading),
    sideways: Math.abs(dx * Math.cos(heading) - dz * Math.sin(heading))
  };
}

// Steer with the same five boolean inputs as the keyboard. This is a QA-only
// uninterrupted lap, in addition to independent probes of every lane segment.
function driveClosedRoad(world: World, road: Road) {
  const points = road.points, start = points[0], next = points[1];
  const drive = new Driving(world);
  drive.state.position.copy(start);
  drive.state.heading = Math.atan2(start.x - next.x, start.z - next.z);
  const input = { ...forward };
  let waypoint = 1, steps = 0, travel = 0;
  const length = points.reduce((sum, p, i) => sum + (i ? p.distanceTo(points[i - 1]) : 0), 0);
  const timeout = Math.ceil((length / 5 + 20) * 60);
  while (steps < timeout && waypoint < points.length) {
    const { position, heading, speed, steering } = drive.state;
    const lookAhead = 5 + speed * 0.24;
    while (waypoint < points.length && position.distanceTo(points[waypoint]) <
      (waypoint === points.length - 1 ? 1 : lookAhead)) waypoint++;
    if (waypoint >= points.length) break;
    const x = position.x, z = position.z;
    const dx = points[waypoint].x - x, dz = points[waypoint].z - z;
    const error = Math.atan2(-dx, -dz) - heading;
    const wanted = Math.atan2(2 * VEHICLE.wheelbase * Math.sin(error), Math.max(1, Math.hypot(dx, dz)));
    input.left = wanted > 0.002 && steering < wanted - 0.001;
    input.right = wanted < -0.002 && steering > wanted + 0.001;
    input.forward = speed < 10;
    drive.step(1 / 60, input);
    travel += Math.hypot(position.x - x, position.z - z);
    steps++;
  }
  return {
    passed: waypoint >= points.length,
    waypointsPassed: waypoint - 1, waypointsTotal: points.length - 1,
    seconds: round(steps / 60), drivenMeters: round(travel),
    finishGapMeters: round(drive.state.position.distanceTo(start)),
    end: [round(drive.state.position.x), round(drive.state.position.z)]
  };
}

// Join the two farthest cross streets to the beachfront and the inland spine.
// Rounded turns follow ordinary cornering lines through the real intersections.
function driveInnerLoop(world: World) {
  const open = world.roads.filter(r => r.points.length > 1 && r.points[0].distanceTo(r.points.at(-1)!) > 1);
  const cross = open.filter(r => Math.abs(r.points[0].z - r.points.at(-1)!.z) < 0.1);
  const spine = open.find(r => Math.abs(r.points[0].x - r.points.at(-1)!.x) < 0.1);
  if (cross.length < 2 || !spine) return null;
  const x0 = Math.min(...cross.flatMap(r => [r.points[0].x, r.points.at(-1)!.x]));
  const x1 = spine.points[0].x;
  const z0 = Math.min(...cross.map(r => r.points[0].z)), z1 = Math.max(...cross.map(r => r.points[0].z));
  const radius = Math.min(10, (x1 - x0) / 4, (z1 - z0) / 4);
  const points: Vector3[] = [];
  const add = (x: number, z: number) => points.push(new Vector3(x, world.groundHeight(x, z), z));
  function straight(x: number, z: number) {
    const from = points.at(-1)!;
    const steps = Math.ceil(Math.hypot(x - from.x, z - from.z) / 3.5);
    for (let i = 1; i <= steps; i++) add(from.x + (x - from.x) * i / steps, from.z + (z - from.z) * i / steps);
  }
  function corner(cx: number, cz: number, start: number) {
    const steps = Math.ceil(radius * Math.PI / 2);
    for (let i = 1; i <= steps; i++) {
      const angle = start + i / steps * Math.PI / 2;
      add(cx + radius * Math.cos(angle), cz + radius * Math.sin(angle));
    }
  }
  const midZ = (z0 + z1) / 2;
  add(x0, midZ);
  straight(x0, z0 + radius); corner(x0 + radius, z0 + radius, Math.PI);
  straight(x1 - radius, z0); corner(x1 - radius, z0 + radius, Math.PI * 1.5);
  straight(x1, z1 - radius); corner(x1 - radius, z1 - radius, 0);
  straight(x0 + radius, z1); corner(x0 + radius, z1 - radius, Math.PI / 2);
  straight(x0, midZ);
  return driveClosedRoad(world, { points, width: spine.width });
}

export function validateRoads(world: World) {
  // Baseline must use the same physics integration without scenery or boundaries
  // near its trajectory. This keeps the pass criteria valid after handling edits.
  const free = trial({ ...world, colliders: [], roads: [] }, -65, 210, 0).along;
  const failures: { road: number; segment: number; lane: string; x: number; z: number; forwardM: number; lateralM: number }[] = [];
  const boxes = world.colliders.filter(b => b.height >= 0.12).map(b => ({
    ...b, c: Math.cos(b.rotation ?? 0), s: Math.sin(b.rotation ?? 0)
  }));
  let total = 0, failed = 0;
  const routes = world.roads.map((road, roadIndex) => {
    let length = 0, leastTravel = Infinity, minCenterClearance = Infinity, tests = 0, blocked = 0;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i], dx = b.x - a.x, dz = b.z - a.z;
      const segmentLength = Math.hypot(dx, dz);
      if (segmentLength < 0.001) continue;
      length += segmentLength;
      const nx = -dz / segmentLength, nz = dx / segmentLength;
      const heading = Math.atan2(-dx, -dz);
      // The authored streets use ~3.5m segments. Keep the same maximum probe
      // spacing for future wide or sparsely tessellated roads.
      const samples = Math.max(1, Math.ceil(segmentLength / 4));
      for (let j = 0; j < samples; j++) {
        const t = (j + 0.5) / samples;
        const x = a.x + t * dx, z = a.z + t * dz;
        for (const box of boxes) {
          const px = x - box.x, pz = z - box.z;
          const lx = Math.abs(px * box.c - pz * box.s) - box.halfX;
          const lz = Math.abs(px * box.s + pz * box.c) - box.halfZ;
          const distance = Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) + Math.min(Math.max(lx, lz), 0);
          minCenterClearance = Math.min(minCenterClearance, distance);
        }
        // Right-hand travel lanes exercise both directions and the center probe
        // catches accidental medians or obstacles occupying the center marking.
        for (const lane of [0, 1, -1]) {
          const offset = lane * road.width * 0.25;
          const px = x + nx * offset, pz = z + nz * offset;
          const result = trial(world, px, pz, heading + (lane < 0 ? Math.PI : 0));
          tests++;
          leastTravel = Math.min(leastTravel, result.along);
          if (Math.abs(result.along - free) <= 0.06 && result.sideways <= 0.06) continue;
          blocked++;
          if (failures.length < 20) failures.push({ road: roadIndex + 1, segment: i,
            lane: lane === 0 ? 'center' : lane === 1 ? 'outbound' : 'inbound',
            x: round(px), z: round(pz), forwardM: round(result.along), lateralM: round(result.sideways) });
        }
      }
    }
    const first = road.points[0], last = road.points.at(-1);
    const loop = first && last && road.points.length > 2 && first.distanceTo(last) < 0.1;
    const lap = loop ? driveClosedRoad(world, road) : undefined;
    total += tests;
    failed += blocked;
    return { road: roadIndex + 1, lengthM: round(length), samples: tests, failures: blocked,
      minTravelM: tests ? round(leastTravel) : null,
      minCenterToColliderM: Number.isFinite(minCenterClearance) ? round(minCenterClearance) : null,
      ...(lap ? { continuousLap: lap } : {}) };
  });
  const roadCount = routes.length;
  const innerLap = driveInnerLoop(world);
  return { passed: roadCount > 0 && total > 0 && !failed && Boolean(innerLap?.passed) && routes.every(r => r.samples && (!r.continuousLap || r.continuousLap.passed)),
    roadCount, probes: total, failedProbes: failed, probeSeconds: frames / 60,
    nominalTravelM: round(free), worstTravelM: total ? Math.min(...routes.map(r => r.minTravelM ?? Infinity)) : null,
    routes, innerLap, failures };
}

