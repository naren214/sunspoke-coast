import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildGt, GT_NAME, GT_PAINT } from './gt-model.ts';
import type { Car, Quality } from './types';
import { VEHICLE } from './vehicle.ts';

type DetailLevel = 'low' | 'high';
const sharedCarGeometry = new Map<DetailLevel, Promise<Map<string, THREE.BufferGeometry>>>();

export interface CarAppearance {
  color?: number;
  label?: string;
}

export function createCar(appearance: CarAppearance = {}): Car & {
  setPaint: (color: number) => void;
  setQuality: (quality: Quality) => void;
  loadAssets: (progress?: (loaded: number, total: number) => void, essentialOnly?: boolean) => Promise<void>;
} {
  const group = new THREE.Group();
  group.name = appearance.label ?? GT_NAME;
  group.userData.visualRevision = 'sunspoke-gt-v1';
  const body = new THREE.Group();
  body.name = 'gt_body';
  group.add(body);
  const { paint, glass, tail, lamps, headlights, steeringPivot, wheels } = buildGt(body, group, appearance.color ?? GT_PAINT);
  group.userData.wheelPivots = wheels.map(wheel => wheel.pivot.name);
  group.updateMatrixWorld(true);

  const parts = new Map<string, {
    mesh: THREE.Mesh;
    restInverse: THREE.Matrix4;
    procedural: THREE.BufferGeometry;
    low?: THREE.BufferGeometry;
    high?: THREE.BufferGeometry;
  }>();
  let partIndex = 0;
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const id = 'car_part_' + String(partIndex++).padStart(3, '0');
    parts.set(id, { mesh: object, restInverse: object.matrixWorld.clone().invert(), procedural: object.geometry });
  });

  const loadedAssets = new Set<DetailLevel>();
  let currentQuality: Quality = 'low';
  function setQuality(quality: Quality) {
    currentQuality = quality;
    paint.clearcoat = quality === 'low' ? .76 : 1;
    glass.clearcoat = quality === 'low' ? .62 : 1;
    for (const part of parts.values()) {
      part.mesh.geometry = (quality === 'low' ? part.low : part.high ?? part.low) ?? part.procedural;
    }
  }

  function loadLevel(level: DetailLevel) {
    const cached = sharedCarGeometry.get(level);
    if (cached) return cached;
    const job = (async () => {
      const loader = new GLTFLoader(), placeholder = new THREE.MeshBasicMaterial();
      // Material, tint and animation stay live. The imported GLB supplies only geometry.
      loader.register(() => ({ name: 'SUNSPOKE_GEOMETRY_ONLY', loadMaterial: () => Promise.resolve(placeholder) }));
      const geometries = new Map<string, THREE.BufferGeometry>();
      const retired = new Set<THREE.BufferGeometry>();
      try {
        const asset = await loader.loadAsync('/assets/car/sunspoke-gt-' + level + '.glb');
        asset.scene.updateMatrixWorld(true);
        asset.scene.traverse(object => {
          if (object instanceof THREE.Mesh) retired.add(object.geometry);
        });
        for (const [id, part] of parts) {
          const incoming = asset.scene.getObjectByName(id);
          if (!(incoming instanceof THREE.Mesh)) throw Error('Missing Sunspoke GT part ' + id);
          const geometry = incoming.geometry.clone();
          geometry.applyMatrix4(incoming.matrixWorld).applyMatrix4(part.restInverse);
          // glTF reverses V relative to the live canvas signature.
          const uv = geometry.getAttribute('uv');
          if (uv) for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
          geometry.computeBoundingSphere();
          geometries.set(id, geometry);
        }
        return geometries;
      } catch (error) {
        geometries.forEach(geometry => geometry.dispose());
        throw error;
      } finally {
        retired.forEach(geometry => geometry.dispose());
        placeholder.dispose();
      }
    })().catch(error => {
      sharedCarGeometry.delete(level);
      throw error;
    });
    sharedCarGeometry.set(level, job);
    return job;
  }

  let wheelAngle = 0;
  let previousTime = 0;
  setQuality(currentQuality);
  return {
    group,
    setPaint(color) { paint.color.setHex(color); },
    setQuality,
    async loadAssets(progress, essentialOnly = false) {
      const requested: DetailLevel[] = essentialOnly ? ['low'] : ['low', 'high'];
      const levels = requested.filter(level => !loadedAssets.has(level));
      let completed = 0;
      await Promise.all(levels.map(async level => {
        try {
          for (const [id, geometry] of await loadLevel(level)) parts.get(id)![level] = geometry;
          loadedAssets.add(level);
          progress?.(++completed, levels.length);
        } catch (error) {
          console.warn('Sunspoke GT detail unavailable for ' + level, error);
        }
      }));
      setQuality(currentQuality);
      group.userData.assetStatus = loadedAssets.size ? 'optimized-local-glb' : 'procedural-fallback';
    },
    update(speed, steering, throttle, braking, time, night) {
      const dt = Math.min(.05, Math.max(0, time - previousTime));
      previousTime = time;
      wheelAngle = (wheelAngle - speed * dt / VEHICLE.wheelRadius) % (Math.PI * 2);
      for (const wheel of wheels) {
        wheel.spin.rotation.x = wheelAngle;
        wheel.pivot.rotation.y = wheel.front ? steering : 0;
      }
      body.rotation.z = THREE.MathUtils.damp(body.rotation.z, -steering * Math.min(Math.abs(speed) / 30, 1) * .046, 6, dt);
      body.rotation.x = THREE.MathUtils.damp(body.rotation.x, braking ? -.012 : throttle * .009, 7, dt);
      body.position.y = Math.sin(time * 7) * Math.min(Math.abs(speed) / 30, 1) * .003;
      steeringPivot.rotation.z = steering * 2;
      tail.emissiveIntensity = braking ? 3.4 : .32 + night * .85;
      lamps.emissiveIntensity = .68 + night * 2.3;
      headlights.forEach(light => { light.intensity = night * 70; });
    },
  };
}
