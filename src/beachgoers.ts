import * as T from 'three';

// Stylized adult holidaymakers with shared, instanced geometry and opaque swimwear.
export function createBeachgoers(height: (x: number, z: number) => number) {
  const group = new T.Group();
  group.name = 'Adult beachgoers';
  const sphere = new T.SphereGeometry(1, 10, 7);
  const cylinder = new T.CylinderGeometry(1, 1, 1, 8);
  const torso = new T.CylinderGeometry(0.19, 0.145, 0.43, 10);
  const triangle = new T.BufferGeometry();
  triangle.setAttribute('position', new T.Float32BufferAttribute([-0.5, 0.5, 0, 0, -0.5, 0, 0.5, 0.5, 0], 3));
  triangle.computeVertexNormals();
  const material = (color: string) => new T.MeshStandardMaterial({ color, roughness: 0.9, side: T.DoubleSide });
  const skins = ['#e4b18d', '#bd8060', '#8e573f', '#663f31', '#d49a73'].map(material);
  const suits = ['#e77164', '#255f77', '#eac663', '#529c8e', '#272e3d', '#ae577d'].map(material);
  const hairs = ['#332a24', '#705037', '#c49b5a'].map(material);
  const white = material('#e9dac1'), dark = material('#282e34');
  type Part = { person: number; g: T.BufferGeometry; m: T.Material; p: T.Vector3; s: T.Vector3; r: T.Euler; limb: number; index?: number; mesh?: T.InstancedMesh };
  const parts: Part[] = [];
  const people: { x: number; z: number; yaw: number; scale: number; walking: boolean; reclining: boolean; phase: number }[] = [];
  let seed = 96141;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function add(person: number, g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, limb = 0, rx = 0) {
    parts.push({ person, g, m, p: new T.Vector3(x, y, z), s: new T.Vector3(sx, sy, sz), r: new T.Euler(rx, 0, 0), limb });
  }
  for (let i = 0; i < 84; i++) {
    const walking = i % 4 === 0, reclining = i % 5 === 1;
    const z = -155 + (i % 28) * 12.6 + Math.floor(i / 28) * 2.2;
    const x = walking ? -111 + random() * 1.5 : -108 + (i % 3) * 3.1 + random();
    people.push({ x, z, yaw: walking ? (i % 8 ? 0 : Math.PI) : random() * Math.PI * 2, scale: 0.96 + random() * 0.14, walking, reclining, phase: random() * 6.28 });
    const skin = skins[i % skins.length], suit = suits[i % suits.length];
    const bikini = i % 3 !== 0, thong = bikini && i % 2 === 0;
    add(i, torso, skin, 0, 1.22, 0, 1, 1, 0.68);
    add(i, sphere, skin, 0, 0.93, 0, 0.205, 0.18, 0.135);
    add(i, cylinder, skin, 0, 1.49, 0, 0.065, 0.12, 0.065);
    add(i, sphere, skin, 0, 1.64, 0.01, 0.115, 0.15, 0.11);
    add(i, sphere, hairs[i % 3], 0, 1.73, -0.025, 0.12, 0.085, 0.11);
    add(i, sphere, dark, 0, 1.66, 0.108, 0.105, 0.026, 0.014);
    for (const side of [-1, 1]) {
      add(i, cylinder, skin, side * 0.098, 0.62, 0, 0.068, 0.41, 0.07, side);
      add(i, cylinder, skin, side * 0.098, 0.23, 0, 0.049, 0.39, 0.05, side);
      add(i, sphere, skin, side * 0.098, 0.055, 0.05, 0.055, 0.05, 0.13, side);
      add(i, cylinder, skin, side * 0.238, 1.19, 0, 0.048, 0.33, 0.05, -side);
      add(i, cylinder, skin, side * 0.25, 0.9, 0.025, 0.038, 0.28, 0.04, -side);
      add(i, sphere, skin, side * 0.25, 0.75, 0.04, 0.04, 0.065, 0.04, -side);
    }
    if (bikini) {
      // Front panels, a back tie, straps and a separate waist band.
      for (const side of [-1, 1]) {
        add(i, triangle, suit, side * 0.09, 1.31, 0.132, 0.17, 0.17, 1, 0, Math.PI);
        add(i, cylinder, suit, side * 0.145, 1.405, 0.08, 0.009, 0.19, 0.009);
      }
      add(i, cylinder, suit, 0, 1.26, 0, 0.191, 0.025, 0.134);
      add(i, cylinder, suit, 0, 1.015, 0, 0.197, 0.035, 0.137);
      add(i, triangle, suit, 0, 0.885, 0.139, 0.34, 0.26, 1);
      add(i, triangle, suit, 0, 0.885, -0.139, thong ? 0.085 : 0.33, 0.26, 1);
    } else {
      add(i, cylinder, suit, 0, 0.91, 0, 0.211, 0.25, 0.144);
      for (const side of [-1, 1]) add(i, cylinder, suit, side * 0.1, 0.78, 0, 0.09, 0.18, 0.09);
    }
    if (reclining) add(i, sphere, white, 0, 0.93, -0.17, 0.37, 0.99, 0.018);
  }
  const buckets = new Map<string, Part[]>();
  for (const part of parts) {
    const key = part.g.uuid + part.m.uuid;
    const bucket = buckets.get(key) ?? []; bucket.push(part); buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    const mesh = new T.InstancedMesh(bucket[0].g, bucket[0].m, bucket.length);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.castShadow = mesh.receiveShadow = true;
    // Walkers remain within the authored beach strip; fixed bounds avoid per-frame scans.
    mesh.boundingSphere = new T.Sphere(new T.Vector3(-103, 1, 15), 205);
    bucket.forEach((part, index) => { part.mesh = mesh; part.index = index; });
    group.add(mesh);
  }
  const root = new T.Object3D(), local = new T.Object3D(), matrix = new T.Matrix4();
  let previous = -1;
  function update(time: number) {
    if (time - previous < 1 / 20 && time >= previous) return;
    previous = time;
    for (const part of parts) {
      const p = people[part.person];
      const stride = p.walking ? Math.sin(time * 3.3 + p.phase) : Math.sin(time * 0.7 + p.phase) * 0.03;
      const z = p.z + (p.walking ? Math.sin(time * 0.055 + p.phase) * 5 : 0);
      root.position.set(p.x, height(p.x, z) + (p.reclining ? 0.17 : 0.02), z);
      root.rotation.set(p.reclining ? -Math.PI / 2 : 0, p.yaw, 0, 'YXZ');
      root.scale.setScalar(p.scale); root.updateMatrix();
      local.position.copy(part.p); local.rotation.copy(part.r); local.scale.copy(part.s);
      if (part.limb && p.walking) {
        local.position.z += stride * part.limb * (part.p.y < 0.8 ? 0.11 : 0.055);
        local.rotation.x += stride * part.limb * 0.22;
      }
      local.updateMatrix(); matrix.multiplyMatrices(root.matrix, local.matrix);
      part.mesh!.setMatrixAt(part.index!, matrix);
    }
    group.children.forEach(mesh => { (mesh as T.InstancedMesh).instanceMatrix.needsUpdate = true; });
  }
  group.userData = { adults: people.length, walkers: people.filter(p => p.walking).length, bikini: 56, thong: 28 };
  update(0);
  return { group, update };
}
