/** SR22T POH 13772-007 7-25; AMM 13773-002 Rev 7 chapters 32-10, 32-20 and 32-41. */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CAT, MG, NOSE_CASTER, NOSE_GEAR } from "@/aircraft/sr22t/parts";
import { pantGeo, wC, wLE, wingP } from "@/aircraft/sr22t/geometry";
import type { PartSpec } from "@/lib/catalogue";

const parts = (name: string) => CAT.parts.filter((p) => p.name === name);
const bounds = (p: PartSpec) => {
  const geo = p.geo();
  geo.computeBoundingBox();
  const b = geo.boundingBox!.clone().translate(new THREE.Vector3(...(p.pos ?? [0, 0, 0])));
  geo.dispose();
  return b;
};

// Test the rendered shell, including its scale, rather than a nominal pant radius.
const pantMesh = (p: PartSpec) => {
  const geo = p.geo();
  geo.scale(...(p.scale ?? [1, 1, 1]));
  geo.translate(...(p.pos ?? [0, 0, 0]));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld();
  return mesh;
};
const insidePant = (mesh: THREE.Mesh, point: THREE.Vector3) => {
  const ray = new THREE.Raycaster(point, new THREE.Vector3(0.31, 0.83, 0.47).normalize());
  const distances = ray
    .intersectObject(mesh)
    .map((hit) => hit.distance)
    .filter((d) => d > 1e-7);
  const unique = distances.filter((d, i) => i === 0 || Math.abs(d - distances[i - 1]) > 1e-6);
  return unique.length % 2 === 1;
};

describe("SR22T wheels and gear-leg detail", () => {
  it("the main strut attaches between WS 27 and WS 37, between the spar and the shear web (AMM 32-10 PDF 1392; POH 7-25)", () => {
    expect(parts("Main gear strut")).toHaveLength(2);
    for (const p of parts("Main gear strut")) {
      const geo = p.geo() as THREE.TubeGeometry;
      const root = geo.parameters.path.getPoint(0);
      expect(Math.abs(root.z)).toBeGreaterThanOrEqual(0.69);
      expect(Math.abs(root.z)).toBeLessThanOrEqual(0.94);
      const chord = (wLE(root.z) - root.x) / wC(root.z);
      const spar = CAT.parts.find((p) => p.name === "Main spar")!.geo() as THREE.TubeGeometry;
      const sparPoints = Array.from({ length: 2001 }, (_, i) => spar.parameters.path.getPoint(i / 2000));
      const sparAtRoot = sparPoints.reduce((a, b) => (Math.abs(a.z - root.z) < Math.abs(b.z - root.z) ? a : b));
      expect(root.x, "aft of the rendered spar at the same station").toBeLessThan(sparAtRoot.x);
      spar.dispose();
      // Existing illustrative shear web is at 60% chord (epic default); AMM does not dimension it.
      expect(chord).toBeLessThan(0.6);
      expect(Math.abs(root.z) / 0.0254).toBeCloseTo(27.5, 8);
      expect(chord).toBeCloseTo(0.45, 8);
      geo.dispose();
    }
  });

  it("upper and lower attach fittings and two lateral ribs per main gear (AMM 32-10 PDF 1392; Fig 32-10-2 PDF 1403)", () => {
    expect(parts("Main gear upper attach fitting")).toHaveLength(2);
    expect(parts("Main gear lower attach fitting")).toHaveLength(2);
    expect(parts("Gear lateral rib")).toHaveLength(4);
    for (const s of [-1, 1]) {
      const upper = parts("Main gear upper attach fitting").find((p) => Math.sign(p.pos![2]) === s)!;
      const lower = parts("Main gear lower attach fitting").find((p) => Math.sign(p.pos![2]) === s)!;
      expect(upper.pos).toEqual(
        wingP(s * 27.5 * 0.0254, 0.45, -1)
          .add(new THREE.Vector3(0, 0.06, 0))
          .toArray(),
      );
      expect(lower.pos).toEqual(wingP(s * 37 * 0.0254, 0.45, -1).toArray());
      const ribs = parts("Gear lateral rib").filter((p) => Math.sign(p.pos![2]) === s);
      expect(ribs).toHaveLength(2);
      for (const rib of ribs) {
        const b = bounds(rib);
        expect(Math.min(Math.abs(b.min.z), Math.abs(b.max.z))).toBeCloseTo(27 * 0.0254, 6);
        expect(Math.max(Math.abs(b.min.z), Math.abs(b.max.z))).toBeCloseTo(37 * 0.0254, 6);
      }
    }
  });

  it("the strut is clamped by both fittings and exits the lower skin at WS 37 (AMM Fig 32-10-2 PDF 1403; 32-10 PDF 1392)", () => {
    for (const strut of parts("Main gear strut")) {
      const geo = strut.geo() as THREE.TubeGeometry;
      const path = geo.parameters.path;
      const s = Math.sign(path.getPoint(0).z);
      const samples = Array.from({ length: 2001 }, (_, i) => path.getPoint(i / 2000));
      for (const name of ["Main gear upper attach fitting", "Main gear lower attach fitting"]) {
        const fitting = parts(name).find((p) => Math.sign(p.pos![2]) === s)!;
        const box = bounds(fitting);
        expect(
          samples.some((p) => box.containsPoint(p)),
          name + " clamps the centerline",
        ).toBe(true);
        const center = new THREE.Vector3(...fitting.pos!);
        expect(Math.min(...samples.map((p) => p.distanceTo(center)))).toBeLessThan(geo.parameters.radius);
      }
      const root = path.getPoint(0);
      expect(root.y).toBeCloseTo(wingP(root.z, 0.45, -1).y + 0.06, 8);
      expect(root.y).toBeLessThan(wingP(root.z, 0.45, 0).y);
      const upperBox = bounds(parts("Main gear upper attach fitting").find((p) => Math.sign(p.pos![2]) === s)!);
      expect(upperBox.max.y).toBeLessThan(wingP(root.z, 0.45, 1).y);
      const clearance = (p: THREE.Vector3) => p.y - wingP(p.z, (wLE(p.z) - p.x) / wC(p.z), -1).y;
      const firstBelow = samples.findIndex((p) => clearance(p) < 0);
      expect(firstBelow).toBeGreaterThan(0);
      const crossing = samples[firstBelow];
      expect(Math.abs(crossing.z) / 0.0254).toBeGreaterThan(32);
      expect(Math.abs(crossing.z) / 0.0254).toBeCloseTo(37, 0);
      // The sampled crossing remains in the lower fitting (no unsupported floating bracket).
      expect(
        bounds(parts("Main gear lower attach fitting").find((p) => Math.sign(p.pos![2]) === s)!).containsPoint(
          crossing,
        ),
      ).toBe(true);
      geo.dispose();
    }
  });

  it("fairings start outside the wing at WS 37; struts end on the inboard axles (AMM Fig 32-10-1 PDF 1397; Fig 32-10-2 PDF 1403)", () => {
    for (const strut of parts("Main gear strut")) {
      const geo = strut.geo() as THREE.TubeGeometry;
      const path = geo.parameters.path as THREE.CatmullRomCurve3;
      const tip = path.getPoint(1);
      const sign = Math.sign(tip.z);
      const sameSide = (name: string) => parts(name).find((p) => Math.sign(p.pos![2]) === sign)!;
      expect(bounds(sameSide("Main wheel axle")).containsPoint(tip)).toBe(true);
      expect(Math.abs(tip.z)).toBeCloseTo(MG.z - 0.15, 8);
      expect(tip.y).toBeCloseTo(MG.y, 8);
      for (const name of ["Main wheel", "Brake disc"]) {
        const b = bounds(sameSide(name));
        const inboard = Math.min(Math.abs(b.min.z), Math.abs(b.max.z));
        expect(Math.abs(tip.z)).toBeLessThan(inboard);
      }
      const fairing = parts("Main strut fairing").find((p) => {
        const g = p.geo() as THREE.TubeGeometry;
        const matches = Math.sign(g.parameters.path.getPoint(0).z) === sign;
        g.dispose();
        return matches;
      })!;
      const cover = fairing.geo() as THREE.TubeGeometry;
      const exterior = cover.parameters.path as THREE.CatmullRomCurve3;
      expect(exterior.getPoint(1).y).toBeGreaterThan(tip.y);
      const root = exterior.getPoint(0);
      expect(Math.abs(root.z) / 0.0254).toBeCloseTo(37, 8);
      for (let i = 0; i <= 1000; i++) {
        const p = exterior.getPoint(i / 1000);
        const skin = wingP(p.z, (wLE(p.z) - p.x) / wC(p.z), -1);
        expect(p.y - skin.y).toBeLessThanOrEqual(1e-8);
        expect(Math.abs(p.z)).toBeGreaterThanOrEqual(37 * 0.0254 - 1e-8);
      }
      geo.dispose();
      cover.dispose();
    }
  });

  it("both attach fittings meet the full-depth lateral ribs (AMM 32-10 PDF 1392; Fig 32-10-2 PDF 1403)", () => {
    for (const rib of parts("Gear lateral rib")) {
      const b = bounds(rib);
      const sign = Math.sign(rib.pos![2]);
      for (const name of ["Main gear upper attach fitting", "Main gear lower attach fitting"]) {
        const fitting = parts(name).find((p) => Math.sign(p.pos![2]) === sign)!;
        expect(bounds(fitting).getSize(new THREE.Vector3()).x).toBeCloseTo(0.2, 6);
        expect(b.intersectsBox(bounds(fitting))).toBe(true);
      }
    }
  });

  it("lateral ribs stay between local wing skins at every vertex (AMM Fig 32-10-2 PDF 1403)", () => {
    for (const rib of parts("Gear lateral rib")) {
      const geo = rib.geo();
      const vertices = geo.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(vertices, i).add(new THREE.Vector3(...rib.pos!));
        const chord = (wLE(v.z) - v.x) / wC(v.z);
        expect(v.y).toBeGreaterThanOrEqual(wingP(v.z, chord, -1).y + 0.0009);
        expect(v.y).toBeLessThanOrEqual(wingP(v.z, chord, 1).y - 0.0009);
      }
      geo.dispose();
    }
  });

  it("each lateral-rib loft ring reaches both local skins (AMM 32-10 p. 1 PDF 1392; Fig 32-10-2 PDF 1403)", () => {
    for (const rib of parts("Gear lateral rib")) {
      const geo = rib.geo();
      const vertices = geo.getAttribute("position");
      // loft appends, per end cap, a copy of the end ring plus its centre (2 × 5 vertices) after its four-vertex rings.
      const ringVertices = vertices.count - 10;
      expect(ringVertices % 4).toBe(0);
      for (let ring = 0; ring < ringVertices; ring += 4) {
        let upper = 0,
          lower = 0;
        for (let j = 0; j < 4; j++) {
          const v = new THREE.Vector3().fromBufferAttribute(vertices, ring + j).add(new THREE.Vector3(...rib.pos!));
          const chord = (wLE(v.z) - v.x) / wC(v.z);
          const lowerGap = v.y - wingP(v.z, chord, -1).y;
          const upperGap = wingP(v.z, chord, 1).y - v.y;
          if (lowerGap >= 0.0009 && lowerGap <= 0.0011) lower++;
          if (upperGap >= 0.0009 && upperGap <= 0.0011) upper++;
        }
        expect(lower, `ring ${ring / 4} reaches lower skin`).toBe(2);
        expect(upper, `ring ${ring / 4} reaches upper skin`).toBe(2);
      }
      geo.dispose();
    }
  });

  it("both mirrored rib skins face outward (AMM Fig 32-10-2 PDF 1403)", () => {
    for (const rib of parts("Gear lateral rib")) {
      const mesh = pantMesh(rib);
      const center = new THREE.Vector3(...rib.pos!);
      for (const direction of [
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(1, 0, 0),
      ]) {
        const ray = new THREE.Raycaster(center.clone().addScaledVector(direction, -1), direction);
        const hit = ray.intersectObject(mesh)[0];
        expect(hit).toBeDefined();
        expect(hit.face!.normal.dot(direction)).toBeLessThan(0);
      }
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });

  it("strut and fairing surfaces clear the fixed brake discs (AMM Figs 32-10-1/2 PDF 1397/1403)", () => {
    for (const name of ["Main gear strut", "Main strut fairing"]) {
      for (const p of parts(name)) {
        const geo = p.geo() as THREE.TubeGeometry;
        const side = Math.sign(geo.parameters.path.getPoint(1).z);
        const disc = bounds(parts("Brake disc").find((d) => Math.sign(d.pos![2]) === side)!);
        const vertices = geo.getAttribute("position");
        for (let i = 0; i < vertices.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(vertices, i);
          expect(disc.containsPoint(v), name + " vertex inside disc").toBe(false);
          expect(Math.abs(v.z)).toBeLessThan(Math.min(Math.abs(disc.min.z), Math.abs(disc.max.z)) - 0.001);
        }
        geo.dispose();
      }
    }
  });

  it("main fairing end rings meet the pant and the lower spring stays enclosed (AMM Fig 32-10-1 items 4/8 PDF 1397)", () => {
    for (const fairing of parts("Main strut fairing")) {
      const cover = fairing.geo() as THREE.TubeGeometry;
      const end = cover.parameters.path.getPoint(1);
      const side = Math.sign(end.z);
      const pant = pantMesh(parts("Wheel pant").find((p) => Math.sign(p.pos![2]) === side)!);
      const vertices = cover.getAttribute("position");
      const ringSize = cover.parameters.radialSegments + 1;
      for (let i = vertices.count - ringSize; i < vertices.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(vertices, i);
        expect(insidePant(pant, point), `end ring ${i}: ${point.toArray()}`).toBe(true);
      }
      for (const strut of parts("Main gear strut")) {
        const spring = strut.geo() as THREE.TubeGeometry;
        if (Math.sign(spring.parameters.path.getPoint(1).z) === side) {
          for (let i = 0; i <= 400; i++) {
            const point = spring.parameters.path.getPoint(i / 400);
            if (point.y <= end.y) expect(insidePant(pant, point), `lower spring: ${point.toArray()}`).toBe(true);
          }
          const axle = parts("Main wheel axle").find((p) => Math.sign(p.pos![2]) === side)!;
          const axleGeo = axle.geo();
          const axlePoints = axleGeo.getAttribute("position");
          for (let i = 0; i < axlePoints.count; i++) {
            const point = new THREE.Vector3().fromBufferAttribute(axlePoints, i).add(new THREE.Vector3(...axle.pos!));
            expect(insidePant(pant, point), `main axle: ${point.toArray()}`).toBe(true);
          }
          axleGeo.dispose();
        }
        spring.dispose();
      }
      cover.dispose();
      pant.geometry.dispose();
      (pant.material as THREE.Material).dispose();
    }
  });

  it("both mirrored pant skins face outward (AMM Fig 32-10-1 PDF 1397)", () => {
    for (const p of parts("Wheel pant")) {
      const pant = pantMesh(p);
      const center = new THREE.Vector3(...p.pos!);
      const base = pantGeo(0.92, 0.19);
      base.computeBoundingBox();
      const actual = bounds(p);
      expect(actual.min.x).toBeCloseTo(base.boundingBox!.min.x + MG.x, 6);
      expect(actual.max.x).toBeCloseTo(base.boundingBox!.max.x + MG.x, 6);
      base.dispose();
      for (const sign of [-1, 1]) {
        const direction = new THREE.Vector3(0, 0, -sign);
        const ray = new THREE.Raycaster(center.clone().add(new THREE.Vector3(0, 0, sign)), direction);
        const hit = ray.intersectObject(pant)[0];
        expect(hit).toBeDefined();
        expect(hit.face!.normal.dot(direction)).toBeLessThan(0);
      }
      pant.geometry.dispose();
      (pant.material as THREE.Material).dispose();
    }
  });

  it("nose nut rests outside the fork and cotter ends protrude (AMM Fig 32-41-2 items 1/2/7 PDF 1449; illustrative stack)", () => {
    const nut = bounds(parts("Nose axle nut")[0]);
    const pin = bounds(parts("Nose axle cotter pin")[0]);
    const forkPart = parts("Nose wheel fork").find((p) => bounds(p).max.z > 0.05)!;
    // Seat against the fork under the nut footprint, not the higher bend elsewhere.
    const forkGeo = forkPart.geo();
    const vertices = forkGeo.getAttribute("position");
    const center = nut.getCenter(new THREE.Vector3());
    const nutSize = nut.getSize(new THREE.Vector3());
    const radius = Math.max(nutSize.x, nutSize.y) / 2;
    let forkUnderNut = -Infinity;
    for (let i = 0; i < vertices.count; i++) {
      const v = new THREE.Vector3()
        .fromBufferAttribute(vertices, i)
        .add(new THREE.Vector3(...(forkPart.pos ?? [0, 0, 0])));
      if (Math.hypot(v.x - center.x, v.y - center.y) <= radius) forkUnderNut = Math.max(forkUnderNut, v.z);
    }
    forkGeo.dispose();
    expect(forkUnderNut).toBeGreaterThan(0.09);
    expect(nut.min.z).toBeCloseTo(forkUnderNut, 6);
    expect(nut.getSize(new THREE.Vector3()).z).toBeCloseTo(0.01, 6);
    expect(pin.min.z).toBeGreaterThan(forkUnderNut + 0.001);
    expect(pin.min.x).toBeLessThan(nut.min.x - 0.001);
    expect(pin.max.x).toBeGreaterThan(nut.max.x + 0.001);
    expect(nut.containsPoint(pin.getCenter(new THREE.Vector3()))).toBe(true);
  });

  it("nose axle reaches through its nut and cotter pin (AMM Fig 32-41-2 PDF 1449)", () => {
    const axle = bounds(parts("Nose wheel axle")[0]);
    const nut = bounds(parts("Nose axle nut")[0]);
    const pin = bounds(parts("Nose axle cotter pin")[0]);
    expect(axle.min.z).toBeLessThan(nut.min.z);
    expect(axle.max.z).toBeGreaterThanOrEqual(nut.max.z - 1e-7);
    expect(axle.max.z).toBeGreaterThanOrEqual(pin.max.z - 1e-7);
    expect(axle.containsPoint(pin.getCenter(new THREE.Vector3()))).toBe(true);
  });

  it("nose axle, nut and pin stay at least 1 mm inside the rendered pant (AMM Fig 32-41-2 PDF 1449)", () => {
    const p = parts("Nose wheel pant")[0];
    const pant = pantMesh(p);
    const center = new THREE.Vector3(...p.pos!);
    for (const name of ["Nose wheel axle", "Nose axle nut", "Nose axle cotter pin"]) {
      const hardware = parts(name)[0];
      expect(hardware.parent).toBe(p.parent);
      const geo = hardware.geo();
      const vertices = geo.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        const point = new THREE.Vector3()
          .fromBufferAttribute(vertices, i)
          .add(new THREE.Vector3(...(hardware.pos ?? [0, 0, 0])));
        // Push each surface point 1 mm outward before checking the actual faceted shell.
        point.add(point.clone().sub(center).normalize().multiplyScalar(0.001));
        expect(insidePant(pant, point), `${name} vertex ${i}: ${point.toArray()}`).toBe(true);
      }
      geo.dispose();
    }
    pant.geometry.dispose();
    (pant.material as THREE.Material).dispose();
  });

  it("nose inflation valve shares the LH pant-door face and caster transform (AMM Fig 32-20-1 item 4 PDF 1413)", () => {
    const valve = parts("Nose tire valve stem")[0];
    const door = parts("Nose pant access door")[0];
    expect(valve.parent).toBe("caster");
    expect(door.parent).toBe(valve.parent);
    expect(bounds(valve).max.z).toBeLessThan(0);
    expect(bounds(door).max.z).toBeLessThan(0);
    expect(bounds(valve).intersectsBox(bounds(parts("Nose wheel hub")[0]))).toBe(true);
  });

  it("the main cotter pins pass through the axle inside the nuts (AMM Fig 32-41-1 PDF 1446)", () => {
    for (const pin of parts("Main axle cotter pin")) {
      const b = bounds(pin),
        center = b.getCenter(new THREE.Vector3());
      const s = Math.sign(center.z);
      const axle = parts("Main wheel axle").find((p) => Math.sign(p.pos![2]) === s)!;
      const nut = parts("Main axle nut").find((p) => Math.sign(p.pos![2]) === s)!;
      expect(bounds(axle).containsPoint(center)).toBe(true);
      expect(bounds(nut).containsPoint(center)).toBe(true);
      expect(Math.abs(center.z) - MG.z).toBeCloseTo(0.082, 6);
    }
  });

  it("main-gear track stays 9.1 ft and tire/hub nominal sizes match 15 x 6.00 x 6 (POH 7-25; AMM 32-41 PDF 1442)", () => {
    expect((2 * MG.z) / 0.3048).toBeCloseTo(9.1, 1);
    for (const p of parts("Main wheel")) {
      expect(p.pos).toEqual([MG.x, MG.y, Math.sign(p.pos![2]) * MG.z]);
      const size = bounds(p).getSize(new THREE.Vector3());
      expect(size.x).toBeCloseTo(15 * 0.0254, 6);
      expect(size.y).toBeCloseTo(15 * 0.0254, 6);
      expect(size.z).toBeCloseTo(6 * 0.0254, 6);
      // No existing main-wheel spin group: wheels remain static; brake discs also remain static.
      expect(p.parent).toBeUndefined();
    }
    for (const p of parts("Main wheel hub"))
      expect(bounds(p).getSize(new THREE.Vector3()).x).toBeCloseTo(6 * 0.0254, 6);
    expect(parts("Main wheel sealed bearing")).toHaveLength(4);
    for (const name of ["Main wheel axle", "Main axle nut", "Main axle cotter pin", "Main tire valve stem"])
      expect(parts(name)).toHaveLength(2);
    for (const p of parts("Brake disc")) expect(p.parent).toBeUndefined();
  });

  it("the nose strut is an oleo with a piston rod and a fork on an independent axle (AMM 32-20 PDF 1408, Fig 32-20-2 PDF 1416; 32-41 PDF 1442)", () => {
    expect(NOSE_GEAR).toEqual([3.06, -0.52, 0]);
    expect(NOSE_CASTER).toEqual([0.22, -0.68, 0]);
    for (const name of ["Nose gear strut", "Nose oleo cylinder", "Nose oleo piston rod", "Nose strut fairing"])
      expect(parts(name).map((p) => p.parent)).toEqual(["noseGear"]);
    expect(parts("Nose wheel fork").map((p) => p.parent)).toEqual(["caster", "caster"]);
    expect(parts("Nose wheel axle").map((p) => p.parent)).toEqual(["caster"]);
    const axle = bounds(parts("Nose wheel axle")[0]);
    for (const p of parts("Nose wheel fork")) {
      const fork = bounds(p);
      expect(fork.min.z).toBeLessThanOrEqual(axle.max.z);
      expect(fork.max.z).toBeGreaterThanOrEqual(axle.min.z);
    }
    expect(parts("Nose wheel sealed bearing")).toHaveLength(2);
    expect(parts("Nose wheel bearing seal")).toHaveLength(2);
    for (const name of [
      "Nose wheel",
      "Nose wheel hub",
      "Nose tire valve stem",
      "Nose axle nut",
      "Nose axle cotter pin",
    ])
      expect(parts(name).map((p) => p.parent)).toEqual(["caster"]);
    const tire = bounds(parts("Nose wheel")[0]).getSize(new THREE.Vector3());
    // Bean default: retain the approximate tire envelope; Fig 32-41-2 PDF 1449 has no dimensions.
    expect(tire.x).toBeCloseTo(0.34, 6);
    expect(tire.z).toBeCloseTo(0.11, 6);
    expect(bounds(parts("Nose wheel hub")[0]).getSize(new THREE.Vector3()).x).toBeCloseTo(5 * 0.0254, 6);
  });

  it("both main pants and the nose pant have inflation access doors and leg fairings (POH 7-25; AMM Fig 32-10-1 PDF 1397, Fig 32-20-1 PDF 1413)", () => {
    expect(parts("Wheel pant access door")).toHaveLength(2);
    expect(parts("Main strut fairing")).toHaveLength(2);
    expect(parts("Nose pant access door").map((p) => p.parent)).toEqual(["caster"]);
    const door = bounds(parts("Nose pant access door")[0]);
    expect(door.max.z).toBeLessThan(0); // LH aft pant face, Fig 32-20-1 item 4.
    expect(door.max.x).toBeLessThan(parts("Nose wheel")[0].pos![0]);
    expect(door.min.x).toBeCloseTo(-0.133, 3);
    expect(parts("Nose wheel pant")[0].note).toContain("access door");
    for (const name of ["Wheel pant", "Nose wheel pant", "Main strut fairing", "Nose strut fairing"])
      for (const p of parts(name)) expect(p.fairing).toBe(true);
  });
});
