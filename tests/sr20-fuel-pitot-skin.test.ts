/** Undimensioned routes are schematic (POH 11934-005 Figs 7-8/7-16; AMM 12137-002 ATA 28/34).
 * Display containment regression: internal hardware/tube walls must stay within the modelled skin. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAT } from "@/aircraft/sr20/parts";
import { insideSR20Airframe as internal } from "./sr20-airframe-helpers";
import { FUEL_PITOT_DEPTH_FLOWS, FUEL_PITOT_SKIN_PORTS } from "@/aircraft/sr20/fuel-pitot-depth-flow";
import { curveOf } from "@/lib/geometry";
import { toV } from "@/lib/math";

const hardware = new Set([
  "Right collector tank / sump",
  "Left collector tank / sump",
  "Fuel filler neck",
  "Reduced-fuel tab",
  "Tank outlet strainer",
  "Flapper valve",
  "Fuel baffle rib",
  "Fuel quantity sensor (inboard)",
  "Fuel quantity sensor (outboard)",
  "Electric boost pump",
  "Gascolator",
  "Gascolator filter screen",
  "Selector valve enclosure",
  "Firewall fuel enclosure",
  "Drain manifold",
  "Induction drain check valve",
  "Alternate static valve",
  "Alternate static knob",
  "Pitot water trap",
  "Static water trap",
  "Console static water trap",
  "Static line sump (R)",
  "Static line sump (L)",
  "Static bulkhead tee",
  "Pitot heat current sensor",
  "Pitot heater wiring",
  "Pitot mast ground strap",
  "Stall warning pressure switch",
  "Stall switch electrical connector",
  "Stall warning water trap",
  "Pitot drain tube",
  "Static drain tube",
  "Console static drain tube",
  "Stall warning drain tube",
  "Pitot drain plug",
  "Static drain plug",
  "Console static drain plug",
  "Stall warning drain plug",
]);
const firstFailures = (points: THREE.Vector3[], ok: (p: THREE.Vector3) => boolean) => {
  const bad = points.filter((p) => !ok(p));
  return bad.length
    ? [
        `${bad.length}/${points.length} outside, first ${bad[0]
          .toArray()
          .map((v) => v.toFixed(4))
          .join(",")}`,
      ]
    : [];
};

describe("SR20 internal fuel/pitot plumbing stays inside fuselage or wing skin", () => {
  for (const part of CAT.parts.filter((p) => hardware.has(p.name ?? "")))
    it(part.name!, () => {
      const g = part.geo();
      try {
        const matrix = new THREE.Matrix4().compose(
          toV(part.pos ?? [0, 0, 0]),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rot ?? [0, 0, 0]))),
          toV(part.scale ?? [1, 1, 1]),
        );
        const positions = g.attributes.position;
        const points = Array.from({ length: positions.count }, (_, i) =>
          new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix),
        );
        expect(firstFailures(points, (p) => internal(p))).toEqual([]);
        if (g instanceof THREE.TubeGeometry) {
          const path = g.parameters.path;
          const samples = path
            .getSpacedPoints(Math.max(50, Math.ceil(path.getLength() / 0.004)))
            .map((p) => p.applyMatrix4(matrix));
          expect(firstFailures(samples, (p) => internal(p, g.parameters.radius))).toEqual([]);
        }
      } finally {
        g.dispose();
      }
    });
  for (const flow of FUEL_PITOT_DEPTH_FLOWS)
    it(flow.key + " curved tube", () => {
      const curve = curveOf(flow.pts, flow.tension ?? 0.3),
        radius = flow.r ?? 0.012;
      const port = FUEL_PITOT_SKIN_PORTS[flow.key];
      // Only the named external port's short terminal may meet the skin; never exclude an entire path.
      const ok = (p: THREE.Vector3, margin = 0) =>
        internal(p, margin) || (port !== undefined && p.distanceTo(toV(port.point)) <= port.reach);
      const tube = new THREE.TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), radius, 6, false);
      try {
        const vertices = tube.attributes.position;
        const walls = Array.from({ length: vertices.count }, (_, i) =>
          new THREE.Vector3().fromBufferAttribute(vertices, i),
        );
        expect(firstFailures(walls, (p) => ok(p))).toEqual([]);
        expect(
          firstFailures(curve.getSpacedPoints(Math.max(50, Math.ceil(curve.getLength() / 0.004))), (p) =>
            ok(p, radius),
          ),
        ).toEqual([]);
      } finally {
        tube.dispose();
      }
    });
});

it("every allowed skin penetration terminates on its own real external port", () => {
  for (const [key, port] of Object.entries(FUEL_PITOT_SKIN_PORTS)) {
    const flow = FUEL_PITOT_DEPTH_FLOWS.find((f) => f.key === key)!;
    const point = toV(port.point);
    expect(Math.min(point.distanceTo(toV(flow.pts[0])), point.distanceTo(toV(flow.pts.at(-1)!)))).toBeLessThan(1e-9);
    const parts = CAT.parts.filter((p) => p.name === port.part);
    expect(parts.every((p) => p.ext)).toBe(true);
    expect(Math.min(...parts.map((p) => point.distanceTo(toV(p.pos!))))).toBeLessThan(1e-9);
    expect(port.reach).toBeLessThanOrEqual(0.025);
    expect(curveOf(flow.pts, flow.tension ?? 0.3).getLength()).toBeGreaterThan(port.reach * 2);
  }
});
