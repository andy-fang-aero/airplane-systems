/** Sourced connectivity; dimensions are illustrative because the AMM figures are undimensioned. */
import { expect, it } from "vitest";
import { Vector3 } from "three";
import { TURBINE_INLET, TAILPIPE } from "@/aircraft/sr22t/exhaust-layout";
import { TURBINE_AFT_X, insideTurbo } from "@/aircraft/sr22t/turbo-layout";
import { FLOWS } from "@/aircraft/sr22t/flows";
import {
  CAT,
  CYLS,
  THROTTLE,
  HEAT_X,
  ALT_AIR,
  CONSOLE_QUADRANT,
  INDUCTION_Y,
  INTAKE_MANIFOLD,
  HEADER,
  ALTERNATE_DUCT,
  BLAST_TUBE,
  EXHAUST_TIE_ROD,
  THROTTLE_CABLE,
  MIXTURE_CABLE,
  MIXTURE_ARM,
} from "@/aircraft/sr22t/parts";
import { toV, type Vec3 } from "@/lib/math";

const parts = (name: string) => CAT.parts.filter((p) => p.name === name);
const distance = (a: Vec3 | Vector3, b: Vec3 | Vector3) => toV(a).distanceTo(toV(b));
const flow = (key: string) => FLOWS.find((f) => f.key === key)!;

it("induction air joins at a Y junction before the throttle body (POH 7-37)", () => {
  expect(parts("Induction Y junction")).toHaveLength(1);
  expect(parts("Induction Y junction")[0].pos).toEqual([3.48, 0.06, 0]);
  for (const key of ["compressorL", "compressorR"]) {
    const pts = flow(key).pts;
    expect(distance(pts.at(-2)!, INDUCTION_Y)).toBeLessThan(0.05);
    expect(distance(pts.at(-1)!, THROTTLE)).toBeLessThan(0.001);
  }
  expect(parts("Intake manifold")[0].pos).toEqual([3.24, 0.05, 0]);
  expect(flow("manifold").pts).toContainEqual(INTAKE_MANIFOLD);
});

it("a blast tube from the heat exchanger keeps the alternate air flap from freezing (AMM 71-60 PDF 2542)", () => {
  expect(parts("Alternate air blast tube")).toHaveLength(1);
  expect(distance(BLAST_TUBE[0], HEAT_X)).toBeLessThan(0.1);
  expect(distance(BLAST_TUBE.at(-1)!, ALT_AIR)).toBeLessThan(0.1);
  expect(parts("Alternate air door switch")).toHaveLength(1);
  expect(distance(parts("Alternate air door switch")[0].pos!, ALT_AIR)).toBeLessThan(0.1);
  expect(parts("Alternate air duct")).toHaveLength(2);
  for (const s of [-1, 1]) expect(ALTERNATE_DUCT(s)).toEqual(flow(s < 0 ? "altAirL" : "altAirR").pts);
});

it("three header pieces per side, slip-jointed to each turbocharger (AMM 78-10 PDF 2734)", () => {
  for (const s of [-1, 1]) {
    for (const name of ["Elbow riser", "Exhaust tee", "Turbocharger transition"]) {
      expect(parts(name).filter((p) => Math.sign(p.pos![2]) === s)).toHaveLength(1);
    }
    const transition = parts("Turbocharger transition").find((p) => Math.sign(p.pos![2]) === s)!;
    expect(transition.pos).toEqual(TURBINE_INLET(s));
    const h = HEADER(s);
    expect(h.elbow.at(-1)).toEqual(h.tee[0]);
    expect(h.transition).toContainEqual(h.tee.at(-1));
  }
  for (let n = 1; n <= 6; n++) {
    const pts = flow("exh" + n).pts;
    expect(distance(pts.at(-1)!, TURBINE_INLET(n % 2 ? 1 : -1))).toBeLessThan(0.001);
    expect(pts.every((p, i) => i === 0 || distance(p, pts[i - 1]) > 0)).toBe(true);
    // After the port/neck/outboard joint, both front and aft branches approach
    // the turbine monotonically (AMM Fig 78-10-2 PDF 2740; Fig 81-20-1 PDF 2815).
    const c = CYLS.find((c) => c.n === n)!;
    const target = TURBINE_INLET(c.s)[0];
    const direction = Math.sign(target - c.x);
    const joint = pts.findIndex((p) => Math.abs(toV(p).z) === 0.5);
    expect(joint).toBeGreaterThan(0);
    for (let i = joint + 1; i < pts.length; i++)
      expect((toV(pts[i]).x - toV(pts[i - 1]).x) * direction).toBeGreaterThanOrEqual(-1e-10);
  }
  expect(parts("Turbocharger / tailpipe clamp")).toHaveLength(2);
});

it("the tie rod joins the RH turbocharger transition and the crossover (AMM 78-00)", () => {
  expect(parts("Exhaust tie rod")).toHaveLength(1);
  expect(EXHAUST_TIE_ROD.every((p) => p[2] > 0)).toBe(true);
  expect(HEADER(1).transition).toContainEqual(EXHAUST_TIE_ROD[0]);
  expect(flow("crossover").pts).toContainEqual(EXHAUST_TIE_ROD.at(-1));
});

it("the throttle and mixture cables run from the console to the throttle body and the engine-driven pump (POH 7-32)", () => {
  expect(parts("Throttle control cable")).toHaveLength(1);
  expect(parts("Mixture control cable")).toHaveLength(1);
  expect(CONSOLE_QUADRANT).toEqual([1.72, -0.32, 0]); // POH 13772-007 Fig 7-4 (7-14), schematic pivot
  expect(THROTTLE_CABLE[0]).toEqual(CONSOLE_QUADRANT);
  expect(MIXTURE_CABLE[0]).toEqual(CONSOLE_QUADRANT);
  expect(distance(THROTTLE_CABLE.at(-1)!, THROTTLE)).toBeLessThan(0.1);
  expect(MIXTURE_ARM).toEqual([2.8, -0.3, -0.12]); // AMM Fig 71-00-2 sheet 3 items 25, 31 PDF p. 2489; approximate left aft engine
  expect(distance(MIXTURE_CABLE.at(-1)!, parts("Engine-driven fuel pump")[0].pos!)).toBeLessThan(0.1);
  for (const path of [THROTTLE_CABLE, MIXTURE_CABLE]) {
    expect(path.some((p) => p[0] === 2.63)).toBe(true); // schematic firewall crossing
  }
});

it("the sourced assemblies build finite, nonempty geometry with the engine stopped", () => {
  const names = [
    "Induction Y junction",
    "Intake manifold",
    "Alternate air duct",
    "Alternate air blast tube",
    "Alternate air door switch",
    "Elbow riser",
    "Exhaust tee",
    "Turbocharger transition",
    "Turbocharger / tailpipe clamp",
    "Exhaust tie rod",
    "Throttle control cable",
    "Mixture control cable",
  ];
  for (const p of CAT.parts.filter((p) => names.includes(p.name!))) {
    const g = p.geo();
    expect(g.getAttribute("position").count).toBeGreaterThan(0);
    expect(Array.from(g.getAttribute("position").array).every(Number.isFinite)).toBe(true);
    expect(p.fitted).toBeUndefined();
    g.dispose();
  }
});

it("tailpipe clamps surround the outlet outside the turbine housing (AMM 78-00 PDF 2732; Figs 78-10-2 PDF 2740, 78-20-4 PDF 2756)", () => {
  for (const side of [-1, 1]) {
    const clamp = parts("Turbocharger / tailpipe clamp").find((p) => Math.sign(p.pos![2]) === side)!;
    const center = toV(clamp.pos!);
    expect(clamp.pos).toEqual(TAILPIPE(side)[0]);
    const pts = flow(side < 0 ? "tailpipeL" : "tailpipeR").pts;
    const delta = toV(pts[1]).sub(toV(pts[0]));
    // The shaft runs fore-and-aft: the clamp sits aft of the turbine housing.
    expect(center.x).toBeLessThan(TURBINE_AFT_X);
    // Torus plane is normal to the outlet direction, and the full ring clears the housing.
    const direction = delta.normalize(),
      g = clamp.geo(),
      vertices = g.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) {
      const v = new Vector3().fromBufferAttribute(vertices, i);
      expect(Math.abs(v.dot(direction))).toBeLessThan(0.006);
      const world = v.add(center);
      expect(insideTurbo(side, world.toArray())).toBe(false);
    }
    g.dispose();
  }
});

it("illustrative induction and exhaust colors match their flow paths (POH 7-37–7-38; AMM Fig 78-10-2 PDF 2740)", () => {
  for (const name of ["Induction Y junction", "Intake manifold", "Alternate air duct"]) {
    for (const p of parts(name)) expect(p.color).toBe(flow("manifold").color);
  }
  for (const name of ["Elbow riser", "Exhaust tee", "Turbocharger transition"]) {
    for (const p of parts(name)) expect(p.color).toBe(flow("exh1").color);
  }
});
