// The flows-ride-inside case holds trivially on mitred polylines; it guards the bent centrelines.
/**
 * The exhaust as bent tube runs (POH 13772-007 7-38; AMM 13773-002 Rev 7 78-00 PDF p. 2732,
 * 78-10 PDF pp. 2734/2739, Fig 78-10-2 PDF p. 2740). The figures are undimensioned: these tests check bends,
 * connections and clearance, not sizes. Connectivity, slip joints, cowl exits, crankcase and ignition clearance are in
 * tests/sr22t-exhaust-audit.test.ts.
 */
import { describe, expect, it } from "vitest";
import { Curve, Euler, Matrix4, Quaternion, TubeGeometry, Vector3, type BufferGeometry } from "three";
import { CAT, CYLS } from "@/aircraft/sr22t/parts";
import { cylExhaust, cylOrigin } from "@/aircraft/sr22t/parts/engine";
import { CROSSOVER_RADIUS, EXHAUST_BEND } from "@/aircraft/sr22t/exhaust-layout";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { FW } from "@/aircraft/sr22t/geometry";
import { curveOf } from "@/lib/geometry";
import type { PartSpec } from "@/lib/catalogue";
import { toV } from "@/lib/math";
import { obstacle, sampledClearance, samplesAlong, surfaceSamples } from "./sampled-clearance";
import { gap, solid } from "./sr22t-engine-gap";

const parts = (name: RegExp) => CAT.parts.filter((p) => name.test(p.name ?? ""));
const side = (p: PartSpec) => (/^(LH|Left)/.test(p.note ?? "") ? -1 : /^(RH|Right)/.test(p.note ?? "") ? 1 : 0);
/** A part's geometry in airplane coordinates. */
const placed = (p: PartSpec): BufferGeometry => {
  const g = p.geo();
  g.applyMatrix4(
    new Matrix4().compose(
      toV(p.pos ?? [0, 0, 0]),
      new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
      toV(p.scale ?? [1, 1, 1]),
    ),
  );
  const c = CYLS.find((c) => p.parent === `cyl:${c.n}`);
  if (c) g.translate(...cylOrigin(c));
  return g;
};
/** A curve moved by `shift`. */
class Shifted extends Curve<Vector3> {
  constructor(
    private readonly path: Curve<Vector3>,
    private readonly shift: Vector3,
  ) {
    super();
  }
  override getPoint(t: number, target = new Vector3()) {
    return target.copy(this.path.getPoint(t)).add(this.shift);
  }
}
/** The rendered tube's own centreline and radius in airplane coordinates. */
const tubeOf = (p: PartSpec) => {
  const g = p.geo();
  expect(g, p.name).toBeInstanceOf(TubeGeometry);
  const { path, radius } = (g as TubeGeometry).parameters;
  const pos = toV(p.pos ?? [0, 0, 0]);
  const v0 = new Vector3().fromBufferAttribute(g.getAttribute("position"), 0).add(pos);
  g.dispose();
  // the placed first ring lies one radius off the centreline start: either the path is already in airplane
  // coordinates (header pieces translate their mesh about `pos`), or it is local and moves with `pos`
  const shift = Math.abs(v0.distanceTo(path.getPoint(0)) - radius) < 1e-6 ? new Vector3() : pos;
  return {
    name: `${p.name} ${side(p) < 0 ? "LH" : side(p) > 0 ? "RH" : ""}`,
    curve: new Shifted(path, shift),
    r: radius,
  };
};
/** Every drawn exhaust tube: headers, risers, crossover, bypass, tie rod, discharge necks, tailpipes. */
const EXHAUST =
  /^(Elbow riser|Exhaust tee|Turbocharger transition|Cylinder exhaust riser|Exhaust crossover pipe|Wastegate bypass pipe|Exhaust tie rod|Turbine discharge neck|Tailpipe)$/;
const exhaustTubes = () => parts(EXHAUST).map(tubeOf);
const flow = (key: string) => FLOWS.find((f) => f.key === key)!;
const flowCurve = (key: string) => curveOf(flow(key).pts, flow(key).tension ?? 0.3);

describe("SR22T exhaust bent runs", () => {
  it("each elbow riser is a bent run, not mitred segments: it turns at least 60° and no bend is tighter than one tube diameter (AMM Fig 78-10-2 PDF 2740; radius approximate)", () => {
    const elbows = parts(/^Elbow riser$/).map(tubeOf);
    expect(elbows).toHaveLength(2);
    for (const e of elbows) {
      const turn = e.curve.getTangentAt(0).angleTo(e.curve.getTangentAt(1));
      expect(turn, e.name).toBeGreaterThanOrEqual(Math.PI / 3);
      // radius of the circle through three centreline points 2 mm apart; straight runs give an infinite radius
      const pts = samplesAlong(e.curve, 0.002);
      let tightest = Infinity;
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i - 1].distanceTo(pts[i]),
          b = pts[i].distanceTo(pts[i + 1]),
          c = pts[i - 1].distanceTo(pts[i + 1]);
        const area = new Vector3().crossVectors(pts[i].clone().sub(pts[i - 1]), pts[i + 1].clone().sub(pts[i - 1]));
        if (area.length() > 1e-12) tightest = Math.min(tightest, (a * b * c) / (2 * area.length()));
      }
      expect(tightest, e.name).toBeGreaterThanOrEqual(EXHAUST_BEND * 0.98);
    }
  });

  it("the exhaust flows ride inside their bent tubes: every exh* point lies within 2 mm of a drawn header centreline (POH 7-38; Fig 78-10-2 PDF 2740)", () => {
    const headers = parts(/^(Elbow riser|Exhaust tee|Turbocharger transition|Cylinder exhaust riser)$/).map(tubeOf);
    const lines = headers.map((h) => samplesAlong(h.curve, 0.001));
    for (const c of CYLS) {
      // 2 mm: the 10-mm flow sampling cuts each 1-D bend's chord by under 0.5 mm, and the collector joints, where two
      // pieces overlap, are the pieces' own tubes
      for (const p of flow("exh" + c.n).pts) {
        const gap = Math.min(...lines.map((l) => Math.min(...l.map((q) => q.distanceTo(toV(p))))));
        expect(gap, `exh${c.n} at ${p}`).toBeLessThan(0.002);
      }
    }
  });

  it("each cylinder exhaust port carries its gasket and the riser's flange, the riser attached through them (AMM 78-10 PDF 2738 (a)–(b); Fig 78-10-2 PDF 2740 item 5)", () => {
    const headers = parts(/^(Elbow riser|Cylinder exhaust riser)$/).map(tubeOf);
    for (const c of CYLS) {
      const port = toV(cylExhaust(c));
      const box = (name: string) => {
        const found = parts(new RegExp(`^${name} — cyl ${c.n}$`));
        expect(found, `${name} cyl ${c.n}`).toHaveLength(1);
        const g = placed(found[0]);
        g.computeBoundingBox();
        const b = g.boundingBox!.clone();
        g.dispose();
        return b;
      };
      const gasket = box("Exhaust port gasket"),
        flange = box("Exhaust port flange");
      // stacked under the port: gasket on the port plane, flange under the gasket, both centred on the port
      expect(Math.abs(gasket.max.y - port.y), `cyl ${c.n} gasket seat`).toBeLessThanOrEqual(0.001);
      expect(Math.abs(flange.max.y - gasket.min.y), `cyl ${c.n} flange on gasket`).toBeLessThanOrEqual(0.001);
      for (const b of [gasket, flange]) {
        expect(Math.abs(b.getCenter(new Vector3()).x - port.x)).toBeLessThanOrEqual(0.001);
        expect(Math.abs(b.getCenter(new Vector3()).z - port.z)).toBeLessThanOrEqual(0.001);
      }
      // the riser's drawn tube starts on the port (within 1 mm), runs through the flange's thickness, and the flange
      // is wider than the tube
      const riser = headers.find((h) => h.curve.getPoint(0).distanceTo(port) <= 0.001);
      expect(riser, `cyl ${c.n} riser on its port`).toBeDefined();
      const throughFlange = riser!.curve.getPointAt(
        (port.y - (flange.max.y + flange.min.y) / 2) / riser!.curve.getLength(),
      );
      expect(flange.containsPoint(throughFlange), `cyl ${c.n} riser through its flange`).toBe(true);
      expect(flange.max.x - flange.min.x).toBeGreaterThan(2 * riser!.r);
    }
  });

  it("every exhaust part keeps its margin from the clearance table: 5 mm to the baffles and seals, 10 mm to the spark plugs, ignition leads, CHT probes and induction ducts (AMM 78-10 PDF 2739: 'adequate clearance', undimensioned)", () => {
    // Clearance margins, surface to surface on the rendered meshes:
    const MARGINS: { what: string; names: RegExp; margin: number }[] = [
      // operator ruling 2026-10-10: the baffle audit's own 5 mm (tests/sr22t-engine-baffles.test.ts)
      {
        what: "baffles and seals",
        names:
          /^(Cylinder baffle|Inter-cylinder baffle|Side baffle|Aft baffle|Front baffle|Baffle seal|Intercooler seal)$/,
        margin: 0.005,
      },
      // tests/sr22t-exhaust-audit.test.ts "all exhaust fittings and TIT clear plugs and ignition leads by 10 mm"
      // (AMM Figs 74-20-1/2 PDF 2624/2625); the CHT probes sit beside the ports (AMM 77-20 PDF 2706)
      {
        what: "spark plugs, ignition leads and CHT probes",
        names: /^(Spark plug — cyl .*|Ignition lead — .*|CHT sensor — cyl \d)$/,
        margin: 0.01,
      },
      // acceptance: at least 0.01 m from every induction duct
      {
        what: "induction ducts",
        names:
          /^(Induction inlet duct|Alternate air duct|Intake pipe — cyl \d|Upper-deck pressure line|Manifold pressure line|Intercooler inlet duct|Intake manifold)$/,
        margin: 0.01,
      },
    ];
    const exhaust = parts(
      /^(Elbow riser|Exhaust tee|Turbocharger transition|Cylinder exhaust riser|Exhaust crossover pipe|Wastegate bypass pipe|Exhaust tie rod|Turbine discharge neck|Tailpipe|Exhaust port (flange|gasket) — cyl \d)$/,
    ).map(solid);
    expect(exhaust).toHaveLength(2 * 5 + 2 * 2 + 3 + 12);
    const hits: string[] = [];
    for (const { what, names, margin } of MARGINS) {
      const near = parts(names).map(solid);
      expect(near.length, what).toBeGreaterThan(5);
      for (const e of exhaust)
        for (const n of near) {
          const d = gap(e, n, margin);
          if (d < margin)
            hits.push(`${e.name} vs ${n.name} (${what}): ${(d * 1000).toFixed(2)} mm < ${margin * 1000} mm`);
        }
    }
    expect(hits).toEqual([]);
  }, 180000);

  it("no exhaust tube comes within 10 mm of the induction ducts, the engine mount, or the firewall, sampled every 10 mm (AMM 78-10 PDF 2739: 'adequate clearance from surrounding objects'; 10 mm chosen)", () => {
    const induction = parts(
      /^(Induction inlet duct|Alternate air duct|Intake pipe — cyl \d|Upper-deck pressure line|Manifold pressure line|Intercooler inlet duct|Intake manifold)$/,
    );
    const mount = parts(/^Engine mount/);
    expect(induction.filter((p) => p.name === "Intercooler inlet duct")).toHaveLength(2);
    expect(mount.length).toBeGreaterThan(10);
    const solids = [...induction, ...mount];
    const geos = solids.map(placed);
    // open tubes cannot hold a point inside them; only closed solids get the parity check
    const obstacles = solids.map((p, i) => obstacle(p.name!, geos[i], !(geos[i] instanceof TubeGeometry)));
    try {
      const tubes = exhaustTubes();
      expect(tubes.length).toBe(2 * 5 + 2 * 2 + 3);
      for (const t of tubes) {
        const worst = sampledClearance(t.curve, t.r, obstacles);
        expect(worst.gap, `${t.name} vs ${worst.name} at ${worst.at.toArray()}`).toBeGreaterThanOrEqual(0.01);
        const aft = surfaceSamples(t.curve, t.r).filter((v) => v.x < FW + 0.01);
        expect(
          aft.map((v) => v.toArray()),
          `${t.name} within 10 mm of the firewall`,
        ).toEqual([]);
      }
    } finally {
      for (const g of geos) g.dispose();
    }
  }, 120000);

  it("the tie rod joins the RH turbocharger transition and the crossover: each drawn end lies within 10 mm of its host tube's surface (AMM 78-10 PDF 2734)", () => {
    const [rod] = parts(/^Exhaust tie rod$/).map(tubeOf);
    const transition = parts(/^Turbocharger transition$/)
      .map(tubeOf)
      .find((t) => t.name.endsWith("RH"))!;
    const [crossover] = parts(/^Exhaust crossover pipe$/).map(tubeOf);
    expect(crossover.r).toBe(CROSSOVER_RADIUS);
    for (const [end, host] of [
      [rod.curve.getPoint(0), transition],
      [rod.curve.getPoint(1), crossover],
    ] as const) {
      expect(end.z).toBeGreaterThan(0);
      const toAxis = Math.min(...samplesAlong(host.curve, 0.0005).map((q) => q.distanceTo(end)));
      // surface distance, inside or outside the wall: an end buried at the centreline is 20 mm from the surface
      expect(Math.abs(toAxis - host.r), `${host.name}`).toBeLessThanOrEqual(0.01);
    }
  });

  it("the heat duct passes the shroud beside the crossover, not through the pipe, and the rear cylinder drains clear the crossover, heat exchanger and transitions (POH 7-64; AMM Fig 21-40-2 PDF 495)", () => {
    const solids = parts(
      /^(Exhaust crossover pipe|Exhaust crossover \/ heat exchanger|Turbocharger transition|Exhaust tie rod|Wastegate transition|Wastegate bypass pipe)$/,
    );
    const geos = solids.map(placed);
    const all = solids.map((p, i) => obstacle(`${p.name} ${side(p)}`, geos[i], !(geos[i] instanceof TubeGeometry)));
    try {
      // the shroud is the heat duct's own host (it heats the duct's air); the pipe inside it is not
      const pipe = all.filter((o) => o.name.startsWith("Exhaust crossover pipe"));
      const hot = sampledClearance(flowCurve("hotIn"), flow("hotIn").r!, pipe, 0.005);
      expect(hot.gap, `hotIn vs ${hot.name} at ${hot.at.toArray()}`).toBeGreaterThanOrEqual(0.005);
      for (const key of ["fuelDrainCyl1", "fuelDrainCyl2"]) {
        const worst = sampledClearance(flowCurve(key), flow(key).r!, all, 0.005);
        expect(worst.gap, `${key} vs ${worst.name} at ${worst.at.toArray()}`).toBeGreaterThanOrEqual(0.005);
      }
    } finally {
      for (const g of geos) g.dispose();
    }
  }, 60000);
});
