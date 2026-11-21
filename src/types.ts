import type * as THREE from 'three';
export type Lighting = 'golden' | 'twilight' | 'night';
export type Quality = 'low' | 'medium' | 'high';
export interface Collider { x: number; z: number; halfX: number; halfZ: number; rotation?: number; height: number; baseY?: number; }
export interface Road { points: THREE.Vector3[]; width: number; name?: string; }
export interface World {
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  group: THREE.Group;
  colliders: Collider[];
  dynamicColliders?: Collider[];
  stepEnvironment?: (dt: number, carPosition: THREE.Vector3) => void;
  remotePositions?: THREE.Vector3[];
  loadAssets?: () => Promise<void>;
  setQuality?: (quality: Quality) => void;
  roads: Road[];
  groundHeight: (x: number, z: number) => number;
  surfaceHeight?: (x: number, z: number) => number;
  visualHeight?: (x: number, z: number) => number;
  updateStaticVisibility?: (camera: THREE.Camera, shadowCamera?: THREE.Camera) => void;
  update: (time: number, lighting: Lighting, carPosition: THREE.Vector3) => void;
}
export interface Car {
  group: THREE.Group;
  update: (speed: number, steering: number, throttle: number, braking: boolean, time: number, night: number) => void;
}
export interface DriveState { position: THREE.Vector3; heading: number; speed: number; steering: number; throttle: number; braking: boolean; slip: number; airborne: boolean; pitch: number; verticalSpeed: number; }
