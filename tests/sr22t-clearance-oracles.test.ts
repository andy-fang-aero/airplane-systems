// Negative controls protect the existing mesh audit during a tests-only refactor.
import { BoxGeometry } from "three";
import { expect, it } from "vitest";
import { doorSolid, doorIntersects } from "./sr22t-door-clearance";
import { ignitionSolid, ignitionIntersects, sampledGap } from "./sr22t-ignition-clearance";

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
