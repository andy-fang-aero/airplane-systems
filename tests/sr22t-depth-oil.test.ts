// The tee topology guard preserves the original base split that an earlier implementation regressed.
/** Oil system relationships: SR22T POH 13772-007; AMM 13773-002 Rev 7. Metres are illustrative. */
import { describe, expect, it } from "vitest";
import { Matrix4, Quaternion, Euler, Vector3 } from "three";
import { FUSE, inFus } from "@/aircraft/sr22t/geometry";
import { CAT, GOV } from "@/aircraft/sr22t/parts";
import { ACCESSORY_FACE_X, CRANK_Y, IN } from "@/aircraft/sr22t/engine-datum";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { toV } from "@/lib/math";
import { curveOf } from "@/lib/geometry";
import { solid, gap, tube } from "./sr22t-engine-gap";

const part = (name: string) => {
  const p = CAT.parts.find((p) => p.name === name);
  expect(p, name).toBeDefined();
  return p!;
};
const position = (name: string) => new Vector3(...part(name).pos!);
const path = (key: string) => FLOWS.find((f) => f.key === key)!.pts.map(toV);
const bounds = (name: string) => {
  const geo = part(name).geo();
  geo.computeBoundingBox();
  const b = geo.boundingBox!.clone().translate(position(name));
  geo.dispose();
  return b;
};

describe("SR22T engine oil", () => {
  it("the oil pressure and temperature sensors sit below the oil cooler (POH 7-35–7-36; AMM 79-30 PDF 2778)", () => {
    const cooler = position("Oil cooler");
    for (const name of ["Oil pressure sensor", "Oil temperature sensor"]) {
      const sensor = position(name);
      expect(sensor.y).toBeLessThan(cooler.y);
      expect(Math.abs(sensor.x - cooler.x)).toBeLessThanOrEqual(0.15);
      expect(Math.abs(sensor.z - cooler.z)).toBeLessThanOrEqual(0.15);
    }
    expect(position("Oil temperature sensor").z).toBeLessThan(0);
  });

  it("the oil cooler sits where the Continental rear view puts it (M-18 Fig 5-33 sheet 1 p. 5-53)", () => {
    const cooler = bounds("Oil cooler");
    const centre = cooler.getCenter(new Vector3());
    // +6.5 to -2.9 in. about the crankshaft, 5.4-13.9 in. left of it (scaled, ±0.5 in.)
    expect(Math.abs(centre.y - (CRANK_Y + 1.8 * IN))).toBeLessThanOrEqual(0.5 * IN);
    expect(Math.abs(centre.z + 9.65 * IN)).toBeLessThanOrEqual(0.5 * IN);
    expect(cooler.max.y).toBeLessThanOrEqual(CRANK_Y + 6.5 * IN + 0.5 * IN);
    expect(cooler.min.y).toBeGreaterThanOrEqual(CRANK_Y - 2.9 * IN - 0.5 * IN);
    expect(cooler.max.z).toBeLessThanOrEqual(-5.4 * IN + 0.5 * IN);
    expect(cooler.min.z).toBeGreaterThanOrEqual(-13.9 * IN - 0.5 * IN);
  });

  it("the oil sensors hang below the cooler's bottom at their Fig 5-33 ports, clear of their neighbours", () => {
    const cooler = bounds("Oil cooler");
    const pressure = position("Oil pressure sensor"),
      temperature = position("Oil temperature sensor");
    // Detail J: 4.56 in. below the crankshaft (dimensioned), at the accessory face; temperature port scaled
    expect(Math.abs(pressure.y - (CRANK_Y - 4.56 * IN))).toBeLessThan(0.001);
    expect(Math.abs(pressure.x - ACCESSORY_FACE_X)).toBeLessThanOrEqual(1 * IN + 0.001);
    expect(Math.abs(temperature.y - (CRANK_Y - 4.2 * IN))).toBeLessThanOrEqual(0.5 * IN);
    expect(Math.abs(temperature.x - (ACCESSORY_FACE_X + 2.8 * IN))).toBeLessThanOrEqual(0.5 * IN);
    for (const name of ["Oil pressure sensor", "Oil temperature sensor"]) {
      const sensor = bounds(name);
      expect(sensor.max.y, name).toBeLessThan(cooler.min.y);
      for (const other of ["Engine-driven fuel pump", "Oil filter (full-flow)", "Engine mount weldment", "Oil cooler"])
        expect(sensor.intersectsBox(bounds(other)), `${name} vs ${other}`).toBe(false);
    }
  });

  it("the oil cooler clears the oil filter and the MCU heat shield", () => {
    const cooler = bounds("Oil cooler");
    for (const other of ["Oil filter (full-flow)", "MCU heat shield", "Oil filler cap / dipstick"])
      expect(cooler.intersectsBox(bounds(other)), other).toBe(false);
  });

  it("turbo oil comes from the bottom of the oil cooler (POH 7-38)", () => {
    const cooler = part("Oil cooler");
    const geo = cooler.geo();
    geo.computeBoundingBox();
    const bottom = position("Oil cooler");
    bottom.y += geo.boundingBox!.min.y;
    geo.dispose();
    for (const key of ["turboOilL", "turboOilR", "gateOil"]) {
      expect(path(key)[0].distanceTo(bottom)).toBeLessThanOrEqual(0.05);
    }
  });

  it("the checked turbo tee hangs at the cooler base, clear of the separate wastegate supply and nearby hardware (POH 7-38; AMM Fig 79-30-2 sheet 3 PDF 2787)", () => {
    const cooler = bounds("Oil cooler");
    const bottom = cooler.getCenter(new Vector3());
    bottom.y = cooler.min.y;
    const check = position("Turbo oil check valve"),
      tee = position("Turbo oil tee");
    // The figure is undimensioned: test a compact assembly at the cooler, not exact illustrative coordinates.
    for (const name of ["Turbo oil check valve", "Turbo oil tee"]) {
      const fitting = solid(part(name));
      expect(position(name).distanceTo(bottom), name).toBeLessThan(0.12);
      expect(fitting.box.max.y, name).toBeLessThan(cooler.min.y);
      expect(part(name).note).toContain("approximate");
      for (const other of CAT.parts.filter(
        (p) =>
          p.name !== name &&
          !["Turbo oil check valve", "Turbo oil tee"].includes(p.name ?? "") &&
          (!p.parent || p.parent.startsWith("cyl:")),
      )) {
        expect(gap(fitting, solid(other), 0.005), `${name} vs ${other.name}`).toBeGreaterThanOrEqual(0.005 - 1e-7);
      }
      for (const f of FLOWS.filter((f) => f.tube !== false && !["turboOilL", "turboOilR"].includes(f.key)))
        expect(gap(fitting, tube(f), 0.005, false), `${name} vs ${f.key}`).toBeGreaterThanOrEqual(0.005 - 1e-7);
      for (const key of ["turboOilL", "turboOilR"]) {
        const f = FLOWS.find((f) => f.key === key)!;
        const atTee = f.pts.findIndex((p) => toV(p).distanceTo(tee) < 0.001);
        const downstream = tube({ ...f, pts: f.pts.slice(atTee + 1) });
        expect(gap(fitting, downstream, 0.005, false), `${name} vs ${key} after tee`).toBeGreaterThanOrEqual(
          0.005 - 1e-7,
        );
      }
    }
    expect(tee.y).toBeLessThan(check.y);
    for (const key of ["turboOilL", "turboOilR"]) {
      const points = path(key);
      const atCheck = points.findIndex((p) => p.distanceTo(check) < 0.001);
      const atTee = points.findIndex((p) => p.distanceTo(tee) < 0.001);
      expect(atCheck).toBeGreaterThan(0);
      expect(atTee).toBe(atCheck + 1);
    }
  });

  it("the LH and RH hoses branch at the tee's opposite outlets within 1 mm (AMM Fig 79-30-2 sheet 3 Detail C PDF 2787)", () => {
    const tee = position("Turbo oil tee");
    const [left, right] = ["turboOilL", "turboOilR"].map((key) => {
      const points = path(key);
      const at = points.findIndex((p) => p.distanceTo(tee) <= 0.001);
      expect(at).toBeGreaterThan(0);
      const f = FLOWS.find((f) => f.key === key)!;
      const curve = curveOf(f.pts, f.tension ?? 0.3);
      expect(curve.getPoint(at / (points.length - 1)).distanceTo(tee)).toBeLessThanOrEqual(0.001);
      return { head: points.slice(0, at + 1), outlet: points[at + 1] };
    });
    expect(left.head).toEqual(right.head);
    expect(left.outlet.z).toBeLessThan(tee.z - 0.01);
    expect(right.outlet.z).toBeGreaterThan(tee.z + 0.01);
    // At the branch plane both independent hoses start at the same tee, within the connectivity tolerance.
    for (const head of [left.head, right.head]) expect(head.at(-1)!.distanceTo(tee)).toBeLessThanOrEqual(0.001);
  });

  it("the oil circuit visits suction screen, pump, filter, cooler, governor in POH 7-36 order", () => {
    const names = ["Oil suction screen", "Oil pump", "Oil filter (full-flow)", "Oil cooler"];
    const anchors = [...names.map(position), new Vector3(...GOV)];
    const visits = path("oil")
      .map((point) => {
        const distances = anchors.map((anchor) => anchor.distanceTo(point));
        const nearest = Math.min(...distances);
        return nearest < 0.001 ? distances.indexOf(nearest) : -1;
      })
      .filter((i) => i >= 0);
    expect(visits).toEqual([0, 1, 2, 3, 4]);
    expect(path("oil").some((p) => p.distanceTo(position("Oil temperature control valve")) < 0.001)).toBe(true);
  });

  it("a check valve and a tee lead to both turbo centre housings (AMM 79-00 PDF 2764)", () => {
    const check = position("Turbo oil check valve"),
      tee = position("Turbo oil tee");
    for (const [key, name] of [
      ["turboOilL", "LH turbocharger"],
      ["turboOilR", "RH turbocharger"],
    ]) {
      const points = path(key);
      const at = (anchor: Vector3) => points.findIndex((p) => p.distanceTo(anchor) < 0.001);
      expect(at(check)).toBeGreaterThan(0);
      expect(at(tee)).toBe(at(check) + 1);
      expect(points.at(-1)!.distanceTo(position(name))).toBeLessThan(0.001);
    }
  });

  it("the full-flow filter is at the left rear, inboard of the oil cooler (AMM Fig 71-00-2 sheet 3 item 27 PDF 2489; M-18 Fig 5-33 PDF p. 148; issues 65, 306)", () => {
    const filter = position("Oil filter (full-flow)");
    expect(filter.z).toBeLessThan(0);
    expect(filter.x).toBeLessThan(position("Oil sump").x);
    expect(filter.x).toBeLessThan(ACCESSORY_FACE_X);
    expect(bounds("Oil filter (full-flow)").max.z).toBeLessThan(0);
    expect(bounds("Oil filter (full-flow)").min.z).toBeGreaterThan(bounds("Oil cooler").max.z);
    expect(part("Oil filter (full-flow)").note).toContain("bypass relief valve");
  });

  it("the filler is under the top-left door and the drain below the sump (POH 7-37; AMM Fig 71-00-2 sheets 2, 4)", () => {
    const cap = position("Oil filler cap / dipstick"),
      door = position("Oil filler access door");
    expect(cap.z).toBeLessThan(0);
    expect(cap.y).toBeLessThan(door.y);
    expect(Math.abs(cap.x - door.x)).toBeLessThan(0.06);
    expect(Math.abs(cap.z - door.z)).toBeLessThan(0.06);
    const drain = position("Crankcase oil drain"),
      sump = position("Oil sump");
    expect(drain.y).toBeLessThan(sump.y);
    expect(drain.x).toBe(sump.x);
    expect(drain.z).toBe(sump.z);
  });

  it("the rear oil pump relief follows the POH over the AMM (POH 7-31, 7-36; AMM 79-00 PDF 2764)", () => {
    expect(position("Oil pump").x).toBeLessThan(position("Oil sump").x);
    expect(position("Oil pressure relief valve").distanceTo(position("Oil pump"))).toBeLessThan(0.08);
    expect(part("Oil pressure relief valve").note).toContain("pump inlet");
    expect(part("Oil pressure relief valve").note).toContain("POH governs");
  });

  it("the aft-baffle separator connects crankcase, breather and oil return (AMM Fig 79-20-3 PDF 2776)", () => {
    const separator = position("Oil separator");
    expect(separator.x).toBeLessThan(position("Oil cooler").x);
    expect(separator.z).toBeLessThan(0);
    for (const name of ["Oil breather line", "Oil separator breather hose", "Oil separator return line"]) {
      const geo = part(name).geo();
      geo.computeBoundingBox();
      expect(
        geo
          .boundingBox!.clone()
          .translate(new Vector3(...(part(name).pos ?? [0, 0, 0])))
          .distanceToPoint(separator),
      ).toBeLessThan(0.05);
      geo.dispose();
    }
  });
});

// POH 13772-007 7-37, 8-15; AMM 13773-002 Rev 7 Fig 71-10-2 item 7 (PDF 2510).
it("the oil access cover follows the upper-left cowl skin flush across its whole footprint", () => {
  const door = part("Oil filler access door");
  const g = door.geo();
  const a = g.attributes.position;
  const matrix = new Matrix4().compose(
    new Vector3(...door.pos!),
    new Quaternion().setFromEuler(new Euler(...(door.rot ?? [0, 0, 0]))),
    new Vector3(1, 1, 1),
  );
  for (let i = 0; i < a.count; i++) {
    const p = new Vector3().fromBufferAttribute(a, i).applyMatrix4(matrix);
    expect(p.z).toBeLessThan(0);
    // The entire cover lies in a 3-mm layer at the surface, allowing Float32 rounding.
    expect(inFus(p.clone().add(new Vector3(0, -0.0006, 0)))).toBe(true);
    expect(inFus(p.clone().add(new Vector3(0, 0.003, 0)))).toBe(false);
    expect(p.y).toBeGreaterThan(FUSE.section(p.x).cy);
  }
  g.dispose();
});
