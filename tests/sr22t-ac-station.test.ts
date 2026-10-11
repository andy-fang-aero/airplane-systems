/**
 * SR22T A/C compressor station, The unit hangs aft of the crankcase pads and magnetos, orientation unchanged.
 * Sources: AMM 13773-002 Rev 7 Fig 21-50-2 (PDF p. 523), Fig 21-50-1 sheet 2 (PDF p. 520), Fig 71-00-2 sheet 1 (PDF
 * p. 2487), Fig 71-00-1 sheet 2 (PDF p. 2484); the belt straight edge, 21-50 Adjustment/Test (PDF p. 503).
 */
import { describe, expect, it } from "vitest";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { ACCESSORY_FACE_X } from "@/aircraft/sr22t/engine-datum";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { FW, inFus } from "@/aircraft/sr22t/geometry";
import { AC, CAT } from "@/aircraft/sr22t/parts";
import { AC_CLUTCH_PULLEY, AC_COMPRESSOR_LEN, acBeltLoop } from "@/aircraft/sr22t/parts/aircon";
import { MANIFOLD_PRESSURE_LINE } from "@/aircraft/sr22t/parts/engine-air";
import { toV } from "@/lib/math";
import { gap, solid, tube, type Shape } from "./sr22t-engine-gap";

const MARGIN = 0.005;
/** How far the compressor head and its hose fittings may stand forward of the accessory mounting face: the head sits
 * just aft of the crankcase pad faces (Fig 21-50-1 sheet 2 PDF p. 520), and the drawn pads and magnetos run forward of
 * the face, so 2 in. (0.0508 m) covers the head casting and the fitting bosses; approximate. */
const HEAD_ALLOWANCE = 0.0508;

const part = (name: string) => {
  const found = CAT.parts.filter((p) => p.name === name);
  expect(found, name).toHaveLength(1);
  return found[0];
};
const placed = (name: string) => {
  const p = part(name),
    g = p.geo();
  g.applyMatrix4(
    new Matrix4().compose(
      toV(p.pos ?? [0, 0, 0]),
      new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
      new Vector3(1, 1, 1),
    ),
  );
  g.computeBoundingBox();
  return { g, box: g.boundingBox!.clone(), bvh: new MeshBVH(g) };
};
const verts = (s: Shape) => s.faces.flatMap(({ triangle: t }) => [t.a, t.b, t.c]);

describe("A/C compressor station", () => {
  it("the whole unit hangs between the firewall and the engine: no part of it reaches more than the head allowance forward of the accessory face", () => {
    const comp = placed("A/C compressor");
    expect(comp.box.max.x).toBeLessThanOrEqual(ACCESSORY_FACE_X + HEAD_ALLOWANCE);
    // and the compressor body itself ends forward of the face by no more than the head allowance either
    const front = new Vector3(AC.compressor[0] + AC_COMPRESSOR_LEN / 2, AC.compressor[1], AC.compressor[2]);
    expect(comp.bvh.closestPointToPoint(front)!.distance).toBeLessThan(1e-6);
    expect(front.x - ACCESSORY_FACE_X).toBeLessThanOrEqual(HEAD_ALLOWANCE);
    // aft of the face, the pulleys sit in the firewall bay, clear of the firewall
    expect(comp.box.min.x).toBeGreaterThan(FW + 0.02);
    expect(AC_CLUTCH_PULLEY[0]).toBeLessThan(ACCESSORY_FACE_X);
    comp.g.dispose();
  });

  it("the wastegate controller and its lines sit inboard of the belt and clear it, the pulleys and the A/C hoses by 5 mm (Fig 71-00-2 sheet 3 PDF p. 2489)", () => {
    const comp = solid(part("A/C compressor"));
    const controller = solid(part("Wastegate controller"));
    // the sensing hoses and the oil hoses at the controller, drawn and as flows
    const lines = [
      ...["Upper-deck pressure line", "Manifold pressure line", "Wastegate oil line", "Controller oil return"].map(
        (n) => solid(part(n)),
      ),
      ...FLOWS.filter((f) => ["deckRef", "gateOil"].includes(f.key)).map(tube),
    ];
    expect(lines).toHaveLength(6);
    const hoses = FLOWS.filter((f) => ["acDischarge", "acSuction"].includes(f.key)).map(tube);
    const hits: string[] = [];
    for (const a of [controller, ...lines])
      for (const b of [comp, ...hoses]) {
        const g = gap(a, b, MARGIN);
        if (g < MARGIN - 1e-7) hits.push(`${a.name} / ${b.name}: ${(g * 1000).toFixed(2)} mm`);
      }
    expect(hits).toEqual([]);
    expect(verts(controller).filter((v) => !inFus(v))).toEqual([]);
    // inboard of the belt plane's whole loop, no longer aft of the clutch pulley where the moved unit now hangs
    const beltInboard = Math.max(...acBeltLoop().map((p) => p[2]));
    expect(controller.box.min.z).toBeGreaterThan(beltInboard + MARGIN);
  }, 120000);

  it("the controller and its four drawn hoses clear every solid they do not attach to by 5 mm, the MCU and its fuse included (Fig 78-10-3 PDF p. 2742; Fig 71-00-2 sheet 3 PDF p. 2489)", () => {
    const capFitting = toV(MANIFOLD_PRESSURE_LINE[MANIFOLD_PRESSURE_LINE.length - 1]);
    // each item's own attachments: the firewall the controller is seated on, the controller every hose ends on, and
    // each hose's far-end fitting, the manifold's aft end cap carrying the manifold pressure fitting
    const hosts: Record<string, (s: Shape) => boolean> = {
      "Wastegate controller": (s) => s.name.startsWith("Firewall"),
      "Upper-deck pressure line": (s) => s.name === "Upper-deck pressure fitting",
      "Manifold pressure line": (s) => s.box.clone().expandByScalar(0.001).containsPoint(capFitting),
      "Wastegate oil line": (s) => s.name === "Wastegate actuator",
      "Controller oil return": (s) => s.name === "Continental TSIO-550-K",
    };
    const own = new Set(Object.keys(hosts));
    // every catalogue solid in its drawn place: the moving groups other than the cylinders are placed at runtime
    const others = CAT.parts.filter((p) => !p.parent || p.parent.startsWith("cyl:")).map(solid);
    expect(others.some((s) => s.name === "Master Control Unit")).toBe(true);
    expect(others.some((s) => s.name === "CONV bus fuse (5 A)")).toBe(true);
    const hits: string[] = [];
    for (const name of own) {
      const a = solid(part(name));
      for (const b of others) {
        if (own.has(b.name) || hosts[name](b)) continue;
        const g = gap(a, b, MARGIN);
        if (g < MARGIN - 1e-7) hits.push(`${name} / ${b.name}: ${(g * 1000).toFixed(2)} mm`);
      }
    }
    expect(hits).toEqual([]);
  }, 120000);
});
