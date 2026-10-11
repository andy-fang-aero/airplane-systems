/**
 * Turbocharger, air box and wastegate geometry. Stations derive from the dimensioned Continental M-18
 * installation drawing 657645 (Fig 5-33 sheet 1 p. 5-53, PDF p. 148; Fig 5-35 sheet 3 p. 5-55, PDF p. 150), registered
 * on the cylinder layout (Fig 5-34 sheet 2, PDF p. 149). AMM Fig 81-20-1 (PDF p. 2815) gives the joints.
 */
import { expect, it } from "vitest";
import { DoubleSide, Euler, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from "three";
import { CAT, CYLS, HEADER, PROP, cylExhaust } from "@/aircraft/sr22t/parts";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { inFus } from "@/aircraft/sr22t/geometry";
import { ACCESSORY_FACE_X, IN } from "@/aircraft/sr22t/engine-datum";
import {
  AIR_BOX,
  AIR_BOX_SIZE,
  COMPRESSOR_INLET,
  COMPRESSOR_INLET_R,
  COMPRESSOR_OUTLET,
  COMPRESSOR_R,
  TIT_PROBE,
  TURBINE_AFT_X,
  TURBINE_R,
  TURBO,
  TURBO_HOUSINGS,
  TURBO_OIL_RES,
  WASTEGATE,
  WASTEGATE_ACTUATOR,
  insideTurbo,
} from "@/aircraft/sr22t/turbo-layout";
import { TURBINE_INLET, EXHAUST_RADIUS } from "@/aircraft/sr22t/exhaust-layout";
import { toV } from "@/lib/math";
import type { PartSpec } from "@/lib/catalogue";
const flow = (key: string) => FLOWS.find((f) => f.key === key)!;
const sided = (name: string, s: number) => CAT.parts.find((p) => p.name === name && Math.sign(p.pos![2]) === s)!;
const titProbe = (s: number) => sided("TIT probe — " + (s < 0 ? "LH" : "RH"), s);
const worldGeo = (p: PartSpec) =>
  p
    .geo()
    .applyMatrix4(
      new Matrix4().compose(
        toV(p.pos ?? [0, 0, 0]),
        new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
        toV(p.scale ?? [1, 1, 1]),
      ),
    );
const worldVertices = (p: PartSpec) => {
  const g = worldGeo(p);
  const v = g.getAttribute("position");
  const points = Array.from({ length: v.count }, (_, i) => new Vector3().fromBufferAttribute(v, i));
  g.dispose();
  return points;
};

it("the turbos hang from the accessory mounting face as Continental dimensions them (M-18 Fig 5-33 / 5-35)", () => {
  // Fig 5-34: cylinder #1 is 5.42 in. forward of the accessory mounting face.
  expect(ACCESSORY_FACE_X).toBeCloseTo(CYLS.find((c) => c.n === 1)!.x - 5.42 * IN, 9);
  // The 3.97-in. dimension ends on the turbine housing's aft (outlet) face, both side views (judge ruling 2026-10-09,
  // it was once read as the centre housing).
  expect(TURBINE_AFT_X).toBeCloseTo(ACCESSORY_FACE_X + 3.97 * IN, 9);
  for (const s of [-1, 1]) {
    const t = TURBO(s);
    // Centre housing (the labelled "TURBO OIL INLET") and the turbine inlet flange lie forward of the turbine aft face:
    // ≈7.5 in. and ≈5.0 in. forward of the accessory face, scaled (Fig 5-33; ruling reasons 2–3).
    expect(t[0]).toBeGreaterThan(TURBINE_AFT_X);
    expect(TURBINE_INLET(s)[0]).toBeGreaterThan(TURBINE_AFT_X);
    expect(t[0]).toBeCloseTo(ACCESSORY_FACE_X + 7.5 * IN, 9);
    expect(TURBINE_INLET(s)[0]).toBeCloseTo(ACCESSORY_FACE_X + 5.0 * IN, 9);
    // The TIT boss sits on the turbine inlet duct, between the turbine aft face and the centre housing (ruling reason 3).
    expect(TIT_PROBE(s)[0]).toBeGreaterThan(TURBINE_AFT_X);
    expect(TIT_PROBE(s)[0]).toBeLessThan(t[0]);
    expect(PROP[1] - t[1]).toBeCloseTo((s < 0 ? 14.82 : 14.81) * IN, 9); // below the crankshaft, rear view
    expect(t[2]).toBeCloseTo(s * (s < 0 ? 12.94 : 13.45) * IN, 9); // outboard, rear view
    // Low and aft: below the cylinders, the turbine inlet aft of every cylinder of its bank (the body runs forward
    // under #1 / #2, ruling reason 6).
    for (const c of CYLS.filter((c) => c.s === s)) expect(TURBINE_INLET(s)[0]).toBeLessThan(c.x);
    // Shaft fore-and-aft: the housing is longer along x, compressor forward, turbine aft.
    const v = worldVertices(sided((s < 0 ? "LH" : "RH") + " turbocharger", s));
    const span = (k: "x" | "y" | "z") => Math.max(...v.map((p) => p[k])) - Math.min(...v.map((p) => p[k]));
    expect(span("x")).toBeGreaterThan(span("y"));
    expect(Math.min(...v.map((p) => p.x))).toBeCloseTo(TURBINE_AFT_X, 6);
    expect(COMPRESSOR_INLET(s)[0]).toBeGreaterThan(Math.max(...v.map((p) => p.x)));
  }
});

it("each air box clamps directly to the forward-facing Ø3.00-in. compressor inlet (AMM Fig 81-20-1 PDF 2815 items 1/3)", () => {
  expect(2 * COMPRESSOR_INLET_R).toBeCloseTo(3.0 * IN, 9); // dimensioned, Fig 5-33 / 5-35
  for (const s of [-1, 1]) {
    const inlet = COMPRESSOR_INLET(s),
      box = AIR_BOX(s),
      t = TURBO(s);
    expect([inlet[1], inlet[2]]).toEqual([t[1], t[2]]);
    // The inlet face is 11.8 in. forward of the accessory face (scaled, Fig 5-33 and Fig 5-35 agree). Fig 5-35's
    // printed 10.81 in. runs to the CL of the oil quick-drain coupling, which lies aft of the inlet plane.
    expect(inlet[0]).toBeCloseTo(ACCESSORY_FACE_X + 11.8 * IN, 9);
    expect(ACCESSORY_FACE_X + 10.81 * IN).toBeLessThan(inlet[0]);
    // The air box's aft face is the inlet plane.
    expect(box[0] - AIR_BOX_SIZE[0] / 2).toBeCloseTo(inlet[0], 9);
    // The rendered air box closes the joint around the WHOLE Ø3.00-in. inlet: a ray fired forward from just aft of
    // every perimeter point meets the box's aft face at the inlet plane (AMM Fig 81-20-1 items 1/3; Fig 71-60-2
    // sheet 1 items 3, 16). Rays up the face from the inlet's lowest point to the filter body's top also meet it,
    // so the base and body form one continuous mating face.
    const airBox = new Mesh(
      worldGeo(sided("Air box / induction filter", s)),
      new MeshBasicMaterial({ side: DoubleSide }),
    );
    const hitsFace = (y: number, z: number) => {
      const ray = new Raycaster(new Vector3(inlet[0] - 0.001, y, z), new Vector3(1, 0, 0), 0, 0.0015);
      return ray.intersectObject(airBox).length > 0;
    };
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * 2 * Math.PI;
      const [y, z] = [inlet[1] + COMPRESSOR_INLET_R * Math.sin(a), inlet[2] + COMPRESSOR_INLET_R * Math.cos(a)];
      expect(hitsFace(y, z), `inlet perimeter at ${(a * 180) / Math.PI} deg, side ${s}`).toBe(true);
    }
    for (let y = inlet[1] - COMPRESSOR_INLET_R; y <= box[1] + AIR_BOX_SIZE[1] / 2 - 0.001; y += 0.002)
      expect(hitsFace(y, inlet[2]), `mating face gap at y ${y}, side ${s}`).toBe(true);
    airBox.geometry.dispose();
    // The housing must meet the inlet neck rather than penetrate the box.
    const housing = worldVertices(sided((s < 0 ? "LH" : "RH") + " turbocharger", s));
    expect(Math.max(...housing.map((p) => p.x))).toBeLessThanOrEqual(inlet[0] + 0.000001);
    expect(sided("Air box / compressor clamp", s).pos).toEqual(inlet);
    const points = flow(s < 0 ? "intakeL" : "intakeR").pts;
    expect(points).toHaveLength(2);
    expect(toV(points[0]).distanceTo(toV(points[1]))).toBeCloseTo(0.006);
    expect(points.every((p) => toV(p).distanceTo(toV(inlet)) < 0.01)).toBe(true);
    const neck = worldVertices(sided("Compressor inlet neck", s));
    expect(Math.max(...neck.map((p) => p.x))).toBeCloseTo(inlet[0], 6);
    expect(Math.min(...neck.map((p) => p.x))).toBeCloseTo(t[0] + TURBO_HOUSINGS.at(-1)!.x1, 6);
    expect(Math.max(...neck.map((p) => p.y)) - inlet[1]).toBeCloseTo(COMPRESSOR_INLET_R, 4);
  }
});

it("turbos, air boxes, inlet necks, reservoirs and the wastegate stay inside the lower cowl by 5 mm (POH Fig 1-1 loft)", () => {
  const names = [
    "LH turbocharger",
    "RH turbocharger",
    "Air box / induction filter",
    "Compressor inlet neck",
    "Air box / compressor clamp",
    "LH turbo oil reservoir",
    "RH turbo oil reservoir",
    "Wastegate",
    "Wastegate actuator",
    "Turbocharger / tailpipe clamp",
  ];
  const parts = CAT.parts.filter((p) => names.includes(p.name ?? ""));
  expect(parts).toHaveLength(14);
  for (const p of parts)
    for (const v of worldVertices(p))
      for (const d of [
        [0, -0.005, 0],
        [0, 0, 0.005],
        [0, 0, -0.005],
      ] as const)
        expect(inFus(v.clone().add(new Vector3(...d))), `${p.name} at ${v.toArray()}`).toBe(true);
});

it("TIT, oil reservoir and compressor flow start follow each moved turbo (POH 7-35; AMM Figs 77-20-3 PDF 2716 / 81-20-1 PDF 2815)", () => {
  for (const s of [-1, 1]) {
    const t = TURBO(s);
    expect(titProbe(s).pos).toEqual(TIT_PROBE(s));
    const probe = TIT_PROBE(s),
      inlet = TURBINE_INLET(s);
    expect(Math.hypot(probe[0] - inlet[0], probe[2] - inlet[2])).toBeLessThan(EXHAUST_RADIUS);
    expect(probe[0]).toBeLessThan(t[0]);
    expect(probe[0]).toBeLessThan(COMPRESSOR_INLET(s)[0]);
    // The header flange is on top of the turbine housing (AMM Fig 81-20-1 item 7): within its x span, above it.
    expect(inlet[0]).toBeGreaterThan(TURBINE_AFT_X);
    expect(inlet[0]).toBeLessThan(t[0]);
    expect([inlet[1], inlet[2]]).toEqual([t[1] + TURBINE_R + 0.035, t[2]]); // illustrative neck height
    const inletNeck = sided("Turbine housing inlet neck", s);
    const neck = worldVertices(inletNeck);
    expect(Math.max(...neck.map((p) => p.y))).toBeCloseTo(inlet[1], 6);
    expect(insideTurbo(s, [inlet[0], Math.min(...neck.map((p) => p.y)), inlet[2]])).toBe(true); // seated
    expect(inletNeck.pos![0]).toBe(inlet[0]);
    expect(inletNeck.pos![2]).toBe(inlet[2]);
    expect(probe[1]).toBeGreaterThan(inlet[1]);
    // TIT hex 5.3 in. (LH) / 5.6 in. (RH) forward of the accessory face, 9.35 in. below the crankshaft; scaled, Fig 5-33
    // / 5-35 (judge ruling 2026-10-09).
    expect(probe[0]).toBeCloseTo(ACCESSORY_FACE_X + (s < 0 ? 5.3 : 5.6) * IN, 9);
    expect(PROP[1] - probe[1]).toBeCloseTo(9.35 * IN, 9);
    const sensor = worldVertices(titProbe(s));
    const span = (k: "x" | "y" | "z") => Math.max(...sensor.map((p) => p[k])) - Math.min(...sensor.map((p) => p[k]));
    expect(span("z")).toBeGreaterThan(span("y"));
    expect(TURBO_OIL_RES(s)[0]).toBe(t[0]);
    expect(TURBO_OIL_RES(s)[1]).toBeLessThan(t[1]);
    // Compressor scroll outlet on top of the compressor housing.
    const outlet = COMPRESSOR_OUTLET(s);
    expect(outlet[1] - t[1]).toBeCloseTo(COMPRESSOR_R, 9);
    expect(outlet[0]).toBeGreaterThan(t[0]);
    expect(flow(s < 0 ? "compressorL" : "compressorR").pts[0]).toEqual(outlet);
    expect(HEADER(s).transition.at(-1)).toEqual(TURBINE_INLET(s));
    const bank = CYLS.filter((c) => c.s === s),
      h = HEADER(s);
    [h.elbow, h.riser, h.aftRiser].forEach((r, i) => expect(r[0]).toEqual(cylExhaust(bank[i])));
  }
});

it("the single wastegate sits aft of the LH turbine with its actuator outboard (M-18 Fig 5-33; POH 7-38)", () => {
  expect(WASTEGATE[2]).toBe(TURBO(-1)[2]);
  expect(WASTEGATE[0]).toBeCloseTo(ACCESSORY_FACE_X - 2.6 * IN, 9); // scaled, side view
  expect(PROP[1] - WASTEGATE[1]).toBeCloseTo(11.8 * IN, 9); // scaled, rear view
  expect(WASTEGATE[0]).toBeLessThan(TURBINE_AFT_X);
  expect(WASTEGATE_ACTUATOR[2]).toBeLessThan(WASTEGATE[2]);
  expect(CAT.parts.find((p) => p.name === "Wastegate actuator")!.pos).toEqual(WASTEGATE_ACTUATOR);
});
