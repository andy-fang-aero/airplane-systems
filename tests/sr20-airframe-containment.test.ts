/** Internal installation consistency with the modeled skin; this does not assert surveyed maintenance dimensions. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAT, CYLS, YOKES, YOKE_X, YOKE_Y } from "@/aircraft/sr20/parts";
import { FLOWS } from "@/aircraft/sr20/flows";
import { EXTERIOR_RF_PORTS } from "@/aircraft/sr20/electrical-avionics-depth-flow";
import { FUEL_PITOT_SKIN_PORTS } from "@/aircraft/sr20/fuel-pitot-depth-flow";
import { CABIN_ENVIRONMENT_SKIN_PORTS } from "@/aircraft/sr20/cabin-environment-caps-depth-flow";
import { AIL_SECTOR, CARR, ETT, PULLEYS, RUD_HORN } from "@/aircraft/sr20/rig";
import { toV } from "@/lib/math";
import { curveOf } from "@/lib/geometry";
import { worldGeometry, points } from "./placement-helpers";
import { insideSR20Airframe } from "./sr20-airframe-helpers";

function parentMatrix(parent: string | undefined) {
  if (!parent) return undefined;
  if (parent.startsWith("cyl:")) {
    const c = CYLS.find((c) => `cyl:${c.n}` === parent)!;
    return new THREE.Matrix4().makeTranslation(c.x, -0.14, c.s * 0.25);
  }
  if (parent.startsWith("surf:")) {
    const s = CAT.surfaces.find((s) => `surf:${s.key}` === parent)!;
    return new THREE.Matrix4().makeTranslation(...s.pivot);
  }
  if (parent.startsWith("yoke:") || parent.startsWith("grip:")) {
    const y = YOKES.find((y) => parent.endsWith(y.side))!;
    return new THREE.Matrix4().makeTranslation(YOKE_X, YOKE_Y, y.z);
  }
  if (parent.startsWith("rig:pul:")) return new THREE.Matrix4().makeTranslation(...PULLEYS[parent.slice(8)].c);
  const rigOrigins: Record<string, readonly number[]> = {
    "rig:ett": ETT.c,
    "rig:carr:L": [CARR.x, CARR.y, -CARR.z],
    "rig:carr:R": [CARR.x, CARR.y, CARR.z],
    "rig:ailSector": AIL_SECTOR.c,
    "rig:rudHorn": RUD_HORN.c,
    "rig:pedL": [0, 0, 0],
    "rig:pedR": [0, 0, 0],
  };
  const rigOrigin = rigOrigins[parent];
  if (rigOrigin) return new THREE.Matrix4().makeTranslation(rigOrigin[0], rigOrigin[1], rigOrigin[2]);
  throw new Error(`Internal part has an unchecked parent transform: ${parent}`);
}

// A tenth of a millimetre absorbs Float32/interpolation noise, not visible installation protrusions.
const contained = (p: THREE.Vector3) => insideSR20Airframe(p, -0.0001);
const describePoint = (p: THREE.Vector3) =>
  p
    .toArray()
    .map((v) => v.toFixed(4))
    .join(", ");

describe("SR20 internal hardware and routing containment", () => {
  it("keeps every internal catalogue mesh within the fuselage, wing or tail skin", () => {
    const failures: string[] = [];
    for (const part of CAT.parts.filter((part) => !part.ext)) {
      const g = worldGeometry(part, parentMatrix(part.parent));
      try {
        const outside = points(g).find((p) => !contained(p));
        if (outside) failures.push(`${part.name ?? part.id}: ${describePoint(outside)}`);
      } finally {
        g.dispose();
      }
    }
    expect(failures, "Internal mesh vertices outside the airframe").toEqual([]);
  });

  it("keeps complete internal flow curves and rendered tube walls within the skin", () => {
    const failures: string[] = [];
    for (const f of FLOWS.filter((f) => !f.ext)) {
      // Named port apertures may penetrate the skin; the rest of each route still has to fit inside.
      const port = FUEL_PITOT_SKIN_PORTS[f.key] ?? CABIN_ENVIRONMENT_SKIN_PORTS[f.key];
      const inside = (p: THREE.Vector3) =>
        contained(p) ||
        (!!port && p.distanceTo(toV(port.point)) <= port.reach) ||
        (EXTERIOR_RF_PORTS[f.key] ?? []).some(
          (port) => p.distanceTo(toV(port.end === "start" ? f.pts[0] : f.pts.at(-1)!)) <= port.length + (f.r ?? 0.012),
        );
      const curve = curveOf(f.pts, f.tension ?? 0.3);
      const centreOutside = curve.getPoints(600).find((p) => !inside(p));
      if (centreOutside) failures.push(`${f.key} centreline: ${describePoint(centreOutside)}`);
      if (f.tube === false) continue;
      // Match the actual rendered tube, including its radius, not just the route's declared control points.
      const g = new THREE.TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false);
      try {
        const outside = points(g).find((p) => !inside(p));
        if (outside) failures.push(`${f.key} tube wall: ${describePoint(outside)}`);
      } finally {
        g.dispose();
      }
    }
    expect(failures, "Internal curves/tube walls outside the airframe").toEqual([]);
  });
});
