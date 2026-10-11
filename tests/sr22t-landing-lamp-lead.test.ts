/**
 * Landing light lamp lead: the landing-light circuit now runs on from the firewall ballast to the HID lamp
 * in the lower cowl (SR22T POH 13772-007 7-57; AMM 13773-002 Rev 7 Fig 33-40-1, PDF p. 1588). The lead ends on both
 * parts, stays inside the cowl skin, and clears every engine-bay part and rendered tube by 5 mm away from its two ends.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FLOWS, flowRates } from "@/aircraft/sr22t/flows";
import { FUSE, FW, inFus } from "@/aircraft/sr22t/geometry";
import { initialSim, solve, type Sim } from "@/aircraft/sr22t/model";
import { CAT } from "@/aircraft/sr22t/parts";
import { NOSE_CASTER, NOSE_GEAR } from "@/aircraft/sr22t/parts/gear";
import { curveOf } from "@/lib/geometry";
import { toV } from "@/lib/math";
import { patched, type Patch } from "./helpers";
import { tris, type Tri } from "./mesh-clearance";
import { insideSolid } from "./winding-number";
import { gap, outside, shape, solid, tube, type Shape } from "./sr22t-engine-gap";

const LEAD = FLOWS.find((f) => f.key === "landLamp")!;
const BALLAST = "Landing light ballast";
const LAMP = "Landing light (HID, lower cowl)";
const margin = 0.005;

/** A part's world mesh, for the parts with no moving parent group. */
const placed = (name: string) => {
  const p = CAT.parts.find((p) => p.name === name)!;
  return solid(p);
};
const boxOf = (s: Shape) => s.box.clone();
/** Nearest surface distance from `p` to a placed part. */
const surface = (p: THREE.Vector3, s: Shape) =>
  Math.min(...s.faces.map(({ triangle }) => triangle.closestPointToPoint(p, new THREE.Vector3()).distanceTo(p)));

describe("SR22T landing light lamp lead (POH 7-57)", () => {
  it("is lit exactly when the landing light is: LAND off → 0, LAND on → > 0, Main Dist Bus 1 dead → 0", () => {
    const rate = (patch: Patch<Sim>) => {
      const s = patched(initialSim, patch);
      return flowRates(s, solve(s)).landLamp;
    };
    expect(rate({ lights: { land: false } })).toBe(0);
    expect(rate({ lights: { land: true } })).toBeGreaterThan(0);
    // engine stopped and BAT 1 off: no 28 VDC on Main Distribution Bus 1 behind the MCU relay
    expect(rate({ eng: { running: false }, elec: { bat1: false, bat2: true }, lights: { land: true } })).toBe(0);
  });

  it("starts on the ballast and ends on the lamp, each within 1 mm", () => {
    const first = toV(LEAD.pts[0]),
      last = toV(LEAD.pts[LEAD.pts.length - 1]);
    expect(surface(first, placed(BALLAST))).toBeLessThanOrEqual(0.001);
    expect(surface(last, placed(LAMP))).toBeLessThanOrEqual(0.001);
  });

  it("stays inside the cowl: 5 mm inside the skin, except where it enters the lamp seated in the skin", () => {
    const r = LEAD.r ?? 0.012;
    const skin = tris(FUSE.geo({ step: 0.01, N: 160 }), new THREE.Matrix4());
    const depth = (p: THREE.Vector3) => {
      let d = Infinity;
      const t = new THREE.Triangle(),
        q = new THREE.Vector3();
      for (const s of skin)
        if (Math.abs(s[0].x - p.x) < 0.05)
          d = Math.min(
            d,
            t
              .set(...s)
              .closestPointToPoint(p, q)
              .distanceTo(p),
          );
      return inFus(p) ? d : -d;
    };
    // the lamp's seat: its box and the last 30 mm of the lead above it
    const seat = boxOf(placed(LAMP)).expandByScalar(0.03);
    const curve = curveOf(LEAD.pts, LEAD.tension ?? 0.3);
    const fails: string[] = [];
    for (const p of curve.getSpacedPoints(400)) {
      expect(p.x, "forward of the firewall").toBeGreaterThan(FW);
      // away from the seat the whole tube surface, r from the centreline, keeps 5 mm off the skin
      if (!seat.containsPoint(p) && depth(p) < r + margin)
        fails.push(`${p.toArray().map((v) => v.toFixed(3))}: centreline ${(depth(p) * 1000).toFixed(1)} mm inside`);
    }
    // at the seat, every vertex of a finely tessellated tube is inside the skin (1 mm flush, skin-QA method)
    const fine = new THREE.TubeGeometry(curve, 800, r, 16, false).getAttribute("position");
    for (let i = 0; i < fine.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(fine, i);
      if (seat.containsPoint(v) && depth(v) < -0.001)
        fails.push(`${v.toArray().map((x) => x.toFixed(3))}: ${(-depth(v) * 1000).toFixed(1)} mm outside`);
    }
    expect(fails).toEqual([]);
  }, 120000);

  it("clears every engine-bay part and rendered flow tube by 5 mm away from its ballast and lamp ends", () => {
    const lead = tube(LEAD);
    // the ends sit on their hosts; measure the run 20 mm clear of each host's box
    const hosts = [placed(BALLAST), placed(LAMP)].map((s) => boxOf(s).expandByScalar(0.02));
    const run = hosts.reduce<Shape | undefined>((s, h) => s && outside(s, h), lead)!;
    expect(run.faces.length).toBeGreaterThan(lead.faces.length / 2);
    const solids: Shape[] = CAT.parts
      .filter((p) => !p.parent || p.parent.startsWith("cyl:"))
      .map(solid)
      .concat(
        // the nose gear leg hangs from the engine mount under the lower cowl; place its groups at rest
        CAT.parts
          .filter((p) => p.parent === "noseGear" || p.parent === "caster")
          .map((p) => {
            const g = p.geo();
            g.applyMatrix4(
              new THREE.Matrix4()
                .compose(
                  toV(p.pos ?? [0, 0, 0]),
                  new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
                  toV(p.scale ?? [1, 1, 1]),
                )
                .premultiply(
                  new THREE.Matrix4().makeTranslation(
                    ...(p.parent === "caster"
                      ? ([0, 1, 2].map((i) => NOSE_GEAR[i] + NOSE_CASTER[i]) as [number, number, number])
                      : NOSE_GEAR),
                  ),
                ),
            );
            return shape(g, p.name ?? p.id);
          }),
      )
      .filter((s) => s.box.max.x > FW && s.name !== BALLAST && s.name !== LAMP);
    const tubes = FLOWS.filter((f) => f.tube !== false && f.key !== LEAD.key).map(tube);
    const hits = [...solids, ...tubes]
      .map((s) => ({ s, g: gap(run, s, margin, false) }))
      .filter(({ g }) => g < margin - 1e-7)
      .map(({ s, g }) => `${s.name}: ${(g * 1000).toFixed(2)} mm`);
    // the surface gap misses a run buried wholly inside a larger solid: no centreline point lies inside one
    const centre = curveOf(LEAD.pts, LEAD.tension ?? 0.3)
      .getSpacedPoints(200)
      .filter((p) => !hosts.some((h) => h.containsPoint(p)));
    for (const s of solids) {
      const mesh = s.faces.map(({ triangle: t }) => [t.a, t.b, t.c] as Tri);
      for (const p of centre) if (s.box.containsPoint(p) && insideSolid(p, mesh)) hits.push(`${s.name}: run inside it`);
    }
    expect(hits).toEqual([]);
  }, 60000);
});
