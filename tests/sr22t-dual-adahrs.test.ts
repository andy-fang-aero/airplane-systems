/**
 * Dual ADAHRS and dual magnetometers (ADAHRS 2 and MAG 2 installed per operator, 2026-10-08): SR22T POH
 * 13772-007 3-43, 7-21, 7-71 (Fig 7-16 (2 of 2)), 7-73 (Fig 7-17), 7-75, 7-81, 7-88 (Fig 7-20); AMM 13773-002 Rev 7 34-10
 * (PDF p. 1630), Fig 34-10-1 sheet 2 (PDF p. 1646), Fig 34-10-7 sheet 1 (PDF p. 1670), 34-20 (PDF p. 1675), Fig 34-20-3
 * sheet 1 (PDF p. 1689).
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { adahrsAnnunciations, adahrsSources, pfdData } from "@/aircraft/sr22t/displays";
import { FLOWS, flowRates } from "@/aircraft/sr22t/flows";
import { initialSim, solve, type Sim } from "@/aircraft/sr22t/model";
import {
  ADAHRS_1,
  ADAHRS_2,
  CAT,
  GIA_1,
  GIA_2,
  MAG_1,
  MAG_2,
  MAG_WIRES,
  MD302_POS,
  OAT_1,
  OAT_2,
  TANK_SPAN,
} from "@/aircraft/sr22t/parts";
import { drawPFD, type PfdData } from "@/lib/avionics/g1000";
import type { PartSpec } from "@/lib/catalogue";
import type { Vec3 } from "@/lib/math";
import { patched, type Patch } from "./helpers";

const named = (name: string): PartSpec[] => CAT.parts.filter((p) => p.name === name);
const one = (name: string): PartSpec => {
  const [p] = named(name);
  expect(p, name).toBeDefined();
  return p;
};
const pts = (key: string): Vec3[] => {
  const f = FLOWS.find((x) => x.key === key);
  expect(f, key).toBeDefined();
  return f!.pts.map((p) => (Array.isArray(p) ? (p as Vec3) : [p.x, p.y, p.z]));
};
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** The part's world-space bounding box, from its geometry, rot and pos. */
const worldBox = (p: PartSpec) => {
  const m = new THREE.Mesh(p.geo());
  if (p.pos) m.position.set(...p.pos);
  if (p.rot) m.rotation.set(...p.rot);
  m.updateMatrixWorld();
  const b = new THREE.Box3().setFromObject(m);
  m.geometry.dispose();
  return b;
};
const state = (p: Patch<Sim>) => {
  const s = patched(initialSim, p);
  const E = solve(s);
  return { s, E, src: adahrsSources(E), pfd: pfdData(s, E).f };
};

describe("SR22T dual ADAHRS parts (POH Fig 7-17, 7-20)", () => {
  it("two GSU 75 ADAHRS behind the panel, ADAHRS 2 beside IAU 1 between the IAUs (POH Fig 7-20 items 1, 3)", () => {
    const a1 = one("GSU 75 ADAHRS 1"),
      a2 = one("GSU 75 ADAHRS 2");
    expect(a1.pos).toEqual(ADAHRS_1);
    expect(a2.pos).toEqual(ADAHRS_2);
    // ADAHRS 1 outboard of IAU 1, ADAHRS 2 inboard of it and outboard of IAU 2
    expect(ADAHRS_1[2]).toBeLessThan(GIA_1[2]);
    expect(ADAHRS_2[2]).toBeGreaterThan(GIA_1[2]);
    expect(ADAHRS_2[2]).toBeLessThan(GIA_2[2]);
    // they do not overlap each other or either IAU
    const boxes = ["GSU 75 ADAHRS 1", "GSU 75 ADAHRS 2", "GIA 1 (GIA 63W)", "GIA 2 (GIA 63W)"].map((n) =>
      worldBox(one(n)).expandByScalar(-0.001),
    );
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) expect(a.intersectsBox(b)).toBe(false);
  });

  it("ADAHRS 2 on its sourced breaker and bus: 5 A ADAHRS 2, MAIN BUS 2 (POH 7-75; AMM 34-10 PDF 1630)", () => {
    expect(one("GSU 75 ADAHRS 2").note).toContain("5 A ADAHRS 2 circuit breaker on MAIN BUS 2");
    expect(one("GSU 75 ADAHRS 1").note).toContain("5 A ADAHRS 1 circuit breaker on ESS BUS 1");
    // each on its own power: pulling one breaker or killing one bus leaves the other unit running
    expect(state({ cb: { "ADAHRS 2": true } }).E).toMatchObject({ adahrs1: true, adahrs2: false });
    expect(state({ cb: { "ADAHRS 1": true } }).E).toMatchObject({ adahrs1: false, adahrs2: true });
    expect(state({}).E).toMatchObject({ adahrs1: true, adahrs2: true });
  });
});

describe("SR22T dual magnetometers (AMM 34-20 PDF 1675; POH Fig 7-17)", () => {
  it("two GMU 44 magnetometers adjacent in the right wing (AMM 34-20 PDF 1675; Fig 34-20-3 sheet 1)", () => {
    expect(one("Magnetometer (GMU 44, MAG 1)").pos).toEqual(MAG_1);
    expect(one("Magnetometer (GMU 44, MAG 2)").pos).toEqual(MAG_2);
    expect(MAG_2[2]).toBeGreaterThan(3.5);
    expect(dist(MAG_1, MAG_2)).toBeLessThan(0.2);
    expect(
      worldBox(one("Magnetometer (GMU 44, MAG 1)")).intersectsBox(worldBox(one("Magnetometer (GMU 44, MAG 2)"))),
    ).toBe(false);
  });

  it("MAG 2 on 5 A PFD B, MAIN BUS 2 and MAG 1 on 5 A PFD A, ESS BUS 1 (AMM 34-20 PDF 1675)", () => {
    expect(one("Magnetometer (GMU 44, MAG 2)").note).toContain("5 A PFD B circuit breaker on MAIN BUS 2");
    expect(state({ cb: { "PFD B": true } }).E).toMatchObject({ mag1: true, mag2: false });
    expect(state({ cb: { "PFD A": true } }).E).toMatchObject({ mag1: false, mag2: true });
  });

  it("each magnetometer is wired to its own ADAHRS (POH Fig 7-17)", () => {
    for (const [n, mag, adahrs] of [
      [1, MAG_1, ADAHRS_1],
      [2, MAG_2, ADAHRS_2],
    ] as const) {
      const w = MAG_WIRES[n];
      expect(dist(w[0], mag), `MAG ${n}`).toBeLessThan(1e-9);
      expect(dist(w.at(-1)!, adahrs), `MAG ${n}`).toBeLessThan(1e-9);
      one(`MAG ${n} wiring`);
    }
  });
});

describe("SR22T pitot-static feeds both ADAHRS and the MD302 (POH Fig 7-16 (2 of 2); AMM Fig 34-10-1 sheet 2)", () => {
  it("the pitot line and the static line each reach ADAHRS 1, ADAHRS 2 and the standby, ending on the part anchors", () => {
    const anchor = (name: string) => one(name).pos as Vec3;
    const ends: [string, Vec3][] = [
      ["pitot", anchor("GSU 75 ADAHRS 1")],
      ["pitotAdahrs2", anchor("GSU 75 ADAHRS 2")],
      ["pitotStby", MD302_POS],
      ["staticAdahrs", anchor("GSU 75 ADAHRS 1")],
      ["staticAdahrs2", anchor("GSU 75 ADAHRS 2")],
      ["staticStby", MD302_POS],
    ];
    for (const [key, end] of ends) expect(dist(pts(key).at(-1)!, end), key).toBeLessThan(0.01);
    // the branches tee off the main lines: pitot after its trap, static after the console tee
    const pitotTee = pts("pitot").at(-2)!,
      staticTee = pts("static2").at(-1)!;
    for (const key of ["pitotAdahrs2", "pitotStby"]) expect(dist(pts(key)[0], pitotTee), key).toBeLessThan(1e-9);
    for (const key of ["staticAdahrs", "staticAdahrs2", "staticStby"])
      expect(dist(pts(key)[0], staticTee), key).toBeLessThan(1e-9);
  });
});

describe("SR22T single ADAHRS / magnetometer loss reverts, not a total loss (POH 3-43, 7-81)", () => {
  it("normal: both ADAHRS valid, ADAHRS 1 primary, no flags, no comparison annunciation", () => {
    const { src, pfd } = state({});
    expect(src).toEqual({ att: 1, air: 1, hdg: 1, oat: 1, comp: null });
    expect(pfd.fail).toBeUndefined();
  });

  it.each([
    ["ADAHRS 1 failure", { avx: { fail: { adahrs1: true } } }],
    ["ADAHRS 1 breaker pulled", { cb: { "ADAHRS 1": true } }],
  ] as const)("%s: the system switches to ADAHRS 2 and the PFD keeps its data (POH 3-43)", (_, p) => {
    const { src, pfd } = state(p as Patch<Sim>);
    expect(src.att).toBe(2);
    expect(src.air).toBe(2);
    expect(src.hdg).toBe(2);
    expect(pfd.fail).toBeUndefined();
    // one air data computer left: nothing to compare the temperature-compensated altitude with (POH 7-81)
    expect(src.comp).toBe("VDI NO COMP");
  });

  it("ADAHRS 2 lost (failure or MAIN BUS 2 breaker): ADAHRS 1 carries on (POH 3-43, 7-81)", () => {
    for (const p of [{ avx: { fail: { adahrs2: true } } }, { cb: { "ADAHRS 2": true } }] as Patch<Sim>[]) {
      const { src, pfd } = state(p);
      expect(src).toEqual({ att: 1, air: 1, hdg: 1, oat: 1, comp: "VDI NO COMP" });
      expect(pfd.fail).toBeUndefined();
    }
  });

  it("MAG 1 lost: heading reverts to ADAHRS 2 with MAG 2; attitude and air data stay on ADAHRS 1 (POH 3-43, Fig 7-17)", () => {
    for (const p of [{ avx: { fail: { mag1: true } } }, { cb: { "PFD A": true } }] as Patch<Sim>[]) {
      const { src, pfd } = state(p);
      expect(src).toMatchObject({ att: 1, air: 1, hdg: 2 });
      expect(pfd.fail).toBeUndefined();
    }
  });

  it("both ADAHRS lost: red X attitude, heading and air data (POH 3-43 notes)", () => {
    const { src, pfd } = state({ avx: { fail: { adahrs1: true, adahrs2: true } } });
    // nothing to compare either: the VDI comparator still posts (POH 7-81)
    expect(src).toEqual({ att: null, air: null, hdg: null, oat: null, comp: "VDI NO COMP" });
    expect(pfd.fail).toEqual({ att: true, air: true, hdg: true });
  });

  it("both magnetometers lost: heading flagged, attitude and air data kept (POH 3-43 AHRS note; 7-21 HSI)", () => {
    const { pfd } = state({ avx: { fail: { mag1: true, mag2: true } } });
    expect(pfd.fail).toEqual({ att: false, air: false, hdg: true });
  });
});

/** A canvas stand-in that records every filled rectangle and every text drawn, each with its fill colour. */
const recorder = () => {
  const texts: { s: string; x: number; y: number; fill: unknown }[] = [],
    boxes: { x: number; y: number; w: number; h: number; fill: unknown }[] = [];
  const st: Record<string | symbol, unknown> = {};
  const ctx: CanvasRenderingContext2D = new Proxy(st, {
    get(t, k) {
      if (k === "fillText") return (s: string, x: number, y: number) => texts.push({ s, x, y, fill: t.fillStyle });
      if (k === "fillRect")
        return (x: number, y: number, w: number, h: number) => boxes.push({ x, y, w, h, fill: t.fillStyle });
      if (k === "measureText") return (s: string) => ({ width: s.length * 6 });
      if (k in t) return t[k];
      // every other drawing call (paths, transforms, gradients) is a no-op that returns the stand-in
      return () => ctx;
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts, boxes };
};
/** The PFD drawn on a 640 × 480 recorder (one design unit per pixel). */
const drawn = (d: PfdData) => {
  const r = recorder();
  drawPFD(r.ctx, 640, 480, d);
  return r;
};
/** Fill of the last box drawn under the text `s`. */
const boxUnder = (r: ReturnType<typeof recorder>, s: string) => {
  const t = r.texts.find((q) => q.s === s);
  expect(t, s).toBeDefined();
  const under = r.boxes.filter((b) => t!.x >= b.x && t!.x <= b.x + b.w && t!.y >= b.y && t!.y <= b.y + b.h);
  return { text: t!.fill, box: under.at(-1)?.fill };
};

describe("SR22T PFD sensor annunciations for the dual ADAHRS (POH 7-81; PG 190-02183-01 Fig 2-47, 2-48)", () => {
  it("normal: no comparator and no reversionary sensor annunciation on the PFD", () => {
    const { s, E } = state({});
    expect(adahrsAnnunciations(E)).toEqual({ comparators: [], reversionary: [] });
    const r = drawn(pfdData(s, E));
    for (const t of ["VDI NO COMP", "USING AHRS2", "USING ADC2"])
      expect(
        r.texts.some((q) => q.s === t),
        t,
      ).toBe(false);
  });

  it.each([
    ["ADAHRS 1 failure", { avx: { fail: { adahrs1: true } } }],
    ["ADAHRS 1 breaker pulled", { cb: { "ADAHRS 1": true } }],
  ] as const)("%s: VDI NO COMP on the PFD in black text on white, PFD reads ADAHRS 2 (POH 7-81)", (_, p) => {
    const { s, E } = state(p as Patch<Sim>);
    const d = pfdData(s, E);
    expect(d.comparators?.map((c) => c.text)).toEqual(["IAS", "ALT", "VDI NO COMP", "PIT", "ROL", "HDG"]);
    expect(d.reversionary).toEqual(["USING AHRS2", "USING ADC2"]);
    const r = drawn(d);
    expect(boxUnder(r, "VDI NO COMP")).toEqual({ text: "#000", box: "#FFFFFF" });
    for (const t of ["IAS", "ALT", "PIT", "ROL"]) expect(boxUnder(r, t), t).toEqual({ text: "#000", box: "#FFFFFF" });
    // the surviving unit keeps attitude, heading and air data: no red X (POH 3-43)
    expect(d.f.fail).toBeUndefined();
    expect(r.texts.some((q) => q.s === "USING AHRS2")).toBe(true);
    expect(r.texts.some((q) => q.s === "USING ADC2")).toBe(true);
  });

  it("ADAHRS 2 lost: VDI NO COMP and the no-compare boxes, PFD stays on ADAHRS 1 (no USING annunciation)", () => {
    const { s, E } = state({ avx: { fail: { adahrs2: true } } });
    const d = pfdData(s, E);
    expect(d.comparators?.map((c) => c.text)).toContain("VDI NO COMP");
    expect(d.reversionary).toEqual([]);
    expect(boxUnder(drawn(d), "VDI NO COMP")).toEqual({ text: "#000", box: "#FFFFFF" });
  });

  it("MAG 1 lost: only the HDG no-compare box; heading shown from AHRS 2 (PG Table 2-4, 2-5)", () => {
    const { E } = state({ avx: { fail: { mag1: true } } });
    expect(adahrsAnnunciations(E)).toEqual({
      comparators: [{ at: "HDG", text: "HDG" }],
      reversionary: ["USING AHRS2"],
    });
  });

  it("a miscompare draws black text on amber (POH 7-81 VDI MISCOMP; PG Fig 2-47)", () => {
    const { s, E } = state({});
    const r = drawn({ ...pfdData(s, E), comparators: [{ at: "VDI", text: "VDI MISCOMP", miscompare: true }] });
    expect(boxUnder(r, "VDI MISCOMP")).toEqual({ text: "#000", box: "#FFE000" });
  });
});

describe("SR22T dual OAT probes, observed by operator (POH 7-75, 7-80/7-81)", () => {
  it("places both probes on RH and none on LH (operator observation; AMM Fig 34-10-6 PDF 1666)", () => {
    const probes = CAT.parts.filter((p) => p.name?.startsWith("OAT sensor"));
    expect(probes).toHaveLength(2);
    expect(one("OAT sensor 1").pos).toEqual(OAT_1);
    expect(one("OAT sensor 2").pos).toEqual(OAT_2);
    for (const probe of probes) {
      expect(worldBox(probe).min.z).toBeGreaterThan(0);
      expect(probe.note).toContain("operator observation of the modelled airplane, plus AMM Fig 34-10-6");
      expect(probe.note).toContain("side-by-side spacing approximate");
    }
    expect(OAT_2[2] - OAT_1[2]).toBeCloseTo(0.1);
  });

  it("keeps both probe bases outboard of the RH fuel tank's outboard end (AMM Fig 34-10-6 PDF 1666)", () => {
    for (const probe of CAT.parts.filter((p) => p.name?.startsWith("OAT sensor")))
      expect(worldBox(probe).min.z, probe.name).toBeGreaterThan(TANK_SPAN[1]);
  });

  it("lists both probes to tap and locate in the pitot and avionics views", () => {
    // The pair sits 100 mm apart, so the label declutter shows one of the two labels; the other stays hoverable and listed.
    for (const sys of ["pitot", "avionics"] as const)
      expect(
        CAT.pinned(sys)
          .map((p) => p.name)
          .filter((n) => n?.startsWith("OAT sensor")),
        sys,
      ).toEqual(["OAT sensor 1", "OAT sensor 2"]);
  });

  it("connects each probe directly to its own ADC at the part anchors (POH 7-75)", () => {
    for (const n of [1, 2]) {
      const path = pts(`oatData${n}`);
      expect(path[0]).toEqual(one(`OAT sensor ${n}`).pos);
      expect(path.at(-1)).toEqual(one(`GSU 75 ADAHRS ${n}`).pos);
      expect(FLOWS.find((f) => f.key === `oatData${n}`)!.sys).toEqual(["pitot", "avionics"]);
    }
  });

  it("stops each OAT data path with its own ADC power or failure (POH 7-75)", () => {
    for (const [patch, expected] of [
      [{}, [0.4, 0.4]],
      [{ cb: { "ADAHRS 1": true } }, [0, 0.4]],
      [{ avx: { fail: { adahrs2: true } } }, [0.4, 0]],
    ] as [Patch<Sim>, number[]][]) {
      const { s, E } = state(patch);
      const rates = flowRates(s, E);
      expect([rates.oatData1, rates.oatData2]).toEqual(expected);
    }
  });

  it("uses the selected ADC's OAT source, reverting with ADC loss (POH 7-80/7-81)", () => {
    expect(state({}).src.oat).toBe(1);
    expect(state({ avx: { fail: { adahrs1: true } } }).src.oat).toBe(2);
    expect(state({ cb: { "ADAHRS 1": true } }).src.oat).toBe(2);
    expect(state({ avx: { fail: { adahrs2: true } } }).src.oat).toBe(1);
    expect(state({ avx: { fail: { adahrs1: true, adahrs2: true } } }).src.oat).toBeNull();
  });
});
