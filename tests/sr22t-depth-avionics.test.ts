/**
 * Avionics LRUs and their locations: SR22T POH 13772-007 7-72 – 7-90 and Figure 7-20 Equipment
 * Locations (7-88); AMM 13773-002 Rev 7 chapters 21-20, 31-40, 34-20, 34-40, 34-50.
 */
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { AB, FW, WR, botY, inFus, topY, wC, wLE, wY } from "@/aircraft/sr22t/geometry";
import { CAT } from "@/aircraft/sr22t/parts";
import { useSR22T } from "@/aircraft/sr22t/store";
import type { PartSpec } from "@/lib/catalogue";

/** Bezel plane of the PFD and MFD (parts/avionics.ts). */
const BEZEL_X = 2.285;

const named = (name: string): PartSpec[] => CAT.parts.filter((p) => p.name === name);
const one = (name: string): PartSpec => {
  const [p] = named(name);
  expect(p, name).toBeDefined();
  return p;
};
const at = (name: string) => {
  const pos = one(name).pos;
  expect(pos, name).toBeDefined();
  return { x: pos![0], y: pos![1], z: pos![2] };
};
const centre = (p: PartSpec) => {
  const g = p.geo();
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  g.dispose();
  return p.pos ? c.add(new THREE.Vector3(...p.pos)) : c;
};
const behindPanel = (x: number) => x > BEZEL_X && x < FW;
/** The eight corners of a part's local bounding box, placed in the airplane frame by its rot and pos. */
const corners = (p: PartSpec): THREE.Vector3[] => {
  const g = p.geo();
  g.computeBoundingBox();
  const { min, max } = g.boundingBox!;
  g.dispose();
  const e = new THREE.Euler(...(p.rot ?? [0, 0, 0]));
  const t = new THREE.Vector3(...(p.pos ?? [0, 0, 0]));
  const out: THREE.Vector3[] = [];
  for (const x of [min.x, max.x])
    for (const y of [min.y, max.y])
      for (const z of [min.z, max.z]) out.push(new THREE.Vector3(x, y, z).applyEuler(e).add(t));
  return out;
};
const worldBox = (p: PartSpec) => new THREE.Box3().setFromPoints(corners(p));
/** Overlap of two world boxes, shrunk by 1 mm so boxes that only touch do not count. */
const overlaps = (a: PartSpec, b: PartSpec) =>
  worldBox(a).expandByScalar(-0.001).intersectsBox(worldBox(b).expandByScalar(-0.001));

const FANS = ["PFD cooling fan", "MFD cooling fan", "Avionics (IAU) cooling fan"];
/**
 * Supply audit: every LRU this section adds or changes, with its breaker(s), rating and bus as the POH (or, where the POH is
 * silent, the AMM for the modelled airplane) states them. Breaker names are the panel's (POH Fig 7-11, 7-52) unless noted.
 */
type Feed = [amps: string, breaker: string];
const SUPPLY: ({ name: string; feeds: Feed[]; bus: string; via?: string } | { name: string; passive: string })[] = [
  { name: "GSU 75 ADAHRS 1", feeds: [["5", "ADAHRS 1"]], bus: "ESS BUS 1" }, // POH 7-75
  { name: "GSU 75 ADAHRS 2", feeds: [["5", "ADAHRS 2"]], bus: "MAIN BUS 2" }, // POH 7-75; AMM 34-10 PDF p. 1630
  {
    name: "GIA 1 (GIA 63W)",
    feeds: [
      ["7.5", "COM 1"],
      ["5", "GPS NAV GIA 1"],
    ],
    bus: "ESS BUS 1",
  }, // POH 7-78
  {
    name: "GIA 2 (GIA 63W)",
    feeds: [
      ["7.5", "COM 2"],
      ["5", "GPS NAV GIA 2"],
    ],
    bus: "MAIN BUS 2",
  }, // POH 7-78
  { name: "GEA 71 Engine Airframe Unit", feeds: [["3", "ENGINE INSTR"]], bus: "ESS BUS 2" }, // POH 7-78
  { name: "GTX 335/345 transponder", feeds: [["2", "XPONDER"]], bus: "AVIONICS" }, // POH 7-78, 7-83
  { name: "PFD cooling fan", feeds: [["5", "AVIONICS FAN 2"]], bus: "MAIN BUS 2" }, // POH 7-90
  { name: "MFD cooling fan", feeds: [["5", "AVIONICS FAN 1"]], bus: "NON-ESSENTIAL BUS" }, // POH 7-90
  { name: "Avionics (IAU) cooling fan", feeds: [["5", "AVIONICS FAN 2"]], bus: "MAIN BUS 2" }, // POH 7-90
  // no breakers of their own: the GMA 350 intercom drives the speaker and takes the microphone (AMM 23-50 PDF p. 650)
  { name: "Cabin speaker", feeds: [["5", "AUDIO PANEL"]], bus: "AVIONICS", via: "GMA 350" }, // POH 7-78
  { name: "Cabin microphone", feeds: [["5", "AUDIO PANEL"]], bus: "AVIONICS", via: "GMA 350" }, // POH 7-78
  // shares the XM Weather receiver's supply (AMM 23-30 PDF p. 644, 34-50 PDF p. 1721)
  { name: "XM radio transceiver (optional)", feeds: [["5", "DATA LINK/WEATHER"]], bus: "AVIONICS" },
  { name: "GDL 69A XM receiver (optional)", feeds: [["5", "WEATHER/DATA LINK"]], bus: "AVIONICS" }, // POH 7-84 wording
  { name: "Gateway Module (optional)", feeds: [["5", "CONV LIGHTS"]], bus: "the Constant Power Bus (CONV)" }, // POH 7-59, 8-11
  { name: "GSR 56 Iridium transceiver (optional)", feeds: [["5", "DATA LINK/WEATHER"]], bus: "AVIONICS" }, // POH 7-83
  { name: "WX-500 processor (optional)", feeds: [["5", "DATA LINK/WEATHER"]], bus: "AVIONICS" }, // POH 7-84
  { name: "GTS 800 traffic processor (optional)", feeds: [["5", "TRAFFIC"]], bus: "AVIONICS" }, // POH 7-84
  { name: "KN 63 DME receiver (optional)", feeds: [["3", "DME/ADF"]], bus: "AVIONICS" }, // POH 7-85; AMM 34-50 PDF p. 1722
  { name: "Magnetometer (GMU 44, MAG 1)", feeds: [["5", "PFD A"]], bus: "ESS BUS 1" }, // AMM 34-20 PDF p. 1675; POH 7-74
  { name: "Magnetometer (GMU 44, MAG 2)", feeds: [["5", "PFD B"]], bus: "MAIN BUS 2" }, // AMM 34-20 PDF p. 1675
  { name: "Marker beacon antenna", passive: "GMA 350" }, // POH 7-78, 7-89
  { name: "Traffic antenna, bottom (optional)", passive: "GTS 800" }, // POH 7-84, 7-89
];
const initialE = useSR22T.getState().E;
afterEach(() => useSR22T.setState({ E: initialE }));

describe("SR22T avionics LRUs (POH 7-72 – 7-90, Fig 7-20)", () => {
  it("two GIA 63W units behind the PFD and the MFD (POH 7-78; AMM 31-40 PDF 1326)", () => {
    const gia1 = at("GIA 1 (GIA 63W)"),
      gia2 = at("GIA 2 (GIA 63W)");
    expect(gia1.z).toBeLessThan(0);
    expect(gia2.z).toBeGreaterThan(0);
    for (const g of [gia1, gia2]) expect(behindPanel(g.x)).toBe(true);
    expect(named("GIA 63W/64W ×2")).toEqual([]);
    expect(one("GIA 1 (GIA 63W)").note).toContain("ESS BUS 1");
    expect(one("GIA 2 (GIA 63W)").note).toContain("MAIN BUS 2");
  });

  it("the GMU 44 magnetometer sits in the right wing behind RW12 (AMM 34-20 PDF 1675, 1687; Fig 6-00-7)", () => {
    const mag = at("Magnetometer (GMU 44, MAG 1)");
    expect(mag.z).toBeGreaterThan(3.5);
    const oat = centre(one("OAT sensor 1"));
    expect(new THREE.Vector3(mag.x, mag.y, mag.z).distanceTo(oat)).toBeLessThan(0.6);
    expect(named("Magnetometer (MAG 1)")).toEqual([]);
  });

  it("three avionics cooling fans on AVIONICS FAN 1 / FAN 2 (POH 7-90)", () => {
    for (const f of FANS) expect(named(f).length, f).toBeGreaterThan(0);
    const note = (n: string) => one(n).note!;
    expect(note("MFD cooling fan")).toMatch(/5 A AVIONICS FAN 1 circuit breaker on NON-ESSENTIAL BUS/);
    for (const f of ["PFD cooling fan", "Avionics (IAU) cooling fan"])
      expect(note(f)).toMatch(/5 A AVIONICS FAN 2 circuit breaker on MAIN BUS 2/);
  });

  it("each fan rotor spins only while its AVIONICS FAN breaker feeds it (POH 7-90)", () => {
    const rotors = (name: string) => named(name).filter((p) => p.anim);
    for (const [fan, flag] of [
      ["MFD cooling fan", "fan1"],
      ["PFD cooling fan", "fan2"],
      ["Avionics (IAU) cooling fan", "fan2"],
    ] as const) {
      const [rotor] = rotors(fan);
      expect(rotor, fan).toBeDefined();
      const m = new THREE.Mesh();
      useSR22T.setState({ E: { ...initialE, [flag]: true } });
      rotor.anim!(m, 0);
      const r0 = m.rotation.x;
      rotor.anim!(m, 0.1);
      expect(m.rotation.x, fan).not.toBe(r0);
      useSR22T.setState({ E: { ...initialE, [flag]: false } });
      const r1 = m.rotation.x;
      rotor.anim!(m, 0.2);
      expect(m.rotation.x, fan).toBe(r1);
    }
  });

  it("equipment sits where POH Fig 7-20 puts it (7-88)", () => {
    // The transponder is aft of FS 222 on the right
    for (const n of [
      "GTX 335/345 transponder",
      "XM radio transceiver (optional)",
      "GDL 69A XM receiver (optional)",
      "Gateway Module (optional)",
    ]) {
      const p = at(n);
      expect(p.x, n).toBeLessThan(AB);
      expect(p.z, n).toBeGreaterThan(0);
    }
    const iridium = at("GSR 56 Iridium transceiver (optional)");
    expect(iridium.x).toBeLessThan(AB);
    expect(iridium.z).toBeLessThan(0);
    // item 25 is drawn over the inboard, forward part of item 24 (Battery 2): in plan it lies inside the BAT 2 outline,
    // inboard and forward of its centre, so the two are stacked; here it sits under the container
    const bat2 = one("BAT 2 — 2 × 12 V, 7 Ah"),
      bb = worldBox(bat2),
      bc = bb.getCenter(new THREE.Vector3());
    expect(iridium.x).toBeGreaterThan(bb.min.x);
    expect(iridium.x).toBeLessThan(bb.max.x);
    expect(iridium.x).toBeGreaterThan(bc.x);
    expect(iridium.z).toBeGreaterThan(bc.z);
    expect(iridium.z).toBeLessThan(bb.max.z);
    expect(worldBox(one("GSR 56 Iridium transceiver (optional)")).max.y).toBeLessThan(bb.min.y);

    const wx = at("WX-500 processor (optional)");
    expect(wx.x).toBeGreaterThan(AB);
    expect(wx.z).toBeLessThan(0);
    expect(wx.y).toBeGreaterThan(botY(wx.x));
    expect(wx.y).toBeLessThan(botY(wx.x) + 0.15);

    const seat = at("Pilot seat"),
      tas = at("GTS 800 traffic processor (optional)");
    expect(Math.abs(tas.x - seat.x)).toBeLessThan(0.24);
    expect(Math.abs(tas.z - seat.z)).toBeLessThan(0.2);
    expect(tas.y).toBeLessThan(seat.y);

    const dme = at("KN 63 DME receiver (optional)"),
      ext = at("Fire extinguisher");
    expect(dme.x).toBeGreaterThan(seat.x + 0.24);
    expect(dme.x).toBeLessThan(FW);
    expect(dme.z).toBeLessThan(0);
    expect(Math.hypot(dme.x - ext.x, dme.z - ext.z)).toBeLessThan(0.25);

    for (const f of FANS) expect(behindPanel(at(f).x), f).toBe(true);

    const elt = at("ELT — Artex ELT 1000");
    expect(elt.x).toBeLessThan(AB);
    expect(elt.z).toBeGreaterThan(0);
  });

  it("with A/C the marker beacon antenna is inside, below the baggage floor (POH 7-89)", () => {
    const mk = one("Marker beacon antenna");
    expect(mk.pos![1]).toBeGreaterThan(botY(mk.pos![0]));
    expect(mk.ext).toBeFalsy();
    // the whole sled, not just its centre, is inside the skin, and it sits below the A/C condenser rather than in it
    for (const c of corners(mk)) expect(inFus(c), c.toArray().join()).toBe(true);
    const cond = one("A/C condenser");
    expect(overlaps(mk, cond)).toBe(false);
    expect(worldBox(mk).max.y).toBeLessThan(worldBox(cond).min.y);
  });

  it("internal LRUs, the cabin speaker and microphone sit wholly inside the skin without overlapping (Fig 7-20)", () => {
    const internal = [
      "GSU 75 ADAHRS 1",
      "GSU 75 ADAHRS 2",
      "GIA 1 (GIA 63W)",
      "GIA 2 (GIA 63W)",
      "GEA 71 Engine Airframe Unit",
      "GTX 335/345 transponder",
      ...FANS,
      "Cabin speaker",
      "Cabin microphone",
      "XM radio transceiver (optional)",
      "GDL 69A XM receiver (optional)",
      "Gateway Module (optional)",
      "GSR 56 Iridium transceiver (optional)",
      "WX-500 processor (optional)",
      "GTS 800 traffic processor (optional)",
      "KN 63 DME receiver (optional)",
      "Marker beacon antenna",
      "ELT — Artex ELT 1000",
    ].map(one);
    for (const p of internal) {
      expect(p.ext, p.name).toBeFalsy();
      for (const c of corners(p)) expect(inFus(c), `${p.name} ${c.toArray().join()}`).toBe(true);
    }
    const neighbours = [
      ...internal,
      one("A/C condenser"),
      one("BAT 2 — 2 × 12 V, 7 Ah"),
      ...named("BAT 2 battery — 12 V, 7 Ah"),
    ];
    // BAT 2's two batteries sit inside their own container; only pairs with one of this section's parts count
    const theirs = (p: PartSpec) => !internal.includes(p);
    for (const [i, a] of neighbours.entries())
      for (const b of neighbours.slice(i + 1))
        if (!(theirs(a) && theirs(b))) expect(overlaps(a, b), `${a.name} / ${b.name}`).toBe(false);
  });

  it("the GTS 800 under the LH seat clears the main spar that passes under the front seats (POH 7-84)", () => {
    // spar centreline inside the fuselage (structure.ts): x = wLE − 0.3 wC, y = wY + 0.02 wC at the wing root, radius 0.04
    const sx = wLE(WR) - 0.3 * wC(WR),
      sy = wY(WR) + 0.02 * wC(WR);
    const b = worldBox(one("GTS 800 traffic processor (optional)"));
    const dx = Math.max(b.min.x - sx, 0, sx - b.max.x),
      dy = Math.max(b.min.y - sy, 0, sy - b.max.y);
    expect(Math.hypot(dx, dy)).toBeGreaterThan(0.04);
  });

  it("the three fans sit at the Fig 7-20 item 4 places, rotors on the forward face (POH 7-90; AMM 21-20 PDF 454)", () => {
    const pfd = at("PFD bezel"),
      mfd = at("MFD bezel");
    const pfdFan = at("PFD cooling fan"),
      mfdFan = at("MFD cooling fan"),
      iauFan = at("Avionics (IAU) cooling fan");
    // between the displays, in the upper part (upper RH corner of the PFD support bracket)
    expect(pfdFan.z).toBeGreaterThan(pfd.z);
    expect(pfdFan.z).toBeLessThan(mfd.z);
    expect(pfdFan.y).toBeGreaterThan(pfd.y);
    // right of the MFD, upper part (upper RH corner of the MFD support bracket)
    expect(mfdFan.z).toBeGreaterThan(mfd.z);
    expect(mfdFan.y).toBeGreaterThan(mfd.y);
    // low on the left behind the panel (under the LH console, forward of the bolster)
    expect(iauFan.z).toBeLessThan(0);
    expect(iauFan.z).toBeLessThan(pfdFan.z);
    expect(iauFan.y).toBeLessThan(worldBox(one("PFD bezel")).min.y);
    for (const [a, b] of [
      [pfdFan, mfdFan],
      [pfdFan, iauFan],
      [mfdFan, iauFan],
    ])
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(0.1);
    // each rotor is on the housing's forward (+x) face, ahead of the panel: the fans blow onto the forward side of the displays
    const panel = worldBox(one("Instrument panel"));
    for (const f of FANS) {
      const [housing, ...rotors] = named(f);
      expect(rotors.length, f).toBeGreaterThan(0);
      for (const r of rotors) {
        expect(worldBox(r).min.x, f).toBeGreaterThan(worldBox(housing).max.x - 0.001);
        expect(worldBox(r).min.x, f).toBeGreaterThan(panel.max.x);
      }
    }
  });

  it("the cabin speaker, microphone and lower traffic antenna sit where Fig 7-20 and POH 7-89 put them", () => {
    const seat = at("Pilot seat"),
      rear = at("Rear seat (2+1 bench)");
    // item 13: ceiling, centreline, between the front seats and the rear seats
    const spk = at("Cabin speaker");
    expect(Math.abs(spk.z)).toBeLessThan(0.05);
    expect(spk.x).toBeGreaterThan(rear.x);
    expect(spk.x).toBeLessThan(seat.x);
    expect(spk.y).toBeGreaterThan(topY(spk.x) - 0.1);
    // item 29: beside the centre console between the front seats; the plan view gives no height
    const mic = at("Cabin microphone"),
      pax = at("Front passenger seat");
    expect(mic.z).toBeGreaterThan(seat.z);
    expect(mic.z).toBeLessThan(pax.z);
    expect(Math.abs(mic.x - seat.x)).toBeLessThan(0.24);
    // POH 7-89: bottom RH side, just forward of the baggage compartment; outside the skin
    const ant = one("Traffic antenna, bottom (optional)"),
      b = worldBox(ant);
    expect(ant.ext).toBe(true);
    expect(ant.pos![2]).toBeGreaterThan(0);
    expect(b.max.y).toBeLessThanOrEqual(botY(ant.pos![0]));
    expect(ant.pos![0]).toBeGreaterThan(AB);
    expect(ant.pos![0]).toBeLessThan(rear.x);
    expect(ant.pos![0]).toBeGreaterThan(at("Marker beacon antenna").x);
    // the baggage compartment runs "from behind the rear passenger seat to the aft cabin bulkhead" (POH 7-88), so the
    // whole blade is forward of the rear seat back
    const rearBack = named("Rear seat (2+1 bench)")[1];
    expect(b.min.x).toBeGreaterThan(worldBox(rearBack).min.x);
  });

  it("the Gateway Module runs from 5 A CONV LIGHTS on the CONV bus (POH 7-59, 8-11, Fig 7-11; AMM 31-70 PDF 1366)", () => {
    const note = one("Gateway Module (optional)").note!;
    expect(note).toMatch(/BAT 1 feeds through a 5 A fuse/);
    expect(note).toMatch(/CONV SYS 2 \(or CONV LIGHTS\) on Conv Bus/);
  });

  it("every LRU this section adds or changes states its documented supply (POH 7-74 – 7-90, Fig 7-11; AMM)", () => {
    for (const row of SUPPLY) {
      const note = one(row.name).note ?? "";
      expect(note, row.name).toContain("Supply:");
      if ("passive" in row) {
        expect(note, row.name).toContain("passive antenna, no breaker");
        expect(note, row.name).toContain(row.passive);
        continue;
      }
      for (const [amps, breaker] of row.feeds) expect(note, row.name).toContain(`${amps} A ${breaker}`);
      expect(note, row.name).toMatch(new RegExp(`circuit breakers? on ${row.bus.replace(/[()]/g, "\\$&")}`));
      if (row.via) expect(note, row.name).toContain(row.via);
    }
    // completeness: every powered unit in the avionics section, apart from antennas, the display bezels and their
    // controls, the panels, the console units this section does not change and the OAT sensor (pitot), has a row
    const exempt =
      /antenna|bezel|button|panel|wiring$|^GCU 479|^GMC 707|^OAT sensor [12]$|^CHT sensor — cyl |^EGT probe — cyl |^MAP sensor$|^MAT sensor$/;
    const rows = new Set(SUPPLY.map((r) => r.name));
    for (const name of new Set(CAT.parts.filter((p) => p.sys.includes("avionics") && p.name).map((p) => p.name!)))
      if (!exempt.test(name)) expect(rows, name).toContain(name);
  });

  it("ADAHRS 2 and MAG 2 are installed on this airplane (per operator, 2026-10-08; POH Fig 7-17)", () => {
    one("GSU 75 ADAHRS 2");
    one("Magnetometer (GMU 44, MAG 2)");
    expect(named("GSU 75 ADAHRS")).toEqual([]);
  });

  it("behind-display LRUs and the avionics fans are listed but not labelled, so no new pin covers a screen (catalogue.ts)", () => {
    const listed = CAT.pinned("avionics").map((p) => p.name);
    for (const n of ["GIA 1 (GIA 63W)", "GIA 2 (GIA 63W)", ...FANS]) {
      expect(listed, n).toContain(n);
      expect(CAT.isPinned(one(n), "avionics"), n).toBe(false);
    }
  });
});
