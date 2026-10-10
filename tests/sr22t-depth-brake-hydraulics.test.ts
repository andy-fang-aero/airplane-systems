/** POH 13772-007 7-25–7-26; AMM 13773-002 Rev 7 Figs 32-42-4/5, PDF 1476/1479/1481. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { initialSim, setPark } from "@/aircraft/sr22t/model";
import { useSR22T } from "@/aircraft/sr22t/store";
import { FW } from "@/aircraft/sr22t/geometry";
import {
  CAT,
  BRAKE_FITTINGS,
  BRAKE_LINES,
  PARK_VALVE,
  PARK_VALVE_PORT,
  PARK_HANDLE,
  PARK_ARM,
  PARK_CABLE,
  PARK_STOP,
  PARK_SHEATH,
  PARK_CLEVIS,
  parkClevis,
  parkStop,
  parkArmAngle,
  parkWire,
  parkWrap,
} from "@/aircraft/sr22t/parts";
import { animatePart, brakeAmount, brakeAnim, pressureAnim, glowAnim } from "@/lib/anims";
import { mats } from "@/lib/materials";
import { useView } from "@/lib/view";
const distance = (a: number[], b: number[]) => new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));
const parts = (name: string) => CAT.parts.filter((p) => p.name === name);

describe("SR22T brake hydraulic schematic", () => {
  it("every brake line ends on a fitting or port (Fig 32-42-4 PDF 1476, 1479; Fig 32-42-5 PDF 1481)", () => {
    expect(BRAKE_LINES).toHaveLength(19); // Three feed pieces, four supplies, four master hoses, four valve pieces, two strut lines, two caliper hoses.
    for (const line of BRAKE_LINES) {
      expect(distance(line.pts[0], BRAKE_FITTINGS[line.from]), line.from).toBeLessThan(0.01);
      expect(distance(line.pts.at(-1)!, BRAKE_FITTINGS[line.to]), line.to).toBeLessThan(0.01);
      const spec = parts(line.name).find((p) => {
        const geo = p.geo() as THREE.TubeGeometry;
        const match = distance(geo.parameters.path.getPoint(0).toArray(), BRAKE_FITTINGS[line.from]) < 0.001;
        geo.dispose();
        return match;
      });
      expect(spec, line.name).toBeDefined();
      const geo = spec!.geo() as THREE.TubeGeometry;
      try {
        expect(distance(geo.parameters.path.getPoint(1).toArray(), BRAKE_FITTINGS[line.to])).toBeLessThan(0.01);
      } finally {
        geo.dispose();
      }
      // Named terminals must belong to a rendered component, not just exist in the exported map.
      for (const key of [line.from, line.to]) {
        const point = BRAKE_FITTINGS[key];
        expect(
          CAT.parts.some((p) => {
            if (!p.pos || !p.name?.match(/Brake |Parking brake /)) return false;
            const geo = p.geo();
            geo.computeBoundingBox();
            const box = geo
              .boundingBox!.clone()
              .translate(new THREE.Vector3(...p.pos))
              .expandByScalar(0.01);
            geo.dispose();
            return box.containsPoint(new THREE.Vector3(...point));
          }),
          key,
        ).toBe(true);
      }
    }
  });

  it("the parking brake valve sits between the tees and the gear-leg lines (POH 7-26; AMM 32-42 PDF 1472)", () => {
    for (const side of ["lh", "rh"] as const) {
      expect(BRAKE_LINES.some((l) => l.from === `${side}Tee` && l.to === `${side}Master`)).toBe(true);
      expect(BRAKE_LINES.some((l) => l.from === `${side}Line` && l.to === `${side}Bulkhead`)).toBe(true);
      expect(BRAKE_LINES.some((l) => l.from === `${side}Bulkhead` && l.to === `${side}Union`)).toBe(true);
      expect(BRAKE_LINES.some((l) => l.from === `${side}Union` && l.to === `${side}Caliper`)).toBe(true);
    }
    expect(PARK_VALVE_PORT.lhMaster[0]).toBeGreaterThan(PARK_VALVE_PORT.rhMaster[0]);
    expect(PARK_VALVE_PORT.lhLine[0]).toBeGreaterThan(PARK_VALVE_PORT.rhLine[0]);
  });

  it("the valve is at the firewall on the LH side of the outboard console rib (AMM 32-42 PDF 1450)", () => {
    expect(PARK_VALVE[0]).toBeLessThan(FW);
    expect(PARK_VALVE[0]).toBeGreaterThan(FW - 0.3);
    expect(PARK_VALVE[2]).toBeLessThan(0);
    expect(parts("Parking brake poppet")).toHaveLength(2);
    expect(parts("Parking brake valve bracket")).toHaveLength(1);
  });

  it("the control cable runs from the PARK BRAKE handle to the valve arm (POH 7-26; AMM 32-42 PDF 1474)", () => {
    expect(distance(PARK_CABLE[0], PARK_HANDLE)).toBeLessThan(0.02);
    expect(PARK_CABLE.at(-1)).toEqual(PARK_SHEATH);
    expect(distance(parkWire(0).at(-1)!, PARK_CLEVIS)).toBeLessThan(0.007);
    expect(distance(PARK_SHEATH, [PARK_STOP[0], PARK_STOP[1] + 0.0015, PARK_STOP[2]])).toBeCloseTo(1.8 * 0.0254, 6);
  });

  it("ports, seats, arm and bracket contact actual body faces (AMM 32-42 PDF 1471, Fig 32-42-4 PDF 1479; illustrative cutaway)", () => {
    const body = parts("Parking brake valve")[0];
    const geo = body.geo();
    const vertices = geo.getAttribute("position");
    const index = geo.index;
    const triangle = new THREE.Triangle();
    const closest = new THREE.Vector3();
    const bodyOffset = new THREE.Vector3(...body.pos!);
    const required = [
      "Brake valve line port",
      "Brake elbow fitting",
      "Parking brake poppet seat",
      "Parking brake actuation arm",
      "Parking brake valve bracket",
    ];
    try {
      for (const name of required) {
        const specs = parts(name).filter((p) => name !== "Brake elbow fitting" || distance(p.pos!, PARK_VALVE) < 0.1);
        expect(specs.length, name).toBeGreaterThan(0);
        for (const p of specs) {
          const partGeo = p.geo();
          const attribute = partGeo.getAttribute("position");
          let gap = Infinity;
          const samples = Array.from({ length: attribute.count }, (_, v) =>
            new THREE.Vector3().fromBufferAttribute(attribute, v),
          );
          const partIndex = partGeo.index;
          for (let t = 0; t < (partIndex?.count ?? attribute.count); t += 3) {
            const center = new THREE.Vector3();
            for (let k = 0; k < 3; k++)
              center.add(new THREE.Vector3().fromBufferAttribute(attribute, partIndex ? partIndex.getX(t + k) : t + k));
            samples.push(center.multiplyScalar(1 / 3));
          }
          for (const sample of samples) {
            const point = sample.clone().add(new THREE.Vector3(...p.pos!));
            for (let t = 0; t < (index?.count ?? vertices.count); t += 3) {
              [triangle.a, triangle.b, triangle.c].forEach((q, k) =>
                q.fromBufferAttribute(vertices, index ? index.getX(t + k) : t + k).add(bodyOffset),
              );
              triangle.closestPointToPoint(point, closest);
              gap = Math.min(gap, point.distanceTo(closest));
            }
          }
          partGeo.dispose();
          expect(gap, name).toBeLessThanOrEqual(name === "Brake elbow fitting" ? 0.0005 : 0.001);
        }
      }
      expect(PARK_ARM[0] - PARK_VALVE[0]).toBeCloseTo(0.0535);
      expect(PARK_ARM[1]).toBe(PARK_VALVE[1]);
      expect(PARK_STOP[1] - PARK_ARM[1]).toBeCloseTo(0.02);
    } finally {
      geo.dispose();
    }
  });

  it("wire clears its clamped stop throughout PARK travel (AMM 32-42 PDF 1475, Fig 32-42-4 PDF 1479)", () => {
    const cable = parts("Parking brake cable core")[0];
    const stop = parts("Parking brake cable stop")[0];
    const before = useSR22T.getState();
    const cableMesh = new THREE.Mesh(cable.geo());
    const stopMesh = new THREE.Mesh(stop.geo());
    stopMesh.position.set(...stop.pos!);
    try {
      const poses: { cable: THREE.Vector3; stop: THREE.Vector3 }[] = [];
      for (const park of [false, true]) {
        useSR22T.setState({ s: { ...initialSim, gear: { ...initialSim.gear, park } } });
        cable.anim!(cableMesh, 0);
        stop.anim!(stopMesh, 0);
        poses.push({ cable: cableMesh.position.clone(), stop: stopMesh.position.clone() });
      }
      expect(poses[1].stop.toArray()).toEqual(parkStop(1));
      expect(poses[1].stop.y).toBeGreaterThan(poses[0].stop.y);
      const vertices = stopMesh.geometry.getAttribute("position");
      const index = stopMesh.geometry.index!;
      const triangle = new THREE.Triangle();
      const closest = new THREE.Vector3();
      for (let travel = 0; travel <= 20; travel++) {
        const fraction = travel / 20;
        const wireGeo = new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(
            parkWire(fraction).map((p) => new THREE.Vector3(...p)),
            false,
            "catmullrom",
            0,
          ),
          128,
          0.001,
          8,
          false,
        );
        const movingPath = wireGeo.parameters.path;
        wireGeo.dispose();
        let axisGap = Infinity,
          clearance = Infinity;
        const stopOffset = new THREE.Vector3(...parkStop(fraction));
        for (let sample = 0; sample <= 1000; sample++) {
          const point = movingPath.getPoint(sample / 1000);
          axisGap = Math.min(axisGap, point.distanceTo(stopOffset));
          if (point.distanceTo(stopOffset) > 0.015) continue;
          for (let t = 0; t < index.count; t += 3) {
            [triangle.a, triangle.b, triangle.c].forEach((q, k) =>
              q.fromBufferAttribute(vertices, index.getX(t + k)).add(stopOffset),
            );
            triangle.closestPointToPoint(point, closest);
            clearance = Math.min(clearance, point.distanceTo(closest));
          }
        }
        expect(clearance, `wire-to-stop clearance at ${fraction}`).toBeGreaterThan(0.001);
        expect(axisGap, `wire must actually cross stop at ${fraction}`).toBeLessThan(0.0045 - 0.001);
        expect(movingPath.getPoint(0).y).toBeGreaterThan(stopOffset.y);
        expect(movingPath.getPoint(1).y).toBeLessThan(stopOffset.y);
      }
    } finally {
      useSR22T.setState(before);
      cableMesh.geometry.dispose();
      stopMesh.geometry.dispose();
    }
  }, 20_000);

  it("clevis, contacting wrap and wire follow the free end throughout PARK travel (AMM Fig 32-42-4 sheet 4, PDF 1479)", () => {
    const pin = parts("Parking brake clevis pin")[0];
    const pinGeo = pin.geo() as THREE.CylinderGeometry;
    try {
      for (let i = 0; i <= 30; i++) {
        const fraction = i / 30;
        const center = parkClevis(fraction);
        expect(distance(center, [center[0], PARK_ARM[1], PARK_ARM[2]])).toBeCloseTo(0.01, 9);
        const wrap = parkWrap(fraction);
        expect(parkWire(fraction).at(-1)).toEqual(wrap[0]);
        for (const point of wrap) {
          expect(Math.hypot(point[1] - center[1], point[2] - center[2]) - 0.001).toBeCloseTo(
            pinGeo.parameters.radiusTop,
            9,
          );
          expect(Math.abs(point[0] - center[0]) + 0.001).toBeLessThan(pinGeo.parameters.height / 2);
        }
        // Moving wire stays in front of the valve body; it cannot sweep into its side/base rails.
        for (const point of parkWire(fraction)) expect(point[0] - 0.002).toBeGreaterThan(PARK_VALVE[0] + 0.049);
      }
      const before = useSR22T.getState();
      const mesh = new THREE.Mesh(pinGeo);
      try {
        for (const park of [false, true]) {
          useSR22T.setState({ s: { ...initialSim, gear: { ...initialSim.gear, park } } });
          pin.anim!(mesh, 0);
          expect(mesh.position.toArray()).toEqual(parkClevis(park ? 1 : 0));
          const arm = parts("Parking brake actuation arm")[0];
          arm.anim!(mesh, 0);
          const end = new THREE.Vector3(0, -0.01, 0).applyEuler(mesh.rotation).add(new THREE.Vector3(...PARK_ARM));
          expect(end.y).toBeCloseTo(parkClevis(park ? 1 : 0)[1], 9);
          expect(end.z).toBeCloseTo(parkClevis(park ? 1 : 0)[2], 9);
          expect(parts("Parking brake control cable")[0].anim).toBeUndefined();
          for (const [name, points] of [
            ["Parking brake cable core", parkWire],
            ["Parking brake clevis cable wrap", parkWrap],
          ] as const) {
            const spec = parts(name)[0];
            const tube = new THREE.Mesh(spec.geo());
            spec.anim!(tube, 0);
            const path = (tube.geometry as THREE.TubeGeometry).parameters.path;
            expect(path.getPoint(0).toArray()).toEqual(points(park ? 1 : 0)[0]);
            expect(distance(path.getPoint(1).toArray(), points(park ? 1 : 0).at(-1)!)).toBeLessThan(1e-9);
            const geometry = tube.geometry;
            spec.anim!(tube, 0);
            expect(tube.geometry).toBe(geometry);
            tube.geometry.dispose();
          }
        }
      } finally {
        useSR22T.setState(before);
      }
    } finally {
      pinGeo.dispose();
    }
  });

  it("inclined arm has a pull moment throughout travel without stretching the wire (AMM Fig 32-42-4 sheet 4, PDF 1479; illustrative angles)", () => {
    const length = distance(parkStop(0), parkWire(0).at(-1)!);
    const wireLength = (f: number) =>
      parkWire(f)
        .slice(1)
        .reduce((sum, point, i) => sum + distance(point, parkWire(f)[i]), 0);
    for (let i = 0; i <= 100; i++) {
      const f = i / 100;
      const wire = parkWire(f),
        stop = parkStop(f),
        end = wire.at(-1)!;
      // Distance from x-axis through the pivot to the final wire's infinite line in the y-z plane.
      const dy = end[1] - stop[1],
        dz = end[2] - stop[2];
      const moment = Math.abs(dy * (PARK_ARM[2] - stop[2]) - dz * (PARK_ARM[1] - stop[1])) / Math.hypot(dy, dz);
      expect(moment, `moment arm at ${f}`).toBeGreaterThan(0.005);
      expect(distance(stop, end)).toBeCloseTo(length, 6);
      expect(wireLength(f)).toBeCloseTo(wireLength(0), 6);
      // The wire has at least 1 mm chafe clearance from the arm's forward face.
      expect(end[0] - 0.002 - (PARK_ARM[0] + 0.0045)).toBeGreaterThan(0.001);
    }
    expect(parkArmAngle(0)).toBeCloseTo(-Math.PI / 3, 9);
    expect(parkArmAngle(1)).toBeCloseTo(-Math.PI / 2, 9);
  });

  it("arm 24 pivots at its upper end and surrounds pin 17 (AMM Fig 32-42-4 sheets 4/5 PDF 1479/1480)", () => {
    const arm = parts("Parking brake actuation arm")[0].geo();
    arm.computeBoundingBox();
    const b = arm.boundingBox!;
    expect(b.max.y).toBeCloseTo(0, 9);
    const pin = parts("Parking brake clevis pin")[0].geo() as THREE.CylinderGeometry;
    expect(-0.01 - pin.parameters.radiusTop).toBeGreaterThan(b.min.y);
    expect(-0.01 + pin.parameters.radiusTop).toBeLessThan(b.max.y);
    expect(pin.parameters.radiusTop).toBeLessThan(b.max.z);
    arm.dispose();
    pin.dispose();
  });

  it("wire and wrap meet without a radius step (AMM Fig 32-42-4 sheets 4/5 PDF 1479/1480; illustrative wire)", () => {
    const core = parts("Parking brake cable core")[0].geo() as THREE.TubeGeometry;
    const wrap = parts("Parking brake clevis cable wrap")[0].geo() as THREE.TubeGeometry;
    expect(core.parameters.radius).toBe(wrap.parameters.radius);
    for (let i = 0; i <= 20; i++) expect(parkWire(i / 20).at(-1)).toEqual(parkWrap(i / 20)[0]);
    core.dispose();
    wrap.dispose();
  });

  it("glow cues respect X-ray dimming in every view", () => {
    const before = useView.getState();
    const mesh = new THREE.Mesh();
    try {
      for (const xray of [false, true])
        for (const sys of ["gear", "overview", "electrical"] as const) {
          useView.setState({ sys, xray });
          for (const on of [false, true]) {
            // A ["gear"] part as components/scene/Part.tsx sees it: active in Gear and Overview; Part owns dimming.
            const active = sys !== "electrical",
              material = active || !xray ? mats("#67727D").on : mats("#67727D").dim;
            animatePart(
              mesh,
              0,
              { anim: glowAnim("#67727D", () => on, ["gear"]) },
              {
                material,
                active,
                focused: false,
                ghost: false,
              },
            );
            expect(mesh.material).toBe(
              !active
                ? xray
                  ? mats("#67727D").dim
                  : mats("#67727D").on
                : on
                  ? mats("#FFD34D").hi
                  : mats("#67727D").on,
            );
          }
        }
    } finally {
      useView.setState(before);
      mesh.geometry.dispose();
    }
  });

  it("position sensor rests on bracket 19 (AMM Fig 32-42-4 sheet 4 item 26, PDF 1479)", () => {
    const bounds = (name: string) => {
      const spec = parts(name)[0];
      const geo = spec.geo();
      geo.computeBoundingBox();
      const box = geo.boundingBox!.clone().translate(new THREE.Vector3(...spec.pos!));
      geo.dispose();
      return box;
    };
    const bracket = bounds("Parking brake valve bracket"),
      sensor = bounds("Parking brake position sensor");
    expect(sensor.min.y).toBeCloseTo(bracket.max.y, 7);
    expect(sensor.min.x).toBeGreaterThan(bracket.min.x);
    expect(sensor.max.x).toBeLessThan(bracket.max.x);
    expect(sensor.min.z).toBeLessThan(bracket.max.z);
    expect(sensor.max.z).toBeGreaterThan(bracket.min.z);
  });

  it("brake and pressure cues dim outside Gear and Overview, including held PARK", () => {
    const before = useView.getState();
    const mesh = new THREE.Mesh();
    try {
      for (const xray of [true, false]) {
        for (const sys of ["gear", "overview", "electrical", "fuel"] as const) {
          useView.setState({ sys, xray });
          for (const amount of [0, 0.8]) {
            for (const [anim, color] of [
              [pressureAnim, "#67727D"],
              [brakeAnim, "#9AA3AA"],
            ] as const) {
              anim(() => amount)(mesh, 0);
              expect(mesh.material).toBe(
                sys === "gear" || sys === "overview" || !xray
                  ? amount > 0
                    ? mats("#FF6A2A").hi
                    : mats(color).on
                  : mats(color).dim,
              );
            }
          }
        }
      }
    } finally {
      useView.setState(before);
      mesh.geometry.dispose();
    }
  });

  it.each([0.8, -0.8])("PARK holds the applied pressure (POH 7-26), toe input %s", (diff) => {
    const side = diff > 0 ? "R" : "L",
      other = side === "R" ? "L" : "R";
    const before = useSR22T.getState();
    const held = { ...setPark({ diff, park: false, held: { L: 0, R: 0 } }, true), diff: 0 };
    expect(held.held[side]).toBe(0.8);
    expect(held.held[other]).toBe(0);
    expect(brakeAmount(held, side)).toBe(0.8);
    expect(brakeAmount(held, other)).toBe(0);
    const mesh = new THREE.Mesh();
    try {
      useSR22T.setState({ s: { ...initialSim, gear: held } });
      for (const which of ["R", "L"] as const) {
        const poppet = parts("Parking brake poppet").find((p) => (p.pos![0] > PARK_VALVE[0] ? "L" : "R") === which)!;
        poppet.anim!(mesh, 0);
        expect(mesh.position.y).toBe(poppet.pos![1]);
        for (const line of BRAKE_LINES.filter((l) => l.side === which)) {
          const spec = parts(line.name).find((p) => {
            const geo = p.geo() as THREE.TubeGeometry;
            const match = distance(geo.parameters.path.getPoint(0).toArray(), line.pts[0]) < 0.001;
            geo.dispose();
            return match;
          })!;
          spec.anim!(mesh, 0);
          expect(mesh.material).toBe(line.held && which === side ? mats("#FF6A2A").hi : mats("#67727D").on);
        }
      }
      const released = setPark(held, false);
      expect(released.held).toEqual({ L: 0, R: 0 });
      expect(brakeAmount(released, side)).toBe(0);
      expect(brakeAmount({ ...released, diff }, side)).toBe(0.8);
      useSR22T.setState({ s: { ...initialSim, gear: released } });
      for (const p of parts("Parking brake poppet")) {
        p.anim!(mesh, 0);
        expect(mesh.position.y).toBeCloseTo(p.pos![1] + 0.012);
      }
      pressureAnim(() => 0)(mesh, 0);
      expect(mesh.material).toBe(mats("#67727D").on);
    } finally {
      useSR22T.setState(before);
      mesh.geometry.dispose();
    }
  });

  it("PARK with no toe input retains the legacy 0.6 display default (POH 7-26 mechanism)", () => {
    expect(initialSim.gear.held).toEqual({ L: 0, R: 0 });
    const start = structuredClone(initialSim.gear);
    expect(setPark(start, true).held).toEqual({ L: 0.6, R: 0.6 });
    expect(start).toEqual(initialSim.gear);
    // Other airplanes without held state retain their existing display.
    expect(brakeAmount({ park: true, diff: 0 }, "L")).toBe(0.6);
  });
});
