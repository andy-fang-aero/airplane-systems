import { expect, it } from "vitest";
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Euler,
  Line3,
  Matrix4,
  Quaternion,
  Ray,
  Triangle,
  TubeGeometry,
  Vector3,
} from "three";
import { CAT, CYLS } from "@/aircraft/sr22t/parts";
import { cylOrigin } from "@/aircraft/sr22t/parts/engine";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { FW, inFus } from "@/aircraft/sr22t/geometry";
import { curveOf } from "@/lib/geometry";
import { toV } from "@/lib/math";
import { faceCandidates } from "./helpers/faceCandidates";

// Schematic assemblies need 5 mm surface clearance. Rebuild every
// rendered tube with the exact curve, radius and tessellation of Flows.tsx.
const margin = 0.005;
const triangles = (g: BufferGeometry) => {
  const position = g.getAttribute("position"),
    index = g.index;
  return Array.from({ length: (index?.count ?? position.count) / 3 }, (_, i) => {
    const points = [0, 1, 2].map((j) =>
      new Vector3().fromBufferAttribute(position, index ? index.getX(i * 3 + j) : i * 3 + j),
    );
    const triangle = new Triangle(...(points as [Vector3, Vector3, Vector3]));
    return { triangle, box: new Box3().setFromPoints(points) };
  });
};
const edges = (t: Triangle) => [new Line3(t.a, t.b), new Line3(t.b, t.c), new Line3(t.c, t.a)];
const segmentDistance = (a: Line3, b: Line3) => {
  const u = a.delta(new Vector3()),
    v = b.delta(new Vector3()),
    w = a.start.clone().sub(b.start);
  const aa = u.dot(u),
    bb = u.dot(v),
    cc = v.dot(v),
    dd = u.dot(w),
    ee = v.dot(w);
  const det = aa * cc - bb * bb;
  let s = det > 1e-20 ? Math.max(0, Math.min(1, (bb * ee - cc * dd) / det)) : 0;
  let t = cc > 1e-20 ? (bb * s + ee) / cc : 0;
  if (t < 0) {
    t = 0;
    s = aa > 1e-20 ? Math.max(0, Math.min(1, -dd / aa)) : 0;
  } else if (t > 1) {
    t = 1;
    s = aa > 1e-20 ? Math.max(0, Math.min(1, (bb - dd) / aa)) : 0;
  }
  return a.at(s, new Vector3()).distanceTo(b.at(t, new Vector3()));
};
const distance = (a: Triangle, b: Triangle) => {
  let gap = Infinity;
  for (const [first, second] of [
    [a, b],
    [b, a],
  ]) {
    for (const point of [first.a, first.b, first.c])
      gap = Math.min(gap, point.distanceTo(second.closestPointToPoint(point, new Vector3())));
    for (const edge of edges(first)) {
      const delta = edge.delta(new Vector3()),
        length = delta.length();
      if (length > 1e-12) {
        const hit = new Ray(edge.start, delta.divideScalar(length)).intersectTriangle(
          second.a,
          second.b,
          second.c,
          false,
          new Vector3(),
        );
        if (hit && hit.distanceTo(edge.start) <= length + 1e-10) return 0;
      }
    }
  }
  for (const x of edges(a)) for (const y of edges(b)) gap = Math.min(gap, segmentDistance(x, y));
  return gap;
};
// Surface distances alone miss a small solid wholly enclosed in a larger tube.
// Match the existing cylinder audit's odd-exit containment check as well.
const inside = (point: Vector3, faces: ReturnType<typeof triangles>, box: Box3) => {
  if (!box.containsPoint(point)) return false;
  const ray = new Ray(point, new Vector3(0.137, 0.419, 1).normalize());
  const exits = faces
    .flatMap(({ triangle }) => {
      const hit = ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, new Vector3());
      return hit ? [point.distanceTo(hit)] : [];
    })
    .sort((a, b) => a - b);
  if (exits.some((d) => d < 1e-7)) return false;
  return exits.filter((d, i) => i === 0 || d - exits[i - 1] > 1e-7).length % 2 === 1;
};
type Solid = { name: string; faces: ReturnType<typeof triangles>; box: Box3 };
// "mutual" tests one vertex of each closed body inside the other; "first" tests every vertex of an open hose run
// inside the second body only, since the hose itself is not closed.
const gapBetween = (a: Solid, b: Solid, contained: "mutual" | "first" | "none") => {
  if (!a.box.clone().expandByScalar(margin).intersectsBox(b.box)) return Infinity;
  let gap = Infinity;
  for (const x of a.faces)
    for (const y of faceCandidates(b.faces, x.box.clone().expandByScalar(margin))) {
      if (!x.box.clone().expandByScalar(margin).intersectsBox(y.box)) continue;
      gap = Math.min(gap, distance(x.triangle, y.triangle));
    }
  const enclosed =
    contained === "mutual"
      ? inside(a.faces[0].triangle.a, b.faces, b.box) || inside(b.faces[0].triangle.a, a.faces, a.box)
      : contained === "first" &&
        a.faces.some(({ triangle: t }) => [t.a, t.b, t.c].some((v) => inside(v, b.faces, b.box)));
  return enclosed ? 0 : gap;
};
it("every engine sensor and mount assembly clears every rendered flow tube by 5 mm (POH 7-31/7-35/7-38; AMM Figs 71-20-1, 71-30-1, 77-20-2; schematic clearance)", () => {
  const owned = CAT.parts.filter((p) =>
    /^(CHT sensor|EGT probe|MAP sensor|MAT sensor|Throttle position sensor|Mixture position sensor|Engine mount weldment|Engine mount isolator|Firewall attach fitting|Engine grounding strap)$/.test(
      p.name?.replace(/ — cyl \d+$/, "") ?? "",
    ),
  );
  const tubes = FLOWS.filter((f) => f.tube !== false).map((f) => {
    const curve = curveOf(f.pts, f.tension ?? 0.3);
    const g = new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false);
    g.computeBoundingBox();
    const result = { f, triangles: triangles(g), box: g.boundingBox!.clone() };
    g.dispose();
    return result;
  });
  const hits: string[] = [];
  for (const p of owned) {
    const g = p.geo();
    g.applyMatrix4(
      new Matrix4().compose(
        toV(p.pos ?? [0, 0, 0]),
        new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
        toV(p.scale ?? [1, 1, 1]),
      ),
    );
    if (p.parent) {
      const c = CYLS.find((c) => p.parent === `cyl:${c.n}`);
      expect(c, `known parent for ${p.name}`).toBeDefined();
      g.translate(...cylOrigin(c!));
    }
    g.computeBoundingBox();
    const faces = triangles(g),
      box = g.boundingBox!;
    for (const tube of tubes) {
      // Only an EGT's own exhaust header is its documented sensing host.
      if (p.name === `EGT probe — cyl ${tube.f.key.slice(3)}` && /^exh[1-6]$/.test(tube.f.key)) continue;
      if (!box.clone().expandByScalar(margin).intersectsBox(tube.box)) continue;
      let gap = Infinity;
      for (const a of faces)
        for (const b of faceCandidates(tube.triangles, a.box.clone().expandByScalar(margin))) {
          if (!a.box.clone().expandByScalar(margin).intersectsBox(b.box)) continue;
          gap = Math.min(gap, distance(a.triangle, b.triangle));
        }
      if (inside(faces[0].triangle.a, tube.triangles, tube.box) || inside(tube.triangles[0].triangle.a, faces, box))
        gap = 0;
      if (gap < margin - 1e-7)
        hits.push(
          `${p.name} ${g instanceof TubeGeometry ? g.parameters.path.getPoint(1).toArray() : ""} @${p.pos ?? "world"} / ${tube.f.key}: ${(gap * 1000).toFixed(2)} mm`,
        );
    }
    g.dispose();
  }
  expect(owned.length).toBeGreaterThanOrEqual(16);
  expect(hits).toEqual([]);
}, 30000);

it("the A/C compressor and its engine-compartment hoses clear every part and rendered flow tube by 5 mm, inside the cowl (AMM 21-50 PDF pp. 499–501; Fig 21-50-1 sheet 2 PDF p. 520)", () => {
  const placed = (p: (typeof CAT.parts)[number]) => {
    const g = p.geo();
    g.applyMatrix4(
      new Matrix4().compose(
        toV(p.pos ?? [0, 0, 0]),
        new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
        toV(p.scale ?? [1, 1, 1]),
      ),
    );
    if (p.parent) {
      const c = CYLS.find((c) => p.parent === `cyl:${c.n}`);
      expect(c, `known parent for ${p.name}`).toBeDefined();
      g.translate(...cylOrigin(c!));
    }
    g.computeBoundingBox();
    const solid = { name: p.name ?? "unnamed part", faces: triangles(g), box: g.boundingBox!.clone() };
    g.dispose();
    return solid;
  };
  const engineBay = (b: Box3) => b.max.x > FW;
  const compressor = placed(CAT.parts.find((p) => p.name === "A/C compressor")!);
  // the hoses connect at the firewall (AMM 21-50 PDF p. 501): it is their pass-through, not an obstacle
  // moving groups other than the cylinders (propeller, nose gear, controls) are placed at runtime, away from the
  // aft engine bay; the cylinder parts are placed through cylOrigin
  const solids = CAT.parts
    .filter((p) => p.name !== "A/C compressor" && !p.name?.startsWith("Firewall"))
    .filter((p) => !p.parent || p.parent.startsWith("cyl:"))
    .map(placed)
    .filter((s) => engineBay(s.box));
  const hoses: Solid[] = [];
  for (const f of FLOWS.filter((f) => f.tube !== false)) {
    const curve = curveOf(f.pts, f.tension ?? 0.3);
    const g = new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false);
    g.computeBoundingBox();
    const tube = { name: f.key, faces: triangles(g), box: g.boundingBox!.clone() };
    g.dispose();
    if (f.key !== "acDischarge" && f.key !== "acSuction") {
      if (engineBay(tube.box)) solids.push(tube);
      continue;
    }
    // forward of the firewall and outside the compressor body the hose ends in
    const run = tube.faces.filter(
      ({ box }) => box.min.x > FW && !compressor.box.clone().expandByScalar(margin).intersectsBox(box),
    );
    expect(run.length, f.key).toBeGreaterThan(0);
    const verts = run.flatMap(({ triangle: t }) => [t.a, t.b, t.c]);
    expect(
      verts.filter((v) => !inFus(v)),
      `${f.key} inside the cowl`,
    ).toEqual([]);
    hoses.push({ name: f.key, faces: run, box: new Box3().setFromPoints(verts) });
  }
  expect(hoses.map((h) => h.name).sort()).toEqual(["acDischarge", "acSuction"]);
  const hits: string[] = [];
  const check = (a: Solid, b: Solid, contained: "mutual" | "first" | "none") => {
    const gap = gapBetween(a, b, contained);
    if (gap < margin - 1e-7) hits.push(`${a.name} / ${b.name}: ${(gap * 1000).toFixed(2)} mm`);
  };
  for (const s of solids) {
    check(compressor, s, "mutual");
    for (const h of hoses) check(h, s, "first");
  }
  check(hoses[0], hoses[1], "none");
  expect(hits).toEqual([]);
}, 60000);

it("the hose clearance audit catches a hose wholly enclosed in a larger solid", () => {
  const solidOf = (name: string, g: BufferGeometry): Solid => {
    g.computeBoundingBox();
    const solid = { name, faces: triangles(g), box: g.boundingBox!.clone() };
    g.dispose();
    return solid;
  };
  const block = solidOf("block", new BoxGeometry(0.2, 0.2, 0.2));
  const hose = (x: number) =>
    solidOf(
      "hose",
      new TubeGeometry(
        curveOf(
          [
            [x - 0.03, 0, 0],
            [x, 0.01, 0],
            [x + 0.03, 0, 0],
          ],
          0.3,
        ),
        24,
        0.012,
        6,
        false,
      ),
    );
  // every surface of the enclosed hose is more than 5 mm from the block's faces
  expect(gapBetween(hose(0), block, "none")).toBeGreaterThan(margin);
  expect(gapBetween(hose(0), block, "first")).toBe(0);
  expect(gapBetween(hose(0.3), block, "first")).toBeGreaterThan(margin);
});

it("the moved exhaust runs and the ignition leads clear the turbo and wastegate oil lines by 5 mm (AMM 79-00 PDF p. 2764; Figs 74-20-1 PDF p. 2624, 78-10-2 PDF p. 2740, 79-30-2 sheet 3 PDF p. 2787)", () => {
  const placed = (p: (typeof CAT.parts)[number]): Solid => {
    const g = p.geo();
    g.applyMatrix4(
      new Matrix4().compose(
        toV(p.pos ?? [0, 0, 0]),
        new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
        toV(p.scale ?? [1, 1, 1]),
      ),
    );
    g.computeBoundingBox();
    const solid: Solid = { name: `${p.name} @${p.pos ?? "world"}`, faces: triangles(g), box: g.boundingBox!.clone() };
    g.dispose();
    return solid;
  };
  // The left magneto's lower leads run beside the wastegate oil line.
  const leads = CAT.parts.filter((p) => p.name?.startsWith("Ignition lead — ") && !p.parent).map(placed);
  const exhaust = CAT.parts
    .filter((p) =>
      /^(Turbocharger transition|Exhaust crossover pipe|Exhaust tie rod|Wastegate transition|Wastegate bypass pipe|Turbine inlet flange|Turbine housing inlet neck|Turbine discharge neck|Tailpipe|Turbocharger \/ tailpipe clamp|TIT probe — [LR]H)$/.test(
        p.name ?? "",
      ),
    )
    .map(placed);
  // The wastegate oil line and the bypass pipe both terminate in the wastegate body (POH 7-38; AMM 81-20 PDF p. 2812):
  // that body is the gate line's documented host, so its run is audited outside it.
  const wastegate = CAT.parts.find((p) => p.name === "Wastegate")!;
  const gate = wastegate.geo().translate(...wastegate.pos!);
  gate.computeBoundingBox();
  const host = gate.boundingBox!.clone().expandByScalar(margin);
  gate.dispose();
  const oil = FLOWS.filter((f) => /^(turboOil[LR]|turboScav[LR]|gateOil)$/.test(f.key)).map((f) => {
    const curve = curveOf(f.pts, f.tension ?? 0.3);
    const g = new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false);
    g.computeBoundingBox();
    const faces = triangles(g).filter(({ box }) => f.key !== "gateOil" || !host.intersectsBox(box));
    const tube: Solid = { name: f.key, faces, box: g.boundingBox!.clone() };
    g.dispose();
    return tube;
  });
  expect(oil.map((o) => o.name).sort()).toEqual(["gateOil", "turboOilL", "turboOilR", "turboScavL", "turboScavR"]);
  expect(exhaust).toHaveLength(18);
  expect(leads).toHaveLength(12);
  const hits: string[] = [];
  for (const o of oil)
    for (const e of [...exhaust, ...leads]) {
      const gap = gapBetween(o, e, "first");
      if (gap < margin - 1e-7) hits.push(`${o.name} / ${e.name}: ${(gap * 1000).toFixed(2)} mm`);
    }
  expect(hits).toEqual([]);
}, 60000);
