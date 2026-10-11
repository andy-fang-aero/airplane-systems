/**
 * The re-anchored turbo group (Continental M-18 Fig 5-33 / 5-35; AMM Fig 81-20-1 PDF 2815) crosses no
 * catalogue solid and no rendered flow tube except its physical attachments.
 */
import { describe, expect, it } from "vitest";
import {
  TubeGeometry,
  DoubleSide,
  Euler,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Raycaster,
  Vector3,
} from "three";
import { curveOf } from "@/lib/geometry";
import { FLOWS } from "@/aircraft/sr22t/flows";
import type { PartSpec } from "@/lib/catalogue";
import { CAT, CYLS } from "@/aircraft/sr22t/parts";
import { cylOrigin } from "@/aircraft/sr22t/parts/engine";

const material = new MeshBasicMaterial({ side: DoubleSide });
const solid = (p: PartSpec) => {
  const g = p.geo();
  g.applyMatrix4(
    new Matrix4().compose(
      new Vector3(...(p.pos ?? [0, 0, 0])),
      new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
      new Vector3(...(p.scale ?? [1, 1, 1])),
    ),
  );
  const c = CYLS.find((c) => p.parent === `cyl:${c.n}`);
  if (c) g.translate(...cylOrigin(c));
  g.computeBoundingBox();
  return { p, g, box: g.boundingBox!.clone(), mesh: new Mesh(g, material) };
};
type Solid = ReturnType<typeof solid>;
// Triangle edges against the other mesh in both directions, plus containment, as in the ignition clearance audit.
const edgeCrosses = (a: Solid, b: Solid) => {
  const position = a.g.getAttribute("position"),
    index = a.g.index;
  const count = index?.count ?? position.count;
  const ray = new Raycaster(),
    start = new Vector3(),
    end = new Vector3();
  for (let i = 0; i < count; i += 3)
    for (let j = 0; j < 3; j++) {
      start.fromBufferAttribute(position, index ? index.getX(i + j) : i + j);
      end.fromBufferAttribute(position, index ? index.getX(i + ((j + 1) % 3)) : i + ((j + 1) % 3));
      const direction = end.clone().sub(start),
        length = direction.length();
      if (length < 0.00001) continue;
      ray.set(start, direction.normalize());
      ray.near = 0.00001;
      ray.far = length - 0.00001;
      if (ray.intersectObject(b.mesh).length) return true;
    }
  return false;
};
const inside = (point: Vector3, s: Solid) => {
  if (!s.box.containsPoint(point)) return false;
  const hits = new Raycaster(point, new Vector3(0.137, 0.419, 1).normalize(), 0).intersectObject(s.mesh);
  if (hits.some((h) => h.distance < 0.00001)) return false;
  const exits = hits.filter((h, i) => i === 0 || Math.abs(h.distance - hits[i - 1].distance) > 0.00001);
  return exits.length % 2 === 1;
};
const intersects = (a: Solid, b: Solid) => {
  if (!a.box.clone().expandByScalar(-0.00001).intersectsBox(b.box.clone().expandByScalar(-0.00001))) return false;
  return (
    edgeCrosses(a, b) ||
    edgeCrosses(b, a) ||
    inside(new Vector3().fromBufferAttribute(a.g.getAttribute("position"), 0), b) ||
    inside(new Vector3().fromBufferAttribute(b.g.getAttribute("position"), 0), a)
  );
};
const side = (s: Solid) => Math.sign(s.p.pos?.[2] ?? s.box.getCenter(new Vector3()).z);
const L = (s: number) => (s < 0 ? "L" : "R");

/** Physical attachments of each turbo-group part (AMM Figs 81-20-1, 71-60-2, 78-10-2, 78-20-4, 77-20-3). */
const attached = (a: Solid, b: Solid) => {
  const name = a.p.name!,
    other = b.p.name ?? "",
    s = side(a),
    same = side(b) === s;
  const bank = CYLS.filter((c) => c.s === s).map((c) => `flow exh${c.n}`);
  if (/^(LH|RH) turbocharger$/.test(name))
    return (
      (same &&
        ["Turbine housing inlet neck", `${s < 0 ? "LH" : "RH"} turbo oil reservoir`, "Turbine discharge neck"].includes(
          other,
        )) ||
      other === `flow turboOil${L(s)}`
    );
  if (/turbo oil reservoir$/.test(name))
    return other === `${s < 0 ? "LH" : "RH"} turbocharger` || other === `flow turboScav${L(s)}`;
  if (name === "Air box / induction filter")
    return (
      (same && ["Air box / compressor clamp", "Alternate air duct"].includes(other)) || other === `flow altAir${L(s)}`
    );
  if (name === "Compressor inlet neck") return same && other === "Air box / compressor clamp";
  if (name === "Air box / compressor clamp")
    return same && ["Compressor inlet neck", "Air box / induction filter"].includes(other);
  if (name === "Turbine housing inlet neck") return same && other === `${s < 0 ? "LH" : "RH"} turbocharger`;
  if (/^TIT probe — [LR]H$/.test(name))
    return (same && ["Turbocharger transition", "Turbine inlet flange"].includes(other)) || bank.includes(other);
  if (name === "Wastegate")
    return ["Wastegate actuator", "Wastegate bypass pipe", "flow gateOil", "flow gateBypass"].includes(other);
  if (name === "Wastegate actuator") return ["Wastegate", "flow gateOil"].includes(other);
  if (name === "Wastegate transition")
    return ["Exhaust crossover pipe", "Wastegate bypass pipe", "flow crossover", "flow gateBypass"].includes(other);
  return false;
};
const OWNED =
  /^(LH turbocharger|RH turbocharger|Air box \/ induction filter|Compressor inlet neck|Air box \/ compressor clamp|LH turbo oil reservoir|RH turbo oil reservoir|Wastegate|Wastegate actuator|Wastegate transition|Turbine housing inlet neck|TIT probe — [LR]H)$/;

describe("Turbo group clearance", () => {
  it("turbos, air boxes, inlets, reservoirs, wastegate and TIT cross no solid or rendered flow except their attachments", () => {
    const all = CAT.parts.map(solid);
    const flows = FLOWS.filter((f) => f.tube !== false).map((f) => {
      const curve = curveOf(f.pts, f.tension ?? 0.3);
      return solid({
        id: f.key,
        sys: f.sys,
        name: `flow ${f.key}`,
        geo: () => new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false),
      });
    });
    try {
      const owned = all.filter((s) => OWNED.test(s.p.name ?? ""));
      expect(owned).toHaveLength(17);
      const others = [...all.filter((s) => !OWNED.test(s.p.name ?? "")), ...flows];
      // The neighbours the move once collided with stay in the audit.
      for (const name of [
        "Mixing chamber",
        "Hot-air valve",
        "Oil separator breather hose",
        "Engine mount isolator",
        "flow freshIn",
        "flow hotIn",
      ])
        expect(others.some((s) => s.p.name === name)).toBe(true);
      const hits: string[] = [];
      for (const a of owned)
        for (const b of [...others, ...owned.filter((o) => o !== a)])
          if (!attached(a, b) && intersects(a, b))
            hits.push(`${a.p.name} ${a.p.pos} vs ${b.p.name ?? b.p.id} ${b.box.min.toArray()}..${b.box.max.toArray()}`);
      expect(hits).toEqual([]);
    } finally {
      for (const s of [...all, ...flows]) s.g.dispose();
    }
  }, 120000);
});
