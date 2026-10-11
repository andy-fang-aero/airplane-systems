import { describe, expect, it } from "vitest";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { inFus } from "@/aircraft/sr22t/geometry";
import { CAT, CYLS } from "@/aircraft/sr22t/parts";
import { cylOrigin } from "@/aircraft/sr22t/parts/engine";

// Skin-QA method: every vertex of each rendered part, placed in world space at rest, is tested against the
// closed fuselage/cowl loft `inFus` (POH 13772-007 Fig 1-1). Here it is tightened to a margin: the ignition hardware
// runs inside the cowl (AMM Fig 74-20-1 PDF p. 2624), so no vertex may come within MARGIN of the skin.
const MARGIN = 0.005;
const IGNITION =
  /^(Ignition lead|Harness cap|Harness clamp|Magneto P-lead|Magneto ground wire|Engine ground lug|Plug lead terminal)/;

/** Signed clearance to the loft in metres, by bisection on the `inFus` margin (negative: outside). */
const clearance = (p: Vector3) => {
  if (!inFus(p)) {
    let lo = -0.5,
      hi = 0;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (inFus(p, mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  }
  let lo = 0,
    hi = 0.5;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (inFus(p, mid)) lo = mid;
    else hi = mid;
  }
  return lo;
};

describe("Ignition hardware stays inside the cowl (AMM Fig 74-20-1 PDF p. 2624, POH 13772-007 Fig 1-1)", () => {
  it(`every vertex of every lead, clamp, cap, terminal, P-lead and ground wire is at least ${MARGIN * 1000} mm inside the loft`, () => {
    const parts = CAT.parts.filter((p) => IGNITION.test(p.name ?? ""));
    // 12 leads, 6 clamps, 2 caps + 12 cap terminals, 12 plug terminals, 2 P-leads, 2 ground wires, 2 lugs
    expect(parts).toHaveLength(50);
    const worst = new Map<string, { d: number; at: number[] }>();
    for (const p of parts) {
      const g = p.geo();
      const m = new Matrix4().compose(
        new Vector3(...(p.pos ?? [0, 0, 0])),
        new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
        new Vector3(...(p.scale ?? [1, 1, 1])),
      );
      const c = CYLS.find((c) => p.parent === `cyl:${c.n}`);
      if (c) m.premultiply(new Matrix4().makeTranslation(...cylOrigin(c)));
      else expect(p.parent, p.name).toBeUndefined();
      const pos = g.getAttribute("position"),
        v = new Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        if (inFus(v, MARGIN)) continue;
        const d = clearance(v),
          name = p.name!;
        if (d < (worst.get(name)?.d ?? Infinity)) worst.set(name, { d, at: v.toArray().map((x) => +x.toFixed(4)) });
      }
      g.dispose();
    }
    expect(
      [...worst].map(([name, w]) => `${name}: ${(w.d * 1000).toFixed(1)} mm from the skin at ${w.at.join(", ")}`),
    ).toEqual([]);
  });
});
