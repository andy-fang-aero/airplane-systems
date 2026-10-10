/** POH 13772-007 7-64, 7-66; AMM 13773-002 21-20 p. 17 (PDF 470),
 * Fig 21-20-1 sheet 2 Detail A (PDF 475). Undimensioned housing/routing are approximate. */
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, TubeGeometry, Vector3 } from "three";
import { expect, it } from "vitest";
import { curveOf } from "@/lib/geometry";
import { toV } from "@/lib/math";
import { FLOWS, flowRates } from "@/aircraft/sr22t/flows";
import { inFus } from "@/aircraft/sr22t/geometry";
import { initialSim, solve } from "@/aircraft/sr22t/model";
import { CAT } from "@/aircraft/sr22t/parts";
import { DEFROST_VENT } from "@/aircraft/sr22t/parts/environment";
import { patched } from "./helpers";

it("keeps the solid defrost supply below the glareshield and feeds a compact under-slot housing (POH 7-64; AMM Fig 21-20-1 Detail A)", () => {
  const part = (name: string) => CAT.parts.find((p) => p.name === name)!;
  const diffuser = part("Windshield diffuser");
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const housing = new Mesh(diffuser.geo(), material);
  housing.position.set(...diffuser.pos!);
  housing.updateMatrixWorld();
  const glare = part("Glareshield");
  const glareMesh = new Mesh(glare.geo());
  if (glare.pos) glareMesh.position.set(...glare.pos);
  if (glare.rot) glareMesh.rotation.set(...glare.rot);
  if (glare.scale) glareMesh.scale.set(...glare.scale);
  glareMesh.updateMatrixWorld();
  const glareBox = new Box3().setFromObject(glareMesh, true);
  const footprint = new Box3(new Vector3(2.27, -0.135, -0.29), new Vector3(2.566, 0.4, 0.29));
  const bounds = new Box3();
  const supply = FLOWS.find((f) => f.key === "defrost")!;
  const outlet = FLOWS.find((f) => f.key === "defrost2")!;
  try {
    expect(supply.tube).not.toBe(false);
    // Match the actual scene's tessellation, including spline overshoot and tube radius.
    for (const f of [supply, outlet].filter((f) => f.tube !== false)) {
      const curve = curveOf(f.pts, f.tension ?? 0.3);
      const geo = new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false);
      try {
        const positions = geo.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          const p = new Vector3().fromBufferAttribute(positions, i);
          if (p.x >= glareBox.min.x && p.x <= glareBox.max.x)
            expect(p.y, `${f.key} tube above glareshield`).toBeLessThanOrEqual(glareBox.max.y + 1e-7);
          expect(inFus(p), `${f.key} skin containment`).toBe(true);
          expect(footprint.containsPoint(p), `${f.key} declared footprint`).toBe(true);
          bounds.expandByPoint(p);
        }
      } finally {
        geo.dispose();
      }
    }
    // The physical supply ends on the bottom face of a real central housing, below the slot.
    const end = toV(supply.pts.at(-1)!);
    expect(end.y).toBeLessThan(glareBox.max.y - (supply.r ?? 0.012));
    const hit = new Raycaster(end.clone().add(new Vector3(0, -0.01, 0)), new Vector3(0, 1, 0), 0, 0.05).intersectObject(
      housing,
    )[0];
    expect(hit, "supply reaches housing underside").toBeDefined();
    expect(hit.distance).toBeCloseTo(0.01, 6);
    const positions = housing.geometry.getAttribute("position");
    const belowSlot: Vector3[] = [];
    for (let i = 0; i < positions.count; i++) {
      const p = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(housing.matrixWorld);
      expect(inFus(p), "diffuser skin containment").toBe(true);
      expect(footprint.containsPoint(p), "diffuser declared footprint").toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(glareBox.min.x);
      expect(p.x).toBeLessThanOrEqual(glareBox.max.x);
      expect(p.z).toBeGreaterThanOrEqual(glareBox.min.z);
      expect(p.z).toBeLessThanOrEqual(glareBox.max.z);
      if (p.y < glareBox.max.y - 0.01) belowSlot.push(p);
      bounds.expandByPoint(p);
    }
    expect(belowSlot.length, "housing extends under glareshield").toBeGreaterThan(0);
    const central = new Box3().setFromPoints(belowSlot);
    expect(central.getSize(new Vector3()).z, "compact central housing").toBeLessThan(0.15);
    expect(central.max.y).toBeLessThan(glareBox.max.y);
    expect(new Box3().setFromObject(housing, true).containsPoint(new Vector3(...DEFROST_VENT))).toBe(true);
    expect(outlet.tube, "transverse air has no solid tube").toBe(false);
    expect(outlet.pts).toContainEqual(DEFROST_VENT);
    expect(toV(outlet.pts[0]).z).toBeLessThan(0);
    expect(toV(outlet.pts.at(-1)!).z).toBeGreaterThan(0);
    for (const p of outlet.pts) {
      expect(toV(p).x).toBe(DEFROST_VENT[0]);
      expect(toV(p).y).toBe(DEFROST_VENT[1]);
    }
    for (const vent of ["P", "PF", "PFW", "W"] as const) {
      const s = patched(initialSim, { eng: { running: true }, env: { fan: 1, vent } });
      const rates = flowRates(s, solve(s));
      expect(rates.defrost2).toBe(rates.defrost);
      if (vent === "PFW" || vent === "W") expect(rates.defrost2).toBeGreaterThan(0);
      else expect(rates.defrost2).toBe(0);
    }
    console.info("defrost outlet AABB", bounds.min.toArray(), bounds.max.toArray());
  } finally {
    housing.geometry.dispose();
    material.dispose();
    glareMesh.geometry.dispose();
  }
});
