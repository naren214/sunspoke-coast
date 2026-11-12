import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Car } from './types';

/** A single hand-built roadster. All meshes use metres and face local -Z. */
export function createCar(): Car {
  const group = new THREE.Group();
  group.name = 'Sunspoke roadster';
  const body = new THREE.Group();
  group.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x07585d, metalness: 0.76, roughness: 0.23, clearcoat: 1, clearcoatRoughness: 0.15 });
  const leather = new THREE.MeshStandardMaterial({ color: 0xa75a30, roughness: 0.76 });
  const leatherLight = new THREE.MeshStandardMaterial({ color: 0xc9854b, roughness: 0.79 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111a1b, roughness: 0.53 });
  const carpet = new THREE.MeshStandardMaterial({ color: 0x122321, roughness: 1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc3cfca, metalness: 0.92, roughness: 0.22 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x171b1d, roughness: 0.92 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xaad9d9, transparent: true, opacity: 0.22, metalness: 0.1, roughness: 0.07, side: THREE.DoubleSide, depthWrite: false });
  const tailMaterial = new THREE.MeshStandardMaterial({ color: 0x8f0914, emissive: 0xee1929, emissiveIntensity: 0.2, roughness: 0.28 });
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xe6e4ce, emissive: 0xffedce, emissiveIntensity: 0.2, roughness: 0.18 });
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = body) => {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(x, y, z);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  };
  const rounded = (w: number, h: number, d: number, radius: number, material: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = body) => mesh(new RoundedBoxGeometry(w, h, d, 3, radius), material, x, y, z, parent);
  const tube = (points: number[][], radius: number, material: THREE.Material, parent: THREE.Object3D = body) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    return mesh(new THREE.TubeGeometry(curve, Math.max(4, points.length * 5), radius, 6, false), material, 0, 0, 0, parent);
  };
  // Lofted sections give the body its pinched nose, broad shoulders and tapered tail.
  const sections = [
    [-2.20, 0.64, 0.57], [-2.10, 0.78, 0.65], [-1.80, 0.88, 0.71],
    [-1.35, 0.92, 0.73], [-0.80, 0.87, 0.71], [0.00, 0.85, 0.68],
    [0.80, 0.90, 0.71], [1.35, 0.94, 0.73], [1.85, 0.87, 0.69], [2.16, 0.75, 0.62],
  ];
  const crossSection = [[0, -.22], [.75, -.22], [1, -.08], [1, .08], [.85, .16], [0, .17], [-.85, .16], [-1, .08], [-1, -.08], [-.75, -.22]];
  const vertices: number[] = [];
  const indices: number[] = [];
  sections.forEach(([z, w, h]) => crossSection.forEach(([x, y]) => vertices.push(x * w, h + y, z)));
  for (let j = 0; j < sections.length - 1; j++) {
    for (let i = 0; i < crossSection.length; i++) {
      const next = (i + 1) % crossSection.length;
      const a = j * crossSection.length + i;
      const b = j * crossSection.length + next;
      const c = (j + 1) * crossSection.length + i;
      const d = (j + 1) * crossSection.length + next;
      indices.push(a, b, c, b, d, c);
    }
  }
  // End faces are hidden behind the sculpted bumper caps.
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  hull.setIndex(indices);
  hull.computeVertexNormals();
  mesh(hull, paint);
  rounded(1.47, .28, .25, .12, paint, 0, .60, -2.10);
  rounded(1.53, .30, .22, .10, paint, 0, .62, 2.05);

  // The hood and rear deck are separate, leaving an actual open cabin between them.
  rounded(1.64, .23, 1.47, .14, paint, 0, .84, -1.35);
  rounded(1.67, .21, 1.12, .12, paint, 0, .84, 1.48);
  rounded(1.37, .065, 1.46, .03, carpet, 0, .86, .18);
  for (const side of [-1, 1]) {
    rounded(.18, .29, 1.56, .065, paint, side * .81, .85, .16);
    rounded(.065, .055, 1.43, .025, chrome, side * .79, 1.00, .16);
    rounded(.08, .14, 1.30, .035, leather, side * .70, .88, .18);
    rounded(.055, .17, 1.28, .02, paint, side * .855, .52, .02);
    // Shoulder creases, handles and small front-wing vents.
    tube([[side * .88, .78, -.68], [side * .90, .78, .1], [side * .91, .80, 1.10]], .012, chrome);
    rounded(.025, .025, .17, .01, chrome, side * .905, .88, .52);
    for (let vent = 0; vent < 3; vent++) rounded(.018, .035, .12, .008, dark, side * .91, .77, -.93 + vent * .07);
    tube([[side * .79, .79, -.65], [side * .99, 1.02, -.52]], .018, chrome);
    const mirror = rounded(.19, .095, .19, .045, paint, side * 1.015, 1.04, -.53);
    mirror.rotation.y = side * -.20;
    rounded(.14, .064, .012, .015, chrome, side * 1.015, 1.046, -.426);
    // Upholstered seats and visible, stitched ribs.
    const seatX = side * .365;
    rounded(.54, .13, .57, .065, leather, seatX, .93, .28);
    const back = rounded(.54, .55, .15, .065, leather, seatX, 1.14, .57);
    back.rotation.x = -.12;
    rounded(.30, .19, .13, .055, leather, seatX, 1.45, .60);
    for (let stitch = -2; stitch <= 2; stitch++) {
      rounded(.019, .016, .42, .007, leatherLight, seatX + stitch * .075, 1.001, .24);
      const rib = rounded(.019, .36, .014, .006, leatherLight, seatX + stitch * .075, 1.17, .475);
      rib.rotation.x = -.12;
    }
    // Roll hoops remain below the visual prominence of the open windshield.
    tube([[seatX - .18, 1.03, .85], [seatX - .18, 1.32, .85], [seatX, 1.39, .85], [seatX + .18, 1.32, .85], [seatX + .18, 1.03, .85]], .026, chrome);
  }
  rounded(.16, .17, 1.10, .04, dark, 0, .98, .10);
  rounded(.13, .045, .35, .02, leather, 0, 1.08, .40);
  mesh(new THREE.CylinderGeometry(.023, .027, .12, 8), chrome, 0, 1.12, -.02);
  mesh(new THREE.SphereGeometry(.037, 10, 8), dark, 0, 1.185, -.02);
  rounded(1.40, .19, .24, .045, leather, 0, 1.055, -.45);
  rounded(1.31, .035, .19, .015, dark, 0, 1.16, -.45);
  rounded(.22, .125, .02, .012, dark, .15, 1.07, -.31);
  const screen = new THREE.MeshBasicMaterial({ color: 0x83b7b7 });
  rounded(.14, .065, .008, .005, screen, .15, 1.075, -.295);
  for (const x of [-.46, -.33]) {
    const gauge = mesh(new THREE.CircleGeometry(.047, 20), dark, x, 1.11, -.307);
    gauge.rotation.x = -.12;
    tube([[x - .024, 1.094, -.298], [x, 1.129, -.298]], .003, chrome);
  }
  const steeringPivot = new THREE.Group();
  steeringPivot.position.set(-.38, 1.14, -.16);
  steeringPivot.rotation.x = -.38;
  body.add(steeringPivot);
  mesh(new THREE.TorusGeometry(.155, .018, 8, 32), dark, 0, 0, 0, steeringPivot);
  mesh(new THREE.SphereGeometry(.045, 10, 8), chrome, 0, 0, 0, steeringPivot).scale.z = .4;
  for (const angle of [0, 2.09, 4.19]) tube([[0, 0, 0], [.136 * Math.sin(angle), .136 * Math.cos(angle), 0]], .011, chrome, steeringPivot);

  // One transparent pane, leaning back toward the cabin, with slender polished pillars.
  const windshieldGeometry = new THREE.BufferGeometry();
  windshieldGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-.72, 1.12, -.61, .72, 1.12, -.61, .65, 1.59, -.34, -.65, 1.59, -.34], 3));
  windshieldGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  windshieldGeometry.computeVertexNormals();
  mesh(windshieldGeometry, glass);
  tube([[-.72, 1.12, -.61], [-.65, 1.59, -.34], [0, 1.62, -.32], [.65, 1.59, -.34], [.72, 1.12, -.61]], .019, chrome);
  tube([[-.72, 1.12, -.61], [0, 1.13, -.65], [.72, 1.12, -.61]], .022, dark);
  tube([[0, 1.58, -.34], [0, 1.47, -.27]], .011, chrome);
  rounded(.18, .067, .035, .015, dark, 0, 1.46, -.26);
  for (const side of [-1, 1]) {
    const head = rounded(.43, .10, .065, .045, lampMaterial, side * .52, .77, -2.207);
    head.rotation.y = side * -.12;
    rounded(.50, .11, .055, .035, tailMaterial, side * .50, .76, 2.17);
    rounded(.30, .035, .025, .015, chrome, side * .46, .49, -2.215);
    const exhaust = mesh(new THREE.CylinderGeometry(.055, .055, .15, 12), chrome, side * .57, .40, 2.12);
    exhaust.rotation.x = Math.PI / 2;
    const exhaustInside = mesh(new THREE.CircleGeometry(.043, 12), dark, side * .57, .40, 2.201);
    exhaustInside.rotation.y = 0;
  }
  rounded(.63, .15, .045, .05, dark, 0, .49, -2.22);
  for (let slat = -3; slat <= 3; slat++) rounded(.012, .11, .015, .004, chrome, slat * .075, .49, -2.25);
  rounded(.36, .105, .018, .01, chrome, 0, .60, 2.19);
  rounded(.30, .072, .02, .005, dark, 0, .60, 2.203);
  mesh(new THREE.SphereGeometry(.035, 10, 8), chrome, 0, .966, -1.83).scale.set(1, .18, 1);

  const wheels: { pivot: THREE.Group; spin: THREE.Group; front: boolean }[] = [];
  for (const side of [-1, 1]) {
    for (const z of [-1.36, 1.36]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * .89, .385, z);
      group.add(pivot);
      const spin = new THREE.Group();
      pivot.add(spin);
      const tire = mesh(new THREE.CylinderGeometry(.363, .363, .255, 36), rubber, 0, 0, 0, spin);
      tire.rotation.z = Math.PI / 2;
      for (const face of [-1, 1]) {
        const outerX = face * .132;
        const shoulder = mesh(new THREE.TorusGeometry(.298, .066, 10, 36), rubber, face * .073, 0, 0, spin);
        shoulder.rotation.y = Math.PI / 2;
        const rim = mesh(new THREE.TorusGeometry(.248, .018, 8, 32), chrome, outerX, 0, 0, spin);
        rim.rotation.y = Math.PI / 2;
        const brake = mesh(new THREE.CylinderGeometry(.215, .215, .009, 32), dark, face * .10, 0, 0, spin);
        brake.rotation.z = Math.PI / 2;
        const hub = mesh(new THREE.CylinderGeometry(.065, .065, .026, 16), chrome, face * .14, 0, 0, spin);
        hub.rotation.z = Math.PI / 2;
        for (let spoke = 0; spoke < 10; spoke++) {
          const angle = spoke / 10 * Math.PI * 2;
          const bar = rounded(.023, .027, .215, .007, chrome, outerX, Math.sin(angle) * .135, Math.cos(angle) * .135, spin);
          bar.rotation.x = -angle;
        }
      }
      wheels.push({ pivot, spin, front: z < 0 });
    }
  }
  const headlights: THREE.SpotLight[] = [];
  for (const side of [-1, 1]) {
    const lamp = new THREE.SpotLight(0xffedce, 0, 48, .42, .65, 1.5);
    lamp.position.set(side * .55, .81, -2.12);
    lamp.target.position.set(side * .65, .05, -25);
    body.add(lamp, lamp.target);
    headlights.push(lamp);
  }
  // Keep the detailed model inexpensive by joining static parts within each animated group.
  const batchParts = (parent: THREE.Group) => {
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of [...parent.children]) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
      child.updateMatrix();
      const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      geometry.deleteAttribute('uv');
      geometry.applyMatrix4(child.matrix);
      const batch = batches.get(child.material) ?? [];
      batch.push(geometry);
      batches.set(child.material, batch);
      parent.remove(child);
      child.geometry.dispose();
    }
    for (const [material, geometries] of batches) {
      const geometry = mergeGeometries(geometries, false);
      if (geometry) mesh(geometry, material, 0, 0, 0, parent);
      geometries.forEach(part => part.dispose());
    }
  };
  batchParts(body);
  batchParts(steeringPivot);
  wheels.forEach(wheel => batchParts(wheel.spin));
  let wheelAngle = 0;
  let previousTime = 0;
  return {
    group,
    update(speed, steering, throttle, braking, time, night) {
      const dt = Math.min(.05, Math.max(0, time - previousTime));
      previousTime = time;
      wheelAngle -= speed * dt / .363;
      for (const wheel of wheels) {
        wheel.spin.rotation.x = wheelAngle;
        wheel.pivot.rotation.y = wheel.front ? steering : 0;
      }
      body.rotation.z = THREE.MathUtils.damp(body.rotation.z, -steering * Math.min(Math.abs(speed) / 30, 1) * .07, 6, dt);
      body.rotation.x = THREE.MathUtils.damp(body.rotation.x, braking ? -.016 : throttle * .012, 7, dt);
      body.position.y = Math.sin(time * 7) * Math.min(Math.abs(speed) / 30, 1) * .006;
      steeringPivot.rotation.z = steering * 2;
      tailMaterial.emissiveIntensity = braking ? 3 : .15 + night * .8;
      lampMaterial.emissiveIntensity = .25 + night * 2.3;
      for (const headlight of headlights) headlight.intensity = night * 20;
    },
  };
}
