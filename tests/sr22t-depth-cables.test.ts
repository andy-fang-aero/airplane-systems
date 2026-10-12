/**
 * SR22T control cable runs, pulley gangs, turnbuckles and stops against AMM 13773-002 Rev 7 27-10
 * (roll), 27-20 (yaw), 27-30 (pitch) and Fig 6-00-6 Floor Access Panels, and POH 13772-007 7-6 to 7-11.
 */
import { describe, expect, it } from "vitest";
import { Box3, Line3, Mesh, Vector3 } from "three";
import { AB, FUSE, FW } from "@/aircraft/sr22t/geometry";
import { CAT } from "@/aircraft/sr22t/parts";
import { initialSim } from "@/aircraft/sr22t/model";
import { flowRates } from "@/aircraft/sr22t/flows";
import { solve } from "@/aircraft/sr22t/model";
import {
  AFT_GANG,
  CABLES,
  FAIRLEADS,
  FLOOR_HOLES,
  PULLEYS,
  TURNBUCKLES,
  rigPose,
  stopsInContact,
  type FloorHole,
} from "@/aircraft/sr22t/rig";
import { mats } from "@/lib/materials";
import type { Vec3 } from "@/lib/math";
import { useView } from "@/lib/view";
import { patched } from "./helpers";

const named = (name: string) => CAT.parts.filter((p) => p.name === name);
const inHole = (p: Vec3, hole: FloorHole) => {
  const h = FLOOR_HOLES[hole];
  return Math.abs(p[0] - h.x) <= h.hx && Math.abs(p[2] - h.z) <= h.hz;
};
/** Fuselage station and butt line (inches, right positive) of a model point; FS 100 is the firewall (POH Fig. 1-1). */
const FS = (x: number) => 100 + (FW - x) / 0.0254;
const BL = (z: number) => z / 0.0254;
/**
 * Independent oracle for the floor access holes: AMM 13773-002 Rev 7 Fig 6-00-6 Floor Access Panels (PDF p. 123), rendered
 * at 100 dpi and measured in pixels. The figure is not dimensioned, so it is scaled from the floor's forward edge (FS 100,
 * row 209) and the aft panel edge (FS 222, row 742): 0.229 in/px. Hole centre FS and BL and half-sizes in inches.
 */
const FIG_6_00_6 = {
  CF3C: { fs: 158.1, bl: 0, hfs: 4.8, hbl: 4.8 },
  CF4C: { fs: 177.1, bl: 0, hfs: 5.0, hbl: 5.0 },
  CF4L: { fs: 177.1, bl: -14.3, hfs: 5.0, hbl: 5.0 },
  CF4R: { fs: 177.1, bl: 14.3, hfs: 5.0, hbl: 5.0 },
  CF5: { fs: 201.4, bl: 2.2, hfs: 9.4, hbl: 10.3 },
} satisfies Record<FloorHole, { fs: number; bl: number; hfs: number; hbl: number }>;
/** Allowance for reading an undimensioned figure: about 6 px at the measured scale. */
const FIG_TOL = 1.5;
const inFigHole = (p: Vec3, hole: FloorHole) => {
  const h = FIG_6_00_6[hole];
  return Math.abs(FS(p[0]) - h.fs) <= h.hfs + FIG_TOL && Math.abs(BL(p[2]) - h.bl) <= h.hbl + FIG_TOL;
};

describe("SR22T control cables (AMM 27-10, 27-20, 27-30)", () => {
  it("rudder and elevator empennage bellcranks share a shaft at FS 306 (AMM 27-20 PDF 986)", () => {
    const fs306 = FW - 206 * 0.0254;
    expect(PULLEYS.ea.c[0]).toBeCloseTo(fs306, 1);
    expect(Math.abs(PULLEYS.ea.c[0] - fs306)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(PULLEYS.ra.c[0] - fs306)).toBeLessThanOrEqual(0.03);
    // one lateral shaft: same station and height, both turning about it (Fig 27-20-6)
    expect(PULLEYS.ra.c[1]).toBe(PULLEYS.ea.c[1]);
    expect([PULLEYS.ea.axis, PULLEYS.ra.axis]).toEqual(["z", "z"]);
    const shaft = named("Empennage bellcrank shaft (FS 306)");
    expect(shaft).toHaveLength(1);
    expect(Math.abs(shaft[0].pos![0] - fs306)).toBeLessThanOrEqual(0.03);
  });

  it("the rudder/elevator pulley gang is on the forward face of the FS 186 bulkhead (AMM 27-20, 27-30; Fig 27-20-5)", () => {
    // Fig 27-20-5 (PDF p. 1005) draws the pulley bracket (item 6) and pulleys on the FWD side of the FS 186 bulkhead and
    // the backing plate (item 7) on its aft side. Acceptance criterion 2 is overridden to this station by modelling
    // assumption; the rear seats were corrected separately.
    for (const k of ["em", "rm"]) {
      const p = PULLEYS[k];
      expect(FS(p.c[0] - p.r), k).toBeLessThan(186);
      expect(FS(p.c[0]), k).toBeGreaterThan(186 - 4);
      expect(p.c[0], k).toBeGreaterThan(AB);
      // below the rear seat pan, inside the belly skin
      const seat = named("Rear seat")[0].pos!;
      expect(p.c[1] + p.r, k).toBeLessThan(seat[1] - 0.05);
      expect(FUSE.inside(new Vector3(p.c[0], p.c[1] - p.r, p.c[2])), k).toBe(true);
    }
    expect(PULLEYS.em.c[0]).toBe(PULLEYS.rm.c[0]);
    expect(PULLEYS.em.c[0]).toBe(AFT_GANG.x);
    const bracket = named("Rudder/elevator pulley gang bracket");
    expect(bracket).toHaveLength(1);
    expect(FS(bracket[0].pos![0])).toBeLessThan(186);
    expect(FS(bracket[0].pos![0])).toBeGreaterThan(FS(AFT_GANG.x));
    expect(bracket[0].note).toMatch(/forward face of the FS 186 bulkhead/);
    for (const n of [bracket[0].note!, PULLEYS.em.note, PULLEYS.rm.note]) expect(n).not.toMatch(/baggage floor/);
  });

  it("the forward pulley gang carries aileron, elevator and rudder pulleys on one bolt (AMM Fig 27-10-5)", () => {
    const [ef, af, rf] = [PULLEYS.ef, PULLEYS.af, PULLEYS.rf];
    for (const p of [af, rf]) {
      expect(p.c[0]).toBe(ef.c[0]);
      expect(p.c[1]).toBe(ef.c[1]);
      expect(p.axis).toBe("z");
    }
    expect(named("Forward pulley gang bracket")).toHaveLength(1);
  });

  it("aileron cables run along the longerons to kick-out pulleys (AMM 27-10 PDF 946)", () => {
    for (const k of ["atR", "atL"]) {
      expect(PULLEYS[k].name).toBe("Aileron kick-out pulleys");
      expect(Math.abs(PULLEYS[k].c[2]), k).toBeGreaterThanOrEqual(0.4);
      expect(FUSE.inside(new Vector3(...PULLEYS[k].c)), k).toBe(true);
    }
    expect(PULLEYS.atR.c[2]).toBeGreaterThan(0);
    expect(PULLEYS.atL.c[2]).toBeLessThan(0);
    // each direct cable passes its own side's kick-out pulley, then goes into its own wing
    for (const [key, s] of [
      ["ailR", 1],
      ["ailL", -1],
    ] as const) {
      const pts = CABLES.find((c) => c.key === key)!.pts,
        k = PULLEYS[s > 0 ? "atR" : "atL"].c;
      expect(pts.some((p) => Math.hypot(p[0] - k[0], p[2] - k[2]) <= PULLEYS.atR.r + 1e-9)).toBe(true);
      expect(Math.sign(pts[pts.length - 1][2])).toBe(s);
    }
  });

  it("the cross-over cable returns over cross-over pulleys to the other wing (AMM 27-10 PDF 946)", () => {
    const xo = CABLES.find((c) => c.key === "ailBal")!;
    expect(xo.name).toBe("Aileron cross-over cable");
    expect(Math.sign(xo.pts[0][2])).toBe(1);
    expect(Math.sign(xo.pts[xo.pts.length - 1][2])).toBe(-1);
    expect(named("Aileron cross-over pulleys").length).toBe(2);
  });

  it("turnbuckles at CF3C/CF4C (aileron) and CF5 (rudder, elevator) (AMM 27-10 PDF 947; 27-20 PDF 988; 27-30 PDF 1010)", () => {
    const ail = named("Aileron turnbuckle"),
      elev = named("Elevator turnbuckle"),
      rud = named("Rudder turnbuckle");
    expect(ail).toHaveLength(3);
    // one per strand: Fig 27-30-1 item 11 and Fig 27-20-1 item 8 each show two
    expect(elev).toHaveLength(2);
    expect(rud).toHaveLength(2);
    expect(ail.filter((p) => inHole(p.pos!, "CF3C"))).toHaveLength(2);
    expect(ail.filter((p) => inHole(p.pos!, "CF4C"))).toHaveLength(1);
    for (const p of [...elev, ...rud]) expect(inHole(p.pos!, "CF5"), p.name).toBe(true);
    // and inside the holes as Fig 6-00-6 draws them, independently of FLOOR_HOLES
    for (const t of TURNBUCKLES) expect(inFigHole(t.pos, t.hole), t.key).toBe(true);
    // each sits on its own cable, inside the fuselage under the floor
    for (const t of TURNBUCKLES) {
      expect(inHole(t.pos, t.hole), t.key).toBe(true);
      expect(FUSE.inside(new Vector3(...t.pos)), t.key).toBe(true);
    }
    expect(elev[0].note).toMatch(/red .* black/);
    expect(rud[0].note).toMatch(/blue .* yellow/);
    expect(CAT.parts.filter((p) => p.name === "Turnbuckle")).toHaveLength(0);
  });

  it("control stops limit each surface (AMM 27-10, 27-20, 27-30)", () => {
    expect(named("Aileron control stop")).toHaveLength(2);
    expect(named("Elevator control stop")).toHaveLength(1);
    expect(named("Rudder control stop")).toHaveLength(1);
    // one aileron stop per actuation pulley; the elevator and rudder stops at the empennage bellcranks
    for (const k of ["awR", "awL"])
      expect(
        named("Aileron control stop").filter((p) => p.pos![2] === PULLEYS[k].c[2]),
        k,
      ).toHaveLength(1);
    expect(Math.abs(named("Elevator control stop")[0].pos![0] - PULLEYS.ea.c[0])).toBeLessThan(0.15);
    expect(Math.abs(named("Rudder control stop")[0].pos![0] - PULLEYS.ra.c[0])).toBeLessThan(0.15);
    for (const n of ["Aileron control stop", "Elevator control stop", "Rudder control stop"])
      expect(named(n)[0].anim, n).toBeTypeOf("function");
  });

  it("stops are in contact only at full travel; full left roll contacts the LH stop (AMM 27-10 PDF 953)", () => {
    const none = { ailL: false, ailR: false, elev: false, rud: false };
    expect(stopsInContact({ pitch: 0, roll: 0, yaw: 0 })).toEqual(none);
    expect(stopsInContact({ pitch: 0.9, roll: -0.9, yaw: 0.9 })).toEqual(none);
    expect(stopsInContact({ pitch: 0, roll: -1, yaw: 0 })).toEqual({ ...none, ailL: true });
    expect(stopsInContact({ pitch: 0, roll: 1, yaw: 0 })).toEqual({ ...none, ailR: true });
    expect(stopsInContact({ pitch: 1, roll: 0, yaw: 0 }).elev).toBe(true);
    expect(stopsInContact({ pitch: -1, roll: 0, yaw: 0 }).elev).toBe(true);
    expect(stopsInContact({ pitch: 0, roll: 0, yaw: -1 }).rud).toBe(true);
    expect(stopsInContact({ pitch: 0, roll: 0, yaw: 1 })).toEqual({ ...none, rud: true });
  });

  it("a fairlead at each flap hinge per wing, where the flap hinge brackets are (AMM 27-10 PDF 946; POH 7-22)", () => {
    const fl = named("Aileron cable fairlead");
    expect(fl).toHaveLength(6);
    expect(FAIRLEADS).toHaveLength(6);
    const hinges = named("Flap hinge bracket").map((p) => p.pos![2]);
    for (const p of fl)
      expect(
        hinges.some((z) => Math.abs(z - p.pos![2]) < 1e-6),
        String(p.pos),
      ).toBe(true);
  });

  it("two rudder springs run from the pedal assembly to the firewall (POH 7-11; AMM 27-20 PDF 986)", () => {
    const sp = named("Rudder return spring");
    expect(sp).toHaveLength(2);
    expect(sp.map((p) => Math.sign(p.pos![2])).sort()).toEqual([-1, 1]);
    for (const p of sp) expect(p.pos![0]).toBeLessThan(FW);
  });

  it("every pulley turns with the rig, and each cable loop still closes: one strand pays out while the other takes up", () => {
    const p = rigPose(patched(initialSim, { ctrl: { pitch: 1, roll: 1, yaw: 1 } }));
    for (const k of Object.keys(PULLEYS)) expect(Number.isFinite(p.pulley[k]), k).toBe(true);
    const s = patched(initialSim, { ctrl: { pitch: 0.5, roll: -0.4, yaw: 0.7 } }),
      R = flowRates(s, solve(s));
    expect(R.elA).toBe(-R.elB);
    expect(R.ailR).toBe(-R.ailL);
    expect(R.rudR).toBe(-R.rudL);
    expect(CABLES.map((c) => c.key)).toEqual(["elA", "elB", "ailR", "ailL", "ailBal", "rudR", "rudL"]);
  });

  it("the floor access holes sit where Fig 6-00-6 draws them (AMM Fig 6-00-6 PDF p. 123)", () => {
    for (const [k, h] of Object.entries(FLOOR_HOLES) as [FloorHole, (typeof FLOOR_HOLES)[FloorHole]][]) {
      const f = FIG_6_00_6[k];
      expect(Math.abs(FS(h.x) - f.fs), k).toBeLessThanOrEqual(FIG_TOL);
      expect(Math.abs(BL(h.z) - f.bl), k).toBeLessThanOrEqual(FIG_TOL);
      expect(Math.abs(h.hx / 0.0254 - f.hfs), k).toBeLessThanOrEqual(FIG_TOL);
      expect(Math.abs(h.hz / 0.0254 - f.hbl), k).toBeLessThanOrEqual(FIG_TOL);
    }
  });

  it("every pulley set carries its cable retainer or cable guard note (AMM 27-10 PDF pp. 946-948; Fig 27-10-1 item 4)", () => {
    for (const k of ["ef", "af", "rf", "em", "rm", "atR", "atL", "axR", "axL"])
      expect(PULLEYS[k].note, k).toMatch(/cable retainer/);
    for (const k of ["awR", "awL"]) expect(PULLEYS[k].note, k).toMatch(/cable guard .*Fig 27-10-1 item 4/);
  });

  it("the cross-over pulleys register after the mechanism block's existing parts (AGENTS.md Part order)", () => {
    const idx = (name: string) => CAT.parts.findIndex((p) => p.name === name);
    const xover = idx("Aileron cross-over pulleys");
    // unchanged parts that follow the pulley loop in the block keep their place ahead of the new pulleys
    for (const n of ["Elevator bellcrank", "Rudder bellcrank", "Aileron conical drive arm", "Wing sector crank arm"])
      expect(idx(n), n).toBeLessThan(xover);
    // the existing pulleys still register as one run, in PULLEYS order
    const pulleyNames = Object.keys(PULLEYS)
      .filter((k) => !k.startsWith("ax"))
      .map((k) => PULLEYS[k].name);
    const first = idx(pulleyNames[0]);
    expect(CAT.parts.slice(first, first + pulleyNames.length).map((p) => p.name)).toEqual(pulleyNames);
    // at the end of the block: after its last existing part, before the GFC 700 servos
    expect(CAT.parts[xover - 1].name).toBe("Rudder return spring");
    expect(CAT.parts[xover + 1].name).toBe("Aileron cross-over pulleys");
    expect(CAT.parts[xover + 2].name).toBe("Pitch servo actuator (GSA 81)");
  });

  it("each turnbuckle lies along the cable segment it sits on, the CF4C cross-over one laterally", () => {
    for (const t of TURNBUCKLES) {
      const tb = CAT.parts.find((p) => p.name === t.name && p.pos === t.pos)!;
      const size = new Box3().setFromBufferAttribute(tb.geo().getAttribute("position") as never).getSize(new Vector3());
      const along = size
        .clone()
        .divideScalar(Math.max(size.x, size.y, size.z))
        .floor();
      const pts = CABLES.find((c) => c.key === t.key)!.pts.map((p) => new Vector3(...p));
      const q = new Vector3(...t.pos);
      const seg = pts
        .slice(1)
        .map((b, i) => new Line3(pts[i], b))
        .find((l) => l.closestPointToPoint(q, true, new Vector3()).distanceTo(q) < 1e-6)!;
      expect(seg, t.hole).toBeDefined();
      expect(Math.abs(seg.delta(new Vector3()).normalize().dot(along)), `${t.name} at ${t.hole}`).toBeGreaterThan(0.95);
    }
    const xover = TURNBUCKLES.find((t) => t.key === "ailBal")!;
    const g = CAT.parts.find((p) => p.pos === xover.pos)!.geo();
    const s = new Box3().setFromBufferAttribute(g.getAttribute("position") as never).getSize(new Vector3());
    expect(s.z).toBeGreaterThan(s.x);
  });

  it("a control stop fades with its channel when the controls view is focused on another cable run", () => {
    const before = useView.getState();
    const dim = mats("#B5523B").dim;
    const shown = (name: string, ctrlFocus: "all" | "aileron" | "elevator" | "rudder") => {
      useView.setState({ sys: "controls", ctrlFocus });
      const m = new Mesh();
      named(name)[0].anim!(m, 0);
      return m.material !== dim;
    };
    try {
      for (const [name, own, other] of [
        ["Aileron control stop", "aileron", "elevator"],
        ["Elevator control stop", "elevator", "rudder"],
        ["Rudder control stop", "rudder", "aileron"],
      ] as const) {
        expect(shown(name, "all"), name).toBe(true);
        expect(shown(name, own), name).toBe(true);
        expect(shown(name, other), name).toBe(false);
      }
    } finally {
      useView.setState({ sys: before.sys, ctrlFocus: before.ctrlFocus });
    }
  });
});
