import { expect, it } from "vitest";
import * as THREE from "three";
import { wingP } from "@/aircraft/sr22t/geometry";
import { points, tris, inside, edgeCrossing } from "./mesh-clearance";
import { CAT, LIGHTS } from "@/aircraft/sr22t/parts";
it("each wing has a fixed wingtip wick at the strobe bracket and an aileron wick (AMM 23-60 ¶1A/B, Fig 23-60-1 A/B)", () => {
  for (const name of ["Static wick (wing tip)", "Static wick (aileron)"]) {
    const wicks = CAT.parts.filter((p) => p.name === name);
    expect(wicks).toHaveLength(2);
    expect(wicks.map((p) => Math.sign(p.pos![2])).sort()).toEqual([-1, 1]);
    for (const p of wicks) {
      expect(p.parent).toBeUndefined();
      expect(p.note).toContain("23-60");
    }
    expect(CAT.pinned("controls").map((p) => p.name)).toContain(name);
  }
  for (const tip of [LIGHTS.tipL, LIGHTS.tipR]) {
    const wick = CAT.parts.find(
      (p) => p.name === "Static wick (wing tip)" && Math.sign(p.pos![2]) === Math.sign(tip[2]),
    )!;
    expect(wick.pos![1]).toBe(tip[1]);
    expect(wick.pos![2]).toBe(tip[2]);
    expect(wick.pos![0] + 0.13 / 2).toBeCloseTo(wingP(Math.sign(tip[2]) * 5.84, 1, 0).x, 10);
    expect(wick.note).toContain("Detail A");
  }
});

it("tip wicks clear the aft light and wing shells after trailing-edge seating (AMM Fig 23-60-1 Detail A)", () => {
  for (const wick of CAT.parts.filter((p) => p.name === "Static wick (wing tip)")) {
    const m = new THREE.Matrix4().makeTranslation(...wick.pos!),
      geo = wick.geo(),
      v = points(geo, m),
      t = tris(geo, m);
    const light = Math.sign(wick.pos![2]) > 0 ? LIGHTS.aftR : LIGHTS.aftL;
    for (const p of v) expect(p.distanceTo(new THREE.Vector3(...light))).toBeGreaterThan(0.025);
    const wb = new THREE.Box3().setFromPoints(v);
    const lightCentre = new THREE.Vector3(...light);
    // The entire wick lies inside its box, so a disjoint light sphere proves face clearance too.
    const aft = CAT.parts.find(
      (p) => p.name === "Aft position light (white)" && Math.sign(p.pos![2]) === Math.sign(wick.pos![2]),
    )!;
    const lightGeo = aft.geo();
    lightGeo.computeBoundingSphere();
    expect(wb.clampPoint(lightCentre, new THREE.Vector3()).distanceTo(lightCentre)).toBeGreaterThan(
      lightGeo.boundingSphere!.radius,
    );
    for (const shell of CAT.shells.filter((s) => ["Right wing", "Left wing", "Wing trailing edge"].includes(s.name))) {
      const st = tris(shell.geo(), new THREE.Matrix4()),
        sb = new THREE.Box3().setFromPoints(st.flat());
      expect(edgeCrossing(t, st)).toBeUndefined();
      expect(edgeCrossing(st, t)).toBeUndefined();
      expect(v.some((p) => inside(p, st, sb))).toBe(false);
      expect(st.flat().some((p) => inside(p, t, wb))).toBe(false);
    }
  }
});
