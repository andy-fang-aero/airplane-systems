/**
 * A/C evaporator duct, recirculation inlet path and ECS controller placement: AMM 13773-002 Rev 7 21-50 PDF
 * p. 496, Fig 21-50-1 sheet 3 (PDF p. 521), 21-60 PDF p. 529, Fig 21-60-1 sheet 1 (PDF p. 535); POH 13772-007 7-65, 7-66.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { curveOf } from "@/lib/geometry";
import type { Vec3 } from "@/lib/math";
import { FLOWS, flowRates, isCabinAir } from "@/aircraft/sr22t/flows";
import { FW } from "@/aircraft/sr22t/geometry";
import { initialSim, solve, type Sim } from "@/aircraft/sr22t/model";
import { AC, CAT, type PartSpec } from "@/aircraft/sr22t/parts";
import { CABIN_AIR_COUPLER, ECS_CONTROLLER, ECS_PANEL } from "@/aircraft/sr22t/parts/environment";
import { patched, type Patch } from "./helpers";

const one = (name: string) => {
  const found = CAT.parts.filter((p) => p.name === name);
  expect(found, name).toHaveLength(1);
  return found[0];
};
const flow = (key: string) => {
  const f = FLOWS.find((q) => q.key === key);
  expect(f, key).toBeDefined();
  return f!;
};
const v = (p: Vec3 | THREE.Vector3) => (p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(...p));
const meshOf = (p: PartSpec) => {
  const m = new THREE.Mesh(p.geo());
  if (p.pos) m.position.set(...p.pos);
  if (p.rot) m.rotation.set(...p.rot);
  if (p.scale) m.scale.set(...p.scale);
  m.updateMatrixWorld(true);
  return m;
};
const boxOf = (p: PartSpec) => {
  const m = meshOf(p),
    b = new THREE.Box3().setFromObject(m);
  m.geometry.dispose();
  return b;
};
/** World-space triangles of a geometry. */
const trianglesOf = (g: THREE.BufferGeometry) => {
  const pos = g.getAttribute("position"),
    idx = g.index,
    n = (idx?.count ?? pos.count) / 3;
  return Array.from({ length: n }, (_, i) => {
    const [a, b, c] = [0, 1, 2].map((j) =>
      new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i * 3 + j) : i * 3 + j),
    );
    return new THREE.Triangle(a, b, c);
  });
};
/** A/C selected, engine running, airflow 1, full cold, panel vents. */
const sim = (p: Patch<Sim> = {}) =>
  patched(patched(initialSim, { eng: { running: true }, env: { fan: 1, ac: true, recirc: false, temp: 0 } }), p);
const rates = (p: Patch<Sim> = {}) => {
  const s = sim(p);
  return flowRates(s, solve(s));
};

describe("A/C air path (AMM 21-50 PDF p. 496)", () => {
  it("the evaporator duct runs forward from the evaporator to the distribution manifold (Fig 21-50-1 item 24)", () => {
    const pts = flow("acEvapDuct").pts.map(v),
      first = pts[0],
      last = pts.at(-1)!;
    expect(first.distanceTo(v(AC.evaporator))).toBeLessThan(1e-9);
    expect(boxOf(one("Distribution manifold")).distanceToPoint(last)).toBeLessThan(0.02);
    // ducted forward: it ends ahead of where it starts, at the firewall's aft side
    expect(last.x).toBeGreaterThan(first.x + 1);
    expect(last.x).toBeLessThan(FW);
    expect(isCabinAir("acEvapDuct")).toBe(true);
  });

  it("ram air reaches the evaporator through the coupler duct from the cabin air coupler (Fig 21-50-1 item 29)", () => {
    const pts = flow("acCoupler").pts.map(v);
    expect(pts[0].distanceTo(v(CABIN_AIR_COUPLER))).toBeLessThan(1e-9);
    // the branch leaves the mixing chamber's duct aft of the firewall
    expect(
      flow("toMan")
        .pts.map(v)
        .some((p) => p.distanceTo(pts[0]) < 1e-9),
    ).toBe(true);
    expect(pts[0].x).toBeLessThan(FW);
    expect(pts.at(-1)!.distanceTo(v(AC.evaporator))).toBeLessThan(1e-9);
  });

  it("recirculated cabin air enters through the recirculation check valve into the evaporator (POH 7-65)", () => {
    const f = flow("acRecirc"),
      pts = f.pts.map(v);
    expect(f.tube).toBe(false);
    expect(pts.some((p) => p.distanceTo(v(one("Recirculation check valve").pos!)) < 1e-9)).toBe(true);
    expect(pts.at(-1)!.distanceTo(v(AC.evaporator))).toBeLessThan(1e-9);
    // drawn from cabin air above the evaporator cover and under the RH crew seat cushion
    // the cushion is the first part of that name (parts/cabin.ts)
    const seat = boxOf(CAT.parts.find((p) => p.name === "Front passenger seat")!),
      evap = boxOf(one("A/C evaporator"));
    expect(pts[0].y).toBeGreaterThan(evap.max.y);
    expect(pts[0].y).toBeLessThan(seat.min.y);
    expect(pts[0].x).toBeGreaterThan(seat.min.x);
    expect(pts[0].x).toBeLessThan(seat.max.x);
    expect(isCabinAir("acRecirc")).toBe(true);
  });

  it("normal A/C: ram air through the coupler and evaporator ducts; none recirculated (POH 7-65, 7-66)", () => {
    const R = rates();
    expect(R.fresh).toBeGreaterThan(0);
    expect(R.acCoupler).toBe(R.fresh);
    expect(R.acRecirc).toBe(0);
    expect(R.acEvapDuct).toBeGreaterThan(0);
  });

  it("maximum A/C: the fresh-air valve shuts and the blower recirculates cabin air through the evaporator", () => {
    const R = rates({ env: { recirc: true } });
    expect(R.fresh).toBe(0);
    expect(R.acCoupler).toBe(0);
    expect(R.acRecirc).toBeGreaterThan(0);
    expect(R.acEvapDuct).toBe(R.acRecirc);
    // without the blower (15 A CABIN FAN pulled, POH 7-61) nothing moves the recirculated air
    expect(rates({ env: { recirc: true }, cb: { "CABIN FAN": true } }).acRecirc).toBe(0);
    // nor without the A/C operating (POH 7-66): A/C COMPR pulled, or the engine stopped
    expect(rates({ env: { recirc: true }, cb: { "A/C COMPR": true } }).acRecirc).toBe(0);
    expect(rates({ env: { recirc: true }, eng: { running: false } }).acRecirc).toBe(0);
    // nor at airflow 0 (POH 7-66)
    expect(rates({ env: { recirc: true, fan: 0 } }).acRecirc).toBe(0);
  });

  it("A/C selected: all cabin air passes through the evaporator, none through the direct or blower ducts (POH 7-64, 7-65; AMM 21-50 PDF pp. 496, 504; Fig 21-50-1 sheet 3, PDF p. 521)", () => {
    const outlets = ["panelL", "panelR", "panelL2", "panelR2", "armL", "armR", "floorF", "floorR"];
    for (const recirc of [false, true])
      for (const fan of [0, 1, 2, 3]) {
        if (recirc && fan === 0) continue; // recirculation is not available at airflow 0 (POH 7-66)
        const R = rates({ env: { fan, recirc } }),
          mode = `fan ${fan}${recirc ? " RECIRC" : ""}`;
        expect(R.toMan, mode).toBe(0);
        expect(R.fanDuct, mode).toBe(0);
        expect(R.acEvapDuct, mode).toBeGreaterThan(0);
        // the evaporator duct still feeds every outlet through the manifold
        for (const k of outlets) expect(R[k], `${mode} ${k}`).toBe(R.acEvapDuct);
      }
    // the blower on the evaporator speeds the evaporator duct up in normal A/C as in recirculation
    const normal = [0, 1, 2, 3].map((fan) => rates({ env: { fan } }).acEvapDuct),
      recirc = [1, 2, 3].map((fan) => rates({ env: { fan, recirc: true } }).acEvapDuct);
    for (const s of [normal, recirc]) for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
    // with the engine stopped there is no ram air, but the blower still moves air through the evaporator
    const stopped = rates({ eng: { running: false }, env: { fan: 2 } });
    expect(stopped.acCoupler + stopped.toMan + stopped.fanDuct).toBe(0);
    expect(stopped.acEvapDuct).toBeGreaterThan(0);
    // airflow OFF: nothing anywhere
    const off = rates({ env: { fan: -1 } });
    expect(off.toMan + off.fanDuct + off.acCoupler + off.acRecirc + off.acEvapDuct + off.panelL).toBe(0);
  });

  it("A/C off: the direct and blower ducts carry the air as before (ventilation unchanged)", () => {
    const R = rates({ env: { ac: false, fan: 2, temp: 0.35 } });
    expect(R.toMan).toBeGreaterThan(0);
    expect(R.fanDuct).toBeGreaterThan(0);
    expect(R.panelL).toBe(Math.max(R.toMan, R.fanDuct));
  });

  it("A/C off: no air through the evaporator path", () => {
    const R = rates({ env: { ac: false } });
    expect(R.acCoupler + R.acRecirc + R.acEvapDuct).toBe(0);
    expect(rates({ env: { ac: false, recirc: true } }).acRecirc).toBe(0);
  });

  it("the new ducts clear every other rendered flow tube away from the evaporator they join", () => {
    const tubes = FLOWS.filter((f) => f.tube !== false).map((f) => {
      const c = curveOf(f.pts, f.tension ?? 0.3);
      return { key: f.key, r: f.r ?? 0.012, pts: c.getSpacedPoints(Math.max(60, Math.round(c.getLength() * 300))) };
    });
    // the evaporator is the shared host of its refrigerant lines, drain and ducts (AMM Fig 21-50-1 sheet 3)
    const host = boxOf(one("A/C evaporator")).expandByScalar(0.06);
    const hits: string[] = [];
    for (const key of ["acCoupler", "acEvapDuct"]) {
      const t = tubes.find((q) => q.key === key)!;
      for (const o of tubes) {
        if (o.key === key || (key === "acCoupler" && o.key === "toMan")) continue;
        let gap = Infinity;
        for (const p of t.pts) {
          if (host.containsPoint(p)) continue;
          for (const q of o.pts) gap = Math.min(gap, p.distanceTo(q) - t.r - o.r);
        }
        if (gap < 0.005) hits.push(`${key} / ${o.key}: ${(gap * 1000).toFixed(1)} mm`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("ECS controller (AMM Fig 21-60-1 sheet 1 Detail A, PDF p. 535)", () => {
  it("sits forward of the ECS display panel, under the glareshield and above GIA 2 and the MFD fan", () => {
    const ctrl = one("ECS controller");
    expect(ctrl.pos).toEqual(ECS_CONTROLLER);
    expect(one("Environmental control panel").pos).toEqual(ECS_PANEL);
    const b = boxOf(ctrl),
      panel = boxOf(one("Environmental control panel"));
    // straight forward of the display panel (Detail A), aft of the firewall
    expect(b.min.x).toBeGreaterThan(boxOf(one("Instrument panel")).max.x);
    expect(b.max.x).toBeLessThan(FW);
    expect(b.min.z).toBeLessThan(panel.getCenter(new THREE.Vector3()).z);
    expect(b.max.z).toBeGreaterThan(panel.getCenter(new THREE.Vector3()).z);
    // removed with the glareshield off (AMM 21-60 PDF p. 529): under it, above the behind-panel LRUs
    expect(b.max.y).toBeLessThan(boxOf(one("Glareshield")).min.y);
    expect(b.min.y).toBeGreaterThan(boxOf(one("GIA 2 (GIA 63W)")).max.y);
    for (const fan of CAT.parts.filter((p) => p.name === "MFD cooling fan"))
      expect(b.min.y).toBeGreaterThan(boxOf(fan).max.y);
    expect(ctrl.note).toContain("Fig 21-60-1");
  });

  it("clears every other solid and every rendered flow tube by 5 mm", () => {
    const margin = 0.005,
      ctrl = one("ECS controller"),
      zone = boxOf(ctrl).expandByScalar(margin),
      hits: string[] = [];
    for (const p of CAT.parts) {
      // parts on a moving group (engine cylinders, control surfaces) are nowhere near the instrument panel
      if (p === ctrl || p.parent) continue;
      if (!boxOf(p).intersectsBox(zone)) continue;
      const m = meshOf(p),
        g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      if (trianglesOf(g).some((t) => zone.intersectsTriangle(t))) hits.push(p.name ?? "?");
      m.geometry.dispose();
      g.dispose();
    }
    for (const f of FLOWS.filter((q) => q.tube !== false)) {
      const c = curveOf(f.pts, f.tension ?? 0.3),
        g = new THREE.TubeGeometry(c, Math.max(24, Math.round(c.getLength() * 28)), f.r ?? 0.012, 6, false);
      g.computeBoundingBox();
      if (g.boundingBox!.intersectsBox(zone) && trianglesOf(g).some((t) => zone.intersectsTriangle(t)))
        hits.push(f.key);
      g.dispose();
    }
    expect(hits).toEqual([]);
  });
});
