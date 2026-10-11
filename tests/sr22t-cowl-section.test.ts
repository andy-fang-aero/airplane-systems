// The cabin bit-identity case guards the skin aft of the firewall, which the cowl section must not move
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FUSE, FW, fuselageGeo } from "@/aircraft/sr22t/geometry";
import { CYL_PITCH, REAR_CYL_X } from "@/aircraft/sr22t/engine-datum";
import {
  INTERCOOLER,
  INTERCOOLER_AFT_FACE_X,
  INTERCOOLER_FRONT_X,
  INTERCOOLER_NECK,
  INTERCOOLER_NECK_R,
  INTERCOOLER_NECK_X,
  INTERCOOLER_OUTER_Z,
  INTERCOOLER_SEAT,
  INTERCOOLER_SIZE,
} from "@/aircraft/sr22t/intercooler-layout";
import { CYL_HEAD_SIZE } from "@/aircraft/sr22t/parts/engine";
import { interp } from "@/lib/geometry";
import { tris } from "./mesh-clearance";

const SIDES = [1, -1];
const label = (s: number) => (s > 0 ? "RH" : "LH");

/** One intercooler core box (centre ± half size): its upper and lower outboard edges at 61 stations (≈ 5 mm apart),
 * and all eight corners. */
const core = (s: number) => {
  const c = INTERCOOLER(s),
    h = INTERCOOLER_SIZE(s).map((v) => v / 2),
    xs = Array.from({ length: 61 }, (_, i) => c[0] - h[0] + (2 * h[0] * i) / 60),
    corner = (dx: number, dy: number, dz: number) =>
      new THREE.Vector3(c[0] + dx * h[0], c[1] + dy * h[1], c[2] + dz * h[2]);
  return {
    edges: xs.flatMap((x) => [-1, 1].map((dy) => new THREE.Vector3(x, c[1] + dy * h[1], c[2] + s * h[2]))),
    corners: [-1, 1].flatMap((dx) => [-1, 1].flatMap((dy) => [-1, 1].map((dz) => corner(dx, dy, dz)))),
  };
};
/** Rendered-skin clearance floor for the cores: cowl fit (≥ 8 mm). */
const CORE_CLEARANCE = 0.008;

describe("SR22T cowl cross-section", () => {
  it("encloses both intercooler cores under the upper cowl, with skin to spare", () => {
    // AMM Fig 71-00-2 sheets 1–2 / Fig 71-60-2 sheet 2: the top cowl covers the cores on the side baffles.
    for (const s of SIDES)
      for (const p of [...core(s).edges, ...core(s).corners])
        expect(FUSE.inside(p, 0.005), `${label(s)} point ${p.toArray()}`).toBe(true);
  });

  it("keeps the rendered cowl skin at least 8 mm off both cores at every core station", () => {
    // Only skin triangles near the cores' outboard side can be within 8 mm of them; the inboard corners are far inside.
    const near = new THREE.Box3(new THREE.Vector3(2.7, -0.15, -0.65), new THREE.Vector3(3.15, 0.05, 0.65)),
      skin = tris(fuselageGeo(), new THREE.Matrix4()).filter(
        (t) => t.some((v) => near.containsPoint(v)) && t.some((v) => Math.abs(v.z) > 0.45),
      ),
      tri = new THREE.Triangle(),
      q = new THREE.Vector3();
    for (const s of SIDES)
      for (const p of [...core(s).edges, ...core(s).corners.filter((v) => Math.abs(v.z) > 0.45)]) {
        let d = Infinity;
        for (const t of skin)
          d = Math.min(
            d,
            tri
              .set(...t)
              .closestPointToPoint(p, q)
              .distanceTo(p),
          );
        // A distance alone cannot tell inside from outside: the point must also be inside the skin.
        expect(FUSE.inside(p), `${label(s)} point ${p.toArray()} inside`).toBe(true);
        expect(d, `${label(s)} point ${p.toArray()}`).toBeGreaterThanOrEqual(CORE_CLEARANCE);
      }
  }, 120_000);

  it("meets the side-baffle deck-edge seal along its run: touching, never pinched, outboard of the core", () => {
    // AMM 13773-002 Rev 7 71-00 §1.B (PDF p. 2470): the baffle seals are "in contact with the cowling"; Fig 71-60-2
    // sheet 2 (PDF p. 2558). Seal envelope from the baffles branch, feat/sr22t-baffles-rebuild @ 02002bb,
    // aircraft/sr22t/parts/engine-baffles.ts. Every value there is approximate (its header).
    const SEAL_R = 0.006, // l.44
      SEAL_GAP = 0.0005, // l.45
      CLEAR = 0.006, // l.42
      BAFFLE_SHEET = 0.003, // l.40
      GASKET_T = 0.003, // l.47
      GASKET_DROP = 0.0005; // l.50
    // l.168: outboard edge of the intercooler body at station x (core box, then the transition to the neck)
    const intercoolerOuter = (s: number, x: number) => {
      const front = INTERCOOLER_FRONT_X(s);
      if (x <= front) return INTERCOOLER_OUTER_Z(s);
      if (x >= INTERCOOLER_NECK_X) return 0;
      const neck = Math.abs(INTERCOOLER_NECK(s)[2]) + INTERCOOLER_NECK_R;
      return INTERCOOLER_OUTER_Z(s) + ((x - front) / (INTERCOOLER_NECK_X - front)) * (neck - INTERCOOLER_OUTER_Z(s));
    };
    // l.72: the cowl section boundary along a ray from (|z| 0, y0) at angle a; l.88: SEAL_R + SEAL_GAP inside it
    const cowlRay = (x: number, y0: number, a: number) => {
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (FUSE.inside(new THREE.Vector3(x, y0 + mid * Math.sin(a), mid * Math.cos(a)))) lo = mid;
        else hi = mid;
      }
      return new THREE.Vector2(lo * Math.cos(a), y0 + lo * Math.sin(a));
    };
    const sealPoint = (x: number, y0: number) => {
      const t = cowlRay(x, y0, 0.002).sub(cowlRay(x, y0, -0.002));
      return cowlRay(x, y0, 0).addScaledVector(new THREE.Vector2(t.y, -t.x).normalize(), -(SEAL_R + SEAL_GAP));
    };
    /** Closest distance (m) from a section point (|z|, y) to the skin at station x. */
    const toSkin = (x: number, c: THREE.Vector2) => {
      let d = Infinity;
      for (let i = -300; i <= 300; i++) {
        const p = FUSE.onSkin(x, c.y + i * 0.0002, 1, 1);
        d = Math.min(d, Math.hypot(p.z - c.x, p.y - c.y));
      }
      return d;
    };
    for (const s of SIDES) {
      // l.54, l.179: seal centre height; l.184, l.64: the run from the core's aft face to the front baffle
      const sealY = INTERCOOLER_SEAT(s).y - GASKET_DROP - GASKET_T + SEAL_R,
        x0 = INTERCOOLER_AFT_FACE_X + CLEAR,
        x1 = REAR_CYL_X(s) + 2 * CYL_PITCH + CYL_HEAD_SIZE[0] / 2 + CLEAR + BAFFLE_SHEET / 2;
      for (let i = 0; i <= 60; i++) {
        // l.189-197: on the cowl at seal height, never closer than SEAL_R + CLEAR to the intercooler
        const x = x0 + ((x1 - x0) * i) / 60,
          c = sealPoint(x, sealY),
          clear = intercoolerOuter(s, x - CLEAR) + SEAL_R + CLEAR,
          seal = c.x >= clear ? c : new THREE.Vector2(clear, sealY),
          gap = toSkin(x, seal) - SEAL_R;
        expect(FUSE.inside(new THREE.Vector3(x, seal.y, seal.x + SEAL_R)), `${label(s)} seal pokes at x ${x}`).toBe(
          true,
        );
        expect(gap, `${label(s)} seal to skin at x ${x}`).toBeGreaterThanOrEqual(0);
        expect(gap, `${label(s)} seal to skin at x ${x}`).toBeLessThanOrEqual(0.002);
        // Independent of the l.197 floor: the seal placed by the cowl alone is SEAL_R + CLEAR outboard of the core.
        expect(c.x - intercoolerOuter(s, x - CLEAR), `${label(s)} seal off the core at x ${x}`).toBeGreaterThanOrEqual(
          SEAL_R + CLEAR,
        );
      }
    }
  });

  it("leaves every cabin cross-section aft of the firewall bit-identical to origin/main", () => {
    // origin/main 3838b59a aircraft/sr22t/geometry.ts: the POH 13772-007 Fig 1-1 (p. 1-4) station table and the cabin
    // section (nTop 2.4, nBot 3.0, tumble 0.2) that FUSE used at every station before the cowl section.
    const BASE = [
      [3.74, 0.32, 0.155, -0.125],
      [3.66, 0.42, 0.24, -0.16],
      [3.52, 0.5, 0.3, -0.19],
      [3.3, 0.55, 0.35, -0.2],
      [2.96, 0.6, 0.4, -0.22],
      [2.61, 0.62, 0.45, -0.23],
      [2.31, 0.625, 0.575, -0.13],
      [2.01, 0.635, 0.654, -0.06],
      [1.71, 0.64, 0.7, -0.02],
      [1.26, 0.65, 0.718, 0.0],
      [0.65, 0.645, 0.69, -0.006],
      [0.05, 0.61, 0.623, -0.015],
      [-0.25, 0.488, 0.56, -0.03],
      [-0.55, 0.414, 0.524, -0.025],
      [-0.85, 0.335, 0.472, -0.033],
      [-1.15, 0.262, 0.432, -0.028],
      [-1.6, 0.17, 0.387, -0.007],
      [-2.05, 0.114, 0.364, 0.026],
      [-2.4, 0.089, 0.33, 0.025],
      [-2.8, 0.084, 0.27, -0.02],
      [-3.1, 0.08, 0.2, -0.072],
      [-3.3, 0.04, 0.09, -0.11],
      [-3.36, 0.015, 0.03, -0.11],
    ];
    const stations = [...BASE.map((r) => r[0]).filter((x) => x <= FW)];
    for (let x = FW; x >= FUSE.xTail; x -= 0.01) stations.push(x);
    for (const x of stations) {
      const base = {
        hw: interp(BASE, 1, x),
        hh: interp(BASE, 2, x),
        cy: interp(BASE, 3, x),
        nTop: 2.4,
        nBot: 3.0,
        tumble: 0.2,
      };
      expect(FUSE.section(x), `section at x ${x}`).toStrictEqual(base);
      expect(FUSE.ring(x, 1, 48), `ring at x ${x}`).toStrictEqual(
        Array.from({ length: 48 }, (_, j) => {
          const th = (j / 48) * Math.PI * 2,
            c = Math.cos(th),
            sn = Math.sin(th),
            n = sn >= 0 ? 2.4 : 3.0,
            py = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n),
            pz = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
          return new THREE.Vector3(x, base.cy + base.hh * py, base.hw * (1 - 0.2 * Math.max(0, py)) * pz);
        }),
      );
    }
  });
});
