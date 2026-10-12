/** Fuel storage: POH 13772-007 7-40–7-43; AMM 13773-002 Rev 7 28-10 / 28-40. */
import { Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { CAT, TANK_CHORD, TANK_SPAN, tankTop } from "@/aircraft/sr22t/parts";
import { FLOWS, flowRates } from "@/aircraft/sr22t/flows";
import { initialSim, solve } from "@/aircraft/sr22t/model";
import { wC, wLE, wingP, wingSec } from "@/aircraft/sr22t/geometry";
import { toV } from "@/lib/math";
import { pinPolicy } from "@/components/scene/PinDeclutter";
import { partObjects, registerPart } from "@/lib/registry";
import { patched } from "./helpers";

const named = (name: string) => CAT.parts.filter((p) => p.sys.includes("fuel") && p.name === name);
const onSide = (name: string, side: number) => named(name).filter((p) => Math.sign(p.pos![2]) === side);
const endpoint = (key: string, end: "start" | "end") => {
  const pts = FLOWS.find((f) => f.key === key)!.pts;
  return toV(pts[end === "start" ? 0 : pts.length - 1]);
};

describe("SR22T wing fuel storage", () => {
  it("two float quantity sensors per tank, on the inboard and outboard ribs (AMM 28-40 PDF 1138)", () => {
    expect(named("Fuel quantity sensor (inboard)")).toHaveLength(2);
    expect(named("Fuel quantity sensor (outboard)")).toHaveLength(2);
    for (const side of [-1, 1]) {
      for (const [name, station] of [
        ["inboard", TANK_SPAN[0]],
        ["outboard", TANK_SPAN[1]],
      ] as const) {
        const sensors = onSide(`Fuel quantity sensor (${name})`, side);
        expect(sensors).toHaveLength(1);
        const p = sensors[0];
        expect(Math.abs(p.pos![2])).toBeGreaterThanOrEqual(TANK_SPAN[0]);
        expect(Math.abs(p.pos![2])).toBeLessThanOrEqual(TANK_SPAN[1]);
        expect(Math.abs(Math.abs(p.pos![2]) - station)).toBeLessThan(0.15);
        expect(p.pos).toEqual(wingP(side * station, 0.48, 0).toArray());
        expect(p.note).toContain("GEA 71");
        expect(p.note).toContain("5 A FUEL QTY breaker on MAIN BUS 1");
        expect(p.note).toContain("MAIN BUS 1");
        expect(p.pin).toBe(side < 0);
      }
    }
  });

  it("two outlet strainers per tank at the inboard rib (AMM 28-10 PDF 1088)", () => {
    expect(named("Tank outlet strainer")).toHaveLength(4);
    for (const side of [-1, 1]) {
      const strainers = onSide("Tank outlet strainer", side);
      expect(strainers).toHaveLength(2);
      expect(strainers.map((p) => p.pos)).toEqual([0.37, 0.53].map((c) => wingP(side * TANK_SPAN[0], c, 0).toArray()));
      strainers.forEach((p) => expect(p.note).toContain("1/16-inch"));
    }
  });

  it("a flapper valve between each tank and its collector (POH Fig 7-8)", () => {
    expect(named("Flapper valve")).toHaveLength(2);
    for (const side of [-1, 1]) {
      const valve = onSide("Flapper valve", side)[0];
      const collector = named((side > 0 ? "Right" : "Left") + " collector tank / sump")[0];
      expect(Math.abs(valve.pos![2])).toBeGreaterThan(Math.abs(collector.pos![2]));
      expect(Math.abs(valve.pos![2])).toBeLessThan(TANK_SPAN[0]);
      expect(valve.pos).toEqual(wingP(side * 0.84, 0.45, 0).toArray());
    }
  });

  it("four wing drains plus the gascolator make 5 (POH 7-40, Fig 7-8)", () => {
    expect(named("Tank drain")).toHaveLength(2);
    expect(named("Collector drain")).toHaveLength(2);
    expect(named("Gascolator")).toHaveLength(1);
    for (const side of [-1, 1]) {
      expect(onSide("Tank drain", side)[0].pos).toEqual(wingP(side * 1.3, 0.45, -1).toArray());
      const drain = onSide("Collector drain", side)[0];
      // POH 7-40 flush drain; AMM Fig 28-10-4 Detail B (PDF 1110): lower-skin access panel.
      expect(drain.pos).toEqual(wingP(side * 0.72, 0.45, -1).toArray());
      expect(drain.note).toContain("One of 5");
      // AMM 28-10 PDF 1107–1108: the drain valve is nutted to wing access panel LW3/RW3 (Fig 6-00-7, PDF 124).
      expect(drain.note).toContain("LW3/RW3");
      expect(drain.ext).toBe(true);
      // The left drain carries the label so the right root keeps the flapper and inboard-sensor labels.
      expect(drain.pin).toBe(side < 0);
    }
  });

  it("the tank starts at the main spar (AMM 28-10 PDF 1088)", () => {
    const spar = CAT.parts.find((p) => p.name === "Main spar")!.geo();
    try {
      const positions = spar.getAttribute("position");
      const center = new Vector3();
      // TubeGeometry has eight radial segments; each nine-vertex ring closes on itself.
      for (const ring of [0, 10, 20]) {
        center.set(0, 0, 0);
        for (let j = 0; j < 8; j++) center.add(new Vector3().fromBufferAttribute(positions, ring * 9 + j));
        center.divideScalar(8);
        expect(center.x).toBeCloseTo(wLE(center.z) - TANK_CHORD[0] * wC(center.z), 4);
      }
    } finally {
      spar.dispose();
    }
    expect(TANK_CHORD).toEqual([0.3, 0.6]);
    expect(TANK_SPAN).toEqual([0.95, 4.5]); // Bean's explicitly approximate retained stations.
  });

  it("two baffle ribs inside each tank (AMM 28-10 PDF 1088)", () => {
    expect(named("Fuel baffle rib")).toHaveLength(4);
    for (const side of [-1, 1]) {
      const ribs = onSide("Fuel baffle rib", side);
      expect(ribs).toHaveLength(2);
      expect(ribs.map((p) => Math.abs(p.pos![2]))).toEqual([2.1, 3.3]);
      for (const rib of ribs) {
        const geo = rib.geo();
        try {
          const pts = geo.getAttribute("position");
          for (let i = 0; i < pts.count; i++) {
            const world = new Vector3().fromBufferAttribute(pts, i).add(new Vector3(...rib.pos!));
            const chord = (wLE(world.z) - world.x) / wC(world.z);
            expect(chord).toBeGreaterThanOrEqual(TANK_CHORD[0] - 1e-6);
            expect(chord).toBeLessThanOrEqual(TANK_CHORD[1] + 1e-6);
            expect(Math.abs(world.z)).toBeGreaterThan(TANK_SPAN[0]);
            expect(Math.abs(world.z)).toBeLessThan(TANK_SPAN[1]);
          }
        } finally {
          geo.dispose();
        }
      }
    }
  });

  it("each tank vents to its NACA scoop (AMM 28-10, Fig 28-10-3 PDF 1105)", () => {
    for (const side of [-1, 1]) {
      const k = side > 0 ? "R" : "L";
      expect(endpoint("fuelVent" + k, "end").toArray()).toEqual(onSide("NACA fuel vent", side)[0].pos);
      const start = endpoint("fuelVent" + k, "start");
      const chord = (wLE(start.z) - start.x) / wC(start.z);
      expect(Math.sign(start.z)).toBe(side);
      expect(Math.abs(start.z)).toBeGreaterThanOrEqual(TANK_SPAN[0]);
      expect(Math.abs(start.z)).toBeLessThanOrEqual(TANK_SPAN[1]);
      expect(chord).toBeGreaterThan(TANK_CHORD[0]);
      expect(chord).toBeLessThan(TANK_CHORD[1]);
      // The entire fitting bore must fit under the outer skin, not just its centre.
      const radius = FLOWS.find((f) => f.key === "fuelVent" + k)!.r!;
      expect(wingP(start.z, chord, 1).y - start.y).toBeGreaterThan(radius + 0.001);
      // Compare with the rendered tank's upper polygon, allowing only its tessellation error.
      const upper = wingSec(start.z, ...TANK_CHORD, 0.85)
        .slice(0, 17)
        .sort((a, b) => b.x - a.x);
      const j = upper.findIndex((p, i) => i > 0 && p.x <= start.x && upper[i - 1].x >= start.x);
      expect(j).toBeGreaterThan(0);
      const a = upper[j - 1],
        b = upper[j];
      const tankY = a.y + ((start.x - a.x) / (b.x - a.x)) * (b.y - a.y);
      expect(Math.abs(start.y - tankY)).toBeLessThan(0.0002);
      expect(endpoint("collectorVent" + k, "end").toArray()).toEqual(tankTop(side).toArray());
      expect(endpoint("collectorVent" + k, "start").toArray()).toEqual(
        wingP(side * 0.72, 0.45, 0)
          .add(new Vector3(0, 0.035, 0))
          .toArray(),
      );
    }
  });

  it("vent lines stay static: POH 7-40 and AMM 28-10 (PDF 1089) give no vent flow rate or direction", () => {
    for (const [qL, qR] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [46, 46],
    ]) {
      const s = patched(initialSim, { fuel: { qL, qR } });
      const rates = flowRates(s, solve(s));
      for (const key of ["fuelVentL", "fuelVentR", "collectorVentL", "collectorVentR"]) expect(rates[key]).toBe(0);
    }
  });

  it("fuel view labels: selector, then inboard sensor, outrank the root parts; flapper labels the right root", () => {
    const { rank } = pinPolicy(CAT);
    const order = ["Fuel selector valve", "Fuel quantity sensor (inboard)", "Collector drain", "Tank outlet strainer"];
    const ranks = order.map((name) => rank(name, "fuel"));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    const label = (name: string) => CAT.pinned("fuel").find((p) => p.name === name)!;
    expect(Math.sign(label("Flapper valve").pos![2])).toBe(1);
    for (const name of ["Fuel quantity sensor (inboard)", "Collector drain", "Tank outlet strainer"])
      expect(Math.sign(label(name).pos![2])).toBe(-1);
  });

  it("tap to locate flies to the labelled side of each fuel part", () => {
    // Parts mount in catalogue order; the right instance of each wing part registers first.
    const meshes = new Map<object, Mesh>();
    const offs = CAT.parts
      .filter((p) => p.name && p.sys.includes("fuel"))
      .map((p) => {
        const m = new Mesh();
        meshes.set(p, m);
        return registerPart(p.name!, m, !!p.pin);
      });
    try {
      for (const name of ["Fuel quantity sensor (inboard)", "Collector drain", "Flapper valve"]) {
        const labelled = CAT.pinned("fuel").find((p) => p.name === name)!;
        expect(partObjects.get(name)).toBe(meshes.get(labelled));
      }
    } finally {
      offs.forEach((off) => off());
    }
  });

  it("caps retain 30 usable gallons at the tab and resistive grounding (POH 7-40; AMM 28-10 PDF 1088)", () => {
    expect(named("Filler cap")).toHaveLength(2);
    for (const cap of named("Filler cap")) {
      expect(cap.note).toContain("30 gal usable");
      expect(cap.note).toContain("100 ohm");
    }
  });
});
