/** Internal SR20 G6 brake/trim/control installations stay under the study airframe's skin. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAT } from "@/aircraft/sr20/parts";
import { GEAR_CONTROLS_DEPTH_FLOWS } from "@/aircraft/sr20/gear-controls-depth-flow";
import { live } from "@/aircraft/sr20/model";
import { useSR20 } from "@/aircraft/sr20/store";
import { brakePressurePath } from "@/aircraft/sr20/parts/gear";
import { curveOf } from "@/lib/geometry";
import { insideSR20Airframe } from "./sr20-airframe-helpers";

const internal = new Set([
  "Brake fluid reservoir",
  "Brake reservoir cap",
  "Brake reservoir bracket",
  "Parking brake valve",
  "Parking brake position sensor",
  "Pulley cable retainer",
  "Primary control travel stop",
  "Pitch trim motor",
  "Pitch trim motor bracket",
  "Pitch trim actuation arm",
  "Pitch trim cartridge",
  "Pitch trim limit switch",
  "Roll trim motor",
  "Roll trim cartridge",
  "Roll trim motor offset arm",
  "Roll trim limit switch",
  "Roll trim relay",
  "Yaw trim spring cartridge",
  "Rudder centering spring",
  "Pitch servo — GSA 81",
  "Roll servo — GSA 81",
  "Servo mounting bracket",
  "Pitch servo capstan",
  "Roll servo capstan",
  "Servo slip clutch",
  "Capstan cable guard ring",
  "Servo capstan bridle wrap",
  "Servo bridle stop-ball",
  "Capstan groove exit transition",
  "Pitch servo bridle cable",
  "Roll servo bridle cable",
  "Servo bridle cable clamp",
  "GTA 82 pitch trim adapter",
  "Flap torque tube",
  "Flap actuator",
  "Flap actuator shaft / rod end",
  "Flap torque tube coupler",
  "Flap proximity sensor",
  "Flap relay",
]);

describe("SR20 G6 internal gear/control containment", () => {
  it("contains complete internal hardware envelopes, including cap and wing-sector keepers", () => {
    for (const part of CAT.parts.filter((p) => internal.has(p.name!))) {
      expect(part.parent, part.name).toBeUndefined();
      const g = part.geo(),
        matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(...(part.pos ?? [0, 0, 0])),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rot ?? [0, 0, 0]))),
          new THREE.Vector3(...(part.scale ?? [1, 1, 1])),
        );
      try {
        const vertices = g.getAttribute("position");
        for (let i = 0; i < vertices.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(matrix);
          expect(insideSR20Airframe(p), `${part.name}: ${p.toArray()}`).toBe(true);
        }
      } finally {
        g.dispose();
      }
    }
  });
  it("contains every internal hydraulic/trim wire tube through its full curved radius envelope", () => {
    for (const flow of GEAR_CONTROLS_DEPTH_FLOWS.filter((f) => !f.ext)) {
      const g = new THREE.TubeGeometry(curveOf(flow.pts, flow.tension ?? 0.3), 600, flow.r ?? 0.012, 12, false);
      try {
        const vertices = g.getAttribute("position");
        for (let i = 0; i < vertices.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(vertices, i);
          expect(insideSR20Airframe(p), `${flow.key}: ${p.toArray()}`).toBe(true);
        }
      } finally {
        g.dispose();
      }
    }
  });
  it("keeps animated internal spring/servo/actuator hardware inside through full control and flap travel", () => {
    const saved = useSR20.getState().s,
      angle = live.flapAng;
    try {
      for (const [pitch, roll, yaw, flap] of [
        [-1, -1, 1, 32],
        [1, 1, -1, 0],
        [0, 0, 0, 16],
      ]) {
        useSR20.setState({ s: { ...saved, ctrl: { pitch, roll, yaw } } });
        live.flapAng = flap;
        for (const part of CAT.parts.filter((p) => internal.has(p.name!) && p.anim)) {
          const m = new THREE.Mesh(part.geo());
          m.position.set(...(part.pos ?? [0, 0, 0]));
          m.rotation.set(...(part.rot ?? [0, 0, 0]));
          m.scale.set(...(part.scale ?? [1, 1, 1]));
          const shared = m.geometry;
          try {
            part.anim!(m, 0);
            m.updateMatrix();
            const vertices = m.geometry.getAttribute("position");
            for (let i = 0; i < vertices.count; i++) {
              const p = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(m.matrix);
              expect(
                insideSR20Airframe(p),
                `${part.name} at pitch${pitch}/roll${roll}/flap${flap}: ${p.toArray()}`,
              ).toBe(true);
            }
          } finally {
            if (m.geometry !== shared) m.geometry.dispose();
            shared.dispose();
            (m.material as THREE.Material).dispose();
          }
        }
      }
    } finally {
      useSR20.setState({ s: saved });
      live.flapAng = angle;
    }
  });
  it("routes brake temperature leads through the gear leg and wing entry instead of an exposed caliper-to-cabin chord", () => {
    for (const side of [-1, 1]) {
      const f = GEAR_CONTROLS_DEPTH_FLOWS.find((f) => f.key === "brakeTemp" + (side < 0 ? "L" : "R"))!;
      const leg = brakePressurePath(side).slice(4).reverse();
      expect(f.ext).toBe(true);
      expect(f.pts.slice(0, leg.length)).toEqual(leg);
      const entry = new THREE.Vector3(...brakePressurePath(side)[3]);
      expect(insideSR20Airframe(entry)).toBe(true);
    }
  });
});
