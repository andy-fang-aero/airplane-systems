/**
 * SR22T flap hinges: each flap turns about the line through its three hinge bolts, below the wing skin
 * (AMM 13773-002 Rev 7 57-40 Fig 57-40-1 PDF p. 2401; 57-50 Fig 57-50-6 PDF p. 2422), through 0%, 50% (16°) and 100%
 * (35.5°) (POH 13772-007 7-22; AMM 27-50 PDF p. 1055). The hinge brackets and fairings stay on the wing, so no vertex of
 * theirs may be inside the flap shell anywhere in that range, and no flap vertex inside them; check edge crossings too.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CAT } from "@/aircraft/sr22t/parts";
import { FLAP_HINGE_Z } from "@/aircraft/sr22t/rig";
import { flapHinge, flapHingeAt } from "@/aircraft/sr22t/parts/surfaces";
import type { PartSpec } from "@/lib/catalogue";

import { points, tris, inside, edgeCrossing } from "./mesh-clearance";

const placed = (p: PartSpec) => new THREE.Matrix4().makeTranslation(...(p.pos ?? [0, 0, 0]));
const fixed = CAT.parts.filter(
  (p) => !p.parent && (p.name === "Flap hinge bracket" || p.name === "Flap hinge fairing"),
);
const flapGeometry = new Map(CAT.surfaces.filter((s) => s.key.startsWith("flap")).map((s) => [s.key, s.geo()]));
/** The flap mesh in airplane coordinates at deflection deg (trailing edge down), as Airplane.tsx drives it. */
const flapAt = (key: "flapR" | "flapL", deg: number) => {
  const sf = CAT.surfaces.find((s) => s.key === key)!,
    ang = ((key === "flapR" ? 1 : -1) * deg * Math.PI) / 180,
    m = new THREE.Matrix4()
      .makeTranslation(...sf.pivot)
      .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(...sf.axis), ang));
  return tris(flapGeometry.get(key)!, m);
};
const DEFLECTIONS = [...Array.from({ length: 356 }, (_, i) => i * 0.1), 16, 35.5];

describe("SR22T flap hinges", () => {
  it("three hinge brackets and fairings per wing, each bolt on the flap's hinge line (AMM Fig 57-40-1, Fig 57-50-6)", () => {
    for (const name of ["Flap hinge bracket", "Flap hinge fairing"])
      expect(fixed.filter((p) => p.name === name)).toHaveLength(6);
    for (const s of [1, -1]) {
      const [a, b] = flapHinge(s),
        sf = CAT.surfaces.find((x) => x.key === (s > 0 ? "flapR" : "flapL"))!;
      expect(sf.pivot).toEqual([a.x, a.y, a.z]);
      const axis = b.clone().sub(a).normalize();
      for (const z of FLAP_HINGE_Z) {
        const h = flapHingeAt(s * z),
          off = h.clone().sub(a);
        expect(
          off
            .clone()
            .sub(axis.clone().multiplyScalar(off.dot(axis)))
            .length(),
        ).toBeLessThan(1e-9);
        expect(fixed.filter((p) => p.pos && Math.abs(p.pos[2] - s * z) < 1e-9)).toHaveLength(2);
      }
    }
  });

  it("no hinge bracket or fairing crosses or lies inside the flap shell from 0 to 35.5°, and no flap vertex inside them", () => {
    for (const key of ["flapR", "flapL"] as const) {
      const s = key === "flapR" ? 1 : -1,
        mine = fixed
          .filter((p) => Math.sign(p.pos![2]) === s)
          .map((p) => {
            const m = placed(p),
              t = tris(p.geo(), m);
            return {
              name: p.name,
              z: p.pos![2],
              v: points(p.geo(), m),
              t,
              box: new THREE.Box3().setFromPoints(t.flat()),
            };
          });
      for (const deg of DEFLECTIONS) {
        const flap = flapAt(key, deg),
          fbox = new THREE.Box3().setFromPoints(flap.flat()),
          fv = flap.flat();
        for (const h of mine) {
          expect(edgeCrossing(h.t, flap), `${h.name} edge crosses ${key} at ${deg}°`).toBeUndefined();
          expect(edgeCrossing(flap, h.t), `${key} edge crosses ${h.name} at ${deg}°`).toBeUndefined();
          const hit = h.v.find((p) => inside(p, flap, fbox));
          expect(hit, `${h.name} at z ${h.z.toFixed(2)} inside ${key} at ${deg}°: ${hit?.toArray()}`).toBeUndefined();
          const back = fv.find((p) => inside(p, h.t, h.box));
          expect(back, `${key} vertex inside ${h.name} at z ${h.z.toFixed(2)} at ${deg}°`).toBeUndefined();
        }
      }
    }
  }, 120_000);

  it("the flaps move trailing edge down on both sides (POH 7-22)", () => {
    for (const key of ["flapR", "flapL"] as const) {
      const low = (deg: number) =>
        Math.min(
          ...flapAt(key, deg)
            .flat()
            .map((p) => p.y),
        );
      expect(low(35.5)).toBeLessThan(low(16));
      expect(low(16)).toBeLessThan(low(0));
    }
  });

  it("leaves the aileron hinge fairings as they were: unpinned and out of the Flight controls locate list", () => {
    const ail = CAT.parts.filter((p) => p.name === "Aileron hinge fairing");
    expect(ail).toHaveLength(4);
    for (const p of ail) expect(p.pin).toBeFalsy();
    expect(CAT.pinned("controls").map((p) => p.name)).not.toContain("Aileron hinge fairing");
  });

  it("the hinge bolts are below the stowed flap, outside its shell (the flap turns about an external hinge line)", () => {
    for (const key of ["flapR", "flapL"] as const) {
      const s = key === "flapR" ? 1 : -1,
        flap = flapAt(key, 0),
        box = new THREE.Box3().setFromPoints(flap.flat());
      for (const z of FLAP_HINGE_Z) expect(inside(flapHingeAt(s * z), flap, box)).toBe(false);
    }
  });
});
