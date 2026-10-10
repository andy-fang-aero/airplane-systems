// Original clearance audits moved intact; geometry and tolerances are unchanged.
import { ACCESSORY_FACE_X } from "@/aircraft/sr22t/engine-datum";
import { describe, expect, it } from "vitest";
import {
  Box3,
  TubeGeometry,
  Triangle,
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
import { HARNESS_CAP, IGNITION_LEADS } from "@/aircraft/sr22t/parts/engine-ignition";
import { IGNITION_SWITCH } from "@/aircraft/sr22t/parts/catalogue";
import { cylOrigin } from "@/aircraft/sr22t/parts/engine";
import { HOT_VALVE } from "@/aircraft/sr22t/parts/environment";
import { MeshBVH } from "three-mesh-bvh";

// The installed BVH supports indirect indexing; its older declarations omit that option.
const BVH_OPTIONS = { indirect: true, setBoundingBox: true };
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
  let bvh: MeshBVH | undefined;
  return {
    p,
    g,
    box: g.boundingBox!.clone(),
    mesh: new Mesh(g, material),
    get bvh() {
      return (bvh ??= new MeshBVH(g, BVH_OPTIONS));
    },
  };
};

// A tube's whole AABB covers empty space between its bends. Test actual triangle
// edges in both directions, rather than treating that entire space as solid.
// Indexed queries visit the same rendered triangles as Raycaster.
// Indirect indexing preserves the original vertex/face order; both use DoubleSide
// and the original near/far limits. No centreline approximation or fewer samples.
const edgeCrosses = (a: ReturnType<typeof solid>, b: ReturnType<typeof solid>) => {
  const position = a.g.getAttribute("position"),
    index = a.g.index;
  const count = index?.count ?? position.count;
  const ray = new Raycaster(),
    start = new Vector3(),
    end = new Vector3(),
    edgeBox = new Box3();
  for (let i = 0; i < count; i += 3) {
    for (let j = 0; j < 3; j++) {
      start.fromBufferAttribute(position, index ? index.getX(i + j) : i + j);
      end.fromBufferAttribute(position, index ? index.getX(i + ((j + 1) % 3)) : i + ((j + 1) % 3));
      // An edge lies entirely in its endpoint AABB: a disjoint target cannot be hit.
      if (!edgeBox.setFromPoints([start, end]).intersectsBox(b.box)) continue;
      const direction = end.clone().sub(start),
        length = direction.length();
      if (length < 0.00001) continue;
      ray.set(start, direction.normalize());
      ray.near = 0.00001;
      ray.far = length - 0.00001;
      if (b.bvh.raycast(ray.ray, DoubleSide, ray.near, ray.far).length) return true;
    }
  }
  return false;
};

// Also catch complete containment (closed solids have an odd number of exits).
const inside = (point: Vector3, s: ReturnType<typeof solid>) => {
  if (!s.box.containsPoint(point)) return false;
  const hits = new Raycaster(point, new Vector3(0.137, 0.419, 1).normalize(), 0).intersectObject(s.mesh);
  if (hits.some((h) => h.distance < 0.00001)) return false;
  const exits = hits.filter((h, i) => i === 0 || Math.abs(h.distance - hits[i - 1].distance) > 0.00001);
  return exits.length % 2 === 1;
};
const intersects = (a: ReturnType<typeof solid>, b: ReturnType<typeof solid>) => {
  if (!a.box.clone().expandByScalar(-0.00001).intersectsBox(b.box.clone().expandByScalar(-0.00001))) return false;
  return (
    edgeCrosses(a, b) ||
    edgeCrosses(b, a) ||
    inside(new Vector3().fromBufferAttribute(a.g.getAttribute("position"), 0), b) ||
    inside(new Vector3().fromBufferAttribute(b.g.getAttribute("position"), 0), a)
  );
};

const ignitionName = (p: PartSpec) =>
  /^(Ignition lead|Spark plug|Plug lead terminal|Harness cap|Harness clamp|Magneto P-lead|Magneto ground wire|Engine ground lug)/.test(
    p.name ?? "",
  );
export const auditIgnition1 = () => {
  describe("Ignition solid clearance (AMM Fig 74-20-1 PDF 2624; illustrative routing)", () => {
    it("audits the rendered ignition hardware against every catalogue solid and every rendered flow tube", () => {
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
      const owned = all.filter((s) => ignitionName(s.p));
      const others = [...all.filter((s) => !ignitionName(s.p)), ...flows];
      // Explicit integration coverage: the physical turbine housings, probe and header transition.
      for (const name of ["RH turbocharger", "LH turbocharger"])
        expect(others.filter((s) => s.p.name === name)).toHaveLength(1);
      for (const name of ["TIT probe — LH", "TIT probe — RH"])
        expect(others.filter((s) => s.p.name === name)).toHaveLength(1);
      expect(others.filter((s) => s.p.name === "Turbocharger transition")).toHaveLength(2);
      expect(flows.filter((s) => /^flow exh[1-6]$/.test(s.p.name!))).toHaveLength(6);
      // the aft A/C compressor over the left magneto and its two hoses share the harness corridors.
      expect(others.filter((s) => s.p.name === "A/C compressor")).toHaveLength(1);
      expect(flows.filter((s) => /^flow ac(Suction|Discharge)$/.test(s.p.name!))).toHaveLength(2);
      // the manifold-valve drain runs aft over the intake manifold under the right-to-left upper bundle.
      expect(flows.filter((s) => s.p.name === "flow fuelDrainSpider")).toHaveLength(1);
      const switchIndex = CAT.parts.findIndex((p) => p.name === "Ignition key switch");
      const switchBezel = CAT.parts[switchIndex - 1];
      expect(new Vector3(...switchBezel.pos!).distanceTo(new Vector3(...IGNITION_SWITCH))).toBeCloseTo(0.01, 6);
      const hits: string[] = [];
      try {
        for (const a of owned)
          for (const b of others) {
            const name = a.p.name!,
              other = b.p.name ?? b.p.id;
            // Physical attachments, not clearance exceptions for adjacent equipment.
            if (name.startsWith("Spark plug") && a.p.parent === b.p.parent && other.startsWith("Cylinder head"))
              continue;
            const side = name.startsWith("Harness cap")
              ? Math.sign(a.p.pos![2])
              : a.p.note?.startsWith("Right")
                ? 1
                : -1;
            if (
              (name.startsWith("Harness cap") || name === "Magneto P-lead" || name === "Magneto ground wire") &&
              other === (side === 1 ? "Right magneto" : "Left magneto")
            )
              continue;
            if (name === "Magneto P-lead" && b.p === switchBezel) continue;
            if (name === "Magneto P-lead" && /^(Firewall|Instrument panel|Ignition key switch)/.test(other)) continue;
            if ((name === "Engine ground lug" || name === "Magneto ground wire") && other === "Continental TSIO-550-K")
              continue;
            if (intersects(a, b))
              hits.push(
                `${name} ${a.p.note?.match(/cylinder \d (?:upper|lower)/i)?.[0] ?? a.p.pos} vs ${other} ${b.box.min.toArray()}..${b.box.max.toArray()}`,
              );
          }
        for (const a of owned.filter((s) => /^(Ignition lead|Magneto P-lead|Magneto ground wire)/.test(s.p.name!))) {
          const lead = IGNITION_LEADS.find((l) =>
            a.p.note?.includes(`cylinder ${l.cyl} ${l.pos === "U" ? "upper" : "lower"} plug`),
          );
          for (const b of owned.filter((s) => s.p.name?.startsWith("Harness cap"))) {
            if (lead && b.p.name === "Harness cap" && b.p.pos![2] === HARNESS_CAP(lead.mag)[2]) continue;
            if (
              lead &&
              b.p.name === `Harness cap terminal ${lead.terminal}` &&
              Math.sign(b.p.pos![2]) === (lead.mag === "R" ? 1 : -1)
            )
              continue;
            if (intersects(a, b)) hits.push(`${a.p.name} ${a.p.note} vs ${b.p.name} ${b.p.pos}`);
          }
        }
        expect(hits).toEqual([]);
      } finally {
        for (const s of [...all, ...flows]) s.g.dispose();
      }
    }, 30000);
  });
};
export const auditIgnition2 = () => {
  describe("Ignition solid clearance (AMM Fig 74-20-1 PDF 2624; illustrative routing)", () => {
    it("lower cylinder 2/3 hardware has 5 mm sampled surface margin from merged exhaust/turbos (AMM Figs 74-20-1 PDF 2624, 78-10-2 PDF 2740, 81-20-1 PDF 2815; illustrative margin)", () => {
      const hot = CAT.parts
        .filter((p) =>
          /^(?:[RL]H turbocharger|TIT probe|Turbocharger transition|Cylinder exhaust riser|Elbow riser|Exhaust tee|Exhaust header|Exhaust crossover|Crossover|Tailpipe)/.test(
            p.name ?? "",
          ),
        )
        .map(solid);
      for (const f of FLOWS.filter((f) => /^exh[1-6]$/.test(f.key))) {
        const curve = curveOf(f.pts, f.tension ?? 0.3);
        hot.push(
          solid({
            id: f.key,
            sys: f.sys,
            name: f.key,
            geo: () =>
              new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false),
          }),
        );
      }
      const hardware = CAT.parts
        .filter(
          (p) =>
            /^(Spark plug|Plug lead terminal|Ignition lead)/.test(p.name ?? "") &&
            /cyl(?:inder)? [23] lower/i.test(`${p.name} ${p.note}`),
        )
        .map(solid);
      expect(hardware).toHaveLength(6);
      const triangle = new Triangle(),
        nearest = new Vector3(),
        point = new Vector3(),
        triangleBox = new Box3();
      try {
        for (const a of hardware) {
          const vertices = a.g.getAttribute("position");
          let gap = Infinity,
            nearestPart = "";
          for (const b of hot) {
            if (
              a.box.distanceToPoint(b.box.getCenter(new Vector3())) >
              b.box.getSize(new Vector3()).length() / 2 + 0.04
            )
              continue;
            const positions = b.g.getAttribute("position"),
              indices = b.g.index,
              count = indices?.count ?? positions.count;
            for (let j = 0; j < count; j += 3) {
              triangle.a.fromBufferAttribute(positions, indices ? indices.getX(j) : j);
              triangle.b.fromBufferAttribute(positions, indices ? indices.getX(j + 1) : j + 1);
              triangle.c.fromBufferAttribute(positions, indices ? indices.getX(j + 2) : j + 2);
              triangleBox.setFromPoints([triangle.a, triangle.b, triangle.c]);
              for (let i = 0; i < vertices.count; i++) {
                point.fromBufferAttribute(vertices, i);
                // Triangle subset of AABB: its distance cannot beat this lower bound.
                if (triangleBox.distanceToPoint(point) > gap) continue;
                triangle.closestPointToPoint(point, nearest);
                const d = point.distanceTo(nearest);
                if (d < gap) {
                  gap = d;
                  nearestPart = `${b.p.name} at ${point.toArray()} nearest ${nearest.toArray()}`;
                }
              }
            }
          }
          expect(gap, `${a.p.name}: ${a.p.note}; ${nearestPart}`).toBeGreaterThanOrEqual(0.005);
        }
      } finally {
        for (const s of [...hot, ...hardware]) s.g.dispose();
      }
    }, 30000);
  });
};
export const auditIgnition3 = () => {
  describe("Ignition solid clearance (AMM Fig 74-20-1 PDF 2624; illustrative routing)", () => {
    it("lower cylinder 2/5 hardware clears the heat duct and ALT 2 cable by 5 mm (AMM Figs 74-20-1 PDF 2624, 21-40-2 PDF 486; illustrative routing)", () => {
      // The duct leaves the RH intercooler's rear port aft of the accessory face, aft of the cylinder banks.
      expect((FLOWS.find((f) => f.key === "hotIn")!.pts[1] as [number, number, number])[0]).toBeLessThan(
        ACCESSORY_FACE_X,
      );
      const hot: ReturnType<typeof solid>[] = [];
      for (const f of FLOWS.filter((f) => ["hotIn", "alt2"].includes(f.key))) {
        const curve = curveOf(f.pts, f.tension ?? 0.3);
        hot.push(
          solid({
            id: f.key,
            sys: f.sys,
            name: f.key,
            geo: () =>
              new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false),
          }),
        );
      }
      const hardware = CAT.parts
        .filter(
          (p) =>
            /^(Spark plug|Plug lead terminal|Ignition lead)/.test(p.name ?? "") &&
            /cyl(?:inder)? [25] lower/i.test(`${p.name} ${p.note}`),
        )
        .map(solid);
      expect(hardware).toHaveLength(6);
      const triangle = new Triangle(),
        nearest = new Vector3(),
        point = new Vector3(),
        triangleBox = new Box3();
      try {
        for (const a of hardware) {
          const vertices = a.g.getAttribute("position");
          let gap = Infinity,
            nearestPart = "";
          for (const b of hot) {
            if (
              a.box.distanceToPoint(b.box.getCenter(new Vector3())) >
              b.box.getSize(new Vector3()).length() / 2 + 0.04
            )
              continue;
            const positions = b.g.getAttribute("position"),
              indices = b.g.index,
              count = indices?.count ?? positions.count;
            for (let j = 0; j < count; j += 3) {
              triangle.a.fromBufferAttribute(positions, indices ? indices.getX(j) : j);
              triangle.b.fromBufferAttribute(positions, indices ? indices.getX(j + 1) : j + 1);
              triangle.c.fromBufferAttribute(positions, indices ? indices.getX(j + 2) : j + 2);
              triangleBox.setFromPoints([triangle.a, triangle.b, triangle.c]);
              for (let i = 0; i < vertices.count; i++) {
                point.fromBufferAttribute(vertices, i);
                // Triangle subset of AABB: its distance cannot beat this lower bound.
                if (triangleBox.distanceToPoint(point) > gap) continue;
                triangle.closestPointToPoint(point, nearest);
                const d = point.distanceTo(nearest);
                if (d < gap) {
                  gap = d;
                  nearestPart = `${b.p.name} at ${point.toArray()} nearest ${nearest.toArray()}`;
                }
              }
            }
          }
          expect(gap, `${a.p.name}: ${a.p.note}; ${nearestPart}`).toBeGreaterThanOrEqual(0.005);
        }
      } finally {
        for (const s of [...hot, ...hardware]) s.g.dispose();
      }
    }, 30000);
  });
};
export const auditFerrules = () => {
  describe("Ignition leads meet their plugs at the ferrule's outer end (AMM 74-20 PDF p. 2622; Fig 74-20-1 Detail B PDF p. 2624)", () => {
    it("no rendered lead enters a spark plug or plug lead terminal, except its own ferrule from the outer end", () => {
      const LEAD_R = 0.005;
      // Vertical coaxial envelopes taken from the rendered plug and ferrule meshes.
      const envelope = (p: PartSpec) => {
        const s = solid(p);
        s.g.dispose();
        const centre = s.box.getCenter(new Vector3());
        return {
          p,
          x: centre.x,
          z: centre.z,
          r: Math.max(s.box.max.x - centre.x, s.box.max.z - centre.z),
          y0: s.box.min.y,
          y1: s.box.max.y,
        };
      };
      const plugs = CAT.parts.filter((p) => p.name?.startsWith("Spark plug")).map(envelope);
      const terminals = CAT.parts.filter((p) => p.name === "Plug lead terminal").map(envelope);
      const leadParts = CAT.parts.filter((p) => p.name?.startsWith("Ignition lead — "));
      expect(plugs).toHaveLength(12);
      expect(terminals).toHaveLength(12);
      expect(leadParts).toHaveLength(12);
      const hits: string[] = [];
      for (const l of IGNITION_LEADS) {
        const which = `cylinder ${l.cyl} ${l.pos === "U" ? "upper" : "lower"}`;
        const part = leadParts.find((p) => p.note?.includes(`${which} plug`))!;
        const ownPlug = plugs.find(
          (e) => e.p.name === `Spark plug — cyl ${l.cyl} ${l.pos === "U" ? "upper" : "lower"}`,
        )!;
        const ownTerminal = terminals.find((e) => e.p.note?.toLowerCase().startsWith(`${which} `))!;
        const out = l.pos === "U" ? 1 : -1;
        // The barrel's outer end, where the ferrule seats.
        const barrelEnd = out === 1 ? ownPlug.y1 : ownPlug.y0;
        const g = part.geo() as TubeGeometry;
        try {
          const path = g.parameters.path;
          const samples = Math.ceil(path.getLength() / 0.0005);
          for (let i = 0; i <= samples; i++) {
            const at = path.getPointAt(i / samples);
            const inside = [...plugs, ...terminals].find((e) => {
              const radial = Math.hypot(at.x - e.x, at.z - e.z);
              if (radial >= e.r + LEAD_R || at.y <= e.y0 - LEAD_R || at.y >= e.y1 + LEAD_R) return false;
              // The one permitted entry: on its own plug's axis, outward of the barrel, into its own ferrule.
              return !((e === ownTerminal || e === ownPlug) && radial < 1e-6 && (at.y - barrelEnd) * out > 1e-9);
            });
            if (inside) {
              hits.push(
                `${which} lead at ${at.toArray().map((v) => v.toFixed(3))} in ${inside.p.name} ${inside.p.pos}`,
              );
              break;
            }
          }
        } finally {
          g.dispose();
        }
      }
      expect(hits).toEqual([]);
    });
  });
};
const flowSolid = (f: (typeof FLOWS)[number]) => {
  const curve = curveOf(f.pts, f.tension ?? 0.3);
  return solid({
    id: f.key,
    sys: f.sys,
    name: `flow ${f.key}`,
    geo: () => new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false),
  });
};
// Smallest distance from any vertex of `a` to any triangle of `b`.
const sampledGap = (a: ReturnType<typeof solid>, b: ReturnType<typeof solid>) => {
  const triangle = new Triangle(),
    nearest = new Vector3(),
    point = new Vector3(),
    triangleBox = new Box3(),
    vertices = a.g.getAttribute("position"),
    positions = b.g.getAttribute("position"),
    indices = b.g.index,
    count = indices?.count ?? positions.count;
  let gap = Infinity;
  for (let j = 0; j < count; j += 3) {
    triangle.a.fromBufferAttribute(positions, indices ? indices.getX(j) : j);
    triangle.b.fromBufferAttribute(positions, indices ? indices.getX(j + 1) : j + 1);
    triangle.c.fromBufferAttribute(positions, indices ? indices.getX(j + 2) : j + 2);
    triangleBox.setFromPoints([triangle.a, triangle.b, triangle.c]);
    for (let i = 0; i < vertices.count; i++) {
      point.fromBufferAttribute(vertices, i);
      if (triangleBox.distanceToPoint(point) > gap) continue;
      gap = Math.min(gap, point.distanceTo(triangle.closestPointToPoint(point, nearest)));
    }
  }
  return gap;
};
// The heat duct's physical attachments: RH intercooler rear port, heat-exchanger shroud on the crossover, hot-air valve
// on the mixing chamber.
const HEAT_DUCT_ATTACHED =
  /^(RH intercooler|Exhaust crossover \/ heat exchanger|Exhaust crossover pipe|Alternate air blast tube|Hot-air valve|Mixing chamber|flow (?:crossover|hotL|hot))$/;
export const auditHeatDuct = () => {
  describe("Heat duct clearance (POH 7-64; AMM Fig 21-40-2 PDF p. 486; illustrative routing)", () => {
    it("the rendered heat duct crosses no catalogue solid or rendered flow except its physical attachments", () => {
      const duct = flowSolid(FLOWS.find((f) => f.key === "hotIn")!);
      const all = CAT.parts.map(solid);
      const flows = FLOWS.filter((f) => f.tube !== false && f.key !== "hotIn").map(flowSolid);
      try {
        const others = [...all, ...flows];
        // the solids the forced bend once crossed must stay in the audit
        for (const name of ["flow altAirR", "flow fuelDrainCyl5", "Cylinder head 5", "RH turbocharger"])
          expect(others.filter((s) => s.p.name === name)).toHaveLength(1);
        for (const name of ["Alternate air duct", "Air box / induction filter"])
          expect(others.filter((s) => s.p.name === name)).toHaveLength(2);
        const hits = others
          .filter(
            (b) =>
              !HEAT_DUCT_ATTACHED.test(b.p.name ?? "") &&
              // the hot-air valve's unnamed plate, which the duct ends in
              !(b.p.name === undefined && b.p.pos?.join() === HOT_VALVE.join()) &&
              intersects(duct, b),
          )
          .map((b) => `${b.p.name ?? b.p.id} ${b.box.min.toArray()}..${b.box.max.toArray()}`);
        expect(hits).toEqual([]);
      } finally {
        for (const s of [duct, ...all, ...flows]) s.g.dispose();
      }
    }, 30000);
    it("the heat duct keeps 5 mm sampled margin from the alternate air tube and duct, cylinder 5 fuel drain and lower ignition hardware", () => {
      const duct = flowSolid(FLOWS.find((f) => f.key === "hotIn")!);
      const near = [
        ...CAT.parts
          .filter(
            (p) =>
              (p.name === "Alternate air duct" && p.pos === undefined && /RH/.test(p.note ?? "")) ||
              (/^(Spark plug|Plug lead terminal|Ignition lead)/.test(p.name ?? "") &&
                /cyl(?:inder)? 5 lower/i.test(`${p.name} ${p.note}`)),
          )
          .map(solid),
        ...FLOWS.filter((f) => ["altAirR", "fuelDrainCyl5"].includes(f.key)).map(flowSolid),
      ];
      try {
        expect(near.map((s) => s.p.name).sort()).toEqual(
          [
            "Alternate air duct",
            "Ignition lead — right magneto",
            "Plug lead terminal",
            "Spark plug — cyl 5 lower",
            "flow altAirR",
            "flow fuelDrainCyl5",
          ].sort(),
        );
        for (const b of near) expect(sampledGap(duct, b), b.p.name).toBeGreaterThanOrEqual(0.005);
      } finally {
        for (const s of [duct, ...near]) s.g.dispose();
      }
    }, 30000);
  });
};

export { solid as ignitionSolid, intersects as ignitionIntersects, sampledGap };
