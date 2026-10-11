/**
 * Engine cooling baffles and their seals (rebuilt around the intercoolers).
 * May import anchors only from earlier sections:
 * catalogue.ts, airframe.ts, surfaces.ts, cowl.ts, gear.ts, engine.ts, engine-ignition.ts, engine-oil.ts, engine-air.ts,
 * engine-sensors.ts. Side-effect-free helpers may come from ../geometry, ../engine-datum and ../intercooler-layout.
 *
 * Sources: POH 13772-007 7-38 ("Aluminum baffles direct the incoming air … No movable cowl flaps"); AMM 13773-002 Rev 7
 * 71-00 §1.B (PDF p. 2470: sheet-metal baffles "utilize fiber reinforced silicon seals in contact with the cowling around
 * the circumference of the engine"), Fig 71-00-2 sheets 1–2 (PDF pp. 2487–2488, item 3 Engine Baffle, item 18
 * intercooler on top of each bank's side baffle), Fig 71-00-4 (PDF p. 2498), 71-60 (PDF p. 2555: intercooler and seal
 * "positioned to engine baffling and secure with screws and washers"), Fig 71-60-2 sheet 2 (PDF p. 2558, seal 16);
 * Continental M-18 (21 Sep 2017) 2-2.9 and Fig 2-21 (p. 2-21: the high-pressure area above the cylinders, the aircraft-
 * supplied baffles), 16-7 and Fig 16-29 (p. 16-33: cylinder baffle 43 on the lower side of each cylinder), 17-3.2 and
 * Fig 17-11 (p. 17-16: inter-cylinder baffles between cylinders 1 & 3, 3 & 5, 2 & 4 and 4 & 6). The Cirrus figures are
 * undimensioned and M-18 gives no baffle dimensions: every station, thickness and span below is approximate, fitted to
 * the dimensioned engine (../engine-datum.ts) and intercoolers (../intercooler-layout.ts).
 */
import { CurvePath, ExtrudeGeometry, LineCurve3, Matrix4, Path, Shape, TubeGeometry, Vector2, Vector3 } from "three";
import { curveOf, mergeGeos } from "@/lib/geometry";
import { box, inFus } from "../geometry";
import { CRANK_Y, CYL_PITCH, REAR_CYL_X } from "../engine-datum";
import {
  DUCT7,
  DUCT7_R,
  DUCT7_TENSION,
  INTERCOOLER_AFT_FACE_X,
  INTERCOOLER_FRONT_X,
  INTERCOOLER_IN,
  INTERCOOLER_NECK,
  INTERCOOLER_NECK_R,
  INTERCOOLER_NECK_X,
  INTERCOOLER_OUTER_Z,
  INTERCOOLER_SEAT,
  INTERCOOLER_WIDTH,
} from "../intercooler-layout";
import { part } from "./catalogue";
import { INLET_CUTOUT_R } from "./engine-air";
import {
  CYLS,
  CYL_BARREL_END,
  CYL_BARREL_START,
  CYL_ENVELOPE,
  CYL_HEAD_BOTTOM,
  CYL_HEAD_SIZE,
  cylPoint,
  plugOffset,
} from "./engine";

/* ---------- stations (approximate unless noted) ---------- */
/** Baffle sheet thickness; approximate (AMM 71-00 §1.B: sheet metal, undimensioned). */
export const BAFFLE_SHEET = 0.003;
/** Drawn clearance from every neighbouring part; approximate, above the 5 mm schematic audit. */
const CLEAR = 0.006;
/** Silicone seal section radius, and the drawn gap between it and the cowl skin; approximate (AMM 71-00 §1.B). */
export const SEAL_R = 0.006;
const SEAL_GAP = 0.0005;
/** Seal 16 between the side-baffle top and the intercooler base: thickness and land width approximate (Fig 71-60-2 sh 2). */
export const GASKET_T = 0.003;
const GASKET_W = 0.012;
/** The seal is drawn 0.5 mm under the core base so the two meshes stay distinct; approximate. */
const GASKET_DROP = 0.0005;
/** Side-baffle wall: inside face CLEAR outboard of the head's outboard face (CYL_BARREL_END + head depth). */
export const SIDE_WALL_Z = CYL_BARREL_END + CYL_HEAD_SIZE[2] + CLEAR + BAFFLE_SHEET / 2;
/** Side-baffle deck top: seal 16 below the intercooler seat plane (AMM 71-60 PDF p. 2555). */
export const DECK_TOP = (s: number) => INTERCOOLER_SEAT(s).y - GASKET_DROP - GASKET_T;
/** Side wall foot: just above the exhaust risers on the head's lower face; approximate. */
const SIDE_BOTTOM = CYL_HEAD_BOTTOM + 0.008;
/** Fin envelope bottom and top of a cylinder (the model's 0.95-pitch fin discs, engine.ts `CYL_ENVELOPE`). */
const FIN_BOTTOM = CRANK_Y - CYL_ENVELOPE / 2,
  FIN_TOP = CRANK_Y + CYL_ENVELOPE / 2;
/** Aft baffle: CLEAR aft of the bank's rear head (RH #1, LH #2; M-18 Fig 5-34 stagger), from the fin bottom up. */
export const AFT_X = (s: number) => REAR_CYL_X(s) - CYL_HEAD_SIZE[0] / 2 - CLEAR - BAFFLE_SHEET / 2;
const AFT_BOTTOM = FIN_BOTTOM + CLEAR;
/** Front baffle: CLEAR ahead of the bank's front head (RH #5, LH #6). */
export const FRONT_X = (s: number) => REAR_CYL_X(s) + 2 * CYL_PITCH + CYL_HEAD_SIZE[0] / 2 + CLEAR + BAFFLE_SHEET / 2;
/** Inboard edges of the aft and front baffles: outboard of the A/C lines and oil filler (aft) and of the mount and ALT 2
 * cable (front); approximate. */
const AFT_INNER = (s: number) => (s > 0 ? 0.285 : 0.33);
const FRONT_INNER = (s: number) => (s > 0 ? 0.25 : 0.29);

/* ---------- cowl section ---------- */
/** Boundary of the cowl section at station x along the ray from (|z| 0, y0) at angle a above outboard. */
const cowlRay = (x: number, y0: number, a: number) => {
  let lo = 0,
    hi = 1;
  // 40 bisection steps: a loop count, not a dimension
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inFus(new Vector3(x, y0 + mid * Math.sin(a), mid * Math.cos(a)))) lo = mid;
    else hi = mid;
  }
  return new Vector2(lo * Math.cos(a), y0 + lo * Math.sin(a));
};
/**
 * Seal line in the cowl section at station x, as [|z|, y] centres, from the horizontal ray at y0 up and inboard to |z|
 * = inner. Each centre is SEAL_R + SEAL_GAP inside the skin along the section normal, so the seal meets the cowling
 * (AMM 71-00 §1.B PDF p. 2470).
 */
const sealPoint = (x: number, y0: number, a: number) => {
  const t = cowlRay(x, y0, a + 0.002).sub(cowlRay(x, y0, a - 0.002));
  return cowlRay(x, y0, a).addScaledVector(new Vector2(t.y, -t.x).normalize(), -(SEAL_R + SEAL_GAP));
};
const sealLine = (x: number, y0: number, inner: number) => {
  const pts: Vector2[] = [],
    step = Math.PI / 360;
  for (let a = 0; a <= Math.PI / 2; a += step) {
    const c = sealPoint(x, y0, a);
    if (c.x >= inner) {
      pts.push(c);
      continue;
    }
    // end the line exactly at |z| = inner
    let lo = a - step,
      hi = a;
    // 30 bisection steps: a loop count, not a dimension
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (sealPoint(x, y0, mid).x >= inner) lo = mid;
      else hi = mid;
    }
    if (inner > 0) pts.push(sealPoint(x, y0, lo));
    break;
  }
  return pts;
};
/** Piecewise-linear y of a polyline of [|z|, y] points at |z| = u (points ordered by falling |z|). */
const yAt = (line: Vector2[], u: number) => {
  for (let i = 1; i < line.length; i++)
    if (u <= line[i - 1].x && u >= line[i].x) {
      const k = (u - line[i].x) / (line[i - 1].x - line[i].x || 1);
      return line[i].y + k * (line[i - 1].y - line[i].y);
    }
  return line.at(-1)!.y;
};

/* ---------- plate builders ---------- */
/** A plate of BAFFLE_SHEET in the plane x = x0 from an outline of [|z|, y] points on bank s. */
const xPlate = (outline: Vector2[], x0: number, s: number) => {
  // Shape (u, v) = (z, y), extruded along u × v = -x; rotate so +extrude runs along -x, without mirroring.
  const g = new ExtrudeGeometry(new Shape(outline.map((p) => new Vector2(s * p.x, p.y))), {
    depth: BAFFLE_SHEET,
    bevelEnabled: false,
    curveSegments: 1,
  });
  return g.applyMatrix4(new Matrix4().set(0, 0, -1, x0 + BAFFLE_SHEET / 2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
};
/** A horizontal plate of thickness t below y0 from an outline of [x, |z|] points, with optional holes. */
const yPlate = (outline: Vector2[], y0: number, t: number, s: number, holes: Vector2[][] = []) => {
  const shape = new Shape(outline.map((p) => new Vector2(p.x, -s * p.y)));
  for (const h of holes) shape.holes.push(new Path(h.map((p) => new Vector2(p.x, -s * p.y))));
  // Shape (u, v) = (x, -z), extruded along +y.
  const g = new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
  return g.applyMatrix4(new Matrix4().set(1, 0, 0, 0, 0, 0, 1, y0 - t, 0, -1, 0, 0, 0, 0, 0, 1));
};
/** A round seal along a 3D polyline. */
const sealTube = (pts: Vector3[]) => {
  const path = new CurvePath<Vector3>();
  for (let i = 1; i < pts.length; i++) path.add(new LineCurve3(pts[i - 1], pts[i]));
  return new TubeGeometry(path, Math.max(1, pts.length - 1), SEAL_R, 8, false);
};
const rect = (x0: number, x1: number, z0: number, z1: number) => [
  new Vector2(x0, z0),
  new Vector2(x1, z0),
  new Vector2(x1, z1),
  new Vector2(x0, z1),
];

/**
 * A plate outline with the intercooler inlet duct's cut-out (inferred, no figure): the circle
 * of radius r about c (x, |z|) crosses the outline's aft edge at x = `outline`'s minimum x and overlaps the window's
 * aft-inboard corner, so the outline runs from that edge round the circle into the window and round the window back.
 * The window is then part of the outline, not a hole. Throws if the circle does not sit across the aft edge and the
 * window corner, so a moved duct cannot silently widen the cut-out. 10° arc steps are a mesh resolution.
 */
export const cutOutline = (outline: Vector2[], [x0, x1, z0, z1]: number[], c: Vector2, r: number) => {
  const area = outline.reduce((a, p, i) => {
    const q = outline[(i + 1) % outline.length];
    return a + p.x * q.y - q.x * p.y;
  }, 0);
  // work clockwise in (x, |z|): the aft edge then runs toward +|z|
  const cw = area < 0 ? outline : [...outline].reverse();
  const xa = Math.min(...cw.map((p) => p.x));
  const zSpan = r * r - (xa - c.x) ** 2,
    wSpan = r * r - (x0 - c.x) ** 2,
    iSpan = r * r - (z0 - c.y) ** 2;
  if (zSpan <= 0 || wSpan <= 0 || iSpan <= 0 || Math.hypot(x0 - c.x, z0 - c.y) >= r)
    throw new Error(
      `intercooler inlet cut-out (r ${r} at ${c.x}, ${c.y}) no longer crosses the deck's aft edge and the window corner; re-check the duct's pass`,
    );
  const zlo = c.y - Math.sqrt(zSpan),
    zhi = c.y + Math.sqrt(zSpan),
    zw = c.y + Math.sqrt(wSpan),
    xb = c.x + Math.sqrt(iSpan);
  const i = cw.findIndex((p, k) => {
    const q = cw[(k + 1) % cw.length];
    return p.x === xa && q.x === xa && p.y <= zlo && q.y >= zhi;
  });
  if (i < 0) throw new Error("intercooler inlet cut-out: the outline has no aft edge spanning the duct's pass");
  const arc = (from: Vector2, to: Vector2) => {
    const a0 = Math.atan2(from.y - c.y, from.x - c.x),
      a1 = Math.atan2(to.y - c.y, to.x - c.x);
    const n = Math.max(1, Math.ceil((a1 - a0) / (Math.PI / 18)));
    return Array.from({ length: n - 1 }, (_, k) => {
      const a = a0 + ((a1 - a0) * (k + 1)) / n;
      return new Vector2(c.x + r * Math.cos(a), c.y + r * Math.sin(a));
    });
  };
  const lo = new Vector2(xa, zlo),
    inb = new Vector2(xb, z0),
    win = new Vector2(x0, zw),
    hi = new Vector2(xa, zhi);
  const notched = [
    ...cw.slice(0, i + 1),
    lo,
    ...arc(lo, inb),
    inb,
    new Vector2(x1, z0),
    new Vector2(x1, z1),
    new Vector2(x0, z1),
    win,
    ...arc(win, hi),
    hi,
    ...cw.slice(i + 1),
  ];
  return cw === outline ? notched : notched.reverse();
};

/* ---------- layout per bank ---------- */
/** Duct 7 crossing the plane x = x0 (AMM Fig 71-60-2 sheet 2 item 7), as disks [|z|, y, radius] grown by CLEAR. */
const ductDisks = (s: number, x0: number) =>
  curveOf(DUCT7(s), DUCT7_TENSION)
    .getSpacedPoints(600)
    .flatMap((p) => {
      const dx = Math.max(0, Math.abs(p.x - x0) - BAFFLE_SHEET / 2),
        r2 = (DUCT7_R + CLEAR) ** 2 - dx * dx;
      return r2 > 0 ? [[Math.abs(p.z), p.y, Math.sqrt(r2)] as const] : [];
    });
/** Outboard edge of the intercooler body at station x: the core box, then its transition tapering to the neck. */
const intercoolerOuter = (s: number, x: number) => {
  const front = INTERCOOLER_FRONT_X(s);
  if (x <= front) return INTERCOOLER_OUTER_Z(s);
  if (x >= INTERCOOLER_NECK_X) return 0;
  const neck = Math.abs(INTERCOOLER_NECK(s)[2]) + INTERCOOLER_NECK_R;
  return INTERCOOLER_OUTER_Z(s) + ((x - front) / (INTERCOOLER_NECK_X - front)) * (neck - INTERCOOLER_OUTER_Z(s));
};

const layout = (s: number) => {
  const deckTop = DECK_TOP(s),
    deckBottom = deckTop - BAFFLE_SHEET,
    sealY = deckTop + SEAL_R,
    wallIn = SIDE_WALL_Z - BAFFLE_SHEET / 2,
    wallOut = SIDE_WALL_Z + BAFFLE_SHEET / 2,
    seat = INTERCOOLER_SEAT(s),
    // BAT 1 sits 1 mm aft of the core's aft face, so the deck starts CLEAR forward of it
    coreAft = INTERCOOLER_AFT_FACE_X + CLEAR,
    xa = AFT_X(s),
    xf = FRONT_X(s);
  // Deck-edge seal: against the cowl side at seal height, but never closer than SEAL_R + CLEAR to the intercooler.
  // Where the cowl is narrower than that, the seal and deck stay outboard of the intercooler.
  const sideSeal: Vector3[] = [];
  // 5 mm sampling step along x: a mesh resolution, not a dimension
  const steps = Math.ceil((xf - coreAft) / 0.005);
  for (let i = 0; i <= steps; i++) {
    // intercooler edge taken one CLEAR back: the seal runs straight between samples past the core's front corner
    const x = coreAft + ((xf - coreAft) * i) / steps,
      c = sealPoint(x, sealY, 0),
      clear = intercoolerOuter(s, x - CLEAR) + SEAL_R + CLEAR;
    sideSeal.push(new Vector3(x, c.x >= clear ? c.y : sealY, s * Math.max(c.x, clear)));
  }
  // Deck: from the wall's inside face to the seal centreline, with the cooling-air window under the core.
  const deck = [
    ...sideSeal.map((p) => new Vector2(p.x, Math.abs(p.z))),
    new Vector2(xf, wallIn),
    new Vector2(coreAft, wallIn),
  ];
  const coreFront = INTERCOOLER_FRONT_X(s),
    coreOuter = INTERCOOLER_OUTER_Z(s),
    gasketIn = Math.max(wallIn, coreOuter - INTERCOOLER_WIDTH);
  const window = rect(coreAft + CLEAR, coreFront - GASKET_W, gasketIn + GASKET_W, coreOuter - GASKET_W);
  const gasket = { outer: rect(coreAft, coreFront, gasketIn, coreOuter), inner: window, top: seat.y - GASKET_DROP };
  // the intercooler inlet duct's pass: the deck and seal 16 are notched round it, through the window
  const winBox = [coreAft + CLEAR, coreFront - GASKET_W, gasketIn + GASKET_W, coreOuter - GASKET_W],
    pass = new Vector2(INTERCOOLER_IN(s)[0], Math.abs(INTERCOOLER_IN(s)[2]));
  const wall = [
    new Vector2(coreAft, SIDE_BOTTOM),
    new Vector2(xf, SIDE_BOTTOM),
    new Vector2(xf, deckBottom),
    new Vector2(coreAft, deckBottom),
  ];
  // Aft baffle: up to the seal line inboard of the intercooler, under the core base outboard of it.
  const coreIn = coreOuter - INTERCOOLER_WIDTH - CLEAR;
  const aftLine = sealLine(xa, seat.y, AFT_INNER(s)).filter((c) => c.x <= coreIn);
  const aftTop = (c: Vector2) => new Vector2(c.x, c.y - SEAL_R / 2);
  const aft = [
    new Vector2(AFT_INNER(s), AFT_BOTTOM),
    new Vector2(wallOut, AFT_BOTTOM),
    new Vector2(wallOut, deckTop - CLEAR),
    new Vector2(coreIn, deckTop - CLEAR),
    ...aftLine.map(aftTop),
    new Vector2(AFT_INNER(s), yAt(aftLine, AFT_INNER(s)) - SEAL_R / 2),
  ];
  // Front baffle: up to the seal line, notched from above where duct 7 passes through it.
  const disks = ductDisks(s, xf),
    line = sealLine(xf, sealY, FRONT_INNER(s)),
    // lowest point of the duct (grown by `grow`) above |z| = u
    notch = (u: number, grow: number) =>
      Math.min(
        Infinity,
        ...disks
          .filter(([z, , r]) => Math.abs(u - z) < r + grow)
          .map(([z, y, r]) => y - Math.sqrt((r + grow) ** 2 - (u - z) ** 2)),
      );
  const frontTop: { u: number; y: number; seal: number | undefined }[] = [];
  // Sampled every 2 mm across the plate (a mesh resolution, not a dimension). The notch keeps 1 mm beyond CLEAR, and
  // its floor stays 2 mm over the deck and 10 mm over the foot so the outline never folds; margins approximate.
  for (let u = line[0].x; u > FRONT_INNER(s); u -= 0.002) {
    const sealC = yAt(line, u),
      floor = u > wallOut ? deckBottom + 0.002 : SIDE_BOTTOM + 0.01,
      y = Math.max(floor, Math.min(sealC - SEAL_R / 2, notch(u, 0.001)));
    frontTop.push({ u, y, seal: notch(u, SEAL_R + 0.001) < sealC + SEAL_R ? undefined : sealC });
  }
  const innerC = yAt(line, FRONT_INNER(s));
  // the same notch and floor margins at the inboard edge (approximate)
  frontTop.push({
    u: FRONT_INNER(s),
    y: Math.max(SIDE_BOTTOM + 0.01, Math.min(innerC - SEAL_R / 2, notch(FRONT_INNER(s), 0.001))),
    seal: notch(FRONT_INNER(s), SEAL_R + 0.001) < innerC + SEAL_R ? undefined : innerC,
  });
  const front = [
    new Vector2(FRONT_INNER(s), SIDE_BOTTOM),
    new Vector2(wallOut, SIDE_BOTTOM),
    new Vector2(wallOut, deckBottom),
    new Vector2(line[0].x, deckBottom),
    ...frontTop.map((p) => new Vector2(p.u, p.y)),
  ];
  // Seal runs: aft top inboard of the core, the deck edge, the front top and outboard edge; split at the duct notch.
  const frontSeals: Vector3[][] = [[]];
  for (const p of frontTop)
    if (p.seal === undefined) {
      if (frontSeals.at(-1)!.length) frontSeals.push([]);
    } else frontSeals.at(-1)!.push(new Vector3(xf, p.seal, s * p.u));
  const seals = [
    aftLine.map((c) => new Vector3(xa, c.y, s * c.x)),
    sideSeal,
    ...frontSeals.filter((run) => run.length > 1),
  ].filter((run) => run.length > 1);
  return {
    deck,
    deckTop,
    window,
    gasket,
    wall,
    aft,
    xa,
    front,
    xf,
    seals,
    sideSeal,
    /** The drawn deck and seal 16 outlines, notched through the window round the inlet duct's pass. */
    deckCut: cutOutline(deck, winBox, pass, INLET_CUTOUT_R),
    gasketCut: cutOutline(gasket.outer, winBox, pass, INLET_CUTOUT_R),
    cutOut: { centre: pass, r: INLET_CUTOUT_R },
  };
};
const layouts = new Map<number, ReturnType<typeof layout>>();
/** Every point of a bank's baffles, built once on first use (geometry stays lazy): shared by the parts and the tests. */
export const baffleLayout = (s: number) => {
  if (!layouts.has(s)) layouts.set(s, layout(s));
  return layouts.get(s)!;
};

/* ---------- parts ---------- */
const BAFFLE = "#B8BEC4";
const baffleRef =
  "POH 13772-007 7-38; AMM 13773-002 Rev 7 71-00 §1.B (PDF p. 2470), Fig 71-00-2 sheets 1–2 item 3 (PDF pp. 2487–2488), Fig 71-00-4 (PDF p. 2498); Continental M-18 2-2.9, Fig 2-21 (p. 2-21). Outline, stations and thickness approximate: the figures are undimensioned.";
for (const s of [-1, 1]) {
  const bank = s > 0 ? "RH" : "LH",
    L = () => baffleLayout(s);
  part(
    () =>
      mergeGeos([
        yPlate(L().deckCut, L().deckTop, BAFFLE_SHEET, s),
        new ExtrudeGeometry(new Shape(L().wall), {
          depth: BAFFLE_SHEET,
          bevelEnabled: false,
          curveSegments: 1,
        }).translate(0, 0, s * SIDE_WALL_Z - BAFFLE_SHEET / 2),
      ]),
    ["engine"],
    {
      name: "Side baffle",
      groups: [], // core: shown with every engine group
      color: BAFFLE,
      plate: true,
      fairing: true, // X-ray picking passes through to the cylinders it covers
      note: `${bank} bank: the wall closes the outboard side of the heads; the deck on top carries the intercooler on its seal, the cooling air passing down through the core window, and its outboard edge seals to the cowl (AMM 13773-002 Rev 7 71-60 PDF p. 2555; Fig 71-60-2 sheet 2 items 16, 18 PDF p. 2558). Where the model cowl's upper shoulder is narrower than the dimensioned intercooler, the deck edge and its seal stay outboard of the intercooler and cross the model skin. ${baffleRef}`,
    },
  );
  part(() => xPlate(L().aft, L().xa, s), ["engine"], {
    name: "Aft baffle",
    groups: [], // core: shown with every engine group
    color: BAFFLE,
    plate: true,
    fairing: true,
    note: `${bank} bank, aft of the rear cylinder: closes the high-pressure area above the cylinders at the back, up to the cowl inboard of the intercooler and to the core base under it. ${baffleRef}`,
  });
  part(() => xPlate(L().front, L().xf, s), ["engine"], {
    name: "Front baffle",
    groups: [], // core: shown with every engine group
    color: BAFFLE,
    plate: true,
    fairing: true,
    note: `${bank} bank, ahead of the front cylinder: turns the inlet air over the cylinders and seals to the cowl; notched where the intercooler outlet duct passes (AMM Fig 71-60-2 sheet 2 item 7, PDF p. 2558). ${baffleRef}`,
  });
  part(() => yPlate(L().gasketCut, L().gasket.top, GASKET_T, s), ["engine"], {
    name: "Intercooler seal",
    groups: [], // core: shown with every engine group
    color: "#5A5F63",
    note: `${bank} intercooler seal (item 16) between the side-baffle deck and the intercooler, which are screwed together (AMM 13773-002 Rev 7 71-60 PDF p. 2555; Fig 71-60-2 sheet 2 items 15, 16, 18, PDF p. 2558). Thickness and land width approximate.`,
  });
  part(() => mergeGeos(L().seals.map(sealTube)), ["engine"], {
    name: "Baffle seal",
    groups: [], // core: shown with every engine group
    color: "#8C5A3C",
    note: `${bank} bank: fiber-reinforced silicone seal on the baffle edges, in contact with the cowling around the circumference of the engine (AMM 13773-002 Rev 7 71-00 §1.B PDF p. 2470); broken where the intercooler outlet duct passes the front baffle. Section approximate.`,
  });
}

// Inter-cylinder baffles (Continental M-18 17-3.2, Fig 17-11 p. 17-16): a lower baffle assembly closing the space under
// each pair of adjacent cylinders, bolted to a support on top that straddles the fins, between cylinders 1 & 3, 3 & 5,
// 2 & 4 and 4 & 6. Plate and support sizes approximate; the LH span stops inboard of the ALT 2 cable.
const INTER_PAIRS = [
  [1, 3],
  [3, 5],
  [2, 4],
  [4, 6],
] as const;
const INTER_Z = [CYL_BARREL_START + 0.01, 0.26] as const; // approximate
for (const [a, b] of INTER_PAIRS) {
  const ca = CYLS.find((c) => c.n === a)!,
    cb = CYLS.find((c) => c.n === b)!,
    x = (ca.x + cb.x) / 2,
    zc = (ca.s * (INTER_Z[0] + INTER_Z[1])) / 2,
    zl = INTER_Z[1] - INTER_Z[0];
  part(
    () =>
      // lower plate 0.06 m wide under the gap, support 0.03 × 0.012 m on the fins, CLEAR + half its height above them;
      // approximate (Fig 17-11 is undimensioned)
      mergeGeos([
        box(0.06, BAFFLE_SHEET, zl).translate(0, FIN_BOTTOM - CLEAR - BAFFLE_SHEET / 2 - CRANK_Y, 0),
        box(0.03, 0.012, zl).translate(0, FIN_TOP + CLEAR + 0.006 - CRANK_Y, 0),
      ]),
    ["engine"],
    {
      pos: [x, CRANK_Y, zc],
      color: BAFFLE,
      name: "Inter-cylinder baffle",
      groups: [], // core: shown with every engine group
      note: `Between cylinders ${a} & ${b}: lower baffle assembly under the gap, bolted to the baffle support on top that straddles the fins (Continental M-18 17-3.2, Fig 17-11 p. 17-16; 12-15 p. 12-57). Sizes approximate.`,
    },
  );
}
// Cylinder baffle 43 (Continental M-18 16-7 step 1, Figs 16-29/16-30 p. 16-33): on the lower side of each cylinder below
// the pushrod tube passages, closing the gap outboard of the lower spark plug hole; held by a spring hooked over a fin
// on the opposite side. Drawn as a plate CLEAR under the head's lower face, from CLEAR outboard of the lower plug's hex
// (engine.ts: 0.036 m across) to the head's outboard face. Fore and aft it ends CLEAR aft of the lower plug's lead,
// which drops to the plug at the plug's station (engine-ignition.ts), and runs 0.034 m aft, short of the exhaust riser.
// Length and station approximate: the figure is a photograph, undimensioned.
const PLUG_HEX_R = 0.018; // engine.ts lower-plug hex radius (illustrative there)
const LEAD_R = 0.005; // engine-ignition.ts lead radius (illustrative there)
export const CYL_BAFFLE_LEN = 0.034; // approximate
/** Cylinder baffle 43 envelope per cylinder: x centre, |z| inboard and outboard edges, top y (approximate). */
export const cylinderBaffle = (c: { n: number; x: number; s: number }) => {
  const hole = cylPoint(c, plugOffset(c, "L"));
  return {
    x: hole[0] - LEAD_R - CLEAR - CYL_BAFFLE_LEN / 2,
    hole,
    zIn: Math.abs(hole[2]) + PLUG_HEX_R + CLEAR,
    zOut: CYL_BARREL_END + CYL_HEAD_SIZE[2],
    top: CYL_HEAD_BOTTOM - CLEAR,
  };
};
for (const c of CYLS) {
  const b = cylinderBaffle(c);
  part(() => box(CYL_BAFFLE_LEN, BAFFLE_SHEET, b.zOut - b.zIn), ["engine"], {
    pos: [b.x, b.top - BAFFLE_SHEET / 2, (c.s * (b.zIn + b.zOut)) / 2],
    color: BAFFLE,
    name: "Cylinder baffle",
    groups: [], // core: shown with every engine group
    note: `Cylinder ${c.n}: on the lower side of the cylinder below the pushrod tube passages, closing the gap outboard of the lower spark plug hole; held by a spring hooked over a fin on the opposite side (Continental M-18 16-7 step 1, Figs 16-29, 16-30 p. 16-33). Size and station approximate.`,
  });
}
