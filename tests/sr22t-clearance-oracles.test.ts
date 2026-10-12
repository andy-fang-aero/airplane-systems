// Negative controls protect the existing mesh audit during a tests-only refactor.
import { BoxGeometry, LineCurve3, Matrix4, Quaternion, TubeGeometry, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { expect, it } from "vitest";
import { doorSolid, doorIntersects } from "./sr22t-door-clearance";
import { ignitionSolid, ignitionIntersects, sampledGap } from "./sr22t-ignition-clearance";
import { pitotClearance } from "./sr22t-pitot-clearance";

// Synthetic metre-scale boxes, not aircraft dimensions or installation tolerances.
const auditCollision = <S extends ReturnType<typeof ignitionSolid>>(
  name: string,
  solid: (p: Parameters<typeof ignitionSolid>[0]) => S,
  intersects: (a: S, b: S) => boolean,
) => {
  it(`${name} rejects a planted crossing and complete containment`, () => {
    const outer = solid({ id: "outer", sys: [], geo: () => new BoxGeometry(1, 1, 1) });
    try {
      for (const [x, collision] of [
        [2, false],
        [0.45, true],
        [0, true],
      ] as const) {
        const intrusion = solid({
          id: "intrusion",
          sys: [],
          geo: () => new BoxGeometry(0.2, 0.2, 0.2),
          pos: [x, 0, 0],
        });
        try {
          expect(intersects(outer, intrusion)).toBe(collision);
        } finally {
          intrusion.g.dispose();
        }
      }
    } finally {
      outer.g.dispose();
    }
  });
};
auditCollision("ignition", ignitionSolid, ignitionIntersects);
auditCollision("door", doorSolid, doorIntersects);

it("the pitot audit rejects surface crossings and complete wire containment", () => {
  const wire = new TubeGeometry(new LineCurve3(new Vector3(-0.03, 0, 0), new Vector3(0.03, 0, 0)), 4, 0.003, 8);
  const obstacle = new BoxGeometry(0.2, 0.2, 0.2);
  const tree = new MeshBVH(wire);
  try {
    for (const [x, surfaceIntersection, contained] of [
      [0.2, false, false],
      [0.09, true, true],
      [0, false, true],
    ] as const) {
      const result = pitotClearance(tree, obstacle, new Matrix4().makeTranslation(x, 0, 0));
      expect(result.surfaceIntersection, `obstacle x=${x}`).toBe(surfaceIntersection);
      expect(result.contained, `obstacle x=${x}`).toBe(contained);
      // In the enclosed case both original surface-only checks pass despite the collision.
      if (!surfaceIntersection) expect(result.closest.distance).toBeGreaterThanOrEqual(0.002);
    }
    // The obstacle matrix is the renderer's composed parent/local transform, including mirrored scale.
    wire.translate(2, 1, -3);
    tree.refit();
    const matrix = new Matrix4().compose(
      new Vector3(2, 1, -3),
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 4),
      new Vector3(-1, 1.5, 1),
    );
    const transformed = pitotClearance(tree, obstacle, matrix);
    expect(transformed.surfaceIntersection).toBe(false);
    expect(transformed.closest.distance).toBeGreaterThanOrEqual(0.002);
    expect(transformed.contained).toBe(true);
  } finally {
    wire.dispose();
    obstacle.dispose();
  }
});

it("the sampled surface-gap audit rejects a planted sub-5-mm margin", () => {
  const a = ignitionSolid({ id: "a", sys: [], geo: () => new BoxGeometry(0.02, 0.02, 0.02) });
  const b = ignitionSolid({ id: "b", sys: [], geo: () => new BoxGeometry(0.02, 0.02, 0.02), pos: [0.03, 0, 0] });
  try {
    expect(sampledGap(a, b)).toBeGreaterThanOrEqual(0.005);
    b.g.translate(-0.008, 0, 0);
    b.g.computeBoundingBox();
    b.box.copy(b.g.boundingBox!);
    expect(sampledGap(a, b)).toBeLessThan(0.005);
  } finally {
    a.g.dispose();
    b.g.dispose();
  }
});
