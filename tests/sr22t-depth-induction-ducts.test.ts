// The overboost-on-the-LH-outlet-tube case guards the overboost placement.
/**
 * The induction path as connected ducts (POH 13772-007 7-37; AMM 13773-002 Rev 7 71-60 PDF p. 2542,
 * Fig 71-60-2 PDF pp. 2557–2558). The figures are undimensioned: these tests check connectivity and clearance, not sizes.
 */
import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Curve,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Ray,
  Matrix4,
  Quaternion,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from "three";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { FW, inFus } from "@/aircraft/sr22t/geometry";
import { CAT, CYLS, INDUCTION_PATH } from "@/aircraft/sr22t/parts";
import { GATE_CONTROLLER, OVERBOOST, THROTTLE, cylIntake, cylOrigin } from "@/aircraft/sr22t/parts/engine";
import { DUCT7_R, INTERCOOLER_IN } from "@/aircraft/sr22t/intercooler-layout";
import { COMPRESSOR_OUTLET } from "@/aircraft/sr22t/turbo-layout";
import { BAFFLE_SHEET, baffleLayout } from "@/aircraft/sr22t/parts/engine-baffles";
import { OIL_SOURCE } from "@/aircraft/sr22t/parts/engine-oil";
import { curveOf } from "@/lib/geometry";
import type { PartSpec } from "@/lib/catalogue";
import { toV, type Vec3 } from "@/lib/math";
import { obstacle, sampledClearance, samplesAlong, surfaceSamples } from "./sampled-clearance";

const parts = (name: string | RegExp) =>
  CAT.parts.filter((p) => (typeof name === "string" ? p.name === name : name.test(p.name ?? "")));
/** A part's geometry in airplane coordinates (its own pos/rot/scale, plus the cylinder group origin). */
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
const boxOf = (p: PartSpec) => {
  const g = placed(p);
  g.computeBoundingBox();
  const b = g.boundingBox!.clone();
  g.dispose();
  return b;
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
/** A tube part's centreline and radius in airplane coordinates (tube parts drawn about `pos` carry a world path). */
const tubeOf = (p: PartSpec): { curve: Curve<Vector3>; r: number } | undefined => {
  const g = p.geo();
  // a capped duct carries its centreline (parts/engine-air.ts)
  if (g.userData.path) {
    g.dispose();
    return { curve: g.userData.path as Curve<Vector3>, r: g.userData.radius as number };
  }
  if (!(g instanceof TubeGeometry)) return void g.dispose();
  const { path, radius } = g.parameters;
  const v0 = new Vector3().fromBufferAttribute(g.getAttribute("position"), 0).add(toV(p.pos ?? [0, 0, 0]));
  g.dispose();
  const shift = Math.abs(v0.distanceTo(path.getPoint(0)) - radius) < 1e-6 ? new Vector3() : toV(p.pos ?? [0, 0, 0]);
  return { curve: new Shifted(path, shift), r: radius };
};
/** Smallest distance from `p` to a polyline sampled along `curve`. */
const toCentreline = (curve: Curve<Vector3>, p: Vec3 | Vector3, step = 0.001) =>
  Math.min(...samplesAlong(curve, step).map((q) => q.distanceTo(toV(p))));
const flow = (key: string) => FLOWS.find((f) => f.key === key)!;
/** Boxes and capped cylinders are closed solids (the inside test applies); open sleeves and tubes are not. */
const closedSolid = (g: BufferGeometry) =>
  g instanceof BoxGeometry || (g instanceof CylinderGeometry && !g.parameters.openEnded);
const side = (s: number) => (s < 0 ? "LH" : "RH");
const L = (s: number) => (s < 0 ? "L" : "R");

/** The new phase A tubes ("every induction tube"). */
const NEW_TUBES =
  /^(Induction inlet duct|Alternate air duct|Intake pipe — cyl \d|Upper-deck pressure line|Manifold pressure line)$/;
const tubes = () =>
  parts(NEW_TUBES).map((p) => {
    const t = tubeOf(p);
    expect(t, p.name).toBeDefined();
    return { name: `${p.name} ${(p.note ?? "").slice(0, 2)}`, ...t! };
  });

describe("SR22T induction ducts", () => {
  it("induction path is continuous with no gap from each NACA inlet through the compressor, coupler, inlet duct, intercooler, Y, throttle body and manifold into every intake pipe and its port, within 1 mm (POH 7-37; Figs 71-60-2 PDF 2557–2558, 81-20-1 PDF 2815)", () => {
    for (const s of [-1, 1]) {
      const chains = INDUCTION_PATH(s);
      expect(chains.map((c) => c.map((r) => r.part))).toEqual([
        [
          "Induction inlet duct",
          "Air box / induction filter",
          "Compressor inlet neck",
          `${side(s)} turbocharger`,
          "Compressor outlet coupler",
          "Intercooler inlet duct",
          `${side(s)} intercooler`,
          "Intercooler outlet duct",
          "Induction Y junction",
          "Throttle body / fuel-metering valve",
          "Intake manifold",
        ],
        ...CYLS.filter((c) => c.s === s).map((c) => [
          "Intake manifold",
          `Intake pipe — cyl ${c.n}`,
          "Intake port flange",
        ]),
      ]);
      // every intake pipe branch ends over its own cylinder's intake port
      for (const branch of chains.slice(2)) {
        const n = Number(branch[1].part.slice(-1));
        const c = CYLS.find((c) => c.n === n)!;
        // the drawn pipe ends on its port, and the port's flange is the next run
        expect(toV(branch[1].pts.at(-1)!).distanceTo(toV(cylIntake(c)))).toBeLessThan(0.001);
        expect(branch[2].part).toBe("Intake port flange");
      }
      // the chain starts in the NACA duct and ends at the compressor inlet / in the manifold
      expect(
        boxOf(parts("NACA induction duct").find((p) => Math.sign(p.pos![2]) === s)!).distanceToPoint(
          toV(chains[0][0].pts[0]),
        ),
      ).toBeLessThan(0.03);
      for (const chain of chains) {
        for (let i = 1; i < chain.length; i++)
          expect(
            toV(chain[i - 1].pts.at(-1)!).distanceTo(toV(chain[i].pts[0])),
            `${side(s)} ${chain[i - 1].part} → ${chain[i].part}`,
          ).toBeLessThan(0.001);
        // each run's drawn part (with its unnamed pieces, e.g. the Y's RH arm) reaches both of its ends
        for (const run of chain) {
          const drawn = CAT.parts.filter(
            (p) =>
              p.name === run.part ||
              (run.part === "Induction Y junction" && !p.name && p.groups?.includes("induction")),
          );
          expect(drawn.length, run.part).toBeGreaterThan(0);
          for (const end of [run.pts[0], run.pts.at(-1)!]) {
            // a side outlet (`wall`) lies on the tube's wall rather than on its centreline
            const onWall = run.wall && end === run.pts.at(-1);
            const reach = Math.min(
              ...drawn.map((p) => {
                const t = tubeOf(p);
                if (!t) return boxOf(p).distanceToPoint(toV(end));
                return onWall ? Math.abs(toCentreline(t.curve, end) - t.r) : toCentreline(t.curve, end);
              }),
            );
            expect(reach, `${side(s)} ${run.part} at ${end}`).toBeLessThan(0.001);
          }
        }
      }
    }
  });

  it("each joint carries its clamp: inlet duct at the air box, both alternate air tube ends, the throttle body's two faces and every intake pipe (Fig 71-60-2 item 4)", () => {
    const clamps = parts("Induction clamp");
    // + coupler 9's two clamps 3 and hose connector 10's two clamps 4 on each intercooler inlet duct (fix 1)
    expect(clamps).toHaveLength(2 + 4 + 2 + 6 + 8);
    // every clamp hugs one of the new tubes, the "Y" / manifold at the throttle body, or an inlet duct's coupler or
    // hose connector (their sleeves are 4 mm thick)
    const hosts = [
      ...tubes(),
      ...["Induction Y junction", "Intake manifold"].map((n) => ({ name: n, ...tubeOf(parts(n)[0])! })),
      ...parts("Intercooler inlet duct").map((p) => {
        const t = tubeOf(p)!;
        return { name: "Intercooler inlet duct", curve: t.curve, r: t.r + 0.004 };
      }),
    ];
    for (const c of clamps) {
      const b = boxOf(c),
        centre = b.getCenter(new Vector3());
      const host = hosts.find((h) => toCentreline(h.curve, centre, 0.002) < 0.002);
      expect(host, `${c.note}`).toBeDefined();
      // the band sits just outside its tube's wall
      const size = b.getSize(new Vector3());
      expect(Math.max(size.x, size.y, size.z) / 2).toBeGreaterThan(host!.r);
      expect(Math.max(size.x, size.y, size.z) / 2).toBeLessThan(host!.r + 0.01);
    }
  });

  it("six intake pipes reach six intake ports on top of the heads (POH 7-37)", () => {
    const manifold = tubeOf(parts("Intake manifold")[0])!;
    for (const c of CYLS) {
      const pipe = parts(`Intake pipe — cyl ${c.n}`);
      expect(pipe).toHaveLength(1);
      const { curve } = tubeOf(pipe[0])!;
      const [start, end] = [curve.getPointAt(0), curve.getPointAt(1)];
      // starts in a manifold outlet: inside the manifold's wall
      expect(toCentreline(manifold.curve, start)).toBeLessThan(manifold.r);
      // ends on its own cylinder's port, above the cylinder centre
      expect(end.distanceTo(toV(cylIntake(c)))).toBeLessThan(0.001);
      // its end is square to the port, and a flange seats it there
      expect(curve.getTangentAt(1).y).toBeLessThan(-0.999);
      expect(
        parts("Intake port flange").filter(
          (f) => boxOf(f).distanceToPoint(end) < 0.001 && boxOf(f).max.y - end.y < 0.005,
        ),
      ).toHaveLength(1);
      expect(end.y).toBeGreaterThan(cylOrigin(c)[1]);
      for (const other of CYLS.filter((o) => o !== c))
        expect(end.distanceTo(toV(cylIntake(other)))).toBeGreaterThan(0.05);
    }
  });

  it("the overboost valve is on the LH intercooler outlet tube (AMM 71-60 PDF 2542)", () => {
    expect(OVERBOOST[2]).toBeLessThan(0);
    const lh = parts("Intercooler outlet duct")
      .map(tubeOf)
      .filter((t) => t && t.curve.getPointAt(0.5).z < 0);
    expect(lh).toHaveLength(2);
    const gap = Math.min(...lh.map((t) => toCentreline(t!.curve, OVERBOOST) - DUCT7_R));
    expect(gap).toBeLessThan(0.02);
  });

  it("the wastegate controller has its sensing hoses to the throttle body inlet and to the manifold (Fig 78-10-3 PDF 2742; AMM 81-00 PDF 2808)", () => {
    const controller = boxOf(parts("Wastegate controller")[0]);
    expect(controller.containsPoint(toV(GATE_CONTROLLER))).toBe(true);
    // each hose's surface meets its fitting's surface (≤ 1 mm) at the far end: the upper-deck hose on the throttle body's
    // upper-deck pressure fitting, the manifold hose on the manifold's aft end cap; and its other end on the controller
    const surfaceGap = (hose: PartSpec, host: PartSpec, end: 0 | 1) => {
      const g = hose.geo() as TubeGeometry,
        ring = g.parameters.radialSegments + 1,
        at = g.getAttribute("position"),
        first = end === 0 ? 0 : g.parameters.tubularSegments * ring;
      const h = placed(host),
        bvh = obstacle(host.name ?? host.id, h, false).bvh;
      let gap = Infinity;
      for (let i = first; i < first + ring; i++)
        gap = Math.min(gap, bvh.closestPointToPoint(new Vector3().fromBufferAttribute(at, i))!.distance);
      g.dispose();
      h.dispose();
      return gap;
    };
    const fitting = parts("Upper-deck pressure fitting");
    expect(fitting).toHaveLength(1);
    const cap = CAT.parts.filter(
      (p) => !p.name && p.groups?.includes("induction") && p.geo() instanceof CylinderGeometry,
    );
    expect(cap.length).toBeGreaterThan(0);
    for (const [name, host] of [
      ["Upper-deck pressure line", fitting[0]],
      [
        "Manifold pressure line",
        cap.find(
          (p) => boxOf(p).distanceToPoint(tubeOf(parts("Manifold pressure line")[0])!.curve.getPointAt(1)) < 0.002,
        )!,
      ],
    ] as const) {
      const line = parts(name);
      expect(line, name).toHaveLength(1);
      expect(line[0].groups).toEqual(["induction"]);
      expect(host, `${name} host`).toBeDefined();
      const { curve } = tubeOf(line[0])!;
      const tapEnd = name === "Upper-deck pressure line" ? 0 : 1;
      expect(surfaceGap(line[0], host, tapEnd), `${name} on its fitting`).toBeLessThan(0.001);
      expect(controller.distanceToPoint(curve.getPointAt(1 - tapEnd)), `${name} on the controller`).toBeLessThan(0.001);
    }
    // the fitting sits on the throttle body's upstream half, seated into its surface
    const throttle = parts("Throttle body / fuel-metering valve")[0];
    const fb = boxOf(fitting[0]);
    expect(fb.intersectsBox(boxOf(throttle))).toBe(true);
    expect(fb.getCenter(new Vector3()).x).toBeGreaterThan(THROTTLE[0]);
    // the deckRef flow runs along the drawn hose from the controller's own fitting; the magnetos' pressure hose has its
    // own fitting (Continental M-18 Fig 5-35 View F-F PDF p. 150; AMM Fig 78-10-3 PDF p. 2742)
    const { curve } = tubeOf(parts("Upper-deck pressure line")[0])!;
    const deck = flow("deckRef").pts;
    expect(fb.distanceToPoint(toV(deck[0]))).toBeLessThan(0.001);
    for (const p of deck) expect(toCentreline(curve, p)).toBeLessThan(0.001);
  });

  it("no new induction tube crosses the engine, its cylinders, the mount, the firewall or the cowl, sampled every 10 mm", () => {
    const solids = parts(/^(Continental TSIO-550-K|Cylinder \d|Cylinder head \d|Engine mount .*)$/);
    expect(solids.filter((p) => /^Cylinder/.test(p.name!))).toHaveLength(12);
    expect(solids.filter((p) => /^Engine mount/.test(p.name!)).length).toBeGreaterThan(10);
    const geos = solids.map(placed);
    // open tubes (the mount members) cannot hold a point inside them; only closed solids get the parity check
    const obstacles = solids.map((p, i) => obstacle(p.name!, geos[i], !(geos[i] instanceof TubeGeometry)));
    try {
      const all = tubes();
      expect(all).toHaveLength(2 + 2 + 6 + 2);
      for (const t of all) {
        const worst = sampledClearance(t.curve, t.r, obstacles);
        expect(worst.gap, `${t.name} vs ${worst.name} at ${worst.at.toArray()}`).toBeGreaterThan(0.001);
        const skin = surfaceSamples(t.curve, t.r);
        expect(
          skin.filter((v) => v.x <= FW),
          `${t.name} aft of the firewall`,
        ).toEqual([]);
        expect(
          skin.filter((v) => !inFus(v)).map((v) => v.toArray()),
          `${t.name} inside the cowl`,
        ).toEqual([]);
      }
    } finally {
      for (const g of geos) g.dispose();
    }
  }, 60000);

  it("the new tubes keep 5 mm from the baffles, the magnetos, the engine sensors and the oil cooler", () => {
    const near = CAT.parts.filter(
      (p) =>
        /(baffle|Baffle seal|Intercooler seal)$/i.test(p.name ?? "") ||
        /^(Left magneto|Right magneto|Oil cooler|MAP sensor|MAT sensor)$/.test(p.name ?? "") ||
        p.groups?.includes("sensors"),
    );
    for (const name of [
      "Side baffle",
      "Front baffle",
      "Baffle seal",
      "Left magneto",
      "Right magneto",
      "Oil cooler",
      "MAP sensor",
      "Throttle position sensor",
    ])
      expect(
        near.some((p) => p.name === name),
        name,
      ).toBe(true);
    const geos = near.map(placed);
    const obstacles = near.map((p, i) => obstacle(p.name ?? p.id, geos[i], !(geos[i] instanceof TubeGeometry)));
    try {
      const all = tubes();
      expect(all).toHaveLength(2 + 2 + 6 + 2);
      for (const t of all) {
        const worst = sampledClearance(t.curve, t.r, obstacles);
        expect(worst.gap, `${t.name} vs ${worst.name} at ${worst.at.toArray()}`).toBeGreaterThanOrEqual(0.005);
      }
    } finally {
      for (const g of geos) g.dispose();
    }
  }, 60000);

  it("the flows follow the ducts: every inlet, alternate air and intake pipe flow point lies within 10 mm of its tube's centreline, up to the part it feeds", () => {
    for (const s of [-1, 1]) {
      const inlet = parts("Induction inlet duct")
        .map(tubeOf)
        .find((t) => Math.sign(t!.curve.getPointAt(0).z) === s)!;
      const alt = parts("Alternate air duct")
        .map(tubeOf)
        .find((t) => Math.sign(t!.curve.getPointAt(1).z) === s)!;
      for (const p of flow("altAir" + L(s)).pts)
        expect(toCentreline(alt.curve, p), `altAir${L(s)} ${p}`).toBeLessThan(0.01);
      // the inlet flow runs the whole duct, NACA inlet to the air box face, then on into the filter housing
      const inletPts = flow("inlet" + L(s)).pts;
      for (const p of inletPts.slice(0, -1))
        expect(toCentreline(inlet.curve, p), `inlet${L(s)} ${p}`).toBeLessThan(0.01);
      expect(toV(inletPts.at(-2)!).distanceTo(inlet.curve.getPointAt(1))).toBeLessThan(0.001);
      expect(
        boxOf(parts("Air box / induction filter").find((p) => Math.sign(p.pos![2]) === s)!).containsPoint(
          toV(inletPts.at(-1)!),
        ),
      ).toBe(true);
    }
    for (const c of CYLS) {
      const { curve } = tubeOf(parts(`Intake pipe — cyl ${c.n}`)[0])!;
      const pts = flow("man" + c.n).pts;
      for (const p of pts) expect(toCentreline(curve, p), `man${c.n} ${p}`).toBeLessThan(0.01);
      expect(pts.at(-1)).toEqual(cylIntake(c));
    }
  });

  it("every new induction part carries the induction group", () => {
    const fresh = parts(
      /^(Induction inlet duct|Induction clamp|Intake pipe — cyl \d|Upper-deck pressure line|Manifold pressure line|Alternate air duct|Intercooler inlet duct|Compressor outlet coupler|Intercooler inlet hose connector|Intake port flange|Air filter element|Upper-deck pressure fitting)$/,
    );
    expect(fresh).toHaveLength(2 + 22 + 6 + 2 + 2 + 2 + 2 + 2 + 6 + 4 + 1);
    for (const p of fresh) expect(p.groups, p.name).toEqual(["induction"]);
    for (const key of [
      "inletL",
      "inletR",
      "altAirL",
      "altAirR",
      "deckRef",
      "compressorL",
      "compressorR",
      ...CYLS.map((c) => "man" + c.n),
    ])
      expect(flow(key).groups, key).toEqual(["induction"]);
  });

  /* ---------- phase B: the wastegate controller's oil lines and the wastegate drain ---------- */
  const OIL_LINES = [
    "Wastegate oil supply line",
    "Wastegate oil line",
    "Controller oil return",
    "Wastegate drain line",
  ];
  const lines = () =>
    OIL_LINES.map((name) => {
      const p = parts(name);
      expect(p, name).toHaveLength(1);
      expect(p[0].groups, name).toEqual(["oil"]);
      return { name, ...tubeOf(p[0])! };
    });
  const ends = (t: { curve: Curve<Vector3> }) => [t.curve.getPointAt(0), t.curve.getPointAt(1)];
  const near = (name: string, p: Vector3) => Math.min(...parts(name).map((q) => boxOf(q).distanceToPoint(p)));

  it("the wastegate oil runs supply → actuator → controller → engine, and the drain from the wastegate to the drain manifold (Fig 78-10-3 PDF 2742; Fig 71-70-2 PDF 2565; POH 7-38–7-39)", () => {
    const [supply, wgLine, ret, drain] = lines();
    // supply: from the oil cooler's outlet fitting, untouched (the turbo check valve and tee sit there)
    expect(ends(supply)[0].distanceTo(toV(OIL_SOURCE))).toBeLessThan(0.001);
    expect(near("Wastegate actuator", ends(supply)[1])).toBeLessThan(0.02);
    // the hose 6 "WASTEGATE (REF)" from the actuator to the controller, and "TO ENGINE" from the controller to the case
    expect(near("Wastegate actuator", ends(wgLine)[0])).toBeLessThan(0.02);
    expect(near("Wastegate controller", ends(wgLine)[1])).toBeLessThan(0.02);
    expect(near("Wastegate controller", ends(ret)[0])).toBeLessThan(0.02);
    expect(near("Continental TSIO-550-K", ends(ret)[1])).toBeLessThan(0.02);
    // the "TO WASTEGATE" drain hose ends on the firewall drain manifold
    expect(near("Wastegate", ends(drain)[0])).toBeLessThan(0.02);
    expect(near("Drain manifold", ends(drain)[1])).toBeLessThan(0.02);
    // the oil flow follows the three oil lines, point by point
    const oil = [supply, wgLine, ret];
    for (const p of flow("gateOil").pts)
      expect(Math.min(...oil.map((t) => toCentreline(t.curve, p))), `gateOil ${p}`).toBeLessThan(0.01);
    expect(flow("gateOil").groups).toEqual(["oil"]);
  });

  it("the oil lines and the drain keep 5 mm from the merged lower ignition leads, the baffles, the magnetos, the engine and oil sensors, the turbo oil lines and turbos, and every other part and flow tube, inside the cowl and forward of the firewall", () => {
    // each line's own hosts, and the oil cooler fitting the supply shares with the turbo oil lines
    const HOSTS =
      /^(Wastegate|Wastegate actuator|Wastegate controller|Oil cooler|Continental TSIO-550-K|Drain manifold)$/;
    const others = CAT.parts.filter(
      (p) =>
        p.sys.includes("engine") &&
        !p.parent?.startsWith("blade") &&
        !OIL_LINES.includes(p.name ?? "") &&
        !HOSTS.test(p.name ?? ""),
    );
    for (const name of [
      "Ignition lead — left magneto",
      "Side baffle",
      "Left magneto",
      "Oil temperature sensor",
      "LH turbocharger",
    ])
      expect(
        others.some((p) => p.name === name),
        name,
      ).toBe(true);
    const geos = others.map(placed);
    const flowGeos = FLOWS.filter((f) => f.tube !== false && f.key !== "gateOil").map((f) => {
      const c = curveOf(f.pts, f.tension ?? 0.3);
      return {
        key: f.key,
        g: new TubeGeometry(c, Math.max(24, Math.round(c.getLength() * 28)), f.r ?? 0.012, 6, false),
      };
    });
    expect(flowGeos.filter((f) => /^turbo(Oil|Scav)[LR]$/.test(f.key))).toHaveLength(4);
    const obstacles = [
      ...others.map((p, i) => obstacle(p.name ?? p.id, geos[i], closedSolid(geos[i]))),
      ...flowGeos.map((f) => obstacle("flow " + f.key, f.g, false)),
    ];
    try {
      for (const t of lines()) {
        // the supply's first 20 mm leave the shared oil cooler fitting with the turbo oil lines
        const from = t.name === "Wastegate oil supply line" ? 0.02 : 0;
        const length = t.curve.getLength();
        const body = new Shifted(
          {
            getPoint: (u: number) => t.curve.getPointAt(from / length + (u * (length - from)) / length),
          } as Curve<Vector3>,
          new Vector3(),
        );
        const worst = sampledClearance(body, t.r, obstacles);
        expect(worst.gap, `${t.name} vs ${worst.name} at ${worst.at.toArray()}`).toBeGreaterThanOrEqual(0.005);
        const skin = surfaceSamples(t.curve, t.r);
        expect(
          skin.filter((v) => v.x <= FW),
          `${t.name} aft of the firewall`,
        ).toEqual([]);
        expect(
          skin.filter((v) => !inFus(v)).map((v) => v.toArray()),
          `${t.name} inside the cowl`,
        ).toEqual([]);
      }
    } finally {
      for (const g of geos) g.dispose();
      for (const f of flowGeos) f.g.dispose();
    }
  }, 60000);

  /* ---------- the compressor → intercooler inlet ducts ---------- */
  const ducts = () =>
    [-1, 1].map((s) => {
      const p = parts("Intercooler inlet duct").find((q) => Math.sign(tubeOf(q)!.curve.getPointAt(0).z) === s)!;
      expect(p.groups).toEqual(["induction"]);
      expect(p.note).toMatch(/inferred \(no figure\)/);
      return { s, ...tubeOf(p)! };
    });

  it("each compressor outlet carries coupler 9 with two clamps 3, and each duct hose connector 10 with two clamps 4 below the baffle deck (Figs 81-20-1 PDF 2815, 71-60-2 sheet 2 PDF 2558)", () => {
    for (const d of ducts()) {
      const start = d.curve.getPointAt(0);
      expect(start.distanceTo(toV(COMPRESSOR_OUTLET(d.s)))).toBeLessThan(0.001);
      expect(d.curve.getPointAt(1).distanceTo(toV(INTERCOOLER_IN(d.s)))).toBeLessThan(0.001);
      const coupler = parts("Compressor outlet coupler").filter((p) => boxOf(p).distanceToPoint(start) < 0.001);
      expect(coupler, `${side(d.s)} coupler`).toHaveLength(1);
      const connector = parts("Intercooler inlet hose connector").filter(
        (p) => toCentreline(d.curve, boxOf(p).getCenter(new Vector3()), 0.002) < 0.002,
      );
      expect(connector, `${side(d.s)} hose connector`).toHaveLength(1);
      // below the deck, so its sleeve and clamps need no cut-out
      expect(boxOf(connector[0]).max.y).toBeLessThan(baffleLayout(d.s).deckTop - BAFFLE_SHEET - 0.005);
      for (const host of [...coupler, ...connector]) {
        const b = boxOf(host).expandByScalar(0.006);
        expect(parts("Induction clamp").filter((c) => b.containsBox(boxOf(c)))).toHaveLength(2);
      }
    }
  });

  it("the cut-out is bounded: a circle of the duct radius + 6 mm about each inlet pass; the deck and seal 16 change only on it (inferred, no figure)", () => {
    for (const d of ducts()) {
      const L = baffleLayout(d.s);
      expect(L.cutOut.r).toBeLessThanOrEqual(d.r + 0.006 + 1e-9);
      expect(L.cutOut.centre.x).toBe(INTERCOOLER_IN(d.s)[0]);
      expect(L.cutOut.centre.y).toBe(Math.abs(INTERCOOLER_IN(d.s)[2]));
      // every notched outline point is an original outline or window corner, or lies on the cut-out circle
      for (const [cut, base] of [
        [L.deckCut, L.deck],
        [L.gasketCut, L.gasket.outer],
      ] as const) {
        const extra = cut.filter((p) => ![...base, ...L.window].some((q) => q.distanceTo(p) < 1e-9));
        expect(extra.length).toBeGreaterThan(2);
        for (const p of extra)
          expect(Math.abs(p.distanceTo(L.cutOut.centre) - L.cutOut.r), `${p.x}, ${p.y}`).toBeLessThan(1e-9);
      }
    }
  });

  it("each duct keeps 5 mm from the lower ignition leads, every baffle and seal (the cut-out included), the turbos, the oil lines and every other solid and flow tube, inside the cowl and forward of the firewall", () => {
    // the duct's own joint hardware and its end host
    const OWN =
      /^(Intercooler inlet duct|Compressor outlet coupler|Intercooler inlet hose connector|Induction clamp|[LR]H intercooler)$/;
    const others = CAT.parts.filter(
      (p) => p.sys.includes("engine") && !p.parent?.startsWith("blade") && !OWN.test(p.name ?? ""),
    );
    for (const name of [
      "Ignition lead — left magneto",
      "Ignition lead — right magneto",
      "Side baffle",
      "Intercooler seal",
      "Aft baffle",
      "LH turbocharger",
      "Engine mount weldment",
      "Wastegate oil supply line",
      "Wastegate drain line",
    ])
      expect(
        others.some((p) => p.name === name),
        name,
      ).toBe(true);
    const geos = others.map(placed);
    const flowGeos = FLOWS.filter((f) => f.tube !== false).map((f) => {
      const c = curveOf(f.pts, f.tension ?? 0.3);
      return {
        key: f.key,
        g: new TubeGeometry(c, Math.max(24, Math.round(c.getLength() * 28)), f.r ?? 0.012, 6, false),
      };
    });
    const obstacles = [
      ...others.map((p, i) => obstacle(p.name ?? p.id, geos[i], closedSolid(geos[i]))),
      ...flowGeos.map((f) => obstacle("flow " + f.key, f.g, false)),
    ];
    try {
      for (const d of ducts()) {
        // the duct starts on its own turbo's scroll outlet: its first 5 mm sit on that housing
        const length = d.curve.getLength();
        const body = new Shifted(
          { getPoint: (u: number) => d.curve.getPointAt((0.005 + u * (length - 0.005)) / length) } as Curve<Vector3>,
          new Vector3(),
        );
        const worst = sampledClearance(body, d.r, obstacles, 0.005);
        expect(worst.gap, `${side(d.s)} duct vs ${worst.name} at ${worst.at.toArray()}`).toBeGreaterThanOrEqual(0.005);
        const skin = surfaceSamples(d.curve, d.r);
        expect(skin.filter((v) => v.x <= FW)).toEqual([]);
        expect(
          skin.filter((v) => !inFus(v)).map((v) => v.toArray()),
          `${side(d.s)} duct inside the cowl`,
        ).toEqual([]);
      }
    } finally {
      for (const g of geos) g.dispose();
      for (const f of flowGeos) f.g.dispose();
    }
  }, 120000);

  it("each air box shows its two filter elements in X-ray: the housing ghosts, and a ray from the Engine camera meets an element first (AMM 71-60 PDF 2542)", () => {
    // the Engine view's camera (aircraft/sr22t/systems.ts), and its mirror for the LH box
    const ENGINE_CAM = new Vector3(5.5, 1.6, 2.3);
    for (const s of [-1, 1]) {
      const housing = parts("Air box / induction filter").find((p) => Math.sign(p.pos![2]) === s)!;
      expect(housing.fairing).toBe(true);
      const hb = boxOf(housing);
      const elements = parts("Air filter element").filter((p) => hb.containsBox(boxOf(p)));
      expect(elements).toHaveLength(2);
      // the two elements are distinct: side by side, not overlapping
      expect(boxOf(elements[0]).intersectsBox(boxOf(elements[1]))).toBe(false);
      // X-ray draws every non-ghosted part opaque; ghosted fairings and plates do not hide what they cover
      const opaque = CAT.parts.filter(
        (p) => p.sys.includes("engine") && !p.fairing && !p.plate && !p.parent?.startsWith("blade") && p !== housing,
      );
      const geos = opaque.map(placed);
      const meshes = geos.map((g) => obstacle("", g, false).bvh);
      try {
        const cam = new Vector3(ENGINE_CAM.x, ENGINE_CAM.y, s * ENGINE_CAM.z);
        for (const e of elements) {
          const eb = boxOf(e),
            target = eb.getCenter(new Vector3());
          // aim at the element's centre and at its four camera-facing edge midpoints; one clear line of sight suffices
          const aims = [
            target,
            ...[-1, 1]
              .flatMap((k) => [new Vector3(0, k * 0.02, 0), new Vector3(0, 0, k * 0.012)])
              .map((d) => target.clone().add(d)),
          ];
          const seen = aims.some((aim) => {
            const dir = aim.clone().sub(cam).normalize(),
              ray = new Ray(cam, dir),
              far = cam.distanceTo(aim);
            const nearest = Math.min(...meshes.map((m) => m.raycastFirst(ray, DoubleSide)?.distance ?? Infinity));
            const own = meshes[opaque.indexOf(e)].raycastFirst(ray, DoubleSide)?.distance ?? Infinity;
            return own <= far && own <= nearest + 1e-9;
          });
          expect(seen, `${side(s)} ${e.note?.slice(0, 40)}`).toBe(true);
        }
      } finally {
        for (const g of geos) g.dispose();
      }
    }
  }, 60000);
});
