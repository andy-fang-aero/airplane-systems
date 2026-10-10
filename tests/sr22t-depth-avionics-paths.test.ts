/**
 * Avionics data, power and cooling paths: SR22T POH 13772-007 Fig 7-17 (7-73), 7-74 – 7-90;
 * AMM 13773-002 Rev 7 31-40 (PDF pp. 1326–1327), 34-10 (PDF p. 1630), 34-20 (PDF p. 1675), 21-20 (PDF p. 454).
 */
import { FLOWS, flowRates } from "@/aircraft/sr22t/flows";
import { WR, inFus, wC, wLE, wingP } from "@/aircraft/sr22t/geometry";
import { initialSim, solve } from "@/aircraft/sr22t/model";
import {
  ADAHRS_1,
  ADAHRS_2,
  CAT,
  GEA_71,
  GIA_1,
  GIA_2,
  GMA_350,
  MAG_WIRES,
  MFD_CONN,
  OAT_1,
  PFD_CONN,
  TANK_CHORD,
  TANK_SPAN,
} from "@/aircraft/sr22t/parts";
import { curveOf } from "@/lib/geometry";
import { toV } from "@/lib/math";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { patched } from "./helpers";

import {
  COOL_KEYS,
  DATA_KEYS,
  FEED_KEYS,
  NEW_KEYS,
  OAT_KEYS,
  ROUTED_KEYS,
  SECOND_LINKS,
  first,
  flow,
  frames,
  last,
  rates,
  rodRadii,
  same,
  samples,
  solids,
  swept,
} from "./sr22t-avionics-path-clearance";

describe("SR22T avionics data, power and cooling paths", () => {
  it("ADAHRS 2 has exactly the four avionics-only data connections in POH 13772-007 Fig 7-17 (7-73)", () => {
    const connections = FLOWS.filter(
      // OAT 2 also serves ADAHRS 2 (POH 7-75); its combined pitot/avionics path is outside this figure.
      (f) =>
        f.sys.length === 1 && f.sys.includes("avionics") && (same(f.pts[0], ADAHRS_2) || same(f.pts.at(-1)!, ADAHRS_2)),
    );
    expect(connections.map((f) => f.key).sort()).toEqual(SECOND_LINKS.map(([key]) => key).sort());
    expect(
      FLOWS.filter(
        (f) =>
          (same(f.pts[0], ADAHRS_2) && same(f.pts.at(-1)!, PFD_CONN)) ||
          (same(f.pts[0], PFD_CONN) && same(f.pts.at(-1)!, ADAHRS_2)),
      ),
    ).toHaveLength(0);
  });
  for (const [key, start, end] of SECOND_LINKS)
    it(`${key} connects its anchors and stops with ADAHRS 2 (POH 13772-007 Fig 7-17, 7-73; 7-75)`, () => {
      expect(same(first(key), start)).toBe(true);
      expect(same(last(key), end)).toBe(true);
      expect(flow(key).sys).toContain("avionics");
      expect(rates()[key]).toBeGreaterThan(0);
      expect(rates({ cb: { "ADAHRS 2": true } })[key]).toBe(0);
      expect(rates({ avx: { fail: { adahrs2: true } } })[key]).toBe(0);
      expect(rates({ cb: { "ADAHRS 1": true } })[key]).toBeGreaterThan(0);
    });
  it("MAG data particles follow their single physical harnesses", () => {
    for (const n of [1, 2] as const) {
      const f = flow(n === 1 ? "magData" : "magData2");
      expect(f.pts).toBe(MAG_WIRES[n]);
      expect(f.tension).toBe(0.15);
      expect(f.tube).toBe(false);
    }
    expect(rates({ cb: { "PFD B": true } }).magData2).toBe(0);
    expect(rates({ avx: { fail: { mag2: true } } }).magData2).toBe(0);
  });
  it("ADAHRS 2 destination power gates each link; GIAs use GPS NAV alone (POH 7-74/7-78; operator ruling)", () => {
    expect(rates({ cb: { "MFD A": true, "MFD B": true } }).adahrs2Mfd).toBe(0);
    for (const n of [1, 2]) {
      expect(rates({ cb: { [`GPS NAV GIA ${n}`]: true } })[`adahrs2Gia${n}`]).toBe(0);
      expect(rates({ cb: { [`COM ${n}`]: true } })[`adahrs2Gia${n}`]).toBeGreaterThan(0);
    }
  });
  it("ADAHRS 1 interfaces with the magnetometer, OAT probe, PFD and both GIAs (POH 7-75)", () => {
    for (const key of ["magData", "oatData1", "adahrsPfd", "adahrsGia1", "adahrsGia2"])
      expect(flow(key).sys).toContain("avionics");
    expect(same(first("oatData1"), OAT_1)).toBe(true);
    expect(same(last("magData"), ADAHRS_1)).toBe(true);
    expect(same(last("oatData1"), ADAHRS_1)).toBe(true);
    // one OAT 1 → ADAHRS 1 path: oatData1 on this route, no second tube from the same probe
    expect(FLOWS.filter((f) => same(f.pts[0], OAT_1))).toHaveLength(1);
    expect(same(first("adahrsPfd"), ADAHRS_1) && same(last("adahrsPfd"), PFD_CONN)).toBe(true);
    expect(same(first("adahrsGia1"), ADAHRS_1) && same(last("adahrsGia1"), GIA_1)).toBe(true);
    expect(same(first("adahrsGia2"), GIA_2) && same(last("adahrsGia2"), ADAHRS_1)).toBe(true);
  });

  it("each GIA links to its own display; the audio panel to both GIAs (AMM 31-40 PDF p. 1327; POH 7-74, 7-78)", () => {
    expect(same(first("gia1Pfd"), GIA_1) && same(last("gia1Pfd"), PFD_CONN)).toBe(true);
    expect(same(first("gia2Mfd"), GIA_2) && same(last("gia2Mfd"), MFD_CONN)).toBe(true);
    expect(same(first("pfdMfd"), PFD_CONN) && same(last("pfdMfd"), MFD_CONN)).toBe(true);
    expect(same(first("audioGia1"), GMA_350) && same(last("audioGia1"), GIA_1)).toBe(true);
    expect(same(first("audioGia2"), GMA_350) && same(last("audioGia2"), GIA_2)).toBe(true);
    expect(same(last("xpdrData"), GIA_1)).toBe(true); // primary IAU (POH 7-78)
  });

  it("the two GIAs do not talk to each other (AMM 31-40 PDF p. 1326)", () => {
    for (const f of FLOWS) {
      const g1 = f.pts.some((p) => same(p, GIA_1)),
        g2 = f.pts.some((p) => same(p, GIA_2));
      expect(g1 && g2, f.key).toBe(false);
    }
  });

  it("the GEA 71 links to both IAUs, as POH Fig 7-17 draws it (POH 13772-007 7-73)", () => {
    expect(same(first("geaData"), GEA_71) && same(last("geaData"), GIA_1)).toBe(true);
    expect(same(first("geaData2"), GEA_71) && same(last("geaData2"), GIA_2)).toBe(true);
    for (const key of ["geaData", "geaData2"]) {
      expect(flow(key).note, key).toMatch(/both Integrated Avionics Units \(POH 13772-007 Fig 7-17, 7-73\)/);
      expect(flow(key).note, key).not.toMatch(/does not say which/);
    }
  });

  it("optional sensor data reaches the secondary IAU (POH 7-84)", () => {
    for (const key of ["trafficData", "wxData", "dmeData"]) expect(same(last(key), GIA_2), key).toBe(true);
    // the GTS 800 takes its inputs via the primary Air Data Computer (POH 7-84)
    expect(flow("trafficData").pts.some((p) => same(p, ADAHRS_1))).toBe(true);
  });

  it("PFD stays fed with PFD A or PFD B in; the MFD with MFD A or MFD B (POH 7-74)", () => {
    const all = rates();
    for (const key of FEED_KEYS) expect(all[key], key).toBeGreaterThan(0);
    const noA = rates({ cb: { "PFD A": true } });
    expect(noA.pfdFeedA).toBe(0);
    expect(noA.pfdFeedB).toBeGreaterThan(0);
    expect(solve(patched(initialSim, { cb: { "PFD A": true } })).pfd).toBe(true);
    const noB = rates({ cb: { "PFD B": true } });
    expect(noB.pfdFeedB).toBe(0);
    expect(noB.pfdFeedA).toBeGreaterThan(0);
    const noMfdA = rates({ cb: { "MFD A": true } });
    expect(noMfdA.mfdFeedA).toBe(0);
    expect(noMfdA.mfdFeedB).toBeGreaterThan(0);
    const noMfdB = rates({ cb: { "MFD B": true } });
    expect(noMfdB.mfdFeedB).toBe(0);
    expect(noMfdB.mfdFeedA).toBeGreaterThan(0);
    // each feed ends at its display's connector
    for (const key of ["pfdFeedA", "pfdFeedB"]) expect(same(last(key), PFD_CONN), key).toBe(true);
    for (const key of ["mfdFeedA", "mfdFeedB"]) expect(same(last(key), MFD_CONN), key).toBe(true);
  });

  it("the IAU cooling duct stops with AVIONICS FAN 2 pulled (POH 7-90)", () => {
    const on = rates();
    for (const key of COOL_KEYS) expect(on[key], key).toBeGreaterThan(0);
    const s = patched(initialSim, { cb: { "AVIONICS FAN 2": true } });
    const E = solve(s);
    expect(E.fan2).toBe(false);
    const off = flowRates(s, E);
    for (const key of COOL_KEYS) expect(off[key], key).toBe(0);
  });

  it("a data link runs only while both end units are powered (POH 7-74 – 7-85)", () => {
    const on = rates();
    for (const key of DATA_KEYS) expect(on[key], key).toBeGreaterThan(0);
    // ADAHRS 1 breaker (ESS BUS 1, POH 7-75) stops every ADAHRS link and the traffic path through the ADC
    const noAdahrs = rates({ cb: { "ADAHRS 1": true } });
    for (const key of ["magData", "oatData1", "adahrsPfd", "adahrsGia1", "adahrsGia2", "trafficData"])
      expect(noAdahrs[key], key).toBe(0);
    expect(noAdahrs.gia1Pfd).toBeGreaterThan(0);
    // AVIONICS master off: the AVIONICS-bus units stop, the ESS / MAIN bus units keep talking (POH 7-78, 7-84)
    const avOff = rates({ elec: { avionics: false } });
    for (const key of ["xpdrData", "audioGia1", "audioGia2", "trafficData", "wxData", "dmeData"])
      expect(avOff[key], key).toBe(0);
    for (const key of ["adahrsGia1", "gia1Pfd", "gia2Mfd", "geaData", "geaData2"])
      expect(avOff[key], key).toBeGreaterThan(0);
    // ENGINE INSTR (ESS BUS 2, POH 7-78) stops the GEA 71 links
    const noGea = rates({ cb: { "ENGINE INSTR": true } });
    expect(noGea.geaData).toBe(0);
    expect(noGea.geaData2).toBe(0);
    // a failed PFD stops the links that end at it
    const pfdFail = rates({ avx: { pfdFail: true } });
    for (const key of ["adahrsPfd", "gia1Pfd", "pfdMfd"]) expect(pfdFail[key], key).toBe(0);
    expect(pfdFail.gia2Mfd).toBeGreaterThan(0);
    // simulated ADAHRS 1 / MAG 1 failures (POH 3-43) stop their links like a pulled breaker
    const adahrsFail = rates({ avx: { fail: { adahrs1: true } } });
    for (const key of ["magData", "oatData1", "adahrsPfd", "adahrsGia1", "adahrsGia2", "trafficData"])
      expect(adahrsFail[key], key).toBe(0);
    expect(adahrsFail.gia1Pfd).toBeGreaterThan(0);
    const magFail = rates({ avx: { fail: { mag1: true } } });
    expect(magFail.magData).toBe(0);
    for (const key of ["adahrsPfd", "adahrsGia1", "adahrsGia2", "trafficData"])
      expect(magFail[key], key).toBeGreaterThan(0);
    // COM 1 powers only the COM radio: GIA 1's data links run on GPS NAV GIA 1 (modelling choice, open question)
    const noCom1 = rates({ cb: { "COM 1": true } });
    for (const key of ["adahrsGia1", "gia1Pfd", "geaData", "xpdrData", "audioGia1"])
      expect(noCom1[key], key).toBeGreaterThan(0);
    const noNav1 = rates({ cb: { "GPS NAV GIA 1": true } });
    for (const key of ["adahrsGia1", "gia1Pfd", "geaData", "xpdrData", "audioGia1"]) expect(noNav1[key], key).toBe(0);
    expect(noNav1.adahrsGia2).toBeGreaterThan(0);
    // everything off: nothing moves
    const dark = rates({ elec: { bat1: false, bat2: false, alt1: false, alt2: false }, eng: { running: false } });
    for (const key of NEW_KEYS) expect(dark[key], key).toBe(0);
  });

  it("data links and power feeds use distinct colours, documented in the block comment", () => {
    const data = new Set(DATA_KEYS.map((k) => flow(k).pcolor));
    const feed = new Set(FEED_KEYS.map((k) => flow(k).pcolor));
    expect(data.size).toBe(1);
    expect(feed.size).toBe(1);
    expect([...data][0]).not.toBe([...feed][0]);
    for (const key of NEW_KEYS) expect(flow(key).note, key).toMatch(/Routing schematic\./);
  });

  it("pins the schematic OAT 2 clearance route (POH 7-75; AMM Fig 34-10-6 PDF 1666; AMM Fig 52-10-1 PDF 2011; 5 mm schematic margin)", () => {
    expect(flow("oatData2").tension).toBe(0);
    expect(
      flow("oatData2")
        .pts.slice(1, -1)
        .map((p) => toV(p).toArray()),
    ).toEqual([
      [1.275, -0.18, 4.635],
      [1.11, -0.18, 4.5],
      [1.035, -0.285, 2.88],
      [0.93, -0.45, 0.945],
      [1.035, -0.465, 0.675],
      [1.155, -0.45, 0.585],
      [1.26, -0.345, 0.54],
      [1.275, -0.33, 0.525],
      [2.31, -0.25, 0.09],
      [2.355, -0.25, 0.075],
      [2.37, -0.03, 0.06],
      [2.37, -0.015, 0.045],
      [2.415, 0.06, -0.0],
      [2.43, 0.09, -0.015],
      [2.43, 0.105, -0.03],
    ]);
  });

  it("runs the OAT 1 wing lane aft of the RH fuel tank (POH 7-75; AMM Fig 34-10-6 PDF 1666; AMM Fig 28-10-3 PDF 1105)", () => {
    const f = flow("oatData1");
    expect(f.tension).toBe(0);
    let inTankSpan = 0;
    for (const p of curveOf(f.pts, 0).getSpacedPoints(6000)) {
      if (p.z < TANK_SPAN[0] || p.z > TANK_SPAN[1]) continue;
      inTankSpan++;
      expect((wLE(p.z) - p.x) / wC(p.z), p.toArray().join(",")).toBeGreaterThan(TANK_CHORD[1]);
    }
    expect(inTankSpan).toBeGreaterThan(1000);
  });

  it.each(OAT_KEYS)(
    "%s keeps 5 mm from control solids and rods swept through full travel (AMM 6-00 PDF 117; POH Figs 7-1/2/3)",
    (key) => {
      // One arc-length sample interval adds a guard for space between path samples.
      const f = flow(key),
        hits = new Set<string>(),
        curve = curveOf(f.pts, f.tension ?? 0.3),
        clearance = f.r! + 0.005 + curve.getLength() / 6000,
        points = curve.getSpacedPoints(6000),
        bounds = new THREE.Box3().setFromPoints(points).expandByScalar(clearance),
        near = swept.filter((envelope) => bounds.intersectsBox(envelope.world));
      for (const point of points)
        for (const envelope of near)
          if (
            envelope.world.distanceToPoint(point) < clearance &&
            (!envelope.faces || envelope.faces.some((face) => face.distanceToPoint(point) < clearance))
          )
            if (![...hits].some((h) => h.startsWith(envelope.name + ":")))
              hits.add(
                envelope.name +
                  ":" +
                  point
                    .toArray()
                    .map((v) => v.toFixed(4))
                    .join(","),
              );
      expect(Object.keys(frames[0].links).sort()).toEqual(Object.keys(rodRadii).sort());
      expect(swept.some((s) => s.name === "moving rod:ailRod")).toBe(true);
      expect(swept.some((s) => s.name === "Aileron kick-out pulleys")).toBe(true);
      // Integration guard: the current doors and seals must remain in the full-open sweep.
      for (const name of ["Right cabin door", "Left cabin door", "Door seal"])
        expect(
          swept.some((s) => s.name === name),
          name,
        ).toBe(true);
      expect([...hits]).toEqual([]);
    },
  );

  it("both RH OAT probes clear catalogue solids and rendered flow tubes (operator; AMM Fig 34-10-6)", () => {
    for (const n of [1, 2]) {
      const probe = solids.find((s) => s.name === `OAT sensor ${n}`)!;
      const part = CAT.parts.find((p) => p.name === probe.name)!;
      const g = part.geo() as THREE.TubeGeometry;
      const hits = new Set<string>();
      // Sample the rendered probe's centreline with its full radius, so narrow crossing
      // tubes and containment cannot slip between surface vertices.
      for (const local of g.parameters.path.getSpacedPoints(100)) {
        const point = local.add(toV(part.pos!));
        for (const other of solids) {
          if (other === probe) continue;
          // Its own data lead intentionally terminates at the mounting base.
          if (other.name === `flow:oatData${n}` && point.distanceTo(toV(part.pos!)) < 0.02) continue;
          if (other.world.distanceToPoint(point) >= g.parameters.radius) continue;
          if (other.dist(point) < g.parameters.radius) hits.add(`${probe.name} in ${other.name}`);
        }
      }
      g.dispose();
      expect([...hits]).toEqual([]);
    }
  });

  it.each(ROUTED_KEYS)("%s stays inside the fuselage or wing skin by its tube radius", (key) => {
    const inWing = (p: THREE.Vector3, m: number) => {
      const az = Math.abs(p.z);
      if (az < WR) return false;
      const xc = (wLE(az) - p.x) / wC(az);
      return xc >= 0 && xc <= 1 && p.y >= wingP(az, xc, -1).y + m && p.y <= wingP(az, xc, 1).y - m;
    };
    const out: string[] = [];
    const f = flow(key),
      r = f.r!,
      ends = [toV(f.pts[0]), toV(f.pts.at(-1)!)];
    // within 3 cm of an end the path is at its unit (the OAT sensor stands outside the lower wing skin)
    for (const p of samples(f))
      if (ends.every((e) => e.distanceTo(p) > 0.03) && !inFus(p, r) && !inWing(p, r)) {
        if (!out.some((h) => h.startsWith(key + ":")))
          out.push(
            key +
              ":" +
              p
                .toArray()
                .map((v) => v.toFixed(4))
                .join(","),
          );
      }
    expect([...new Set(out)]).toEqual([]);
  });

  // every path's two ends are checked against its units in the fleet-wide table (tests/sr22t-flow-anchors.test.ts)
  it("the GIA 2 cooling branch tees off the GIA 1 duct (POH 7-90)", () => {
    expect(same(first("iauCool2"), flow("iauCool").pts[2])).toBe(true);
  });
});
