/** SR22T door hardware against the closed skin, doors shut and latched (POH 13772-007 Fig 1-1 loft).
 * Hinges: AMM 13773-002 Rev 7 Fig 52-10-1 sheet 3 Details C/D (PDF 2013), pins in a fuselage pocket.
 * Handle and lock: Fig 52-10-3 (PDF 2027), Fig 52-10-5 (PDF 2031), flush. Latches: Fig 52-10-6 (PDF 2037), inside.
 * Skin-QA method: a vertex within 1 mm of the skin is flush. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { fRing, doorHinge, inFus, onSkin } from "@/aircraft/sr22t/geometry";
import { CAT } from "@/aircraft/sr22t/parts";
import { box } from "@/lib/geometry";
import type { PartSpec } from "@/lib/catalogue";

const FLUSH = 0.001;

/** Signed distance to the loft in the station plane: positive outside. The in-plane distance bounds the true one. */
const signed = (p: THREE.Vector3) => {
  const side = p.z < 0 ? -1 : 1;
  const ring = fRing(p.x, 1, 1440, -Math.PI / 2, Math.PI / 2, false);
  const d = Math.min(...ring.map((v) => Math.hypot(v.x - p.x, v.y - p.y, side * v.z - p.z)));
  return inFus(p) ? -d : d;
};

/** World vertices of a part in its rest pose: closed doors put the door group at its hinge pivot, unrotated. */
const vertices = (p: PartSpec) => {
  const g = p.geo();
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...(p.pos ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
    new THREE.Vector3(...(p.scale ?? [1, 1, 1])),
  );
  if (p.parent?.startsWith("door:"))
    m.premultiply(new THREE.Matrix4().makeTranslation(doorHinge(p.parent.slice(5) as "L").pivot));
  else expect(p.parent).toBeUndefined();
  const pos = g.attributes.position;
  const pts = Array.from({ length: pos.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m),
  );
  g.dispose();
  return pts;
};
/** Outermost vertex of every instance of a part, in metres (positive = outside the skin). */
const outermost = (name: string) => {
  const parts = CAT.parts.filter((p) => p.name === name);
  expect(parts.length, name).toBeGreaterThan(0);
  return parts.map((p) => Math.max(...vertices(p).map(signed)));
};

describe("SR22T door hardware and the skin", () => {
  it("the probe sees a box standing on the skin as outside and a box sunk below it as inside", () => {
    const spec = (inward: number): PartSpec => ({
      id: "probe",
      sys: [],
      geo: () => box(0.02, 0.02, 0.02),
      pos: [1.3, 0, onSkin(1.3, 0, 1, 1).z - inward],
    });
    expect(Math.max(...vertices(spec(0)).map(signed))).toBeGreaterThan(0.005);
    expect(Math.max(...vertices(spec(0.02)).map(signed))).toBeLessThan(0);
  });

  it("hinge pins and plates sit in their fuselage pocket, inside the skin (AMM Fig 52-10-1 sh 3 Details C/D)", () => {
    for (const name of ["Upper door hinge", "Lower door hinge", "Door hinge plate"])
      for (const d of outermost(name)) expect(d, name).toBeLessThanOrEqual(FLUSH);
  });

  it("latches, strikers, seal and jamb return arm stay inside the closed skin (AMM Figs 52-10-1, -6, -8; 52-30-1)", () => {
    for (const name of [
      "Door latch",
      "Striker pin",
      "Door seal",
      "Gas strut jamb return arm",
      "Baggage door latch",
      "Baggage door seal",
    ])
      for (const d of outermost(name)) expect(d, name).toBeLessThanOrEqual(FLUSH);
  });

  it("exterior handle, housing and locks lie flush with the door skin, visible but not proud (Figs 52-10-3, -5; 52-30-1)", () => {
    for (const name of ["Exterior door handle", "Exterior handle housing", "Door lock cylinder", "Baggage door lock"]) {
      for (const d of outermost(name)) {
        expect(d, `${name} not proud`).toBeLessThanOrEqual(FLUSH);
        expect(d, `${name} reaches the skin`).toBeGreaterThan(-0.003);
      }
      expect(
        CAT.parts.filter((p) => p.name === name).every((p) => p.ext),
        `${name} is exterior hardware`,
      ).toBe(true);
    }
  });

  it("the baggage door piano hinge rides on the skin line, external by design (AMM Fig 52-30-1 sh 1 PDF 2055)", () => {
    for (const d of outermost("Baggage door hinge")) {
      expect(d).toBeLessThanOrEqual(0.01);
      expect(d).toBeGreaterThan(0);
    }
  });
});
