/** The shared engine-gap audit places every part group at its Airplane.tsx rest pose and refuses unknown groups. */
import { Box3, BoxGeometry, Euler, Matrix4, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { CAT, NOSE_CASTER, NOSE_GEAR, PROP } from "@/aircraft/sr22t/parts";
import { toV } from "@/lib/math";
import { solid } from "./sr22t-engine-gap";
import { ignitionSolid, ignitionIntersects } from "./sr22t-ignition-clearance";

const localBox = (p: (typeof CAT.parts)[number]) => {
  const g = p.geo();
  g.applyMatrix4(
    new Matrix4().compose(
      toV(p.pos ?? [0, 0, 0]),
      new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
      toV(p.scale ?? [1, 1, 1]),
    ),
  );
  g.computeBoundingBox();
  const box = g.boundingBox!.clone();
  g.dispose();
  return box;
};

describe("sr22t-engine-gap solid()", () => {
  it("moves nose gear and caster parts by their group origins", () => {
    for (const [parent, origin] of [
      ["noseGear", toV(NOSE_GEAR)],
      ["caster", toV(NOSE_GEAR).add(toV(NOSE_CASTER))],
    ] as const) {
      const part = CAT.parts.find((p) => p.parent === parent)!;
      const expected = localBox(part).translate(origin);
      const placed = solid(part).box;
      expect(placed.min.distanceTo(expected.min)).toBeLessThan(1e-6);
      expect(placed.max.distanceTo(expected.max)).toBeLessThan(1e-6);
    }
  });

  it("places every propeller blade around the hub, not at the airplane origin", () => {
    for (const i of [0, 1, 2]) {
      const part = CAT.parts.find((p) => p.parent === `blade:${i}`)!;
      const box: Box3 = solid(part).box;
      expect(box.distanceToPoint(toV(PROP))).toBeLessThan(1.2);
      expect(box.distanceToPoint(toV([0, 0, 0]))).toBeGreaterThan(2);
    }
  });

  it("places every catalogue part group it is given", () => {
    expect(() => CAT.parts.map(solid)).not.toThrow();
  });

  it("throws on a part group with no rest-pose transform", () => {
    const part = CAT.parts.find((p) => !p.parent)!;
    expect(() => solid({ ...part, parent: "wingFold:L" })).toThrow(
      /no rest-pose transform for part group "wingFold:L"/,
    );
  });
});

it("the ignition oracle detects a collision at the rendered nose-gear position", () => {
  const part = CAT.parts.find((p) => p.parent === "noseGear")!;
  const geometry = part.geo();
  geometry.translate(...NOSE_GEAR);
  const positions = geometry.getAttribute("position"),
    index = geometry.index;
  const center = new Vector3();
  for (let i = 0; i < 3; i++) center.add(new Vector3().fromBufferAttribute(positions, index ? index.getX(i) : i));
  center.divideScalar(3);
  const strut = ignitionSolid(part);
  const probe = ignitionSolid({
    id: "probe",
    sys: ["engine"],
    geo: () => new BoxGeometry(0.01, 0.01, 0.01),
    pos: center.toArray(),
  });
  try {
    expect(ignitionIntersects(probe, strut)).toBe(true);
  } finally {
    geometry.dispose();
    strut.g.dispose();
    probe.g.dispose();
  }
});

it("both clearance oracles place every parent group in the same rest pose", () => {
  const parents = new Set(CAT.parts.map((p) => p.parent));
  for (const parent of parents) {
    const part = { ...CAT.parts.find((p) => p.parent === parent)!, geo: () => new BoxGeometry(0.1, 0.1, 0.1) };
    const ignition = ignitionSolid(part),
      expected = solid(part).box;
    try {
      expect(ignition.box.min.distanceTo(expected.min), parent).toBeLessThan(1e-6);
      expect(ignition.box.max.distanceTo(expected.max), parent).toBeLessThan(1e-6);
    } finally {
      ignition.g.dispose();
    }
  }
  const part = CAT.parts.find((p) => !p.parent)!;
  expect(() => ignitionSolid({ ...part, parent: "wingFold:L" })).toThrow(/no rest-pose transform/);
});
