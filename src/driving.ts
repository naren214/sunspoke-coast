import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Collider, DriveState, World } from './types';
import { VEHICLE } from './vehicle.ts';

export interface DriveInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  brake?: boolean;
}

const STEP = 1 / 60;
const HALF_WIDTH = VEHICLE.halfWidth;
const HALF_LENGTH = VEHICLE.halfLength;
const CAR_RADIUS = Math.hypot(HALF_WIDTH, HALF_LENGTH);
const GRID = 24;

const clamp = MathUtils.clamp;
const damping = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const approach = (value: number, target: number, increment: number) =>
  value + clamp(target - value, -increment, increment);

interface Box extends Collider {
  cosine: number;
  sine: number;
  bottom: number;
  top: number;
}

// Both the vehicle and the camera query the same immutable spatial index.
class Scenery {
  private cells = new Map<string, Box[]>();
  private nearby = new Set<Box>();

  constructor(world: World) {
    for (const collider of world.colliders) {
      const cosine = Math.cos(collider.rotation ?? 0);
      const sine = Math.sin(collider.rotation ?? 0);
      const bottom = world.groundHeight(collider.x, collider.z);
      const box = { ...collider, cosine, sine, bottom, top: bottom + collider.height };
      const rx = Math.abs(cosine) * box.halfX + Math.abs(sine) * box.halfZ;
      const rz = Math.abs(sine) * box.halfX + Math.abs(cosine) * box.halfZ;
      for (let i = Math.floor((box.x - rx) / GRID); i <= Math.floor((box.x + rx) / GRID); i++) {
        for (let j = Math.floor((box.z - rz) / GRID); j <= Math.floor((box.z + rz) / GRID); j++) {
          const key = i + ',' + j;
          const cell = this.cells.get(key);
          if (cell) cell.push(box);
          else this.cells.set(key, [box]);
        }
      }
    }
  }

  query(x0: number, z0: number, x1: number, z1: number) {
    this.nearby.clear();
    for (let i = Math.floor(x0 / GRID); i <= Math.floor(x1 / GRID); i++) {
      for (let j = Math.floor(z0 / GRID); j <= Math.floor(z1 / GRID); j++) {
        const cell = this.cells.get(i + ',' + j);
        if (cell) for (const box of cell) this.nearby.add(box);
      }
    }
    return this.nearby;
  }
}

const indices = new WeakMap<World, Scenery>();
function sceneryFor(world: World) {
  let index = indices.get(world);
  if (!index) {
    index = new Scenery(world);
    indices.set(world, index);
  }
  return index;
}

interface Contact { x: number; z: number; depth: number; }
// 2D oriented rectangles have four candidate separating axes.
function contact(x: number, z: number, c: number, s: number, box: Box, out: Contact) {
  const dx = x - box.x, dz = z - box.z;
  const cosine = box.cosine, sine = box.sine;
  const parallel = Math.abs(c * cosine + s * sine);
  const cross = Math.abs(s * cosine - c * sine);
  const side = dx * c - dz * s;
  const along = dx * s + dz * c;
  const localX = dx * cosine - dz * sine;
  const localZ = dx * sine + dz * cosine;
  const d1 = HALF_WIDTH + box.halfX * parallel + box.halfZ * cross - Math.abs(side);
  const d2 = HALF_LENGTH + box.halfX * cross + box.halfZ * parallel - Math.abs(along);
  const d3 = box.halfX + HALF_WIDTH * parallel + HALF_LENGTH * cross - Math.abs(localX);
  const d4 = box.halfZ + HALF_WIDTH * cross + HALF_LENGTH * parallel - Math.abs(localZ);
  const depth = Math.min(d1, d2, d3, d4);
  if (depth <= 0) return false;
  out.depth = depth;
  if (depth === d1) { const sign = Math.sign(side) || 1; out.x = c * sign; out.z = -s * sign; }
  else if (depth === d2) { const sign = Math.sign(along) || 1; out.x = s * sign; out.z = c * sign; }
  else if (depth === d3) { const sign = Math.sign(localX) || 1; out.x = cosine * sign; out.z = -sine * sign; }
  else { const sign = Math.sign(localZ) || 1; out.x = sine * sign; out.z = cosine * sign; }
  return true;
}

// Liang–Barsky/slab test on a camera segment in the scenery box's local frame.
function boxHit(origin: Vector3, ray: Vector3, box: Box, radius: number) {
  let near = 0, far = 1;
  const x = origin.x - box.x, z = origin.z - box.z;
  const ox = x * box.cosine - z * box.sine, oz = x * box.sine + z * box.cosine;
  const dx = ray.x * box.cosine - ray.z * box.sine;
  const dz = ray.x * box.sine + ray.z * box.cosine;
  for (let axis = 0; axis < 3; axis++) {
    const p = axis === 0 ? ox : axis === 1 ? origin.y : oz;
    const d = axis === 0 ? dx : axis === 1 ? ray.y : dz;
    const min = (axis === 0 ? -box.halfX : axis === 1 ? box.bottom : -box.halfZ) - radius;
    const max = (axis === 0 ? box.halfX : axis === 1 ? box.top : box.halfZ) + radius;
    if (Math.abs(d) < 0.000001) {
      if (p < min || p > max) return 1;
    } else {
      const a = (min - p) / d, b = (max - p) / d;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near > far) return 1;
    }
  }
  return near;
}

export class Driving {
  readonly state: DriveState;
  private world: World;
  private index: Scenery;
  private vx = 0;
  private vz = 0;
  private accumulated = 0;
  private grip = 1;
  private steeringInput = 0;
  private yawRate = 0;
  private gear = 1;
  private shiftTime = 0;
  private collisionGrace = 0;
  private safePosition: Vector3;
  private safeHeading = 0;
  private checkTime = 0;
  private contact: Contact = { x: 0, z: 0, depth: 0 };

  constructor(world: World) {
    this.world = world;
    const position = new Vector3(-65, world.groundHeight(-65, 210), 210);
    this.state = { position, heading: 0, speed: 0, steering: 0, throttle: 0, braking: false, slip: 0, airborne:false, pitch:0, verticalSpeed:0 };
    this.safePosition = position.clone();
    this.index = sceneryFor(world);
  }

  reset() {
    const state = this.state;
    state.position.copy(this.safePosition);
    state.heading = this.safeHeading;
    state.speed = state.steering = state.throttle = state.slip = 0;
    state.braking = false;
    state.airborne = false; state.pitch = state.verticalSpeed = 0;
    this.vx = this.vz = this.accumulated = 0;
    this.grip = 1;
    this.steeringInput = this.yawRate = this.shiftTime = 0;
    this.gear = 1;
    this.collisionGrace = 0;
    this.checkTime = 0;
  }

  step(dt: number, input: DriveInput) {
    this.accumulated += clamp(dt, 0, 0.12);
    while (this.accumulated + 1e-9 >= STEP) {
      this.advance(input);
      this.accumulated -= STEP;
    }
  }

  private advance(input: DriveInput) {
    const state = this.state, pos = state.position;
    if(state.airborne){this.fly(input);return;}
    const oldX=pos.x,oldY=pos.y,oldZ=pos.z;
    const speed = state.speed, absSpeed = Math.abs(speed);
    const direction = Number(input.forward) - Number(input.backward);
    const bothPedals = input.forward && input.backward;
    const opposing = direction * speed < -0.15;
    // Brake to a stop before changing direction, with a brief neutral dwell.
    const shifting = direction !== 0 && direction !== this.gear && absSpeed <= 0.15;
    if (shifting) {
      this.shiftTime += STEP;
      if (this.shiftTime >= 0.18) { this.gear = direction; this.shiftTime = 0; }
    } else this.shiftTime = 0;
    const footBrake = Boolean(input.brake) || opposing || bothPedals || shifting;
    state.braking = footBrake || input.handbrake;

    // Digital keys act like a short-travel analog stick. A tap makes a small
    // correction, a hold reaches full lock, and countersteering crosses quickly.
    const wanted = Number(input.left) - Number(input.right);
    const reversingSteer = wanted * this.steeringInput < 0;
    this.steeringInput = approach(this.steeringInput, wanted,
      (wanted === 0 ? 8 : reversingSteer ? 9 : 5.5) * STEP);
    this.grip += ((input.handbrake ? 0 : 1) - this.grip) * damping(input.handbrake ? 6 : 3.3, STEP);
    const curve = this.steeringInput * (0.6 + 0.4 * Math.abs(this.steeringInput));
    // One continuous radius curve replaces stacked wheel-angle and yaw caps.
    // Tight parking turns blend into useful, predictable highway cornering.
    const radius = 5.5 + 0.027 * absSpeed * absSpeed;
    const targetYaw = speed / radius * curve * (1 + 0.5 * (1 - this.grip));
    this.yawRate += (targetYaw - this.yawRate) * damping(wanted === 0 ? 22 : 16, STEP);
    if (absSpeed < 0.08) this.yawRate = 0;
    const wheelAngle = Math.atan(VEHICLE.wheelbase / radius * curve * (1 + 0.5 * (1 - this.grip)));
    state.steering += (wheelAngle - state.steering) * damping(18, STEP);

    const lateralSpeed = this.vx * Math.cos(state.heading) - this.vz * Math.sin(state.heading);
    const slipRatio = Math.abs(lateralSpeed) / Math.max(absSpeed, 4);
    const traction = 1 - clamp((slipRatio - 0.08) / 0.3, 0, 0.7);
    const wantedThrottle = direction && !state.braking ? traction : 0;
    state.throttle += (wantedThrottle - state.throttle) * damping(state.braking ? 20 : 8, STEP);
    const rolling = 0.4 + absSpeed * 0.015 + absSpeed * absSpeed * 0.00065;
    let nextSpeed = Math.sign(speed || this.gear) * Math.hypot(this.vx, this.vz);
    if (state.braking) nextSpeed = approach(nextSpeed, 0, (footBrake ? 12.5 : 7.5) * STEP);
    else if (direction && direction === this.gear) {
      const topSpeed = direction > 0 ? 40 : 8;
      const acceleration = direction > 0 ? 7.2 : 4.2;
      nextSpeed += direction * acceleration * state.throttle * Math.max(0, 1 - (absSpeed / topSpeed) ** 2) * STEP;
      nextSpeed = approach(nextSpeed, 0, rolling * STEP);
    } else nextSpeed = approach(nextSpeed, 0, rolling * STEP);
    if (shifting || (footBrake && Math.abs(nextSpeed) < 0.15)) nextSpeed = 0;

    const oldHeading = state.heading;
    state.heading = Math.atan2(Math.sin(oldHeading + this.yawRate * STEP), Math.cos(oldHeading + this.yawRate * STEP));
    const c = Math.cos(state.heading), s = Math.sin(state.heading);
    let lateral = this.vx * c - this.vz * s;
    this.collisionGrace = Math.max(0, this.collisionGrace - STEP);
    lateral *= Math.exp(-(this.collisionGrace > 0 ? 2.5 : MathUtils.lerp(1.8, 42, this.grip)) * STEP);
    lateral = clamp(lateral, -Math.abs(nextSpeed) * 0.75, Math.abs(nextSpeed) * 0.75);
    // Conserve the intended kinetic speed while redistributing grip and slip.
    // Steering cannot generate energy or repeatedly scrub away forward power.
    const longitudinal = Math.sign(nextSpeed) * Math.sqrt(Math.max(0, nextSpeed * nextSpeed - lateral * lateral));
    this.vx = -s * longitudinal + c * lateral;
    this.vz = -c * longitudinal - s * lateral;
    // At maximum speed the footprint advances under 0.3m per collision pass.
    for (let part = 0; part < 2; part++) {
      pos.x += this.vx * STEP * 0.5;
      pos.z += this.vz * STEP * 0.5;
      this.collide(c, s);
    }
    const surface=this.surfaceHeight(pos.x,pos.z);
    if(surface < oldY-0.22){
      state.airborne=true;
      // Carry the actual ramp ascent velocity over the lip into ballistic flight.
      state.verticalSpeed=clamp(state.verticalSpeed,-8,14);
      pos.y=oldY+state.verticalSpeed*STEP-0.5*9.81*STEP*STEP;
    }else if(surface > oldY+0.65){
      // A vertical ramp face is a wall, never an elevator onto its deck.
      pos.x=oldX;pos.z=oldZ;this.vx=this.vz=0;state.verticalSpeed=0;
    }else{
      pos.y=surface;
      state.verticalSpeed=(surface-oldY)/STEP;
      const pitch=Math.atan2(state.verticalSpeed*Math.sign(state.speed||1),Math.max(Math.hypot(this.vx,this.vz),0.2));
      state.pitch+=(pitch-state.pitch)*damping(14,STEP);
    }
    state.speed = -this.vx * s - this.vz * c;
    const slide = Math.max(Math.abs(lateral) / 5, input.handbrake ? absSpeed / 14 : 0);
    state.slip += (clamp(slide, 0, 1) - state.slip) * damping(7, STEP);

    this.checkTime += STEP;
    if (this.checkTime >= 0.4) {
      this.checkTime = 0;
      if (pos.distanceToSquared(this.safePosition) > 36 && !input.handbrake && !state.airborne) this.rememberRoad();
    }
  }

  private surfaceHeight(x:number,z:number){return (this.world.surfaceHeight??this.world.groundHeight)(x,z);}

  private fly(input:DriveInput){
    const state=this.state,pos=state.position;
    state.braking=Boolean(input.brake)||input.backward||input.handbrake;
    state.throttle+=(Number(input.forward&&!state.braking)-state.throttle)*damping(8,STEP);
    // Wheel input has no tire force in the air. Preserve launch momentum.
    state.steering+=(0-state.steering)*damping(8,STEP);
    this.yawRate*=Math.exp(-12*STEP);
    this.vx*=Math.exp(-0.025*STEP);this.vz*=Math.exp(-0.025*STEP);
    state.verticalSpeed-=9.81*STEP;
    pos.y+=state.verticalSpeed*STEP;
    const c=Math.cos(state.heading),s=Math.sin(state.heading);
    for(let i=0;i<2;i++){
      pos.x+=this.vx*STEP*0.5;pos.z+=this.vz*STEP*0.5;this.collide(c,s);
    }
    const surface=this.surfaceHeight(pos.x,pos.z);
    state.pitch+=(Math.atan2(state.verticalSpeed*Math.sign(state.speed||1),Math.max(Math.hypot(this.vx,this.vz),0.2))-state.pitch)*damping(7,STEP);
    if(pos.y<=surface&&state.verticalSpeed<=0){
      pos.y=surface;state.verticalSpeed=0;state.airborne=false;
      this.steeringInput=0;this.yawRate=0;
    }
    state.speed=-this.vx*s-this.vz*c;
    state.slip*=Math.exp(-6*STEP);
  }

  private collide(c: number, s: number) {
    const pos = this.state.position;
    const neighbors = this.index.query(pos.x - CAR_RADIUS, pos.z - CAR_RADIUS, pos.x + CAR_RADIUS, pos.z + CAR_RADIUS);
    for (const box of neighbors) {
      if (box.height < 0.12 || pos.y>box.top+0.03 || pos.y+VEHICLE.height<box.bottom || !contact(pos.x, pos.z, c, s, box, this.contact)) continue;
      const n = this.contact;
      pos.x += n.x * (n.depth + 0.002);
      pos.z += n.z * (n.depth + 0.002);
      const inward = this.vx * n.x + this.vz * n.z;
      if (inward < 0) { this.vx -= inward * n.x; this.vz -= inward * n.z; this.collisionGrace = 0.2; }
    }
    // A final bound backs up shoreline, cliff and city-edge geometry.
    const rx = Math.abs(c) * HALF_WIDTH + Math.abs(s) * HALF_LENGTH;
    const rz = Math.abs(s) * HALF_WIDTH + Math.abs(c) * HALF_LENGTH;
    const bounds = this.world.bounds ?? { minX: -116, maxX: 210, minZ: -310, maxZ: 310 };
    const x = clamp(pos.x, bounds.minX + rx, bounds.maxX - rx);
    const z = clamp(pos.z, bounds.minZ + rz, bounds.maxZ - rz);
    if (x !== pos.x) this.vx = 0;
    if (z !== pos.z) this.vz = 0;
    pos.x = x; pos.z = z;
  }

  private rememberRoad() {
    const pos = this.state.position;
    // Save a pose with enough space to steer away in any direction after reset.
    const clearance = 4.7;
    const neighbors = this.index.query(pos.x - clearance, pos.z - clearance, pos.x + clearance, pos.z + clearance);
    for (const box of neighbors) {
      const x = pos.x - box.x, z = pos.z - box.z;
      const lx = Math.max(0, Math.abs(x * box.cosine - z * box.sine) - box.halfX);
      const lz = Math.max(0, Math.abs(x * box.sine + z * box.cosine) - box.halfZ);
      if (lx * lx + lz * lz < clearance * clearance) return;
    }
    for (const road of this.world.roads) {
      const maxDistance = Math.max(0, road.width * 0.5 - HALF_WIDTH - 0.7);
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1], b = road.points[i];
        const dx = b.x - a.x, dz = b.z - a.z;
        const t = clamp(((pos.x - a.x) * dx + (pos.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        if ((a.x + t * dx - pos.x) ** 2 + (a.z + t * dz - pos.z) ** 2 <= maxDistance * maxDistance) {
          this.safePosition.copy(pos);
          this.safeHeading = this.state.heading;
          return;
        }
      }
    }
  }
}

export class ChaseCamera {
  private camera: PerspectiveCamera;
  private world: World;
  private index: Scenery;
  private focus = new Vector3();
  private desired = new Vector3();
  private ray = new Vector3();
  private previous = new Vector3();
  private initialized = false;

  constructor(camera: PerspectiveCamera, world: World) {
    this.camera = camera;
    this.world = world;
    this.index = sceneryFor(world);
  }

  update(dt: number, state: DriveState, orbit: { yaw: number; pitch: number; distance: number }) {
    const { position, heading } = state;
    const yaw = heading + orbit.yaw;
    const pitch = clamp(orbit.pitch, 0.14, 1.15);
    const distance = clamp(orbit.distance, 4, 16);
    const horizontal = Math.cos(pitch) * distance;
    const lookAhead = 0.72 + Math.min(Math.abs(state.speed) / 30, 0.65);
    this.focus.set(position.x - Math.sin(heading) * lookAhead, position.y + 1.35,
      position.z - Math.cos(heading) * lookAhead);
    this.desired.set(position.x + Math.sin(yaw) * horizontal, position.y + 1.3 + Math.sin(pitch) * distance,
      position.z + Math.cos(yaw) * horizontal);
    const snap = !this.initialized || this.previous.distanceToSquared(position) > 16 * 16;
    if (snap) this.camera.position.copy(this.desired);
    else this.camera.position.lerp(this.desired, damping(7.2, clamp(dt, 0, 0.12)));
    this.previous.copy(position);
    this.initialized = true;

    const end = this.camera.position, start = this.focus, radius = 0.32;
    // Lift the boom over rising terrain, including crests between car and camera.
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const x = start.x + t * (end.x - start.x), z = start.z + t * (end.z - start.z);
      const ground = (this.world.surfaceHeight??this.world.groundHeight)(x, z) + 0.45;
      end.y = Math.max(end.y, start.y + (ground - start.y) / t);
    }
    this.ray.subVectors(end, start);
    const boxes = this.index.query(Math.min(start.x, end.x) - radius, Math.min(start.z, end.z) - radius,
      Math.max(start.x, end.x) + radius, Math.max(start.z, end.z) + radius);
    let fraction = 1;
    for (const box of boxes) fraction = Math.min(fraction, boxHit(start, this.ray, box, radius));
    if (fraction < 1) end.copy(start).addScaledVector(this.ray, Math.max(0, fraction - 0.015));
    const gap = Math.hypot(end.x - position.x, end.z - position.z);
    end.y = Math.max(end.y, (this.world.surfaceHeight??this.world.groundHeight)(end.x, end.z) + 0.45,
      position.y + Math.max(0, 3.2 - gap) + VEHICLE.height + 0.25);
    this.camera.lookAt(start);
  }
}







