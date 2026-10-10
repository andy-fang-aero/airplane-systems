// Retitled console/supply regression guards; the new outcome is in sr22t-oxygen-outlets.test.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Oxygen, QuantityGauge } from "@/aircraft/sr22t/panels/oxygen";
/** AMM 13773-002 Rev 7 35-00 (PDF pp. 1780–1781), AFMS 102NMAN0001 Rev F pp. 8–11. */
import {
  Box3,
  Euler,
  Mesh,
  Vector3,
  Matrix4,
  Quaternion,
  Raycaster,
  MeshBasicMaterial,
  DoubleSide,
  TubeGeometry,
  Line3,
  Triangle,
} from "three";
import { afterEach, describe, expect, it } from "vitest";
import { AB, inFus } from "@/aircraft/sr22t/geometry";
import { initialSim, oxyPanelLamps, solve, type Sim } from "@/aircraft/sr22t/model";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { curveOf } from "@/lib/geometry";
import { CAT, LIGHTS, OXY } from "@/aircraft/sr22t/parts";
import { useSR22T } from "@/aircraft/sr22t/store";
import type { PartSpec } from "@/lib/catalogue";
import { useView } from "@/lib/view";
import { mats } from "@/lib/materials";
import { patched, type Patch } from "./helpers";

const one = (name: string) => {
  const p = CAT.parts.find((p) => p.name === name);
  if (!p) throw new Error(`Missing oxygen audit part: ${name}`);
  return p;
};
const transform = (p: PartSpec) =>
  new Matrix4().compose(
    new Vector3(...(p.pos ?? [0, 0, 0])),
    new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
    new Vector3(...(p.scale ?? [1, 1, 1])),
  );
const worldBox = (p: PartSpec) => {
  const g = p.geo();
  try {
    g.computeBoundingBox();
    const { min, max } = g.boundingBox!;
    const corners: Vector3[] = [];
    for (const x of [min.x, max.x])
      for (const y of [min.y, max.y])
        for (const z of [min.z, max.z]) corners.push(new Vector3(x, y, z).applyMatrix4(transform(p)));
    return new Box3().setFromPoints(corners);
  } finally {
    g.dispose();
  }
};
const state = (p: Patch<Sim> = {}) => patched(initialSim, p);
const lamps = (p: Patch<Sim> = {}) => {
  const s = state(p);
  return oxyPanelLamps(s, solve(s));
};
const saved = useSR22T.getState();
const savedView = useView.getState();
afterEach(() => {
  useSR22T.setState(saved);
  useView.setState(savedView);
});

describe("SR22T built-in oxygen hardware (AMM 35-00; AFMS Fig 1)", () => {
  it("the 77 cu ft bottle can hold its charge at 1800 psig (AMM 35-00)", () => {
    // Assumed usable interior, below the outer envelope; 77 cu ft × 28.317 L/cu ft × 14.7 / 1814.7 ≈ 17.7 L.
    const p = one("Oxygen bottle — 77 cu ft"),
      b = worldBox(p),
      size = b.getSize(new Vector3());
    expect(size.x).toBeCloseTo(0.66, 5);
    expect(size.y).toBeCloseTo(0.21, 5);
    expect(size.z).toBeCloseTo(0.21, 5);
    expect(Math.PI * (size.y / 2 - 0.005) ** 2 * (size.x - 0.06) * 1000).toBeGreaterThanOrEqual(17.7);
    expect(b.max.x).toBeLessThan(AB);
    // Check the entire actual cylinder surface, rather than only its centre.
    const g = p.geo();
    try {
      const v = g.getAttribute("position");
      for (let i = 0; i < v.count; i++) {
        const point = new Vector3().fromBufferAttribute(v, i).add(new Vector3(...p.pos!));
        expect(inFus(point), point.toArray().join()).toBe(true);
      }
    } finally {
      g.dispose();
    }
    expect(p.note).toContain("Illustrative: no bottle drawing");
  });

  it("the oxygen control panel is in the console left of the flap switch (AFMS §1.1 p. 11)", () => {
    const panel = one("Oxygen system control panel"),
      flap = one("FLAPS switch");
    expect(new Vector3(...panel.pos!).distanceTo(new Vector3(...flap.pos!))).toBeLessThan(0.1);
    expect(panel.pos![2]).toBeLessThan(flap.pos![2]);
    expect(panel.rot).toEqual(flap.rot);
    const controller = one("Oxygen logic controller");
    expect(controller.pos![0]).toBeGreaterThan(panel.pos![0]);
    expect(worldBox(controller).intersectsBox(worldBox(panel))).toBe(false);
  });

  it("the panel back face is flush with the integrated flap panel (AFMS §1.1 p. 11)", () => {
    const panel = one("Oxygen system control panel"),
      flap = one("FLAPS switch");
    const normal = new Vector3(1, 0, 0).applyEuler(new Euler(...flap.rot!));
    // The existing 40 mm flap-switch body has its back at the console face.
    const consoleFace = new Vector3(...flap.pos!).addScaledVector(normal, 0.02);
    const back = new Vector3(...panel.pos!).addScaledVector(normal, 0.002);
    expect(back.sub(consoleFace).dot(normal)).toBeCloseTo(0, 7);
  });

  it("oxygen and flap bezel front faces are co-planar (AFMS §1.1 p. 11; thickness illustrative)", () => {
    const panel = one("Oxygen system control panel"),
      flap = one("Flap panel");
    const normal = new Vector3(1, 0, 0).applyEuler(new Euler(...panel.rot!));
    const face = (p: PartSpec) => {
      const g = p.geo();
      try {
        const v = g.getAttribute("position");
        return Math.min(
          ...Array.from({ length: v.count }, (_, i) =>
            new Vector3().fromBufferAttribute(v, i).applyMatrix4(transform(p)).dot(normal),
          ),
        );
      } finally {
        g.dispose();
      }
    };
    expect(face(panel)).toBeCloseTo(face(flap), 7);
  });

  it("the manifold body clears both roll-cage hoops (AFMS Fig 1 p. 10; position illustrative)", () => {
    const body = worldBox(one("Overhead distribution manifold"));
    const manifold = one("Overhead distribution manifold");
    const solid = manifold.geo();
    try {
      const vertices = solid.getAttribute("position");
      for (let i = 0; i < vertices.count; i++)
        expect(inFus(new Vector3().fromBufferAttribute(vertices, i).applyMatrix4(transform(manifold)))).toBe(true);
    } finally {
      solid.dispose();
    }
    for (const p of CAT.parts.filter((p) => p.name === "Composite roll cage")) {
      const g = p.geo() as TubeGeometry;
      try {
        for (let i = 0; i <= 1000; i++) {
          const point = g.parameters.path.getPoint(i / 1000).applyMatrix4(transform(p));
          expect(body.distanceToPoint(point) - g.parameters.radius).toBeGreaterThan(0);
        }
      } finally {
        g.dispose();
      }
    }
  });

  it("the overhead console carries the dome light, forward of the CAPS cover and speaker (AFMS Fig 1; POH 7-59)", () => {
    const unit = worldBox(one("Overhead distribution manifold")),
      dome = worldBox(one("Dome light"));
    expect(OXY.manifold[0]).toBeCloseTo(LIGHTS.dome[0], 10);
    expect(OXY.manifold[2]).toBeCloseTo(LIGHTS.dome[2], 10);
    // The lens sits on the lower face.
    expect(dome.max.y).toBeCloseTo(unit.min.y, 6);
    expect(dome.min.x).toBeGreaterThanOrEqual(unit.min.x);
    expect(dome.max.x).toBeLessThanOrEqual(unit.max.x);
    for (const name of [
      "CAPS activation handle cover",
      "CAPS handle receptacle",
      "CAPS cover black forward tab",
      "Cabin speaker",
    ])
      expect(unit.min.x, name).toBeGreaterThan(worldBox(one(name)).max.x);
    expect(one("Overhead distribution manifold").note).toContain("stations approximate (AFMS Fig 1 undimensioned)");
  });

  it("the supply ends on the overhead console's aft face (AFMS Fig 1 p. 10)", () => {
    const supply = one("Center cabin low pressure oxygen line").geo() as TubeGeometry;
    try {
      const path = supply.parameters.path;
      expect(worldBox(one("Overhead distribution manifold")).distanceToPoint(path.getPoint(1))).toBeLessThan(1e-8);
      expect(path.getPoint(1).x).toBeCloseTo(worldBox(one("Overhead distribution manifold")).min.x, 8);
    } finally {
      supply.dispose();
    }
  });

  it("headliner distribution stays within the fuselage skin (AFMS Fig 1 p. 10; routing illustrative)", () => {
    for (const p of CAT.parts.filter(
      (p) =>
        p.sys.includes("oxygen") &&
        (p.name?.startsWith("Oxygen outlet ") ||
          ["Center cabin low pressure oxygen line", "Overhead distribution manifold"].includes(p.name ?? "")),
    )) {
      const g = p.geo();
      try {
        const vertices = g.getAttribute("position");
        for (let i = 0; i < vertices.count; i++) {
          const point = new Vector3().fromBufferAttribute(vertices, i).applyMatrix4(transform(p));
          expect(inFus(point), `${p.name}: ${point.toArray()}`).toBe(true);
        }
      } finally {
        g.dispose();
      }
    }
  });

  it("oxygen tubes clear all stationary non-oxygen tubes outside the manifold (AFMS Fig 1 p. 10)", () => {
    const tubes = CAT.parts
      .filter((p) => !p.parent && !p.fairing && !p.plate)
      .flatMap((p) => {
        const g = p.geo();
        try {
          if (g.type !== "TubeGeometry") return [];
          const geo = g as TubeGeometry,
            matrix = transform(p);
          const points = Array.from({ length: 401 }, (_, i) =>
            geo.parameters.path.getPoint(i / 400).applyMatrix4(matrix),
          );
          const radius = geo.parameters.radius * Math.max(...(p.scale ?? [1, 1, 1]).map(Math.abs));
          return [
            {
              p,
              points,
              radius,
              box: new Box3().setFromPoints(points).expandByScalar(radius),
              segments: points.slice(1).map((point, i) => ({
                line: new Line3(points[i], point),
                box: new Box3().setFromPoints([points[i], point]).expandByScalar(radius),
              })),
            },
          ];
        } finally {
          g.dispose();
        }
      });
    expect(tubes.filter((t) => t.p.name === "Composite roll cage")).toHaveLength(2);
    for (const a of tubes.filter((t) => t.p.sys.includes("oxygen")))
      for (const b of tubes.filter((t) => !t.p.sys.includes("oxygen"))) {
        if (!a.box.intersectsBox(b.box)) continue;
        let gap = Infinity;
        for (const point of a.points) {
          const nearest = Math.min(
            ...b.segments
              .filter((segment) => segment.box.distanceToPoint(point) <= a.radius + 1e-5)
              .map((segment) => segment.line.closestPointToPoint(point, true, new Vector3()).distanceTo(point)),
          );
          gap = Math.min(gap, nearest - a.radius - b.radius);
        }
        expect(gap, `${a.p.name} / ${b.p.name ?? b.p.id}: surface gap ${gap}`).toBeGreaterThanOrEqual(-1e-5);
      }
  }, 15000);

  it("all oxygen bounds clear the CAPS station and console units (POH Fig 7-4; AFMS Fig 1 p. 10)", () => {
    const obstacles = [
      "CAPS activation T-handle",
      "CAPS handle receptacle",
      "CAPS activation handle cover",
      "CAPS cover black forward tab",
      "Flap panel",
      "GCU 479 FMS keyboard",
      "GMC 707 autopilot mode controller",
      "GMA 350 audio panel",
      "PARK BRAKE handle",
      "Cabin speaker",
      "Cabin light switch",
      "Reading light",
      "Reading light push button",
    ];
    // A long tube's single box encloses empty space; bound each short run of its path instead.
    const bounds = (p: PartSpec) => {
      const g = p.geo();
      try {
        if (g.type !== "TubeGeometry") return [worldBox(p)];
        const tube = g as TubeGeometry,
          points = tube.parameters.path.getPoints(400).map((v) => v.applyMatrix4(transform(p)));
        return points
          .slice(1)
          .map((v, i) => new Box3().setFromPoints([points[i], v]).expandByScalar(tube.parameters.radius));
      } finally {
        g.dispose();
      }
    };
    for (const name of obstacles)
      for (const o of CAT.parts.filter((p) => p.name === name))
        for (const p of CAT.parts.filter((p) => p.sys.includes("oxygen")))
          for (const b of bounds(p)) expect(worldBox(o).intersectsBox(b), `${name} / ${p.name ?? p.id}`).toBe(false);
  });

  it("oxygen tube centrelines and surfaces clear solid hardware (AFMS Fig 1 p. 10; routing approximate)", () => {
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const manifoldBounds = worldBox(one("Overhead distribution manifold"));
    const hardware = CAT.parts
      .filter((p) => !p.parent && !p.fairing && !p.plate)
      .map((p) => {
        const g = p.geo();
        g.computeBoundingBox();
        return {
          p,
          g,
          mesh: new Mesh(g, material),
          inverse: transform(p).invert(),
          box: g.boundingBox!.clone().applyMatrix4(transform(p)).expandByScalar(1e-5),
        };
      });
    const directions = [
      [1, 0.37, 0.19],
      [0.23, 1, 0.41],
      [0.31, 0.17, 1],
    ].map((v) => new Vector3(...v).normalize());
    const inside = (h: (typeof hardware)[number], w: Vector3) => {
      const local = w.clone().applyMatrix4(h.inverse);
      if (!h.g.boundingBox!.clone().expandByScalar(-1e-5).containsPoint(local)) return false;
      return (
        directions.filter((direction) => {
          const hits = new Raycaster(local, direction).intersectObject(h.mesh);
          const distinct = hits.filter((hit, i) => i === 0 || Math.abs(hit.distance - hits[i - 1].distance) > 1e-7);
          return distinct.length % 2 === 1;
        }).length >= 2
      );
    };
    try {
      for (const line of hardware.filter((h) => h.p.sys.includes("oxygen") && h.g.type === "TubeGeometry")) {
        const path = (line.g as TubeGeometry).parameters.path;
        const start = path.getPoint(0).applyMatrix4(transform(line.p));
        const end = path.getPoint(1).applyMatrix4(transform(line.p));
        const points = Array.from({ length: 201 }, (_, i) => path.getPoint(i / 200).applyMatrix4(transform(line.p)));
        const vertices = line.g.getAttribute("position");
        for (let i = 0; i < vertices.count; i++)
          points.push(new Vector3().fromBufferAttribute(vertices, i).applyMatrix4(transform(line.p)));
        // Include every tested centreline/surface point and the clearance tolerance.
        const bounds = new Box3().setFromPoints(points).expandByScalar(1e-5);
        for (const h of hardware.filter(
          (h) =>
            ["BoxGeometry", "CylinderGeometry", "SphereGeometry"].includes(h.g.type) ||
            [
              "CAPS activation T-handle",
              "CAPS handle receptacle",
              "CAPS activation handle cover",
              "CAPS cover black forward tab",
              "Flap panel",
              "GCU 479 FMS keyboard",
              "GMC 707 autopilot mode controller",
              "GMA 350 audio panel",
              "PARK BRAKE handle",
              "Composite roll cage",
            ].includes(h.p.name ?? ""),
        )) {
          if (!bounds.intersectsBox(h.box)) continue;
          for (const point of points) {
            // Only actual end fittings are allowed to enter their connected hardware.
            const manifold =
              h.p.name === "Overhead distribution manifold" &&
              ((manifoldBounds.containsPoint(start) && point.distanceTo(start) < 0.1) ||
                (manifoldBounds.distanceToPoint(end) < 1e-8 && point.distanceTo(end) < 0.02));
            const regulator =
              h.p.name === "Regulator / latching solenoid" &&
              line.p.name === "Non-conductive oxygen hose" &&
              point.distanceTo(start) < 0.012;
            const filler =
              h.p.name === "Remote filler station" && line.p.name === "Filler line" && point.distanceTo(end) < 0.015;
            if (manifold || regulator || filler) continue;
            expect(inside(h, point), `${line.p.name} / ${h.p.name ?? h.p.id} at ${point.toArray()}`).toBe(false);
          }
        }
      }
    } finally {
      hardware.forEach((h) => h.g.dispose());
      material.dispose();
    }
  }, 15000);

  it("a non-conductive hose and a ground strap protect the aft line from lightning (AFMS Fig 1 p. 10)", () => {
    const hose = worldBox(one("Non-conductive oxygen hose"));
    const regulator = worldBox(one("Regulator / latching solenoid"));
    const supply = worldBox(one("Center cabin low pressure oxygen line"));
    expect(hose.min.x).toBeGreaterThan(regulator.max.x - 0.001);
    expect(hose.max.x).toBeLessThan(supply.min.x + 0.025);
    expect(hose.max.y).toBeGreaterThan(regulator.max.y + 0.1);
    const strap = worldBox(one("Oxygen bottle ground strap"));
    const bottle = worldBox(one("Oxygen bottle — 77 cu ft"));
    expect(strap.max.x).toBeCloseTo(bottle.min.x, 5);
    expect(strap.min.x).toBeLessThan(bottle.min.x);
  });

  it("new oxygen solids clear installed hardware in world coordinates (AFMS Fig 1; AMM 35-00)", () => {
    const oxygen = CAT.parts.filter((p) => p.sys.includes("oxygen"));
    const solids = oxygen.filter((p) => {
      const g = p.geo();
      const solid = g.type !== "TubeGeometry" && !p.name?.endsWith(" lamp");
      g.dispose();
      return solid;
    });
    // World boxes audit physical hardware, not hollow enclosing fairings, translucent bulkheads,
    // moving-group coordinates, or long curved tubes whose box encloses empty space.
    const neighbours = CAT.parts
      .filter((p) => !p.parent && !p.fairing && !p.plate && !oxygen.includes(p))
      .filter((p) => {
        const g = p.geo();
        const solid = ["BoxGeometry", "CylinderGeometry", "SphereGeometry"].includes(g.type);
        g.dispose();
        return solid;
      });
    for (const a of solids) {
      for (const b of [...neighbours, ...solids.filter((p) => p.id > a.id)]) {
        expect(
          worldBox(a).expandByScalar(-0.001).intersectsBox(worldBox(b).expandByScalar(-0.001)),
          `${a.name ?? a.id} / ${b.name ?? b.id}`,
        ).toBe(false);
      }
    }
    for (const n of [
      "GTX 335/345 transponder",
      "Yaw servo actuator (GSA 80)",
      "BAT 2 — 2 × 12 V, 7 Ah",
      "Convenience system controller",
      "Timer Box",
    ])
      expect(worldBox(one("Oxygen bottle — 77 cu ft")).intersectsBox(worldBox(one(n))), n).toBe(false);
    // Rotated panel/lamp AABBs overlap empty space even though the faces do not. Check each lamp in the
    // panel frame: every vertex must be outside its aft face, with no solid embedded in the panel.
    const panel = one("Oxygen system control panel");
    const rotation = new Euler(...panel.rot!);
    const inverse = new Euler(0, 0, -rotation.z);
    for (const p of oxygen.filter((p) => p.name?.endsWith(" lamp"))) {
      const g = p.geo();
      try {
        const vertices = g.getAttribute("position");
        for (let i = 0; i < vertices.count; i++) {
          const v = new Vector3()
            .fromBufferAttribute(vertices, i)
            .applyEuler(rotation)
            .add(new Vector3(...p.pos!))
            .sub(new Vector3(...panel.pos!))
            .applyEuler(inverse);
          expect(v.x, p.name).toBeLessThanOrEqual(-0.002 + 1e-7);
        }
      } finally {
        g.dispose();
      }
    }
    expect(OXY.outlets).toHaveLength(5);
  });
});

describe("SR22T panel lamps follow AFMS §1 pp. 8–9 and Fig 2 p. 10", () => {
  it("capacity indication requires ON and controller power", () => {
    expect(lamps({ oxy: { on: true, psi: 1800 } }).capacity).toEqual(["on", "dark", "dark", "dark", "dark", "dark"]);
    expect(lamps({ oxy: { on: false } }).capacity).toEqual(Array(6).fill("dark"));
    expect(lamps({ oxy: { on: true, psi: 350 } }).capacity).toEqual(["dark", "dark", "dark", "dark", "dark", "flash"]);
    for (const on of [true, false])
      expect(lamps({ oxy: { on, flowFault: true }, paFt: 15000, cb: { "CABIN LIGHTS / OXYGEN": true } })).toEqual({
        capacity: Array(6).fill("dark"),
        required: "dark",
        fault: "dark",
      });
  });

  it.each([
    [2000, 0],
    [1800, 0],
    [1799, 1],
    [1600, 1],
    [1599, 2],
    [1200, 2],
    [1199, 3],
    [800, 3],
    [799, 4],
    [400, 4],
    [399, 5],
    [0, 5],
  ])("single-band interpretation at %i psig selects lamp %i (illustrative)", (psi, band) => {
    expect(lamps({ oxy: { on: true, psi } }).capacity).toEqual(
      Array.from({ length: 6 }, (_, i) => (i !== band ? "dark" : i === 5 ? "flash" : "on")),
    );
  });

  it("O₂ REQ’D is powered even with oxygen OFF above approximately 12,000 ft", () => {
    expect(lamps({ paFt: 12000, oxy: { on: false } }).required).toBe("dark");
    const high = lamps({ paFt: 12001, oxy: { on: false } });
    expect(high.required).toBe("on");
    expect(high.capacity).toEqual(Array(6).fill("dark"));
    expect(lamps({ paFt: 15000, oxy: { on: true } }).required).toBe("dark");
    // AFMS §1.1.2 p. 14: insufficient outlet pressure also lights the reminder.
    expect(lamps({ paFt: 12001, oxy: { on: true, flowFault: true } }).required).toBe("on");
    expect(lamps({ paFt: 12000, oxy: { on: true, flowFault: true } }).required).toBe("dark");
  });

  it("manifold pressure fault flashes only while ON and powered", () => {
    expect(lamps({ oxy: { on: true, flowFault: true } }).fault).toBe("flash");
    expect(lamps({ oxy: { on: false, flowFault: true } }).fault).toBe("dark");
    expect(lamps({ oxy: { on: true, flowFault: false } }).fault).toBe("dark");
  });

  it("steady and flashing lamps dim in unrelated views", () => {
    for (const psi of [1800, 350]) {
      const s = state({ oxy: { on: true, psi, flowFault: true } });
      useSR22T.setState({ s, E: solve(s) });
      for (const p of CAT.parts.filter((p) => p.name?.endsWith(" lamp") && p.sys.includes("oxygen"))) {
        const mesh = new Mesh();
        for (const sys of ["avionics", "cabin", "electrical"] as const) {
          useView.setState({ sys });
          for (const t of [0, 0.6, 1]) {
            p.anim!(mesh, t);
            expect(mesh.material, p.name).toBe(mats(p.color!).dim);
          }
        }
        for (const sys of ["oxygen", "overview"] as const) {
          useView.setState({ sys });
          p.anim!(mesh, 0);
          const lit =
            p.name === "Oxygen FAULT lamp" ||
            p.name === (psi === 1800 ? "Oxygen capacity FULL lamp" : "Oxygen capacity EMPTY lamp");
          expect(mesh.material, p.name).toBe(lit ? mats(p.color!).hi : mats("#303438").on);
        }
      }
    }
  });

  it("the 3D lamps show the pure panel state and flash at fixed frame times", () => {
    useView.setState({ sys: "oxygen" });
    const s = state({ oxy: { on: true, psi: 350, flowFault: true } });
    useSR22T.setState({ s, E: solve(s) });
    for (const name of ["Oxygen capacity EMPTY lamp", "Oxygen FAULT lamp"]) {
      const p = one(name),
        mesh = new Mesh();
      p.anim!(mesh, 0);
      const lit = mesh.material;
      p.anim!(mesh, 0.6);
      expect(mesh.material, name).not.toBe(lit);
      p.anim!(mesh, 1);
      expect(mesh.material, name).toBe(lit);
      useSR22T.setState({ s, E: { ...solve(s), oxyPwr: false } });
      p.anim!(mesh, 1);
      expect(mesh.material, name).not.toBe(lit);
      useSR22T.setState({ s, E: solve(s) });
    }
  });
});

it("the sidebar includes the five-person A5 reference (AFMS Fig 26 p. 42)", () => {
  const html = renderToStaticMarkup(createElement(Oxygen));
  expect(html).toContain("Five-person A5 duration reference");
  expect(html).toContain("≈5 h · ≈9 h");
  expect(html).toContain("A5 is the only flow device approved");
  expect(html.match(/POH 13772-007 &gt; AMM 13773-002 Rev 7 &gt; Precise Flight/g)).toHaveLength(1);
  expect(html).not.toContain("Source precedence remains");
  expect(html).toContain("modelling assumption");
  expect(html).toContain("pending installed-display confirmation");
});

it("quantity dial retains the amber 400–800 psig scale even without indication (AFMS §1.1.2 p. 14)", () => {
  for (const psi of [null, 350, 400, 800, 1800]) {
    const html = renderToStaticMarkup(createElement(QuantityGauge, { psi }));
    expect(html).toContain('data-oxygen-amber-band="400-800"');
    expect(html).toContain('stroke="#F4B43B"');
    expect(html.includes("data-oxygen-needle")).toBe(psi !== null);
  }
});

it("oxygen hardware clears every rendered flow tube (AFMS Fig 1 p. 10; routing illustrative)", () => {
  // Use the renderer's curve, tension and radius, including tubes without moving particles.
  const flows = FLOWS.filter((f) => f.tube !== false).map((f) => {
    const curve = curveOf(f.pts, f.tension ?? 0.3);
    const points = curve.getPoints(Math.max(400, Math.ceil(curve.getLength() / 0.002)));
    const radius = f.r ?? 0.012;
    return { f, points, radius, box: new Box3().setFromPoints(points).expandByScalar(radius) };
  });
  for (const p of CAT.parts.filter((p) => p.sys.includes("oxygen") && !p.parent && !p.fairing && !p.plate)) {
    const g = p.geo();
    try {
      const matrix = transform(p),
        inverse = matrix.clone().invert();
      g.computeBoundingBox();
      const box = g.boundingBox!.clone().applyMatrix4(matrix);
      for (const flow of flows) {
        if (!box.clone().expandByScalar(0.02).intersectsBox(flow.box)) continue;
        let gap = Infinity;
        if (g.type === "TubeGeometry") {
          const tube = g as TubeGeometry;
          const points = tube.parameters.path.getPoints(600).map((v) => v.applyMatrix4(matrix));
          const segments = points.slice(1).map((v, i) => new Line3(points[i], v));
          for (const v of flow.points) {
            if (box.distanceToPoint(v) > flow.radius + tube.parameters.radius + 0.02) continue;
            for (const segment of segments)
              gap = Math.min(
                gap,
                segment.closestPointToPoint(v, true, new Vector3()).distanceTo(v) -
                  flow.radius -
                  tube.parameters.radius,
              );
          }
        } else {
          const vertices = g.getAttribute("position"),
            index = g.getIndex();
          const triangles = Array.from(
            { length: (index?.count ?? vertices.count) / 3 },
            (_, i) =>
              new Triangle(
                ...([0, 1, 2].map((j) =>
                  new Vector3().fromBufferAttribute(vertices, index ? index.getX(i * 3 + j) : i * 3 + j),
                ) as [Vector3, Vector3, Vector3]),
              ),
          );
          const material = new MeshBasicMaterial({ side: DoubleSide }),
            mesh = new Mesh(g, material);
          try {
            for (const v of flow.points) {
              const local = v.clone().applyMatrix4(inverse);
              if (g.boundingBox!.distanceToPoint(local) > flow.radius + 0.02) continue;
              const hits = new Raycaster(local, new Vector3(1, 0.37, 0.19).normalize()).intersectObject(mesh);
              const distinct = hits.filter((hit, i) => i === 0 || Math.abs(hit.distance - hits[i - 1].distance) > 1e-7);
              const distance = Math.min(
                ...triangles.map((t) => t.closestPointToPoint(local, new Vector3()).distanceTo(local)),
              );
              gap = Math.min(gap, (distinct.length % 2 ? -distance : distance) - flow.radius);
            }
          } finally {
            material.dispose();
          }
        }
        expect(gap, `${p.name} / ${flow.f.key}: ${gap} m`).toBeGreaterThan(0);
      }
    } finally {
      g.dispose();
    }
  }
}, 15000);

it("supply retains its 3.5 mm roll-cage gap (routing illustrative)", () => {
  const gapTo = (name: string, obstacle: string) => {
    const p = one(name),
      g = p.geo() as TubeGeometry;
    let gap = Infinity;
    try {
      const points = g.parameters.path.getPoints(1000).map((v) => v.applyMatrix4(transform(p)));
      const obstacles = CAT.parts.filter((p) => p.name === obstacle);
      expect(obstacles.length).toBeGreaterThan(0);
      for (const q of obstacles) {
        const other = q.geo() as TubeGeometry;
        try {
          const v = other.parameters.path.getPoints(1000).map((v) => v.applyMatrix4(transform(q)));
          const segments = v.slice(1).map((end, i) => new Line3(v[i], end));
          const box = new Box3().setFromPoints(v).expandByScalar(other.parameters.radius + g.parameters.radius + 0.02);
          for (const point of points) {
            if (!box.containsPoint(point)) continue;
            for (const segment of segments)
              gap = Math.min(
                gap,
                segment.closestPointToPoint(point, true, new Vector3()).distanceTo(point) -
                  other.parameters.radius -
                  g.parameters.radius,
              );
          }
        } finally {
          other.dispose();
        }
      }
      expect(Number.isFinite(gap)).toBe(true);
      return gap;
    } finally {
      g.dispose();
    }
  };
  // The supply crosses the x 0.75 hoop just under the roof.
  expect(gapTo("Center cabin low pressure oxygen line", "Composite roll cage")).toBeGreaterThanOrEqual(0.0035);
}, 15000);
