import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { curveOf } from "@/lib/geometry";
import { CAT as DA40, CYLS as DA40_CYLS } from "@/aircraft/da40/parts";
import { CAT as SR20, CYLS as SR20_CYLS } from "@/aircraft/sr20/parts";
import * as diamond from "@/aircraft/da40/geometry";
import * as cirrus from "@/aircraft/sr20/geometry";
import { linkPoints, rigPose } from "@/aircraft/da40/rig";
import { FLOWS as DA40_FLOWS } from "@/aircraft/da40/flows";
import { FLOWS as SR20_FLOWS } from "@/aircraft/sr20/flows";
import { namedPart, partBounds, points, worldGeometry } from "./placement-helpers";

// These are physical consistency checks of representative geometry, not assertions of surveyed installation dimensions.
describe("DA40 installation clearances (AFM §7 and G1000 SMM §2)", () => {
  it.each([
    "Starter (Skytec 149-24LS)",
    "Alternator — 28 V, 70 A",
    "Voltage regulator (VR2000)",
    "Main battery — 24 V, 11 Ah",
    "Remote avionics enclosure",
    "GRS 77 AHRS",
    "Pitch servo (GSA)",
    "Parking brake valve (Cleveland 60-59)",
  ])("keeps %s inside the skin", (name) => {
    const geometry = worldGeometry(namedPart(DA40, name));
    try {
      expect(points(geometry).every((p) => diamond.inFus(p, 0.002))).toBe(true);
    } finally {
      geometry.dispose();
    }
  });

  it("keeps the wing-root filters in the stub wing (AFM 7-54)", () => {
    const geometry = worldGeometry(namedPart(DA40, "Pitot-static filters"));
    try {
      for (const p of points(geometry)) {
        const xc = (diamond.wLE(p.z) - p.x) / diamond.wC(p.z);
        expect(xc).toBeGreaterThan(0);
        expect(xc).toBeLessThan(1);
        expect(p.y).toBeGreaterThan(diamond.wingP(p.z, xc, -1).y);
        expect(p.y).toBeLessThan(diamond.wingP(p.z, xc, 1).y);
      }
    } finally {
      geometry.dispose();
    }
  });

  it("fits remote LRUs below the baggage floor and clear of the moving elevator rod", () => {
    const enclosure = partBounds(namedPart(DA40, "Remote avionics enclosure"));
    const floor = partBounds(namedPart(DA40, "Baggage compartment"));
    const servo = partBounds(namedPart(DA40, "Pitch servo (GSA)"));
    expect(enclosure.intersectsBox(servo)).toBe(false);
    const ahrs = partBounds(namedPart(DA40, "GRS 77 AHRS"));
    expect(ahrs.min.y).toBeGreaterThan(floor.max.y);
    const lrus = ["GIA 63W #1", "GIA 63W #2", "GTX 33 transponder"].map((name) => partBounds(namedPart(DA40, name)));
    for (const lru of lrus) {
      expect(enclosure.containsBox(lru)).toBe(true);
      expect(lru.max.y).toBeLessThan(floor.min.y);
    }
    // Check the full commanded pitch range: rod radius 8 mm, servo-link radius 5 mm (ControlRig.tsx).
    for (let step = -10; step <= 10; step++) {
      const links = linkPoints(rigPose({ pitch: step / 10, roll: 0, yaw: 0 }, 0));
      for (const [key, radius] of [
        ["elev2", 0.008],
        ["pServo", 0.005],
      ] as const) {
        for (const lru of lrus) {
          const clearance = lru.clone().expandByScalar(radius);
          for (let i = 0; i <= 200; i++) {
            expect(clearance.containsPoint(links[key][0].clone().lerp(links[key][1], i / 200))).toBe(false);
          }
        }
      }
    }
  });

  it("separates unrelated engine, fuel and cabin equipment", () => {
    for (const [a, b] of [
      ["Starter (Skytec 149-24LS)", "Oil sump"],
      ["Alternator — 28 V, 70 A", "Oil sump"],
      ["Voltage regulator (VR2000)", "Lycoming IO-360-M1A"],
      ["Parking brake valve (Cleveland 60-59)", "Gascolator"],
      ["Large centre console", "Pilot seat"],
      ["Large centre console", "Front passenger seat"],
      ["Emergency axe", "Pilot seat"],
    ]) {
      expect(partBounds(namedPart(DA40, a)).intersectsBox(partBounds(namedPart(DA40, b))), `${a} / ${b}`).toBe(false);
    }
    const starter = partBounds(namedPart(DA40, "Starter (Skytec 149-24LS)"));
    const cable = DA40_FLOWS.find((f) => f.key === "start")!;
    expect(starter.containsPoint(new THREE.Vector3(...(cable.pts.at(-1)! as [number, number, number])))).toBe(true);
  });
});

describe("SR20 installation clearances (POH §7)", () => {
  it.each([
    "Fire extinguisher",
    "Muffler",
    "Heat exchanger (muff)",
    "Oil filter (full-flow)",
    "A/C evaporator (optional)",
  ])("keeps %s inside the skin", (name) => {
    const geometry = worldGeometry(namedPart(SR20, name));
    try {
      expect(points(geometry).every((p) => cirrus.inFus(p, 0.002))).toBe(true);
    } finally {
      geometry.dispose();
    }
  });

  it("keeps exhaust, filter and under-seat equipment clear of unrelated hardware", () => {
    for (const [a, b] of [
      ["Muffler", "Oil sump"],
      ["Heat exchanger (muff)", "Oil sump"],
      ["Oil filter (full-flow)", "BAT 1 — 24 V, 11 Ah"],
      ["A/C evaporator (optional)", "Front passenger seat"],
      ["Fire extinguisher", "Center console"],
    ]) {
      expect(partBounds(namedPart(SR20, a)).intersectsBox(partBounds(namedPart(SR20, b))), `${a} / ${b}`).toBe(false);
    }
    // Parallel round magneto/filter cases may have overlapping bounding boxes, but their cylinders must not intersect.
    const filter = namedPart(SR20, "Oil filter (full-flow)").pos!;
    const mag = namedPart(SR20, "Right magneto").pos!;
    expect(Math.hypot(filter[1] - mag[1], filter[2] - mag[2])).toBeGreaterThan(0.045 + 0.05);

    const sump = partBounds(namedPart(SR20, "Oil sump"));
    for (const f of SR20_FLOWS.filter((flow) => /^exh\d$/.test(flow.key))) {
      const clearance = sump.clone().expandByScalar(f.r!);
      const curve = curveOf(f.pts, f.tension ?? 0.3);
      expect(
        curve.getPoints(150).every((p) => !clearance.containsPoint(p)),
        f.key,
      ).toBe(true);
    }
    const oil = SR20_FLOWS.find((f) => f.key === "oilRelief")!;
    const filterBounds = partBounds(namedPart(SR20, "Oil filter (full-flow)"));
    expect(oil.pts.some((p) => filterBounds.containsPoint(Array.isArray(p) ? new THREE.Vector3(...p) : p))).toBe(true);
  });

  it("leaves the centre avionics stack between the bolster halves (POH Fig. 7-4)", () => {
    const keyboard = partBounds(namedPart(SR20, "GCU 479 FMS keyboard"));
    const geometry = worldGeometry(namedPart(SR20, "Bolster switch panel"));
    const triangles = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    try {
      const vertices = points(triangles);
      for (let i = 0; i < vertices.length; i += 3) {
        const z = vertices.slice(i, i + 3).map((p) => p.z);
        expect(Math.max(...z) < keyboard.min.z || Math.min(...z) > keyboard.max.z).toBe(true);
      }
    } finally {
      triangles.dispose();
      geometry.dispose();
    }
  });

  it("stows both forward CAPS straps beneath the skin (POH 7-94)", () => {
    for (const strap of SR20.parts.filter((p) => p.name === "Forward harness strap")) {
      const geometry = worldGeometry(strap);
      try {
        expect(points(geometry).every((p) => cirrus.inFus(p))).toBe(true);
      } finally {
        geometry.dispose();
      }
    }
  });
});

it("keeps the engine-side batteries clear of both cylinder banks", () => {
  for (const [cat, cyls, name, y, z] of [
    [DA40, DA40_CYLS, "Main battery — 24 V, 11 Ah", -0.05, 0.26],
    [SR20, SR20_CYLS, "BAT 1 — 24 V, 11 Ah", -0.14, 0.25],
  ] as const) {
    const battery = partBounds(namedPart(cat, name));
    for (const c of cyls) {
      const parent = new THREE.Matrix4().makeTranslation(c.x, y, c.s * z);
      for (const p of cat.parts.filter((p) => p.parent === `cyl:${c.n}`)) {
        expect(battery.intersectsBox(partBounds(p, parent)), `${cat.prefix}: ${name} / ${p.name}`).toBe(false);
      }
    }
  }
});
