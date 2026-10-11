import { Box3, BufferGeometry, Euler, Matrix4, Quaternion, Triangle, TubeGeometry, Vector3 } from "three";
import type { PartSpec } from "@/lib/catalogue";
import { curveOf } from "@/lib/geometry";
import { expect, it } from "vitest";
import {
  CAT,
  CYLS,
  THROTTLE,
  NOSE_GEAR,
  MOUNT_ATTACH,
  MOUNT_FEET,
  MOUNT_RUNS,
  MIXTURE_ARM,
  HEADER,
  INTAKE_MANIFOLD,
  NOSE_CASTER,
  PROP,
  YOKES,
  YOKE_X,
  YOKE_Y,
} from "@/aircraft/sr22t/parts";
import { AIL_SECTOR, CARR, ETT, PULLEYS, RUD_HORN } from "@/aircraft/sr22t/rig";
import { FW, doorHinge, type DoorKey } from "@/aircraft/sr22t/geometry";
import { toV, type Vec3 } from "@/lib/math";

import { cylPoint, cylHeadOffset, cylOrigin } from "@/aircraft/sr22t/parts/engine";
import { CRANK_Y, IN } from "@/aircraft/sr22t/engine-datum";
import { FLOWS } from "@/aircraft/sr22t/flows";

import { EXHAUST_RADIUS } from "@/aircraft/sr22t/exhaust-layout";

const parts = (name: string) => CAT.parts.filter((p) => p.name === name);
const triangleList = (g: BufferGeometry) => {
  const position = g.getAttribute("position"),
    index = g.index;
  const count = index?.count ?? position.count;
  const vertex = (i: number) => new Vector3().fromBufferAttribute(position, index ? index.getX(i) : i);
  return Array.from({ length: count / 3 }, (_, i) => new Triangle(vertex(3 * i), vertex(3 * i + 1), vertex(3 * i + 2)));
};
const distance = (a: Vec3, b: Vec3) => toV(a).distanceTo(toV(b));

it("a CHT sensor on each cylinder head and an EGT probe in each exhaust pipe (POH 7-35)", () => {
  expect(CAT.parts.filter((p) => p.name?.startsWith("CHT sensor — cyl"))).toHaveLength(6);
  expect(CAT.parts.filter((p) => p.name?.startsWith("EGT probe — cyl"))).toHaveLength(6);
  for (const c of CYLS) {
    const head = cylPoint(c, cylHeadOffset(c));
    const bankIndex = CYLS.filter((b) => b.s === c.s).findIndex((b) => b.n === c.n);
    const h = HEADER(c.s);
    const port = [h.elbow, h.riser, h.aftRiser][bankIndex][0];
    for (const prefix of ["CHT sensor", "EGT probe"]) {
      const p = parts(`${prefix} — cyl ${c.n}`);
      expect(p).toHaveLength(1);
      expect(distance(p[0].pos!, head)).toBeLessThan(0.15);
      expect(p[0].sys).toEqual(["engine", "avionics"]);
      expect(p[0].pin).toBeUndefined();
    }
    const cht = parts(`CHT sensor — cyl ${c.n}`)[0];
    const egt = parts(`EGT probe — cyl ${c.n}`)[0];
    // Under the head, bayonet up into the port 5.25 in. below the crank CL (M-18 Fig 5-34 View D-D,
    // dimensioned), inside the head's footprint, not on its outboard face (AMM Fig 77-20-2 item 3).
    const headBox = worldBox(parts(`Cylinder head ${c.n}`)[0]),
      chtBox = worldBox(cht);
    expect(cht.pos![1]).toBeCloseTo(CRANK_Y - 5.25 * IN, 6);
    expect(chtBox.min.y).toBeLessThan(headBox.min.y);
    expect(chtBox.max.y).toBeCloseTo(headBox.min.y, 6);
    for (const axis of ["x", "z"] as const) {
      expect(chtBox.min[axis]).toBeGreaterThanOrEqual(headBox.min[axis] - 1e-9);
      expect(chtBox.max[axis]).toBeLessThanOrEqual(headBox.max[axis] + 1e-9);
    }
    // AMM 77-20 (PDF 2706) caution: the probe stays at least 0.2 in. clear of the cylinder fuel drain line.
    const drainFlow = FLOWS.find((f) => f.key === "fuelDrainCyl" + c.n)!;
    const drainPoints = curveOf(drainFlow.pts, drainFlow.tension ?? 0.3).getSpacedPoints(400);
    const chtGeo = cht.geo().translate(...cht.pos!);
    const chtFaces = triangleList(chtGeo);
    chtGeo.dispose();
    const closest = new Vector3();
    const drainGap = Math.min(
      ...drainPoints.map((point) =>
        Math.min(...chtFaces.map((t) => t.closestPointToPoint(point, closest).distanceTo(point))),
      ),
    );
    expect(drainGap - (drainFlow.r ?? 0)).toBeGreaterThanOrEqual(0.2 * IN);
    // Fig 77-20-2 (AMM PDF 2713): separate exterior housings, EGT below
    // the head along the port-to-joint run; schematic, not measured offsets.
    const header = [h.elbow, h.riser, h.aftRiser][bankIndex];
    const curve = curveOf(header, 0);
    const fraction = 0.03 / curve.getLength();
    const tip = curve.getPointAt(fraction);
    const tangent = curve.getTangentAt(fraction);
    const normal = new Vector3(0, 0, c.s);
    normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
    expect(toV(egt.pos!).distanceTo(tip.clone().addScaledVector(normal, EXHAUST_RADIUS + 0.012 - 0.002))).toBeLessThan(
      1e-8,
    );
    // The inner end penetrates the existing pipe wall by 2 mm, while
    // the exterior housing remains below the cylinder-head box.
    expect(toV(egt.pos!).clone().addScaledVector(normal, -0.012).distanceTo(tip)).toBeCloseTo(
      EXHAUST_RADIUS - 0.002,
      6,
    );
    expect(worldBox(egt).max.y).toBeLessThan(worldBox(parts(`Cylinder head ${c.n}`)[0]).min.y);
    expect(distance(egt.pos!, port)).toBeLessThan(0.1);
  }
  for (const name of ["TIT probe — LH", "TIT probe — RH"]) expect(parts(name)).toHaveLength(1);
});

it("MAP sender on the throttle-body boss, MAT in the induction manifold (POH 7-36; AMM 77-20 PDF 2706, Fig 77-10-4 PDF 2702)", () => {
  for (const name of ["MAP sensor", "MAT sensor"]) {
    expect(parts(name)).toHaveLength(1);
    expect(distance(parts(name)[0].pos!, THROTTLE)).toBeLessThan(0.2);
    expect(parts(name)[0].sys).toEqual(["engine", "avionics"]);
  }
  // The MAP sender threads straight into a boss on the throttle body, no line (AMM Fig 77-10-4 PDF 2702), on the
  // RIGHT (M-18 Fig 5-34 p. 5-54). Its inboard end sits on the rendered throttle-body surface, axis lateral.
  const map = parts("MAP sensor")[0],
    mapBox = worldBox(map),
    body = parts("Throttle body / fuel-metering valve")[0],
    bodyBox = worldBox(body);
  expect(mapBox.min.z).toBeGreaterThan(0);
  const extent = mapBox.getSize(new Vector3());
  expect(extent.z).toBeGreaterThan(extent.x);
  expect(extent.z).toBeGreaterThan(extent.y);
  // Inboard (seating) end: centred on the sensor axis, on the throttle body's right face, within 5 mm of its surface.
  const seat = new Vector3(map.pos![0], map.pos![1], mapBox.min.z);
  expect(seat.x).toBeGreaterThan(bodyBox.min.x);
  expect(seat.x).toBeLessThan(bodyBox.max.x);
  expect(seat.y).toBeGreaterThan(bodyBox.min.y);
  expect(seat.y).toBeLessThan(bodyBox.max.y);
  const bodyGeo = body.geo().translate(...body.pos!);
  const closest = new Vector3();
  const seatGap = Math.min(...triangleList(bodyGeo).map((t) => t.closestPointToPoint(seat, closest).distanceTo(seat)));
  bodyGeo.dispose();
  expect(seatGap).toBeLessThan(0.005);
  // The stub enters the boss but the body stays outside: the sensor centre is outboard of the throttle body.
  expect(map.pos![2]).toBeGreaterThan(bodyBox.max.z);
  expect(FLOWS.some((f) => f.name?.includes("MAP"))).toBe(false);
  expect(parts("MAT sensor")[0].pos).toEqual([INTAKE_MANIFOLD[0], INTAKE_MANIFOLD[1] + 0.051, 0]);
  expect(parts("MAT sensor")[0].note).toContain("not depicted on either display");
  expect(parts("MAP sensor")[0].note).toContain("HIGH BOOST/PRIME");
});

it("six isolators on a mount bolted to the firewall at four points (POH 7-31; AMM 71-20 PDF 2522)", () => {
  expect(parts("Engine mount isolator")).toHaveLength(6);
  expect(parts("Firewall attach fitting")).toHaveLength(4);
  for (const p of parts("Firewall attach fitting")) expect(Math.abs(p.pos![0] - FW)).toBeLessThan(0.05);
  for (const pos of [...MOUNT_ATTACH, ...MOUNT_FEET, NOSE_GEAR]) {
    expect(MOUNT_RUNS.some((path) => path.some((p) => distance(p, pos) < 0.001))).toBe(true);
  }
  expect(parts("Engine mount weldment").every((p) => p.sys.includes("gear"))).toBe(true);
  for (const side of [0, 1]) {
    const s = side === 0 ? -1 : 1;
    expect(MOUNT_ATTACH.slice(side * 2, side * 2 + 2)).toEqual([
      [FW + 0.015, -0.07, s * 0.48],
      [FW + 0.015, -0.45, s * 0.52],
    ]);
    expect(MOUNT_RUNS[side * 5][0]).toEqual(MOUNT_ATTACH[side * 2]);
    expect(MOUNT_RUNS[side * 5 + 2][0]).toEqual(MOUNT_ATTACH[side * 2 + 1]);
    expect(MOUNT_RUNS[side * 5 + 1]).toEqual([MOUNT_FEET[side * 3], [3.02, -0.29, s * 0.22]]);
  }
  // Schematic nose-strut support (AMM Fig 71-20-1 PDF 2527; 32-00 PDF 1390):
  // one route off the aft lower cross member, below the unchanged oil sump.
  const sump = worldBox(parts("Oil sump")[0]);
  const noseRoutes = MOUNT_RUNS.filter((route) => route.some((p) => distance(p, NOSE_GEAR) < 1e-9));
  expect(noseRoutes).toHaveLength(1);
  expect(noseRoutes[0].at(-1)).toEqual(NOSE_GEAR);
  const crossMember = MOUNT_RUNS.find((route) => route[0] === MOUNT_FEET[0] && route.at(-1) === MOUNT_FEET[3]);
  expect(crossMember?.some((p) => p === noseRoutes[0][0])).toBe(true);
  const noseSections = parts("Engine mount weldment").filter((p) => {
    const g = p.geo() as TubeGeometry;
    const onRoute = noseRoutes.some((route) =>
      (g.parameters.path as ReturnType<typeof curveOf>).points.every((point) =>
        route.some((anchor) => point.distanceTo(toV(anchor)) < 1e-8),
      ),
    );
    g.dispose();
    return onRoute;
  });
  for (const route of noseRoutes)
    for (const anchor of route)
      expect(
        noseSections.some((p) => {
          const g = p.geo() as TubeGeometry;
          const reaches = (g.parameters.path as ReturnType<typeof curveOf>).points.some(
            (point) => point.distanceTo(toV(anchor)) < 1e-8,
          );
          g.dispose();
          return reaches;
        }),
      ).toBe(true);
  for (const p of noseSections) expect(worldBoxes(p).some((b) => b.intersectsBox(sump))).toBe(false);
});

it("forward LH and aft RH grounding straps bridge isolators (AMM Fig 71-20-1 PDF 2527)", () => {
  const straps = parts("Engine grounding strap");
  expect(straps).toHaveLength(2);
  expect(straps[0].pos![2]).toBeLessThan(0);
  expect(straps[1].pos![2]).toBeGreaterThan(0);
  expect(straps[0].pos![0]).toBeGreaterThan(straps[1].pos![0]);
  for (const [i, strap] of straps.entries()) {
    const foot = MOUNT_FEET[i === 0 ? 2 : 3];
    const g = strap.geo() as TubeGeometry;
    const endpoints = [g.parameters.path.getPoint(0), g.parameters.path.getPoint(1)];
    g.dispose();
    const hosts = ["Engine foot bracket", "Engine mount tab washer"].map((name) =>
      parts(name).find((p) => distance(p.pos!, foot) < 0.05)!,
    );
    for (const [end, host] of hosts.entries()) {
      expect(host).toBeDefined();
      const boxes = worldBoxes(host);
      expect(
        boxes.some((b) => b.containsPoint(endpoints[end])),
        `${host.name} seats strap end`,
      ).toBe(true);
      const otherEnd = endpoints[1 - end];
      expect(boxes.some((b) => b.containsPoint(otherEnd))).toBe(false);
    }
    // Opposite faces of the same isolator, not two points on its mount side.
    expect((endpoints[0].y - foot[1]) * (endpoints[1].y - foot[1])).toBeLessThan(0);
    for (const name of [
      "Engine foot bracket",
      "Engine mount tab washer",
      "Engine mount bolt",
      "Engine grounding strap",
    ])
      for (const p of parts(name).filter((p) => distance(p.pos!, foot) < 0.05))
        for (const b of worldBoxes(p))
          for (const corner of [b.min, b.max])
            for (const axis of ["x", "y", "z"] as const)
              expect(Math.abs(corner[axis] - toV(foot)[axis]), `${name} footprint`).toBeLessThanOrEqual(0.05);
    const isolator = parts("Engine mount isolator").find((p) => distance(p.pos!, foot) < 0.001)!;
    const bolt = parts("Engine mount bolt").find((p) => distance(p.pos!, foot) < 0.05)!;
    expect(worldBoxes(bolt).some((a) => worldBoxes(isolator).some((b) => a.intersectsBox(b)))).toBe(true);
  }
});

it("position sensors are parts only at their control arms (AMM Fig 71-00-2 PDF 2488–2489)", () => {
  expect(parts("Mixture position sensor")[0].pos).toEqual([
    MIXTURE_ARM[0] + 0.0315,
    MIXTURE_ARM[1] + 0.026,
    MIXTURE_ARM[2] - 0.05,
  ]);
  for (const [name, anchor] of [
    ["Throttle position sensor", THROTTLE],
    ["Mixture position sensor", MIXTURE_ARM],
  ] as const) {
    expect(parts(name)).toHaveLength(1);
    expect(distance(parts(name)[0].pos!, anchor)).toBeLessThan(0.1);
    expect(parts(name)[0].note).toContain("Function not described in POH/AMM text");
    expect(parts(name)[0].anim).toBeUndefined();
  }
});

it("engine sensor and support assemblies have finite nonempty geometry", () => {
  const owned = CAT.parts.filter(
    (p) =>
      sensor(p) ||
      [
        "Engine mount weldment",
        "Engine mount isolator",
        "Firewall attach fitting",
        "Engine grounding strap",
        "Engine cooling baffle",
        "Baffle seal",
      ].includes(p.name ?? "") ||
      (p.name === "Heat shield" && p.sys.includes("engine")),
  );
  expect(owned.length).toBeGreaterThanOrEqual(16);
  for (const p of owned) {
    const g = p.geo();
    expect(g.getAttribute("position").count).toBeGreaterThan(0);
    expect(Array.from(g.getAttribute("position").array).every(Number.isFinite)).toBe(true);
    g.dispose();
  }
});

const sensor = (p: PartSpec) =>
  /^(CHT sensor|EGT probe|MAP sensor|MAT sensor|Throttle position sensor|Mixture position sensor)/.test(p.name ?? "");
const worldBoxes = (p: PartSpec) => {
  const g = p.geo();
  g.computeBoundingBox();
  const matrix = new Matrix4().compose(
    toV(p.pos ?? [0, 0, 0]),
    new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
    toV(p.scale ?? [1, 1, 1]),
  );
  // A winding tube's whole AABB encloses empty space. Bound each rendered
  // segment between adjacent rings instead, including its full cross section.
  const local =
    g instanceof TubeGeometry
      ? Array.from({ length: g.parameters.tubularSegments }, (_, i) => {
          const b = new Box3();
          const position = g.getAttribute("position");
          const stride = g.parameters.radialSegments + 1;
          for (let j = i * stride; j < (i + 2) * stride; j++)
            b.expandByPoint(new Vector3().fromBufferAttribute(position, j));
          return b;
        })
      : [g.boundingBox!.clone()];
  const boxes = local.map((b) => b.applyMatrix4(matrix));
  // Rest-pose transforms mirror Airplane.tsx NoseGear/Propeller/Cylinders/Yokes
  // and ControlRig.tsx group positions (all pivots imported). Update this list
  // with those components; an unrecognised parent fails instead of checking
  // untranslated local bounds. rig:pedL/R are identity at neutral rudder.
  if (p.parent) {
    let pivot: Vec3 = [0, 0, 0];
    let rotation = new Matrix4();
    if (p.parent.startsWith("cyl:")) {
      const c = CYLS.find((c) => p.parent === `cyl:${c.n}`)!;
      pivot = cylOrigin(c);
    } else if (p.parent === "noseGear" || p.parent === "caster") {
      pivot =
        p.parent === "caster"
          ? [NOSE_GEAR[0] + NOSE_CASTER[0], NOSE_GEAR[1] + NOSE_CASTER[1], NOSE_GEAR[2] + NOSE_CASTER[2]]
          : NOSE_GEAR;
    } else if (p.parent.startsWith("door:")) {
      pivot = doorHinge(p.parent.slice(5) as DoorKey).pivot.toArray() as Vec3;
    } else if (p.parent.startsWith("blade:")) {
      pivot = PROP;
      rotation = new Matrix4().makeRotationX((Number(p.parent.split(":")[1]) * Math.PI * 2) / 3);
    } else if (/^(yoke|grip):/.test(p.parent)) {
      const yoke = YOKES.find((y) => p.parent!.endsWith(String(y.side)))!;
      pivot = [YOKE_X, YOKE_Y, yoke.z];
    } else if (p.parent.startsWith("surf:")) {
      pivot = CAT.surfaces.find((s) => p.parent === "surf:" + s.key)!.pivot;
    } else if (p.parent === "rig:ett") pivot = ETT.c;
    else if (p.parent === "rig:ailSector") pivot = AIL_SECTOR.c;
    else if (p.parent === "rig:rudHorn") pivot = RUD_HORN.c;
    else if (p.parent.startsWith("rig:carr:")) pivot = [CARR.x, CARR.y, p.parent.endsWith("L") ? -CARR.z : CARR.z];
    else if (p.parent.startsWith("rig:pul:")) pivot = PULLEYS[p.parent.slice(8)].c;
    else expect(["rig:pedL", "rig:pedR"]).toContain(p.parent);
    for (const b of boxes) b.applyMatrix4(rotation).translate(toV(pivot));
  }
  g.dispose();
  return boxes;
};
const worldBox = (p: PartSpec) => worldBoxes(p).reduce((a, b) => a.union(b), new Box3());
// Find unnamed risers by their exported header path, not unstable part ids.
const hostOf = (p: PartSpec): PartSpec => {
  if (p.name?.startsWith("CHT sensor")) return parts(`Cylinder head ${p.name.split(" ").at(-1)}`)[0];
  if (p.name?.startsWith("EGT probe")) {
    const c = CYLS.find((c) => p.name === `EGT probe — cyl ${c.n}`)!;
    const index = CYLS.filter((b) => b.s === c.s).findIndex((b) => b.n === c.n);
    const h = HEADER(c.s);
    const path = [h.elbow, h.riser, h.aftRiser][index];
    const hosts = CAT.parts
      .filter((candidate) => ["Elbow riser", "Cylinder exhaust riser"].includes(candidate.name ?? ""))
      .filter((candidate) => {
        const g = candidate.geo();
        const matches =
          g instanceof TubeGeometry &&
          g.parameters.path.getPoint(0).distanceTo(toV(path[0])) < 1e-8 &&
          g.parameters.path.getPoint(1).distanceTo(toV(path.at(-1)!)) < 1e-8;
        g.dispose();
        return matches;
      });
    expect(hosts).toHaveLength(1);
    return hosts[0];
  }
  return parts(
    (
      {
        "MAP sensor": "Throttle body / fuel-metering valve",
        "MAT sensor": "Intake manifold",
        "Throttle position sensor": "Throttle body / fuel-metering valve",
        "Mixture position sensor": "Engine-driven fuel pump",
      } as Record<string, string>
    )[p.name!],
  )[0];
};
it("all sixteen sensors touch their named hosts, stay exposed and clear every non-host solid (POH 7-35/7-36; AMM Figs 77-20-2, 77-10-4, 77-20-5, 71-00-2)", () => {
  const sensors = CAT.parts.filter(sensor);
  expect(sensors).toHaveLength(16);
  const collisions: string[] = [];
  const bounds = new Map(CAT.parts.map((p) => [p, worldBoxes(p)]));
  for (const p of sensors) {
    const b = worldBox(p),
      host = hostOf(p);
    expect(host, p.name).toBeDefined();
    const hostBoxes = worldBoxes(host);
    expect(
      hostBoxes.some((box) => box.clone().expandByScalar(1e-8).intersectsBox(b)),
      `${p.name} touches ${host.name}`,
    ).toBe(true);
    expect(
      hostBoxes.some((box) => box.containsPoint(toV(p.pos!))),
      `${p.name} center exposed`,
    ).toBe(false);
    for (const other of CAT.parts) {
      if (other === p || other === host) continue;
      if (bounds.get(other)!.some((otherBox) => b.intersectsBox(otherBox)))
        collisions.push(`${p.name} / ${other.name} (${other.id})`);
    }
  }
  expect(collisions).toEqual([]);
});

it("weldment clears every engine-bay solid (AMM Fig 71-20-1 PDF 2527)", () => {
  const bounds = new Map(CAT.parts.map((p) => [p, worldBoxes(p)]));
  const hits: string[] = [];
  for (const p of parts("Engine mount weldment")) {
    const g = p.geo() as TubeGeometry;
    const endpoints = (g.parameters.path as ReturnType<typeof curveOf>).points;
    const reachesNose = endpoints.some((point) => point.distanceTo(toV(NOSE_GEAR)) < 1e-8);
    const reachesFirewall = endpoints.some((point) => MOUNT_ATTACH.some((a) => point.distanceTo(toV(a)) < 1e-8));
    g.dispose();
    for (const other of CAT.parts) {
      if (
        [
          "Engine mount weldment",
          "Engine mount isolator",
          "Firewall attach fitting",
          "Engine grounding strap",
          "Engine foot bracket",
          "Engine mount tab washer",
          "Engine mount bolt",
          "Heat shield",
        ].includes(other.name ?? "")
      )
        continue;
      // Only the members ending at a documented fitting may contact its host.
      if ((other.parent === "noseGear" || other.parent === "caster") && reachesNose) continue;
      if (other.name === "Firewall" && reachesFirewall) continue;
      if (bounds.get(p)!.some((a) => bounds.get(other)!.some((b) => a.intersectsBox(b))))
        hits.push(`${p.id} at ${p.pos} / ${other.name ?? other.id}`);
    }
  }
  expect(hits).toEqual([]);
});
