/**
 * SR22T airframe outline, still the SR20 shape (copied from tests/sr20-geometry.test.ts), against the drawings:
 * AMM 13773-002 Rev 7 Fig 6-00-2 Airplane Principal Dimensions (PDF p. 119; SR22/SR22T, scaled from its FS/WL/BL ticks),
 * the AMM 6-00 dimensions text, and the SR20 POH 11934-005 Fig 1-1 three view (p. 1-4) and Section 6 (PDF p. 189), which
 * show the same airframe. Model metres become stations in inches with FS = (5.15 − x)/0.0254, WL = 100 + (y + 0.13)/0.0254
 * (legacy airframe registration; the spinner follows the registered crank/prop axis) and BL = z/0.0254.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  AB,
  EF,
  FIN,
  FW,
  HH,
  HZ,
  SSPAN,
  WTIP,
  botY,
  fC,
  fLE,
  fus,
  hingeX,
  inFus,
  sC,
  sLE,
  topY,
  wC,
  wLE,
  wY,
} from "@/aircraft/sr22t/geometry";
import { CAT, MG, surfacePivot } from "@/aircraft/sr22t/parts";
import { LIGHTS } from "@/aircraft/sr22t/parts/lights";

const IN = 0.0254;
const FS = (x: number) => (5.15 - x) / IN;
const WL = (y: number) => 100 + (y + 0.13) / IN;
const z = (bl: number) => bl * IN;
const y = (wl: number) => (wl - 100) * IN - 0.13;
const x = (fs: number) => 5.15 - fs * IN;
const within = (v: number, want: number, tol: number) =>
  expect(Math.abs(v - want), `${v.toFixed(2)} vs ${want}`).toBeLessThanOrEqual(tol);

/** Shortest distance from point p to the polyline pts (same units as the inputs). */
const distToLine = (pts: [number, number][], [px, py]: [number, number]) => {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1],
      [bx, by] = pts[i],
      l2 = (bx - ax) ** 2 + (by - ay) ** 2,
      t = l2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2)) : 0;
    d = Math.min(d, Math.hypot(px - ax - t * (bx - ax), py - ay - t * (by - ay)));
  }
  return d;
};

/* ---------- horizontal tail ---------- */

const stabLE = (bl: number) => FS(sLE(z(bl)));
const stabTE = (bl: number) => FS(sLE(z(bl)) - sC(z(bl)));
const elevHinge = (bl: number) => FS(sLE(z(bl)) - EF * sC(z(bl)));
const TIP_BL = SSPAN / IN;
/** Plan outline of the stabilizer tip as (BL, FS): the leading edge from BL 70 out to the tip, closed by the TE corner. */
const stabTip = () => {
  const pts: [number, number][] = [];
  for (let bl = 70; bl < TIP_BL; bl += 0.01) pts.push([bl, stabLE(bl)]);
  pts.push([TIP_BL, stabLE(TIP_BL)], [TIP_BL, stabTE(TIP_BL)]);
  return pts;
};

/** World bounding box of the catalogue part with this name on this moving surface. */
const surfPartBox = (name: string, key: string) => {
  const p = CAT.parts.find((q) => q.name === name && q.parent === "surf:" + key)!;
  const geo = p.geo();
  geo.computeBoundingBox();
  const pv = surfacePivot(key);
  return geo.boundingBox!.clone().translate(new THREE.Vector3(p.pos![0] + pv[0], p.pos![1] + pv[1], p.pos![2] + pv[2]));
};

describe("SR22T horizontal tail", () => {
  it("horizontal stabilizer planform matches AMM Fig 6-00-2 (PDF 119)", () => {
    within(stabLE(10), 294.5, 1);
    within(stabLE(70), 301.3, 1);
    within(stabTE(10), 324.3, 1);
    within(stabTE(70), 321.3, 1);
    expect(stabTE(70), "TE sweeps forward").toBeLessThan(stabTE(10));
    within(sC(z(10)), 0.757, 0.6 * IN);
    within(sC(z(70)), 0.508, 0.6 * IN);
    within(TIP_BL, 77.3, 1);
  });

  it("elevator hinge line is straight at FS 315.2 (AMM Fig 6-00-2, 6-00-5)", () => {
    for (const bl of [0, 36, 72]) within(elevHinge(bl), 315.2, 0.5);
    within(stabTE(10) - elevHinge(10), 0.23 / IN, 0.6);
    within(stabTE(70) - elevHinge(70), 0.155 / IN, 0.6);
  });

  it("elevator tip is a full-chord rounded cap from BL 72 (AMM Fig 55-20-2 Detail A, PDF 2246)", () => {
    within(HZ / IN, 72, 0.5);
    within(stabLE(74), 303.2, 1.5);
    within(stabLE(75), 305.2, 1.5);
    // where the rounding runs almost fore-and-aft, check the normal distance from the drawn point to the outline
    expect(distToLine(stabTip(), [76, 309.9])).toBeLessThanOrEqual(1);
    expect(distToLine(stabTip(), [77, 318.1])).toBeLessThanOrEqual(1);
    within(stabTE(TIP_BL), 321.2, 1);
  });

  it("elevator horn balance weight stays inside the rounded tip (AMM Fig 55-20-2 Detail A)", () => {
    const { min, max } = surfPartBox("Elevator horn balance + weight", "elevR");
    for (const bl of [min.z, max.z]) {
      expect(max.x, `z ${bl.toFixed(3)}: behind the LE`).toBeLessThanOrEqual(sLE(bl));
      expect(min.x, `z ${bl.toFixed(3)}: ahead of the TE`).toBeGreaterThanOrEqual(sLE(bl) - sC(bl));
    }
  });
});

/* ---------- fin and rudder ---------- */

const finTE = (wl: number) => FS(fLE(y(wl)) - fC(y(wl)));
const rudHinge = (wl: number) => FS(hingeX(y(wl)));
/** Side outline of the fin and rudder trailing edge as (FS, WL), from the lowest FIN row to the top. */
const finTEOutline = () => FIN.map((r) => [FS(r[2]), WL(r[0])] as [number, number]);

describe("SR22T fin and rudder", () => {
  it("fin and rudder TE and fin top match AMM Fig 6-00-2 (PDF 119)", () => {
    within(finTE(110), 339.3, 1);
    within(finTE(130), 342.8, 1);
    within(finTE(150), 346.2, 1);
    within(finTE(162), 348.4, 1);
    // the TE fillet into the tailcone is nearly horizontal: normal distance from the drawn point to the outline
    expect(distToLine(finTEOutline(), [334.2, 98])).toBeLessThanOrEqual(1.5);
    within(WL(Math.max(...FIN.map((r) => r[0]))), 165.5, 0.5);
    // aft-most point: overall length 26.0 ft (SR20 POH Fig 1-1)
    within(FS(Math.min(...FIN.map((r) => r[2]))), 350.2, 0.5);
  });

  it("rudder hinge line runs FS 320.7 @WL98 to FS 339.3 @WL155 (AMM Fig 6-00-2)", () => {
    within(rudHinge(98), 320.7, 1);
    within(rudHinge(155), 339.3, 1);
    within(finTE(126) - rudHinge(126), 12.3, 0.75);
  });

  it("rudder horn cap starts at WL 160.2 (AMM Fig 55-40-1 Detail B, PDF 2262)", () => {
    within(WL(HH), 160.2, 0.5);
    const fin = CAT.shells.find((s) => s.name === "Vertical stabilizer")!.geo();
    fin.computeBoundingBox();
    expect(fin.boundingBox!.max.y, "the fin ends at the horn joint").toBeLessThanOrEqual(HH + 1e-6);
    // above the joint the rudder spans the full chord, from the fin's leading edge to its trailing edge
    const spec = CAT.surfaces.find((s) => s.key === "rudder")!,
      pos = spec.geo().attributes.position,
      pivot = new THREE.Vector3(...spec.pivot),
      p = new THREE.Vector3(),
      fwd = new Map<number, number>();
    let top = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).add(pivot);
      if (p.y < HH + 0.01) continue;
      expect(p.x, `h ${p.y.toFixed(3)}`).toBeLessThanOrEqual(fLE(p.y) + 1e-6);
      expect(p.x, `h ${p.y.toFixed(3)}`).toBeGreaterThanOrEqual(fLE(p.y) - fC(p.y) - 1e-6);
      for (const h of [1.42, 1.47, 1.51, 1.534])
        if (Math.abs(p.y - h) < 1e-6) fwd.set(h, Math.max(fwd.get(h) ?? -Infinity, p.x));
      top = Math.max(top, p.y);
    }
    expect(fwd.size).toBe(4);
    for (const [h, x] of fwd) expect(Math.abs(x - fLE(h)), `h ${h}`).toBeLessThan(0.01);
    expect(top, "the rudder reaches the fin top").toBeGreaterThanOrEqual(Math.max(...FIN.map((r) => r[0])) - 1e-6);
  });

  it("rudder horn balance weight stays inside the horn cap (AMM Fig 55-40-1 Detail B)", () => {
    const { min, max } = surfPartBox("Rudder horn balance + weight", "rudder");
    expect(min.y, "above the horn joint").toBeGreaterThanOrEqual(HH);
    for (const h of [min.y, max.y]) {
      expect(max.x, `h ${h.toFixed(3)}: behind the LE`).toBeLessThanOrEqual(fLE(h));
      expect(min.x, `h ${h.toFixed(3)}: ahead of the TE`).toBeGreaterThanOrEqual(fLE(h) - fC(h));
    }
  });

  it("NAV antenna sits on the fixed fin below the horn joint (AMM Fig 34-50-4, PDF 1739; P20 p. 7-87)", () => {
    const nav = CAT.parts.find((p) => p.name === "NAV antenna")!;
    expect(nav.parent, "not on the moving rudder").toBeUndefined();
    const geo = nav.geo();
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox!.clone().translate(new THREE.Vector3(...nav.pos!));
    expect(max.y, "below the rudder horn cap").toBeLessThanOrEqual(HH);
    for (const h of [min.y, max.y]) {
      expect(max.x, `h ${h.toFixed(3)}: behind the fin LE`).toBeLessThanOrEqual(fLE(h));
      expect(min.x, `h ${h.toFixed(3)}: ahead of the rudder hinge`).toBeGreaterThanOrEqual(hingeX(h));
    }
  });
});

/* ---------- lights ---------- */

describe("SR22T lights", () => {
  it("the lower-cowl landing light hangs below the cowl skin, its top face seated just inside it (POH 7-57; AMM Fig 33-40-1)", () => {
    const land = CAT.parts.find((p) => p.name === "Landing light (HID, lower cowl)")!;
    expect(land.pos).toEqual(LIGHTS.cowl);
    const place = new THREE.Matrix4().compose(
      new THREE.Vector3(...land.pos!),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...land.rot!)),
      new THREE.Vector3(1, 1, 1),
    );
    const g = land.geo();
    const local = g.getAttribute("position");
    const at = g.clone().applyMatrix4(place).getAttribute("position");
    for (let i = 0; i < at.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(at, i);
      // the lens face shows below the lower skin in solid mode; the top face, where the ballast lead enters, is inside
      if (local.getY(i) < 0) expect(p.y, `x ${p.x.toFixed(3)}: lens below the lower skin`).toBeLessThan(botY(p.x));
      else {
        expect(inFus(p), `x ${p.x.toFixed(3)}: top face inside the cowl`).toBe(true);
        expect(p.y, `x ${p.x.toFixed(3)}: top face seated at the skin`).toBeLessThan(botY(p.x) + 0.006);
      }
    }
  });
});

/* ---------- wing ---------- */

const wingLE = (bl: number) => FS(wLE(z(bl)));
const wingChord = (bl: number) => wC(z(bl)) / IN;
/** The straight inboard leading edge (through BL 40 and BL 200) extended to bl. */
const straightLE = (bl: number) => wingLE(40) + ((wingLE(200) - wingLE(40)) * (bl - 40)) / 160;

describe("SR22T wing", () => {
  it("wing LE straight to BL 220, tip rounded over the last 8 in (AMM Fig 6-00-2; P20 Fig 1-1)", () => {
    for (let bl = 40; bl <= 218.5; bl += 0.5) within(wingLE(bl) - straightLE(bl), 0, 1e-6);
    within(wingLE(224) - straightLE(224), 3.1, 1.25);
    within(wingLE(227) - straightLE(227), 9.4, 1.25);
    within(wC(5.4), 0.805, 0.025);
    within(wC(5.6), 0.766, 0.025);
  });

  it("LEMAC at FS 133.1 at BL 87.7 (P20 Section 6, PDF 189; AMM Fig 6-00-2)", () => {
    within(wingLE(87.7), 133.1, 0.5);
    within(wingLE(40), 131.5, 0.75);
    within(wingLE(220), 137.9, 0.75);
    within(wingChord(40), 56.5, 0.75);
    within(wingChord(220), 30.3, 0.75);
  });

  it("wing dihedral is 5.5° (AMM 6-00)", () => {
    const deg = (Math.atan((wY(4) - wY(1)) / 3) * 180) / Math.PI;
    within(deg, 5.5, 0.05);
  });

  it("span, firewall and aft bulkhead stay on the drawing (AMM Fig 6-00-2)", () => {
    within(WTIP / IN, 229.5, 0.5);
    within(FS(FW), 100, 0.1);
    within(FS(AB), 222, 0.1);
  });
});

/* ---------- tailcone ---------- */

describe("SR22T aft tailcone", () => {
  it("aft tailcone half-width matches AMM Fig 6-00-2 plan view", () => {
    const want: [number, number][] = [
      [212.6, 19.2],
      [224.4, 16.3],
      [236.2, 13.2],
      [248, 10.3],
      [265.7, 6.7],
      [283.5, 4.5],
      [297.2, 3.5],
      [313, 3.3],
    ];
    for (const [fs, hw] of want) within(fus(x(fs)).hw / IN, hw, 0.75);
  });

  it("aft tailcone top and bottom match AMM Fig 6-00-2 side view", () => {
    const top: [number, number][] = [
      [224, 124.8],
      [248, 121.0],
      [266, 120.1],
      [284, 120.5],
    ];
    const bottom: [number, number][] = [
      [266, 89.6],
      [284, 91.8],
      [297, 93.1],
      [313, 93.7],
    ];
    for (const [fs, wl] of top) within(WL(topY(x(fs))), wl, 0.75);
    for (const [fs, wl] of bottom) within(WL(botY(x(fs))), wl, 0.75);
  });

  it("the dorsal fillet starts on the tailcone skin", () => {
    const [h, le] = FIN.reduce((a, r) => (r[1] > a[1] ? r : a));
    within(h, topY(le), 0.01);
  });
});

/* ---------- main gear ---------- */

describe("SR22T main gear", () => {
  it("main-gear track is 9.1 ft (P20 Fig 1-1; AMM 6-00)", () => {
    within(MG.z / IN, 54.8, 0.2);
    within((2 * MG.z) / 0.3048, 9.1, 0.05);
  });
});
