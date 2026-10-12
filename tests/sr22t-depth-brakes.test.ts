/** POH 13772-007 7-25–7-26; AMM 13773-002 Rev 7 32-42, Figs 32-42-1–5. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  CAT,
  MG,
  NOSE_GEAR,
  NOSE_CASTER,
  PROP,
  CYLS,
  YOKES,
  YOKE_X,
  YOKE_Y,
  PARK_SHEATH,
  parkWire,
  PARK_CLEVIS,
} from "@/aircraft/sr22t/parts";
import { FW, inFus, wingP, wLE, wC, WR, WTIP, doorHinge, type DoorKey } from "@/aircraft/sr22t/geometry";
import { ETT, CARR, AIL_SECTOR, RUD_HORN, PULLEYS } from "@/aircraft/sr22t/rig";
import type { PartSpec } from "@/lib/catalogue";

const parts = (name: string) => CAT.parts.filter((p) => p.name === name);
const sidePart = (name: string, s: number) => parts(name).find((p) => Math.sign(p.pos![2]) === s)!;
const position = (p: PartSpec) => new THREE.Vector3(...p.pos!);
const curve = (p: PartSpec) => {
  const geo = p.geo() as THREE.TubeGeometry;
  const path = geo.parameters.path;
  geo.dispose();
  return path;
};
const near = (path: THREE.Curve<THREE.Vector3>, point: THREE.Vector3) =>
  Math.min(...Array.from({ length: 2001 }, (_, i) => path.getPoint(i / 2000).distanceTo(point)));

describe("SR22T brake hardware", () => {
  it("each main wheel has a single disc and a fixed dual-piston caliper (POH 7-25)", () => {
    expect(parts("Disc brake")).toHaveLength(0);
    for (const s of [-1, 1]) {
      for (const name of ["Brake disc", "Brake caliper", "Brake torque plate"]) {
        const side = parts(name).filter((p) => Math.sign(p.pos![2]) === s);
        expect(side).toHaveLength(1);
        expect(side[0].parent).toBeUndefined();
      }
      expect(sidePart("Brake disc", s).anim).toBeUndefined();
      expect(sidePart("Brake caliper", s).anim).toBeTypeOf("function");
      expect(Math.abs(sidePart("Brake caliper", s).pos![2])).toBeLessThan(MG.z);
      for (const name of ["Brake pad", "Brake caliper piston"]) {
        const side = parts(name).filter((p) => Math.sign(p.pos![2]) === s);
        expect(side).toHaveLength(2);
        for (const p of side) expect(p.parent).toBeUndefined();
      }
      const discZ = sidePart("Brake disc", s).pos![2];
      const padZ = parts("Brake pad")
        .filter((p) => Math.sign(p.pos![2]) === s)
        .map((p) => p.pos![2]);
      expect(Math.min(...padZ)).toBeLessThan(discZ);
      expect(Math.max(...padZ)).toBeGreaterThan(discZ);
    }
  });

  it("brake lines run master cylinder → tee → parking brake valve → caliper (POH 7-26; Fig 32-42-4)", () => {
    const valve = position(parts("Parking brake valve")[0]);
    for (const s of [-1, 1]) {
      const line = parts(`Brake line (${s > 0 ? "R" : "L"})`);
      expect(line).toHaveLength(1);
      const path = curve(line[0]);
      expect(parts("Brake elbow fitting")).toHaveLength(2);
      expect(parts("Brake union fitting")).toHaveLength(2);
      const masterPath = curve(parts(`Brake valve hose (${s > 0 ? "R" : "L"})`)[0]);
      const valvePath = curve(parts(`Brake valve line (${s > 0 ? "R" : "L"})`)[0]);
      expect(masterPath.getPoint(0).distanceTo(position(sidePart("Brake tee fitting", s)))).toBeLessThan(0.001);
      const cylinders = parts("Brake master cylinder").filter(
        (p) => (p.pos![2] === -0.36 || p.pos![2] === 0.14 ? -1 : 1) === s,
      );
      expect(cylinders).toHaveLength(2);
      const tee = position(sidePart("Brake tee fitting", s));
      expect(near(masterPath, tee)).toBeLessThan(0.05);
      expect(near(valvePath, valve)).toBeLessThan(0.05);
      expect(near(path, position(sidePart("Brake bulkhead fitting", s)))).toBeLessThan(0.05);
      const caliper = position(sidePart("Brake caliper", s));
      expect(path.getPoint(1).distanceTo(caliper)).toBeLessThan(0.05);
      for (const cylinder of cylinders) {
        const branch = parts("Brake master cylinder line").find(
          (p) => curve(p).getPoint(0).distanceTo(position(cylinder)) < 0.051,
        )!;
        expect(branch).toBeDefined();
        expect(curve(branch).getPoint(1).distanceTo(tee)).toBeLessThan(0.001);
      }
      expect(
        curve(parts("Brake hose").find((p) => Math.sign(curve(p).getPoint(1).z) === s)!)
          .getPoint(1)
          .distanceTo(caliper),
      ).toBeLessThan(0.05);
    }
  });

  it("the reservoir is on the upper RH firewall in the engine compartment (AMM 32-42 PDF 1450)", () => {
    expect(parts("Brake fluid reservoir")).toHaveLength(1);
    const reservoir = parts("Brake fluid reservoir")[0];
    expect(reservoir.pos![0]).toBeGreaterThan(FW);
    expect(reservoir.pos![2]).toBeGreaterThan(0);
    expect(reservoir.pos![1]).toBeGreaterThan(-0.14); // Existing engine centreline.
    expect(reservoir.note).toContain("MIL-PRF-87257");
    expect(parts("Brake reservoir supply line")).toHaveLength(4);
    for (const cylinder of parts("Brake master cylinder")) {
      expect(cylinder.pos![0]).toBeGreaterThan(
        parts("Rudder pedal / toe brake").find((p) => p.pos![2] === cylinder.pos![2])!.pos![0],
      );
      const supply = parts("Brake reservoir supply line").find(
        (p) => curve(p).getPoint(1).distanceTo(position(cylinder)) < 0.051,
      )!;
      expect(supply).toBeDefined();
      expect(
        curve(supply)
          .getPoint(0)
          .distanceTo(position(parts("Brake supply branch fitting")[0])),
      ).toBeLessThan(0.03);
    }
  });

  it("a temperature sensor and a temperature indicator on each brake (POH 7-25; AMM 32-42)", () => {
    expect(parts("Brake temperature sensor")).toHaveLength(2);
    expect(parts("Brake temperature indicator")).toHaveLength(2);
    for (const s of [-1, 1]) {
      const caliper = position(sidePart("Brake caliper", s));
      const sensor = sidePart("Brake temperature sensor", s);
      expect(position(sensor).distanceTo(caliper)).toBeLessThan(0.1);
      expect(sensor.note).toContain("270–293 °F");
      expect(sensor.note).toContain("above 293 °F");
      expect(sensor.note).toContain("ESS BUS 2");
      expect(sensor.note).toContain("Main Bus 2");
      const indicator = sidePart("Brake temperature indicator", s);
      expect(position(indicator).distanceTo(caliper)).toBeLessThan(0.1);
      expect(indicator.color).toBe("#FFFFFF");
      expect(indicator.anim).toBeUndefined();
      expect(indicator.note).toContain("450 °F");
      expect(indicator.note).toContain("AMM 32-42");
    }
  });

  it("the parking brake valve is at the firewall on the LH side of the outboard console rib (AMM 32-42)", () => {
    expect(parts("Parking brake valve")).toHaveLength(1);
    const valve = parts("Parking brake valve")[0];
    expect(valve.pos![0]).toBeLessThan(FW);
    expect(valve.pos![0]).toBeGreaterThan(FW - 0.3);
    expect(valve.pos![2]).toBeLessThan(0);
    const arm = position(parts("Parking brake actuation arm")[0]);
    expect(position(parts("Parking brake position sensor")[0]).distanceTo(arm)).toBeLessThan(0.05);
    expect(parts("Parking brake position sensor")[0].note).toContain("PARK BRAKE");
    const cable = curve(parts("Parking brake control cable")[0]);
    expect(cable.getPoint(0).distanceTo(position(parts("PARK BRAKE handle")[0]))).toBeLessThan(0.001);
    expect(cable.getPoint(1).distanceTo(new THREE.Vector3(...PARK_SHEATH))).toBeLessThan(1e-9);
    expect(new THREE.Vector3(...parkWire(0).at(-1)!).distanceTo(new THREE.Vector3(...PARK_CLEVIS))).toBeLessThan(0.007);
    expect(parts("PARK BRAKE handle")[0].note).toContain("POH governs");
  });
});

// Neutral-pose world transforms mirror Airplane/ControlRig without depending on live state.
const groupMatrix = (parent?: string): THREE.Matrix4 => {
  const matrix = new THREE.Matrix4();
  if (!parent || parent === "rig:pedL" || parent === "rig:pedR") return matrix;
  let origin: number[];
  if (parent === "noseGear") origin = NOSE_GEAR;
  else if (parent === "caster") origin = NOSE_GEAR.map((v, i) => v + NOSE_CASTER[i]);
  else if (parent.startsWith("blade:"))
    return matrix.makeRotationX((Number(parent.split(":")[1]) * Math.PI * 2) / 3).setPosition(...PROP);
  else if (parent.startsWith("cyl:")) {
    const c = CYLS.find((c) => c.n === Number(parent.split(":")[1]))!;
    origin = [c.x, -0.14, c.s * 0.25];
  } else if (parent.startsWith("yoke:") || parent.startsWith("grip:"))
    origin = [YOKE_X, YOKE_Y, YOKES.find((y) => y.side === parent.split(":")[1])!.z];
  else if (parent.startsWith("door:")) origin = doorHinge(parent.slice(5) as DoorKey).pivot.toArray();
  else if (parent.startsWith("surf:")) origin = CAT.surfaces.find((p) => p.key === parent.slice(5))!.pivot;
  else if (parent === "rig:ett") origin = ETT.c;
  else if (parent === "rig:ailSector") origin = AIL_SECTOR.c;
  else if (parent === "rig:rudHorn") origin = RUD_HORN.c;
  else if (parent.startsWith("rig:carr:")) origin = [CARR.x, CARR.y, parent.endsWith("L") ? -CARR.z : CARR.z];
  else if (parent.startsWith("rig:pul:")) origin = PULLEYS[parent.slice(8)].c;
  else throw new Error("Missing world transform for " + parent);
  return matrix.makeTranslation(origin[0], origin[1], origin[2]);
};
const brakeOwned = (p: PartSpec) =>
  p.name?.startsWith("Brake ") || p.name?.startsWith("Parking brake ") || p.name === "PARK BRAKE handle";

it("brake solids and plumbing clear every other world-space solid and expose their internal parts (AMM Figs 32-42-1–5, PDF 1462/1465/1469/1476/1481)", () => {
  // World boxes are broad-phase only: treating the disc bore, tire torus or open housing as full boxes would be wrong.
  // Narrow phase checks actual solids; only named landing-gear covers permit brake parts inside.
  const covers = new Set(["Wheel pant", "Main strut fairing"]);
  const faceMargin = 0.001; // Illustrative chafe clearance, AMM 32-10 PDF 1392; Figs 32-42-3/5 PDF 1469/1481.
  const ray = new THREE.Raycaster();
  const directions = [new THREE.Vector3(0.31, 0.83, 0.47).normalize(), new THREE.Vector3(-0.6, 0.2, -0.77).normalize()];
  const solids = CAT.parts.map((p) => {
    const geo = p.geo();
    const local = new THREE.Matrix4().compose(
      position({ ...p, pos: p.pos ?? [0, 0, 0] }),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
      new THREE.Vector3(...(p.scale ?? [1, 1, 1])),
    );
    const world = groupMatrix(p.parent).multiply(local);
    const path = geo instanceof THREE.TubeGeometry ? geo.parameters.path : undefined;
    const points = path ? Array.from({ length: 801 }, (_, i) => path.getPoint(i / 800).applyMatrix4(world)) : [];
    // Zero-tension Catmull-Rom pieces trace exact straight segments (with eased parameter speed).
    // Use their actual vertices for distance tests; preserve dense samples for curved foreign runs.
    const segments =
      path instanceof THREE.CatmullRomCurve3 && path.tension === 0
        ? path.points.map((point) => point.clone().applyMatrix4(world))
        : points;
    const tube = geo instanceof THREE.TubeGeometry ? { radius: geo.parameters.radius, points, segments } : undefined;
    geo.applyMatrix4(world);
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const box = geo.boundingBox!.clone();
    return { p, geo, mesh, box, interiorBox: box.clone().expandByScalar(-1e-5), tube };
  });
  type Solid = (typeof solids)[number];
  // Cache segment bounds and scalar projections; retain all 801 curved-route samples.
  // The bounds are broad phase only, padded for the widest brake tube plus the face margin.
  const maxBrakeRadius = Math.max(...solids.filter((s) => brakeOwned(s.p)).map((s) => s.tube?.radius ?? 0));
  const segmentCache = new Map(
    solids
      .filter((s) => s.tube)
      .map((s) => [
        s,
        s.tube!.segments.slice(1).map((b, i) => {
          const a = s.tube!.segments[i],
            delta = b.clone().sub(a);
          return {
            a,
            delta,
            lengthSq: delta.lengthSq(),
            box: new THREE.Box3().setFromPoints([a, b]).expandByScalar(s.tube!.radius + maxBrakeRadius + faceMargin),
          };
        }),
      ]),
  );
  const tubeDistanceSq = (s: Solid, q: THREE.Vector3) => {
    let closest = Infinity;
    for (const segment of segmentCache.get(s)!) {
      if (!segment.box.containsPoint(q)) continue;
      const dx = q.x - segment.a.x,
        dy = q.y - segment.a.y,
        dz = q.z - segment.a.z,
        d = segment.delta;
      const t = segment.lengthSq ? Math.max(0, Math.min(1, (dx * d.x + dy * d.y + dz * d.z) / segment.lengthSq)) : 0;
      closest = Math.min(closest, (dx - t * d.x) ** 2 + (dy - t * d.y) ** 2 + (dz - t * d.z) ** 2);
    }
    return closest;
  };
  const inside = (s: Solid, q: THREE.Vector3) => {
    if (!s.interiorBox.containsPoint(q)) return false;
    if (s.tube) return tubeDistanceSq(s, q) < (s.tube.radius - 1e-5) ** 2;
    return directions.every((d) => {
      ray.set(q, d);
      const distances = ray
        .intersectObject(s.mesh, false)
        .map((hit) => hit.distance)
        .filter((v) => v > 1e-5);
      const unique = distances.filter((v, i) => i === 0 || Math.abs(v - distances[i - 1]) > 1e-5);
      return unique.length % 2 === 1;
    });
  };
  const samples = (s: Solid) => {
    if (s.tube)
      return s.tube.points
        .filter((_, i) => i % 2 === 0)
        .flatMap((point) => [
          point,
          ...[0, 1, 2].flatMap((axis) =>
            [-1, 1].map((sign) => {
              const q = point.clone();
              q.setComponent(axis, q.getComponent(axis) + sign * s.tube!.radius * 0.9);
              return q;
            }),
          ),
        ]);
    const points: THREE.Vector3[] = [];
    for (let x = 0; x < 9; x++)
      for (let y = 0; y < 9; y++)
        for (let z = 0; z < 9; z++) {
          const q = new THREE.Vector3(
            ...[x, y, z].map(
              (v, axis) =>
                s.box.min.getComponent(axis) +
                ((s.box.max.getComponent(axis) - s.box.min.getComponent(axis)) * (v + 0.5)) / 9,
            ),
          );
          if (inside(s, q)) points.push(q);
        }
    return points;
  };
  // Only intended physical junctions are exempt: terminal tube joins within 0.025 m, or within their fitting body.
  const connections = (a: Solid, b: Solid, q: THREE.Vector3) => {
    if (!brakeOwned(b.p)) return false;
    const endpointNear = (line: Solid, target: Solid) =>
      line.tube &&
      [line.tube.points[0], line.tube.points.at(-1)!].some(
        (end) =>
          (target.tube ? end.distanceTo(q) < 0.025 : target.box.clone().expandByScalar(0.005).containsPoint(q)) &&
          target.box.clone().expandByScalar(0.008).containsPoint(end),
      );
    if (endpointNear(a, b) || endpointNear(b, a)) return true;
    if (
      [a.p.name, b.p.name].includes("Brake reservoir feed") &&
      [a.p.name, b.p.name].includes("Brake supply firewall fitting")
    )
      return true;
    // Main hydraulic line traverses its valve and inlet elbow; this is its intended circuit path.
    return (
      (a.p.name?.startsWith("Brake line (") &&
        ["Parking brake valve", "Brake elbow fitting", "Brake bulkhead fitting", "Brake tee fitting"].includes(
          b.p.name!,
        )) ||
      (b.p.name?.startsWith("Brake line (") &&
        ["Parking brake valve", "Brake elbow fitting", "Brake bulkhead fitting", "Brake tee fitting"].includes(
          a.p.name!,
        ))
    );
  };
  try {
    const overlaps: string[] = [];
    for (const a of solids.filter((s) => brakeOwned(s.p))) {
      const points = samples(a);
      expect(points.length, a.p.name).toBeGreaterThan(0);
      for (const b of solids) {
        if (a === b || covers.has(b.p.name!) || !a.box.intersectsBox(b.box)) continue;
        const hit = points.find((q) => inside(b, q) && !connections(a, b, q));
        if (hit)
          overlaps.push(
            `${a.p.name} intersects ${b.p.name} at ${hit
              .toArray()
              .map((v) => v.toFixed(4))
              .join(",")}`,
          );
      }
    }
    // Skin and firewall checks use the airframe envelope (POH 13772-007 Fig 1-1 p.1-4;
    // AMM Fig 6-00-2) and internal routing in AMM Figs 32-42-3/4/5 PDF1469/1476/1481.
    const inWing = (q: THREE.Vector3, margin: number) => {
      if (Math.abs(q.z) < WR || Math.abs(q.z) > WTIP) return false;
      const chord = (wLE(q.z) - q.x) / wC(q.z);
      return (
        chord > 0 && chord < 1 && q.y >= wingP(q.z, chord, -1).y + margin && q.y <= wingP(q.z, chord, 1).y - margin
      );
    };
    const wheelRegion = (q: THREE.Vector3) =>
      [-1, 1].some((side) => q.distanceTo(new THREE.Vector3(MG.x, MG.y, side * MG.z)) < 0.24);
    const strutCovers = solids.filter((s) => covers.has(s.p.name!));
    const envelope = (q: THREE.Vector3, margin: number, strut: boolean) =>
      inFus(q, margin) ||
      inWing(q, margin) ||
      (strut && Math.abs(q.z) >= 37 * 0.0254 - 0.06 && (strutCovers.some((s) => inside(s, q)) || wheelRegion(q)));
    const fittings = solids.filter((s) => brakeOwned(s.p) && s.p.name?.includes("fitting"));
    const fitted = (q: THREE.Vector3) => fittings.some((s) => s.box.containsPoint(q));
    const triangle = new THREE.Triangle();
    const closest = new THREE.Vector3();
    const vertex = (solid: Solid, i: number, to: THREE.Vector3) =>
      to.fromBufferAttribute(solid.geo.getAttribute("position") as THREE.BufferAttribute, i);
    const failures: string[] = [...new Set(overlaps)];
    let firewallCrossings = 0;
    for (const a of solids.filter((s) => brakeOwned(s.p))) {
      const strut =
        a.p.name?.startsWith("Brake line (") ||
        a.p.name === "Brake hose" ||
        a.p.name === "Brake union fitting" ||
        // The new terminal fitting belongs to the existing exterior wheel/strut hydraulic envelope.
        a.p.name === "Brake caliper fitting";
      if (a.tube) {
        for (const q of a.tube.points) {
          if (!envelope(q, a.tube.radius + faceMargin, !!strut)) {
            failures.push(`${a.p.name}: outside envelope at ${q.toArray().map((v) => v.toFixed(4))}`);
            break;
          }
        }
        // Surface offsets guard the tube width too, including the allowed strut-cover run.
        if (samples(a).some((q) => !envelope(q, faceMargin, !!strut)))
          failures.push(`${a.p.name}: tube surface outside envelope`);
        if (
          !a.p.name?.startsWith("Brake reservoir feed") &&
          a.tube.points.some((q) => q.x + a.tube!.radius >= FW && !fitted(q))
        )
          failures.push(`${a.p.name}: cabin line extends through firewall`);
        for (let i = 1; i < a.tube.points.length; i++) {
          const before = a.tube.points[i - 1],
            after = a.tube.points[i];
          if ((before.x - FW > 1e-9 && after.x - FW <= 1e-9) || (before.x - FW < -1e-9 && after.x - FW >= -1e-9)) {
            const crossing = before.clone().lerp(after, (FW - before.x) / (after.x - before.x));
            firewallCrossings++;
            if (!fitted(crossing)) failures.push(`${a.p.name}: unfitted firewall crossing at ${crossing.toArray()}`);
          }
        }
        for (const b of solids.filter((s) => !brakeOwned(s.p) && !covers.has(s.p.name!))) {
          const proximity = b.box.clone().expandByScalar(a.tube.radius + faceMargin);
          const candidates = a.tube.points.filter((q) => proximity.containsPoint(q));
          for (const q of candidates) {
            if (b.p.name === "Firewall — FS 100" && a.p.name?.startsWith("Brake reservoir feed") && fitted(q)) continue;
            let tooClose = false;
            if (b.tube) {
              tooClose = tubeDistanceSq(b, q) < (b.tube.radius + a.tube.radius + faceMargin) ** 2;
            } else {
              const index = b.geo.index,
                count = index?.count ?? b.geo.getAttribute("position").count;
              for (let i = 0; i < count; i += 3) {
                vertex(b, index ? index.getX(i) : i, triangle.a);
                vertex(b, index ? index.getX(i + 1) : i + 1, triangle.b);
                vertex(b, index ? index.getX(i + 2) : i + 2, triangle.c);
                triangle.closestPointToPoint(q, closest);
                if (closest.distanceTo(q) < a.tube.radius + faceMargin) {
                  tooClose = true;
                  break;
                }
              }
            }
            if (tooClose) {
              failures.push(
                `${a.p.name}: within face margin of ${b.p.name} at ${q.toArray().map((v) => v.toFixed(4))}`,
              );
              break;
            }
          }
        }
      } else if (a.p.name?.includes("fitting")) {
        if (samples(a).some((q) => !envelope(q, faceMargin, !!strut))) failures.push(`${a.p.name}: outside envelope`);
        if (a.p.name !== "Brake supply firewall fitting" && a.box.max.x >= FW)
          failures.push(`${a.p.name}: fitting straddles firewall`);
      }
    }
    expect(
      firewallCrossings,
      "Only reservoir feed crosses firewall through item 6/7 fitting (AMM Fig32-42-4 PDF1476)",
    ).toBe(1);
    expect(failures).toEqual([]);
    // AMM Figs32-42-3/5 PDF1469/1481: a visible flexible hose, not a coincident solid terminal.
    for (const hose of solids.filter((s) => s.p.name === "Brake hose")) {
      let exposed = 0;
      for (let i = 1; i < hose.tube!.points.length; i++) {
        const a = hose.tube!.points[i - 1],
          b = hose.tube!.points[i],
          middle = a.clone().lerp(b, 0.5);
        if (!solids.some((s) => s !== hose && brakeOwned(s.p) && inside(s, middle))) exposed += a.distanceTo(b);
      }
      expect(exposed, "Illustrative visible hose length").toBeGreaterThan(0.01);
    }

    // Check the actual disc hole rather than allowing an axle/disc connection exception.
    for (const disc of solids.filter((s) => s.p.name === "Brake disc")) {
      expect(inside(disc, position(disc.p))).toBe(false);
      const boreProbe = position(disc.p).add(new THREE.Vector3(0.05, 0, 0));
      expect(inside(disc, boreProbe)).toBe(false);
      expect(inside(disc, position(disc.p).add(new THREE.Vector3(0.105, 0, 0)))).toBe(true);
    }
  } finally {
    for (const s of solids) {
      s.geo.dispose();
      s.mesh.material.dispose();
    }
  }
  // Builds/samples every fleet solid; allow parallel CI/load contention without weakening any geometry assertion.
}, 120_000);

it("each wheel tee joins matching toes of different pilot stations (POH 13772-007 7-25; AMM Fig 32-42-4 item 8, PDF 1476)", () => {
  for (const [side, zValues] of [
    [-1, [-0.36, 0.14]],
    [1, [-0.14, 0.36]],
  ] as const) {
    const tee = position(sidePart("Brake tee fitting", side));
    const branches = parts("Brake master cylinder line").filter((p) => curve(p).getPoint(1).distanceTo(tee) < 0.001);
    expect(branches).toHaveLength(2);
    const cylinders = branches.map((branch) =>
      parts("Brake master cylinder").find((p) => curve(branch).getPoint(0).distanceTo(position(p)) < 0.051)!,
    );
    expect(cylinders.map((p) => p.pos![2]).sort()).toEqual([...zValues].sort());
    expect(new Set(cylinders.map((p) => p.parent))).toEqual(new Set(["rig:pedL", "rig:pedR"]));
    expect(cylinders[1].pos![2] - cylinders[0].pos![2]).toBeCloseTo(0.5);
  }
});
