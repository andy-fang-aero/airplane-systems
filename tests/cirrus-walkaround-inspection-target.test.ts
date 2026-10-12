/** POH SR20 11934-005 / SR22T 13772-007 4-5, 4-7, 4-9: inspection labels point to the inspected hardware. */
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CAT as sr20Cat } from "@/aircraft/sr20/parts";
import { FUSE, FW, WTIP, wC, wLE, wingP } from "@/aircraft/sr20/geometry";
import { CROUCH_Y } from "@/aircraft/sr20/walkaround";
import { COWL_INLETS } from "@/aircraft/cowl-inlets";
import { initialSim as sr20Initial, solve as sr20Solve } from "@/aircraft/sr20/model";
import * as sr20Walk from "@/aircraft/sr20/walk";
import { CAT as sr22tCat } from "@/aircraft/sr22t/parts";
import { initialSim as sr22tInitial, solve as sr22tSolve } from "@/aircraft/sr22t/model";
import * as sr22tWalk from "@/aircraft/sr22t/walk";
import { specGeo } from "@/lib/catalogue";
import { partCentre, spotsAt, spotsPart } from "@/lib/spot";
import { useView } from "@/lib/view";

const savedView = useView.getState();
afterEach(() => useView.setState(savedView));
// Build the hull geometry once, as the existing walkaround pose suite does; individual assertions stay under 5 s.
beforeAll(() => {
  sr20Walk.underAirplane(new Vector3());
  sr22tWalk.underAirplane(new Vector3());
}, 120_000);

it("the left-fuselage transponder check highlights and frames the unique right-offset belly antenna", () => {
  const step = sr20Walk.walkSteps().find((step) => step.item.id === "2c")!;
  const antenna = sr20Cat.parts.find((part) => part.name === "Transponder antenna")!;
  const centre = partCentre(antenna, specGeo(antenna));
  expect(step.station.side).toBe("L");
  expect(centre.z).toBeGreaterThan(0.05);
  const side = sr20Walk.stepSide(step);
  const spot = { names: sr20Walk.stepParts(step).shown, side };
  expect(spotsPart(spot, antenna, specGeo(antenna), sr20Cat)).toBe(true);
  expect(sr20Walk.stepCentroid(step)!.distanceTo(centre)).toBeLessThan(1e-9);
  const pose = sr20Walk.stepPose(step);
  expect(new Vector3(...pose.t).distanceTo(centre)).toBeLessThan(1e-9);
  expect(pose.p[1]).toBe(CROUCH_Y);
  // Ordinary paired checks still inherit their station's side.
  expect(sr20Walk.stepSide(sr20Walk.walkSteps().find((step) => step.item.id === "2g")!)).toBe(-1);
  expect(sr20Walk.stepSide(sr20Walk.walkSteps().find((step) => step.item.id === "4a")!)).toBe(1);
});

describe("pitot heat probe verification points to the tube while retaining the cockpit switch", () => {
  for (const { name, cat, onId, offId, read } of [
    {
      name: "SR20",
      cat: sr20Cat,
      onId: "1p",
      offId: "1q",
      read: () => {
        const step = sr20Walk.walkSteps().find((s) => s.item.id === "1p")!;
        return {
          marker: sr20Walk.stepCentroid(step)!,
          pose: sr20Walk.stepPose(step),
          spot: { names: sr20Walk.stepParts(step).shown, side: sr20Walk.stepSide(step) },
        };
      },
    },
    {
      name: "SR22T",
      cat: sr22tCat,
      onId: "1r",
      offId: "1s",
      read: () => {
        const step = sr22tWalk.walkSteps(sr22tInitial).find((s) => s.item.id === "1r")!;
        return {
          marker: sr22tWalk.stepCentroid(step)!,
          pose: sr22tWalk.stepPose(step),
          spot: { names: sr22tWalk.stepParts(step).shown, side: sr22tWalk.stepSide(step) },
        };
      },
    },
  ]) {
    it(`${name}: camera and marker are on the physical tube, not between the wing and cockpit`, () => {
      const { marker, pose, spot } = read();
      const probe = cat.parts.find((p) => p.name === "Heated pitot tube")!;
      const tubeCentre = partCentre(probe, specGeo(probe));
      expect(marker.distanceTo(tubeCentre)).toBeLessThan(1e-9);
      expect(new Vector3(...pose.t).distanceTo(tubeCentre)).toBeLessThan(1e-9);
      expect(tubeCentre.z).toBeLessThan(-5);
      for (const partName of ["PITOT HEAT switch", "Heated pitot tube"]) {
        const part = cat.parts.find((p) => p.name === partName)!;
        expect(spotsPart(spot, part, specGeo(part), cat), partName).toBe(true);
      }
    });

    it(`${name}: probe verification turns heat on and the following switch check turns it off`, () => {
      // Each aircraft has its own POH item ids and state shape.
      if (name === "SR20") {
        const steps = sr20Walk.walkSteps();
        const on = sr20Walk.simAt(
          sr20Initial,
          steps,
          steps.findIndex((s) => s.item.id === onId),
        );
        expect(on.pitot.heat).toBe(true);
        expect(sr20Solve(on).pitotPwr).toBe(true);
        expect(
          sr20Walk.simAt(
            sr20Initial,
            steps,
            steps.findIndex((s) => s.item.id === offId),
          ).pitot.heat,
        ).toBe(false);
      } else {
        const steps = sr22tWalk.walkSteps(sr22tInitial);
        const on = sr22tWalk.simAt(
          sr22tInitial,
          steps,
          steps.findIndex((s) => s.item.id === onId),
        );
        expect(on.pitot.heat).toBe(true);
        expect(sr22tSolve(on).pitotPwr).toBe(true);
        expect(
          sr22tWalk.simAt(
            sr22tInitial,
            steps,
            steps.findIndex((s) => s.item.id === offId),
          ).pitot.heat,
        ).toBe(false);
      }
    });
  }
});

it("SR22T tip checks anchor to the actual tip light assembly on both wings", () => {
  for (const [id, side, lightName] of [
    ["6a", 1, "Right wingtip: nav (green) + strobe"],
    ["12d", -1, "Left wingtip: nav (red) + strobe"],
  ] as const) {
    const step = sr22tWalk.walkSteps(sr22tInitial).find((s) => s.item.id === id)!;
    const light = sr22tCat.parts.find((p) => p.name === lightName)!;
    const tipCentre = partCentre(light, specGeo(light));
    const marker = sr22tWalk.stepCentroid(step)!;
    expect(marker.distanceTo(tipCentre)).toBeLessThan(1e-9);
    expect(Math.sign(marker.z)).toBe(side);
    expect(Math.abs(marker.z)).toBeGreaterThan(5.7);
    expect(new Vector3(...sr22tWalk.stepPose(step).t).distanceTo(marker)).toBeLessThan(1e-9);
  }
});

describe("SR20 tip and leading-edge inspection regions", () => {
  for (const { side, tipId, edgeId, wingName } of [
    { side: 1 as const, tipId: "6a", edgeId: "7a", wingName: "Right wing" },
    { side: -1 as const, tipId: "12d", edgeId: "11g", wingName: "Left wing" },
  ]) {
    it(`${tipId}: marks the rounded tip skin and highlights only the tip cap`, () => {
      const step = sr20Walk.walkSteps().find((s) => s.item.id === tipId)!;
      const marker = sr20Walk.stepCentroid(step)!;
      expect(Math.sign(marker.z)).toBe(side);
      expect(Math.abs(marker.z)).toBeGreaterThan(WTIP - 0.05);
      const xc = (wLE(marker.z) - marker.x) / wC(marker.z);
      expect(marker.distanceTo(wingP(marker.z, xc, 1))).toBeLessThan(1e-9);
      expect(new Vector3(...sr20Walk.stepPose(step).t).distanceTo(marker)).toBeLessThan(1e-9);
      const spot = { names: sr20Walk.stepParts(step).shown, side };
      expect(spotsAt(spot, wingName, side * 3)).toBe(false);
      const tips = sr20Cat.parts.filter((p) => p.name === "Wing tip");
      expect(tips).toHaveLength(2);
      for (const tip of tips) {
        const geo = specGeo(tip);
        const matchingSide = Math.sign(partCentre(tip, geo).z) === side;
        expect(spotsPart(spot, tip, geo, sr20Cat)).toBe(matchingSide);
        const bounds = geo.boundingBox!;
        expect(Math.min(Math.abs(bounds.min.z), Math.abs(bounds.max.z))).toBeGreaterThanOrEqual(5.54);
      }
    });

    it(`${edgeId}: highlights the narrow leading edge and inboard strips, leaving the full wing dim`, () => {
      const step = sr20Walk.walkSteps().find((s) => s.item.id === edgeId)!;
      const spot = { names: sr20Walk.stepParts(step).shown, side };
      expect(spotsAt(spot, wingName, side * 3)).toBe(false);
      const strips = sr20Walk.nameCentres("Stall strips", side);
      expect(strips).toHaveLength(1);
      expect(sr20Walk.stepCentroid(step)!.distanceTo(strips[0])).toBeLessThan(1e-9);
      expect(Math.abs(strips[0].x - wLE(strips[0].z))).toBeLessThan(0.02);
      expect(Math.sign(strips[0].z)).toBe(side);
      for (const name of ["Wing leading edge", "Stall strips"]) {
        const parts = sr20Cat.parts.filter((p) => p.name === name);
        expect(parts).toHaveLength(2);
        for (const part of parts) {
          const geo = specGeo(part);
          const matchingSide = Math.sign(partCentre(part, geo).z) === side;
          expect(spotsPart(spot, part, geo, sr20Cat)).toBe(matchingSide);
          if (name === "Stall strips") {
            expect(part.note).toContain("station, length or section");
            expect(part.note).toContain("schematic");
          }
          if (name === "Wing leading edge") {
            const positions = geo.getAttribute("position");
            for (let i = 0; i < positions.count; i++) {
              const z = positions.getZ(i);
              const chordFraction = (wLE(z) - positions.getX(i)) / wC(z);
              expect(chordFraction).toBeGreaterThanOrEqual(-1e-6);
              expect(chordFraction).toBeLessThan(0.04);
            }
          }
        }
      }
    });
  }

  it("hides the duplicated tip/leading-edge skin in ordinary views and exposes only the inspected side", () => {
    const mesh = new Mesh();
    for (const part of sr20Cat.parts.filter((p) =>
      ["Wing tip", "Wing leading edge", "Wing/fuselage fairing", "Cowling inspection region"].includes(p.name ?? ""),
    )) {
      expect(part.fairing && part.ext).toBe(true);
      useView.setState({ spot: null });
      part.anim!(mesh, 0);
      expect(mesh.visible).toBe(false);
      const side = Math.sign(partCentre(part, specGeo(part)).z) as -1 | 1;
      useView.setState({ spot: { names: [part.name!], side } });
      part.anim!(mesh, 0);
      expect(mesh.visible).toBe(true);
      useView.setState({ spot: { names: [part.name!], side: side === 1 ? -1 : 1 } });
      part.anim!(mesh, 0);
      expect(mesh.visible).toBe(false);
    }
  });
});

describe("SR20 blended fairing and cowl inspections use only their surface regions", () => {
  for (const region of ["Cowling inspection region", "Wing/fuselage fairing"]) {
    it(`${region}: every face points away from the skin on both sides`, () => {
      const parts = sr20Cat.parts.filter((p) => p.name === region);
      expect(parts).toHaveLength(2);
      for (const part of parts) {
        const geo = specGeo(part),
          positions = geo.getAttribute("position"),
          indices = geo.index!;
        for (let i = 0; i < indices.count; i += 3) {
          const a = new Vector3().fromBufferAttribute(positions, indices.getX(i)),
            b = new Vector3().fromBufferAttribute(positions, indices.getX(i + 1)),
            c = new Vector3().fromBufferAttribute(positions, indices.getX(i + 2));
          const centre = a
            .clone()
            .add(b)
            .add(c)
            .multiplyScalar(1 / 3);
          const normal = b.sub(a).cross(c.sub(a));
          if (normal.lengthSq() < 1e-16) continue;
          const outward =
            region === "Wing/fuselage fairing"
              ? new Vector3(0, 1, 0)
              : new Vector3(0, centre.y - FUSE.fus(centre.x).cy, centre.z);
          expect(normal.dot(outward), `${part.id}, triangle ${i / 3}`).toBeGreaterThan(0);
        }
      }
    });
  }

  for (const [id, side, region] of [
    ["2e", -1, "Wing/fuselage fairing"],
    ["4b", 1, "Wing/fuselage fairing"],
    ["8d", 1, "Cowling inspection region"],
    ["10b", -1, "Cowling inspection region"],
  ] as const) {
    it(`${id}: targets the actual ${side < 0 ? "left" : "right"} skin and leaves the whole wing/fuselage dim`, () => {
      const step = sr20Walk.walkSteps().find((s) => s.item.id === id)!;
      const marker = sr20Walk.stepCentroid(step)!;
      const spot = { names: sr20Walk.stepParts(step).shown, side };
      expect(spot.names).toEqual([region]);
      expect(spotsAt(spot, "Fuselage", 0)).toBe(false);
      expect(spotsAt(spot, side < 0 ? "Left wing" : "Right wing", side * 3)).toBe(false);
      expect(Math.sign(marker.z)).toBe(side);
      expect(new Vector3(...sr20Walk.stepPose(step).t).distanceTo(marker)).toBeLessThan(1e-9);
      const overlays = sr20Cat.parts.filter((p) => p.name === region);
      expect(overlays).toHaveLength(2);
      for (const part of overlays) {
        const geo = specGeo(part);
        const ownSide = Math.sign(partCentre(part, geo).z) === side;
        expect(spotsPart(spot, part, geo, sr20Cat)).toBe(ownSide);
        const positions = geo.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          const p = new Vector3().fromBufferAttribute(positions, i);
          if (region === "Wing/fuselage fairing") {
            expect(Math.abs(p.z)).toBeLessThan(0.8); // The highlighted junction cannot extend out into the wing.
            const xc = (wLE(p.z) - p.x) / wC(p.z);
            expect(xc).toBeGreaterThan(0);
            expect(xc).toBeLessThan(1);
            const skin = wingP(p.z, xc, 1);
            expect(p.y - skin.y).toBeCloseTo(0.002, 5);
            expect(FUSE.inside(skin, 0.0001)).toBe(false); // No buried cabin/wing patch.
          } else {
            expect(p.x).toBeGreaterThanOrEqual(FW - 1e-6);
            expect(p.x).toBeLessThanOrEqual(FUSE.xNose + 1e-6);
            expect(p.z * Math.sign(partCentre(part, geo).z)).toBeGreaterThanOrEqual(-1e-6);
          }
        }
        if (!ownSide) continue;
        // Use ordinary front-face culling: a reversed overlay would disappear from the inspection viewpoint.
        const material = new MeshBasicMaterial();
        const mesh = new Mesh(geo, material);
        const outward = region === "Wing/fuselage fairing" ? new Vector3(0, 1, 0) : new Vector3(0, 0, side);
        const hits = new Raycaster(
          marker.clone().addScaledVector(outward, 0.2),
          outward.clone().negate(),
        ).intersectObject(mesh);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].point.distanceTo(marker)).toBeLessThan(0.01);
        material.dispose();
      }
      if (region === "Wing/fuselage fairing") {
        const xc = (wLE(marker.z) - marker.x) / wC(marker.z);
        expect(marker.distanceTo(wingP(marker.z, xc, 1))).toBeLessThan(1e-9);
      } else {
        expect(marker.distanceTo(FUSE.onSkin(marker.x, marker.y, side, 1))).toBeLessThan(1e-9);
      }
    });
  }

  it("keeps both cowl inlet apertures open instead of covering them with an inspection skin", () => {
    for (const part of sr20Cat.parts.filter((p) => p.name === "Cowling inspection region")) {
      const geo = specGeo(part),
        positions = geo.getAttribute("position"),
        indices = geo.index!;
      for (let i = 0; i < indices.count; i += 3) {
        const centre = new Vector3();
        for (let j = 0; j < 3; j++) centre.add(new Vector3().fromBufferAttribute(positions, indices.getX(i + j)));
        centre.multiplyScalar(1 / 3);
        for (const inlet of COWL_INLETS.sr20) {
          if (centre.x < inlet.minX) continue;
          const radial =
            ((centre.y - inlet.y) / (0.45 * inlet.height)) ** 2 + ((centre.z - inlet.z) / (0.45 * inlet.width)) ** 2;
          expect(radial).toBeGreaterThanOrEqual(0.99);
        }
      }
    }
  });
});
