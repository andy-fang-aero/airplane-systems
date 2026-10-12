/** TKS fluid storage and pumping, and the cockpit ICE PROTECT controls. */
// The MAIN BUS 1 bus-off lamp case
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CAT, TANK_CHORD, TANK_SPAN, TKS_TANK } from "@/aircraft/sr22t/parts";
import { useSR22T } from "@/aircraft/sr22t/store";
import { inFus, wC, wLE, wingP } from "@/aircraft/sr22t/geometry";
import { mats } from "@/lib/materials";
import { type PartSpec } from "@/lib/catalogue";

const saved = useSR22T.getState();
beforeEach(() => useSR22T.setState({ s: structuredClone(saved.s), E: saved.E }));
afterEach(() => useSR22T.setState({ s: saved.s, E: saved.E }));

const byName = (name: string) => {
  const p = CAT.parts.find((q) => q.name === name);
  expect(p, name).toBeDefined();
  return p!;
};
const at = (p: PartSpec) => new THREE.Vector3(...(p.pos ?? [0, 0, 0]));
/** World-space bounds of a part drawn at its `pos` (none of the parts tested here rotate). */
const bounds = (p: PartSpec) => {
  const g = p.geo();
  g.computeBoundingBox();
  const b = g.boundingBox!.clone().translate(at(p));
  g.dispose();
  return b;
};
const setSim = (patch: (s: typeof saved.s) => void) => useSR22T.getState().update(patch);
const run = (p: PartSpec) => {
  const m = new THREE.Mesh();
  m.rotation.set(...(p.rot ?? [0, 0, 0]));
  p.anim!(m, 0);
  return m;
};

it("fluid passes outlet strainer → 3-way valve → in-line strainer → flow meter → metering pumps → filter (AMM 30-00 PDF 1166–1168)", () => {
  const path = [
    "Left TKS outlet strainer",
    "Right TKS outlet strainer",
    "3-way control valve",
    "In-line strainer",
    "Flow meter",
    "Metering pump 1",
    "Metering pump 2",
    "Filter assembly",
  ].map(byName);
  for (const p of path) expect(p.sys, p.name).toContain("ice");
  // the flow meter sits on the line between the in-line strainer and the pumps
  const strainer = at(byName("In-line strainer")),
    meter = at(byName("Flow meter")),
    pump = at(byName("Metering pump 1"));
  expect(strainer.distanceTo(meter) + meter.distanceTo(pump)).toBeLessThan(1.1 * strainer.distanceTo(pump));
  expect(meter.distanceTo(pump)).toBeLessThan(strainer.distanceTo(pump));
  // the 3-way valve is upstream of the in-line strainer, on the forward LH longeron (Fig. 30-07-2 sheet 4)
  const valve = at(byName("3-way control valve"));
  expect(valve.x).toBeGreaterThan(strainer.x);
  expect(valve.z).toBeLessThan(0);
  expect(CAT.parts.some((p) => p.name === "Filter")).toBe(false);
});

/** The drawn tank-to-filter path as part-to-part joints, from each outlet strainer to the filter and on into the 905k lines. */
const JOINTS: [string, string][] = [
  ...(["Left", "Right"] as const).flatMap((s): [string, string][] => [
    [`${s} TKS outlet strainer`, `${s} TKS outlet bulkhead fitting`],
    [`${s} TKS outlet bulkhead fitting`, `${s} TKS tank line`],
    [`${s} TKS tank line`, "3-way control valve"],
  ]),
  ["3-way control valve", "TKS pump supply line"],
  ["TKS pump supply line", "In-line strainer"],
  ["In-line strainer", "TKS flow meter tube"],
  ["TKS flow meter tube", "Flow meter"],
  ["Flow meter", "Metering pump manifold tube"],
  ["Metering pump manifold tube", "Metering pump 1"],
  ["Metering pump manifold tube", "Metering pump 2"],
  ["Metering pump 1", "TKS filter inlet tube"],
  ["TKS filter inlet tube", "Filter assembly"],
  ["Filter assembly", "Forward unit supply line"],
  ["Filter assembly", "Empennage unit supply line"],
];
const TUBES = [
  "Left TKS outlet bulkhead fitting",
  "Right TKS outlet bulkhead fitting",
  "Left TKS tank line",
  "Right TKS tank line",
  "TKS pump supply line",
  "TKS flow meter tube",
  "Metering pump manifold tube",
  "TKS filter inlet tube",
];
/** The part's rendered mesh in world space (pos, rot and scale applied). */
const worldGeo = (p: PartSpec) => {
  const g = p.geo();
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      at(p),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
      new THREE.Vector3(...(p.scale ?? [1, 1, 1])),
    ),
  );
  return g;
};
it("the drawn TKS path is continuous from each outlet strainer through the valve, strainer, meter and pumps to the filter (AMM 30-00 PDF 1166–1167; Fig. 30-07-2 sheets 3–4, PDF 1219–1220)", () => {
  const gaps: string[] = [];
  for (const [a, b] of JOINTS) {
    const ga = worldGeo(byName(a)),
      gb = worldGeo(byName(b));
    const bvh = new MeshBVH(ga);
    // joined: the meshes intersect or touch within 1 mm
    const gap = bvh.intersectsGeometry(gb, new THREE.Matrix4())
      ? 0
      : bvh.closestPointToGeometry(gb, new THREE.Matrix4())!.distance;
    if (gap > 0.001) gaps.push(`${a} → ${b}: ${(gap * 1000).toFixed(2)} mm`);
    ga.dispose();
    gb.dispose();
  }
  expect(gaps).toEqual([]);
  for (const n of TUBES) expect(byName(n).sys, n).toContain("ice");
  // both tank lines stay forward of the main spar tube (x 1.42 at the root, parts/structure.ts) until the valve
  for (const tube of ["Left TKS tank line", "Right TKS tank line"])
    expect(bounds(byName(tube)).min.x, tube).toBeGreaterThan(1.47);
});

it("each tank has a float quantity sensor and a low-level switch near its outlet (AMM 30-00 PDF 1168)", () => {
  for (const label of ["Left", "Right"]) {
    const tank = bounds(byName(`${label} TKS tank`));
    const sensors = CAT.parts.filter((p) => p.name === `${label} TKS quantity sensor`);
    const switches = CAT.parts.filter((p) => p.name === `${label} TKS low-level switch`);
    expect(sensors).toHaveLength(1);
    expect(switches).toHaveLength(1);
    const outlet = at(byName(`${label} TKS outlet strainer`));
    for (const p of [sensors[0], switches[0], byName(`${label} TKS outlet strainer`)])
      expect(tank.containsPoint(at(p)), p.name).toBe(true);
    expect(at(switches[0]).distanceTo(outlet)).toBeLessThan(0.15);
  }
});

it("each TKS tank vents to a NACA duct just outboard of it on the lower skin (AMM 30-00 PDF 1166; Fig. 6-00-7 LW5/RW5)", () => {
  for (const [label, side] of [
    ["Left", -1],
    ["Right", 1],
  ] as const) {
    const tank = bounds(byName(`${label} TKS tank`));
    const outboard = side < 0 ? -tank.min.z : tank.max.z;
    const vent = at(byName(`${label} TKS tank vent`));
    expect(Math.sign(vent.z)).toBe(side);
    expect(Math.abs(vent.z)).toBeGreaterThan(outboard);
    expect(Math.abs(vent.z) - outboard).toBeLessThan(0.2);
    // below the lower skin at that station
    expect(vent.y).toBeLessThan(wingP(vent.z, 0.17, -1).y);
  }
});

/** World-space vertices of a part drawn at its `pos` and `rot` (parts with a parent are skipped by the callers). */
const vertices = (p: PartSpec) => {
  const g = p.geo(),
    a = g.getAttribute("position"),
    o = new THREE.Vector3(...(p.pos ?? [0, 0, 0])),
    r = new THREE.Euler(...(p.rot ?? [0, 0, 0]));
  const out = Array.from({ length: a.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(a, i).applyEuler(r).add(o),
  );
  g.dispose();
  return out;
};
/** Chord fraction of a point at its own span station. */
const xcOf = (v: THREE.Vector3) => (wLE(v.z) - v.x) / wC(v.z);
/** Inside the wing skin: within the chord and between the lower and upper skins at that station and chord fraction. */
const inWing = (v: THREE.Vector3) => {
  const xc = xcOf(v);
  return xc > 0 && xc < 1 && v.y > wingP(v.z, xc, -1).y && v.y < wingP(v.z, xc, 1).y;
};
/** Inside a fuel-tank bay as Airplane.tsx lofts it: TANK_SPAN by TANK_CHORD, the skins scaled 0.85 about the mean line. */
const inFuelBay = (v: THREE.Vector3) => {
  const xc = xcOf(v),
    mean = wingP(v.z, xc, 0).y;
  return (
    Math.abs(v.z) >= TANK_SPAN[0] &&
    Math.abs(v.z) <= TANK_SPAN[1] &&
    xc >= TANK_CHORD[0] &&
    xc <= TANK_CHORD[1] &&
    v.y >= mean + 0.85 * (wingP(v.z, xc, -1).y - mean) &&
    v.y <= mean + 0.85 * (wingP(v.z, xc, 1).y - mean)
  );
};

it("every TKS tank vertex is inside the wing skin and outside both fuel-tank bays (AMM 30-00 PDF 1166)", () => {
  // the predicates catch a point in each volume
  expect(inFuelBay(wingP(2, 0.45, 0))).toBe(true);
  expect(inFuelBay(wingP(-2, 0.45, 0))).toBe(true);
  expect(inWing(wingP(1, 0.2, 1).add(new THREE.Vector3(0, 0.01, 0)))).toBe(false);
  for (const label of ["Left", "Right"]) {
    const vs = vertices(byName(`${label} TKS tank`));
    expect(vs.length).toBeGreaterThan(50);
    for (const v of vs) {
      const where = `${label} ${v.toArray().map((n) => n.toFixed(3))}`;
      expect(inWing(v), where).toBe(true);
      expect(inFuelBay(v), where).toBe(false);
      expect(inFus(v), where).toBe(false);
      // the skin-hugging vertices sit outside the 0.85-deep fuel bay anyway; the tank's mid-depth must clear it in plan too
      expect(inFuelBay(wingP(v.z, xcOf(v), 0)), `${where} mid-depth`).toBe(false);
    }
  }
});

it("the outlet strainer is at the tank's inboard end and the vent outboard of it (AMM Fig. 30-00-1, PDF 1169)", () => {
  const mid = (TKS_TANK.z0 + TKS_TANK.z1) / 2;
  for (const label of ["Left", "Right"]) {
    expect(Math.abs(at(byName(`${label} TKS outlet strainer`)).z)).toBeLessThan(mid);
    expect(Math.abs(at(byName(`${label} TKS tank vent`)).z)).toBeGreaterThan(TKS_TANK.z1);
  }
});

it("no other part passes through a TKS tank bay", () => {
  /** Inside the tank envelope ice.ts lofts: TKS_TANK span and chord, the skins scaled by its depth about the mean line. */
  const inTks = (v: THREE.Vector3) => {
    const xc = xcOf(v),
      z = Math.abs(v.z);
    if (z < TKS_TANK.z0 || z > TKS_TANK.z1 || xc < TKS_TANK.xc0 || xc > TKS_TANK.xc1) return false;
    const mean = wingP(v.z, xc, 0).y;
    return (
      v.y > mean + TKS_TANK.depth * (wingP(v.z, xc, -1).y - mean) &&
      v.y < mean + TKS_TANK.depth * (wingP(v.z, xc, 1).y - mean)
    );
  };
  expect(inTks(wingP(0.9, 0.18, 0))).toBe(true);
  // the tank itself, the parts mounted inside it and the filler cap set into the upper skin over it
  // the outlet bulkhead fitting passes through the inboard rib by design (Fig. 30-07-2 sheet 3 item 1, PDF 1219)
  const own =
    /^(Left|Right) TKS (tank|outlet strainer|outlet bulkhead fitting|quantity sensor|low-level switch|filler neck|filler)$/;
  for (const p of CAT.parts) {
    if (own.test(p.name ?? "") || p.parent) continue;
    const n = vertices(p).filter(inTks).length;
    expect(n, p.name).toBe(0);
  }
});

it("each TKS tank holds about its 4.25 gal (AMM 30-00 PDF 1166)", () => {
  const g = byName("Right TKS tank").geo();
  const a = g.getAttribute("position"),
    idx = g.getIndex()!;
  const [p, q, r] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let vol = 0;
  for (let i = 0; i < idx.count; i += 3) {
    p.fromBufferAttribute(a, idx.getX(i));
    q.fromBufferAttribute(a, idx.getX(i + 1));
    r.fromBufferAttribute(a, idx.getX(i + 2));
    vol += p.dot(q.clone().cross(r)) / 6;
  }
  g.dispose();
  const gal = Math.abs(vol) / 0.003785411784;
  expect(gal).toBeGreaterThan(4.25 * 0.85);
  expect(gal).toBeLessThan(4.25 * 1.15);
});

it("the TKS tanks sit at the wing root forward of the main spar, clear of the fuel tank (AMM 30-00 PDF 1166; Fig. 6-00-7)", () => {
  for (const [label, side] of [
    ["Left", -1],
    ["Right", 1],
  ] as const) {
    const tank = bounds(byName(`${label} TKS tank`));
    const [inboard, outboard] = side < 0 ? [-tank.max.z, -tank.min.z] : [tank.min.z, tank.max.z];
    // the fuel tank runs aft from the main spar web (TANK_CHORD); the TKS bay is forward of it and of the spar tube
    for (const v of vertices(byName(`${label} TKS tank`))) expect(xcOf(v)).toBeLessThan(TANK_CHORD[0] - 0.04 / wC(v.z));
    expect(inboard).toBeGreaterThan(0.35);
    // inboard rib at the root (LW2 / RW2), outboard rib inboard of the NACA vent (LW5 / RW5)
    expect(inboard).toBeCloseTo(TKS_TANK.z0, 2);
    expect(outboard).toBeCloseTo(TKS_TANK.z1, 2);
    // clear of the fuel collector tank (fuel.ts)
    expect(tank.intersectsBox(bounds(byName(`${label} collector tank / sump`)))).toBe(false);
    // the filler cap and neck are over it
    for (const n of [`${label} TKS filler`, `${label} TKS filler neck`]) {
      const p = at(byName(n));
      expect(p.x, n).toBeGreaterThan(tank.min.x);
      expect(p.x, n).toBeLessThan(tank.max.x);
      expect(Math.abs(p.z), n).toBeGreaterThan(inboard);
      expect(Math.abs(p.z), n).toBeLessThan(outboard);
    }
  }
});

it("two windshield spray nozzles sit side by side at the LH windshield base (AMM 30-40 PDF 1254; Fig. 30-40-1 PDF 1257)", () => {
  const nozzles = CAT.parts.filter((p) => p.name?.endsWith("windshield nozzle"));
  expect(nozzles.map((p) => p.name).sort()).toEqual(["Inboard windshield nozzle", "Outboard windshield nozzle"]);
  const [a, b] = nozzles.map(at);
  // distinct and adjacent, both on the pilot (negative z) side, clear of the centreline
  expect(a.distanceTo(b)).toBeGreaterThan(0.03);
  expect(a.distanceTo(b)).toBeLessThan(0.1);
  for (const p of [a, b]) expect(p.z).toBeLessThan(-0.1);
  expect(at(byName("Outboard windshield nozzle")).z).toBeLessThan(at(byName("Inboard windshield nozzle")).z);
  expect(a.y).toBeCloseTo(b.y);
  expect(a.x).toBeCloseTo(b.x);
});

it("the 3-way valve indicator follows tank selection; display backup forces AUTO (AMM 30-00 PDF 1166, 1168)", () => {
  const indicator = byName("3-way valve indicator");
  expect(at(indicator).distanceTo(at(byName("3-way control valve")))).toBeLessThan(0.05);
  const points = () => new THREE.Vector3(0, 0, 1).applyEuler(run(indicator).rotation);
  setSim((s) => Object.assign(s.ice, { sel: "L" }));
  expect(points().z).toBeCloseTo(-1);
  setSim((s) => Object.assign(s.ice, { sel: "R" }));
  expect(points().z).toBeCloseTo(1);
  // AUTO alternates tanks, which the sim does not model: the model points aft (approximate convention)
  setSim((s) => Object.assign(s.ice, { sel: "AUTO" }));
  expect(points().x).toBeCloseTo(-1);
  setSim((s) => {
    s.ice.sel = "L";
    s.avx.backup = true;
  });
  expect(points().x).toBeCloseTo(-1);
});

it("the windshield solenoid opens only during a powered WINDSHLD cycle (AMM 30-00 PDF 1167)", () => {
  setSim((s) => Object.assign(s.ice, { on: true }));
  const sol = byName("Windshield solenoid");
  expect(run(sol).material).not.toBe(mats("#FFD34D").hi);
  setSim((s) => Object.assign(s.ice, { ws: 3 }));
  expect(run(sol).material).toBe(mats("#FFD34D").hi);
  // no IPS supply: closed even with the windshield timer running
  setSim((s) => {
    s.cb["ICE PROTECT 1"] = true;
  });
  expect(useSR22T.getState().E.ipsPwr).toBe(false);
  expect(run(sol).material).not.toBe(mats("#FFD34D").hi);
  setSim((s) => {
    s.cb["ICE PROTECT 1"] = false;
  });
  expect(run(sol).material).toBe(mats("#FFD34D").hi);
  // the cycle expires: closed again
  setSim((s) => Object.assign(s.ice, { ws: 0 }));
  expect(run(sol).material).not.toBe(mats("#FFD34D").hi);
});

it("the ICE PROTECT controls follow the sim (POH Fig 7-12; AMM 30-00 PDF 1166)", () => {
  const names = ["ICE PROTECT switch", "ICE PROTECT mode switch", "MAX switch", "WINDSHLD switch", "PUMP BKUP switch"];
  const pitot = at(byName("PITOT HEAT switch"));
  const panel = bounds(byName("Bolster switch panel"));
  const controls = Object.fromEntries(names.map((n) => [n, byName(n)]));
  for (const p of Object.values(controls)) {
    const pos = at(p);
    expect(pos.z, p.name).toBeGreaterThan(pitot.z);
    expect(pos.distanceTo(pitot), p.name).toBeLessThan(0.08);
    expect(Math.abs(pos.x - panel.getCenter(new THREE.Vector3()).x), p.name).toBeLessThan(0.08);
  }
  const tilt = byName("PITOT HEAT switch").rot![2];
  const up = (n: string) => run(controls[n]).rotation.z < tilt;
  const lit = (n: string) => run(controls[n]).material === mats("#FFD34D").hi;

  expect([up("ICE PROTECT switch"), up("ICE PROTECT mode switch")]).toEqual([false, false]);
  expect(names.slice(2).map(lit)).toEqual([false, false, false]);
  setSim((s) => Object.assign(s.ice, { on: true }));
  expect(up("ICE PROTECT switch")).toBe(true);
  setSim((s) => Object.assign(s.ice, { mode: "HIGH" }));
  expect(up("ICE PROTECT mode switch")).toBe(true);
  setSim((s) => Object.assign(s.ice, { maxT: 120 }));
  expect(names.slice(2).map(lit)).toEqual([true, false, false]);
  setSim((s) => Object.assign(s.ice, { maxT: 0, ws: 3 }));
  expect(names.slice(2).map(lit)).toEqual([false, true, false]);
  setSim((s) => Object.assign(s.ice, { ws: 0, bkup: true }));
  expect(names.slice(2).map(lit)).toEqual([false, false, true]);
  const pressed = run(controls["PUMP BKUP switch"]).position.clone();
  setSim((s) => Object.assign(s.ice, { bkup: false }));
  expect(run(controls["PUMP BKUP switch"]).position.distanceTo(pressed)).toBeGreaterThan(0.001);

  // without FIKI none of the five is drawn and the three blank positions are
  setSim((s) => Object.assign(s.equip, { fiki: false }));
  const drawn = CAT.partsFor();
  for (const n of names)
    expect(
      drawn.some((p) => p.name === n),
      n,
    ).toBe(false);
  expect(drawn.filter((p) => p.name === "Blank switch position")).toHaveLength(3);
  setSim((s) => Object.assign(s.equip, { fiki: true }));
  expect(CAT.partsFor().filter((p) => p.name === "Blank switch position")).toHaveLength(0);
});

it("the MAX, WINDSHLD and PUMP BKUP lamps need IPS power; PUMP BKUP stays pressed in (AMM 30-00 PDF 1166–1167)", () => {
  const lamps = ["MAX switch", "WINDSHLD switch", "PUMP BKUP switch"].map(byName);
  const bkup = byName("PUMP BKUP switch");
  const lit = () => lamps.map((p) => run(p).material === mats("#FFD34D").hi);
  setSim((s) => Object.assign(s.ice, { on: true, maxT: 120, ws: 3, bkup: true }));
  expect(useSR22T.getState().E.ipsPwr).toBe(true);
  expect(lit()).toEqual([true, true, true]);
  const pressed = run(bkup).position.clone();
  // either ICE PROTECT feed pulled removes IPS power (POH Fig 7-10, 7-48; AMM 30-00 PDF 1166)
  for (const breaker of ["ICE PROTECT 1", "ICE PROTECT 2"]) {
    setSim((s) => {
      s.cb[breaker] = true;
    });
    expect(useSR22T.getState().E.ipsPwr, breaker).toBe(false);
    expect(lit(), breaker).toEqual([false, false, false]);
    expect(run(bkup).position.distanceTo(pressed), breaker).toBeLessThan(1e-9);
    setSim((s) => {
      s.cb[breaker] = false;
    });
    expect(lit(), breaker).toEqual([true, true, true]);
  }
});

it("the MAX, WINDSHLD and PUMP BKUP lamps go dark with MAIN BUS 1 dead, ESS BUS 2 still up (POH 7-48, 7-50)", () => {
  const lamps = ["MAX switch", "WINDSHLD switch", "PUMP BKUP switch"].map(byName);
  const lit = () => lamps.map((p) => run(p).material === mats("#FFD34D").hi);
  setSim((s) => Object.assign(s.ice, { on: true, maxT: 120, ws: 3, bkup: true }));
  expect(lit()).toEqual([true, true, true]);
  // BAT 1 and both alternators off: MAIN BUS 1 (ICE PROTECT 1) loses power while BAT 2 keeps ESS BUS 2 (ICE PROTECT 2)
  setSim((s) => Object.assign(s.elec, { bat1: false, alt1: false, alt2: false }));
  const E = useSR22T.getState().E;
  expect(E.main1).toBe(0);
  expect(E.ess2).toBeGreaterThan(0);
  expect(E.ipsPwr).toBe(false);
  expect(lit()).toEqual([false, false, false]);
});

it("every new storage and pumping part leaves the scene without FIKI", () => {
  const added = [
    "TKS filler neck",
    "TKS tank vent",
    "TKS outlet strainer",
    "TKS quantity sensor",
    "TKS low-level switch",
  ].flatMap((n) => [`Left ${n}`, `Right ${n}`]);
  added.push(
    "3-way control valve",
    "In-line strainer",
    "Flow meter",
    "Windshield solenoid",
    "Test port",
    "Level sensor power card",
    "Left TKS tank",
    "Right TKS tank",
    ...TUBES,
  );
  setSim((s) => Object.assign(s.equip, { fiki: false }));
  const drawn = new Set(CAT.partsFor().map((p) => p.name));
  for (const n of added) {
    expect(byName(n).sys, n).toContain("ice");
    expect(drawn.has(n), n).toBe(false);
  }
});
