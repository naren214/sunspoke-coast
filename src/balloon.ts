import * as T from 'three';
import { CITY } from './city';
import type { Lighting } from './types';

const envelopeHeight = 64;

function envelopeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const colors = ['#a94032', '#dc6842', '#f28e50', '#e07546', '#c85237', '#ef8150'];
  const panelWidth = canvas.width / 24;
  for (let panel = 0; panel < 24; panel++) {
    const start = Math.round(panel * panelWidth);
    const end = Math.round((panel + 1) * panelWidth);
    ctx.fillStyle = colors[panel % colors.length];
    ctx.fillRect(start, 0, end - start, canvas.height);
  }

  ctx.fillStyle = '#213b49';
  ctx.fillRect(0, 463, canvas.width, 49);
  ctx.fillRect(0, 155, canvas.width, 149);
  ctx.fillStyle = '#f8e5bb';
  ctx.fillRect(0, 164, canvas.width, 131);

  ctx.fillStyle = 'rgba(42, 22, 21, 0.17)';
  for (let panel = 0; panel < 24; panel++) {
    ctx.fillRect(Math.round(panel * panelWidth), 0, 2, canvas.height);
  }

  const labelWidth = canvas.width / 4;
  ctx.font = 'bold 100px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1e3645';
  for (let side = 0; side < 4; side++) {
    ctx.fillText('NAREN', (side + .5) * labelWidth, 235, labelWidth * .78);
  }

  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = T.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function createCountyBalloon(group: T.Group) {
  const root = new T.Group();
  root.name = 'NAREN hot-air balloon';
  group.add(root);

  const profile = new T.SplineCurve([
    new T.Vector2(4.5, 0), new T.Vector2(8, 8), new T.Vector2(19, 17),
    new T.Vector2(28, 28), new T.Vector2(31, 39), new T.Vector2(27, 51),
    new T.Vector2(17, 60), new T.Vector2(0, envelopeHeight)
  ]);
  const geometry = new T.LatheGeometry(profile.getPoints(32), 72);
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setY(i, positions.getY(i) / envelopeHeight);

  const wrap = envelopeTexture();
  const fabric = new T.MeshStandardMaterial({
    map: wrap, emissiveMap: wrap, emissive: '#ffffff', emissiveIntensity: .08, roughness: .95
  });
  const envelope = new T.Mesh(geometry, fabric);
  envelope.name = 'Balloon envelope';
  root.add(envelope);

  const wicker = new T.MeshStandardMaterial({ color: '#a8774c', roughness: .92 });
  const straps = new T.MeshStandardMaterial({ color: '#3d2b29', roughness: .8 });
  const basket = new T.Mesh(new T.BoxGeometry(5.8, 3.3, 4.6), wicker);
  basket.position.y = -12;
  root.add(basket);
  const trim = new T.BoxGeometry(6, .35, 4.8);
  for (const y of [-13.55, -10.38]) {
    const rim = new T.Mesh(trim, straps);
    rim.position.y = y;
    root.add(rim);
  }
  const up = new T.Vector3(0, 1, 0);
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const lower = new T.Vector3(x * 2.5, -10.3, z * 1.9);
    const upper = new T.Vector3(x * 3.15, 0, z * 3.15);
    const length = lower.distanceTo(upper);
    const rope = new T.Mesh(new T.CylinderGeometry(.1, .1, length, 6), straps);
    rope.position.lerpVectors(lower, upper, .5);
    rope.quaternion.setFromUnitVectors(up, upper.sub(lower).normalize());
    root.add(rope);
  }

  const centerX = (CITY.minX + CITY.maxX) / 2;
  const centerZ = (CITY.minZ + CITY.maxZ) / 2;
  const flightHeight = 122;
  function update(time: number, lighting: Lighting) {
    root.position.set(centerX + 12 * Math.sin(time * .046), flightHeight + 2.5 * Math.sin(time * .32), centerZ + 9 * Math.sin(time * .038));
    root.rotation.y = -Math.PI / 4 + .22 * Math.sin(time * .055);
    fabric.emissiveIntensity = lighting === 'night' ? .48 : lighting === 'twilight' ? .22 : .08;
  }
  update(0, 'golden');
  return update;
}
