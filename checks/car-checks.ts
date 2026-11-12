import assert from "node:assert/strict";
import { Box3, Mesh, Vector3 } from "three";
import { createCar } from "../src/car.ts";
import { VEHICLE } from "../src/vehicle.ts";

// Geometry checks use a canvas stub. Browser texture drawing is checked separately.
globalThis.document = {
  createElement() {
    return {
      width: 0,
      height: 0,
      getContext() {
        return new Proxy({}, { get: () => () => {} });
      },
    };
  },
} as unknown as Document;

const car = createCar();
car.group.updateMatrixWorld(true);
const bounds = new Box3().setFromObject(car.group);
const size = bounds.getSize(new Vector3());
assert.equal(car.group.name, "Porsche Cayenne");
assert.ok(size.y > 1.65 && size.y < 1.75);
assert.ok(size.z > 4.85 && size.z < VEHICLE.halfLength * 2);
assert.ok(size.x <= VEHICLE.halfWidth * 2 + 0.001);
assert.ok(bounds.min.y >= -0.001);
car.group.traverse((object) => {
  if (!(object instanceof Mesh)) return;
  const position = object.geometry.getAttribute("position");
  assert.ok(Array.from(position.array).every(Number.isFinite));
});
for (let frame = 0; frame < 120; frame++) {
  car.update(12, 0.2, 0.6, frame > 60, frame / 60, 1);
}
car.group.traverse((object) => {
  assert.ok(object.position.toArray().every(Number.isFinite));
  assert.ok(
    [object.rotation.x, object.rotation.y, object.rotation.z].every(
      Number.isFinite,
    ),
  );
});
console.log(
  "PASS Cayenne dimensions, collision envelope, finite geometry and animations",
  size.toArray(),
);
