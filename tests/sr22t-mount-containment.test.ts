import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { expect, it } from "vitest";
import { CAT } from "@/aircraft/sr22t/parts";
import { FUSE } from "@/aircraft/sr22t/geometry";
import { toV } from "@/lib/math";

// Skin-QA method: every vertex of every mount part, placed in world
// space, must lie inside the closed POH 13772-007 Fig 1-1 fuselage/cowl loft
// (inFus). The loft is inset by MARGIN, so each vertex clears the skin by at
// least that much. The nose strut, not the frame, is what exits the lower cowl.
const MARGIN = 0.01;
const MOUNT = ["Engine mount weldment", "Engine mount isolator", "Firewall attach fitting", "Engine grounding strap"];

/** Largest inset (to 0.1 mm) of the loft that still contains p; negative when p is outside. */
const clearance = (p: Vector3) => {
  if (!FUSE.inside(p)) {
    let lo = 0,
      hi = 0.5;
    while (hi - lo > 1e-4) {
      const mid = (lo + hi) / 2;
      // Grow the loft by `mid` (a negative inset) until it reaches p.
      if (FUSE.inside(p, -mid)) hi = mid;
      else lo = mid;
    }
    return -hi;
  }
  let lo = 0,
    hi = 0.5;
  while (hi - lo > 1e-4) {
    const mid = (lo + hi) / 2;
    if (FUSE.inside(p, mid)) lo = mid;
    else hi = mid;
  }
  return lo;
};

it("every engine mount member, isolator, firewall fitting and strap sits inside the cowl with 10 mm margin (AMM Fig 71-20-1 PDF 2527; POH Fig 1-1)", () => {
  const owned = CAT.parts.filter((p) => MOUNT.includes(p.name ?? ""));
  for (const name of MOUNT)
    expect(
      owned.some((p) => p.name === name),
      name,
    ).toBe(true);
  const offenders: string[] = [];
  let checked = 0;
  for (const p of owned) {
    // Mount parts hang off no parent group; a parent would need its rest transform here.
    expect(p.parent, `${p.name} has no parent group`).toBeUndefined();
    const g = p.geo();
    const m = new Matrix4().compose(
      toV(p.pos ?? [0, 0, 0]),
      new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
      toV(p.scale ?? [1, 1, 1]),
    );
    const position = g.getAttribute("position");
    let worst: { c: number; v: Vector3 } | undefined;
    for (let i = 0; i < position.count; i++) {
      const v = new Vector3().fromBufferAttribute(position, i).applyMatrix4(m);
      checked++;
      if (FUSE.inside(v, MARGIN)) continue;
      const c = clearance(v);
      if (!worst || c < worst.c) worst = { c, v };
    }
    g.dispose();
    if (worst)
      offenders.push(
        `${p.name} @${p.pos}: ${(worst.c * 1000).toFixed(1)} mm from the skin at [${worst.v
          .toArray()
          .map((x) => x.toFixed(3))
          .join(", ")}]`,
      );
  }
  expect(checked).toBeGreaterThan(1000);
  expect(offenders).toEqual([]);
});

it("the containment check catches a member hung below the lower cowl", () => {
  // The earlier forward lower cross member [3.52, -0.6, ±0.2] (cowl bottom y -0.49 there).
  expect(FUSE.inside(new Vector3(3.52, -0.6, 0.2), MARGIN)).toBe(false);
  expect(clearance(new Vector3(3.52, -0.6, 0.2))).toBeLessThan(-0.05);
  // A node of the new frame clears the skin by more than the margin.
  expect(clearance(new Vector3(2.86, -0.48, 0.5))).toBeGreaterThan(MARGIN);
});
